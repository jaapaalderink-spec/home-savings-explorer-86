-- 1. Proefvelden op lead_purchases
ALTER TABLE public.lead_purchases
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_sequence_number integer;

-- 2. Eén centrale bedrijfsregel: aantal gratis leads per bedrijf (levenslang)
CREATE OR REPLACE FUNCTION public.trial_lead_allowance()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 10 $$;

-- 3. Backfill: nummer de oudste 10 aankopen per bedrijf, maar markeer alleen
--    aankopen als proeflead wanneer ze nooit geld hebben gekost en niet zijn
--    gefactureerd. Zo verandert er niets aan bestaande facturen.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn,
         price_ex_vat,
         invoice_id
  FROM public.lead_purchases
)
UPDATE public.lead_purchases lp
   SET trial_sequence_number = r.rn,
       is_trial = (COALESCE(r.price_ex_vat, 0) = 0 AND r.invoice_id IS NULL)
  FROM ranked r
 WHERE r.id = lp.id
   AND r.rn <= public.trial_lead_allowance();

-- 4. Toewijzing bepaalt proefstatus, prijs en factureerbaarheid atomair
DROP FUNCTION IF EXISTS public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid);
CREATE OR REPLACE FUNCTION public.allocate_lead_to_company(
  p_lead_id uuid,
  p_company_id uuid,
  p_source purchase_source DEFAULT 'assigned'::purchase_source,
  p_purchased_by uuid DEFAULT NULL::uuid
)
RETURNS TABLE(result text, purchase_id uuid, price_ex_vat numeric, billable boolean, is_trial boolean, trial_sequence_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads;
  v_count integer;
  v_company public.companies;
  v_month_start timestamptz := date_trunc('month', now());
  v_has_region boolean;
  v_has_slot boolean;
  v_used_month integer;
  v_lifetime integer;
  v_allowance integer := public.trial_lead_allowance();
  v_is_trial boolean;
  v_trial_seq integer;
  v_price numeric;
  v_billable boolean;
  v_new_id uuid;
  v_state lead_state;
BEGIN
  -- 1. Vergrendel de lead: hierdoor kan slechts één transactie tegelijk plekken claimen.
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'lead_not_found'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF v_lead.phone_verified IS NOT TRUE THEN
    RETURN QUERY SELECT 'lead_not_verified'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF v_lead.state = 'cancelled' THEN
    RETURN QUERY SELECT 'lead_not_eligible'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM public.lead_purchases WHERE lead_id = p_lead_id;

  IF EXISTS (
    SELECT 1 FROM public.lead_purchases
    WHERE lead_id = p_lead_id AND company_id = p_company_id
  ) THEN
    RETURN QUERY SELECT 'already_assigned'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF v_count >= v_lead.max_partners THEN
    RETURN QUERY SELECT 'lead_full'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  -- 2. Vergrendel het bedrijf: dit serialiseert de proefnummering per bedrijf.
  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND OR v_company.active IS NOT TRUE THEN
    RETURN QUERY SELECT 'company_not_eligible'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_regions cr
    WHERE cr.company_id = p_company_id
      AND v_lead.region_code IS NOT NULL
      AND cr.region_code = v_lead.region_code
  ) INTO v_has_region;
  IF NOT v_has_region THEN
    RETURN QUERY SELECT 'company_not_eligible'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  -- 3. Vergrendel de capaciteitsregels: maakt de maandtelling per categorie veilig.
  PERFORM 1 FROM public.company_products
   WHERE company_id = p_company_id AND active
   ORDER BY id
   FOR UPDATE;

  SELECT EXISTS (
    SELECT 1
    FROM public.company_products cp
    WHERE cp.company_id = p_company_id
      AND cp.active
      AND cp.category = ANY (v_lead.categories)
      AND (
        SELECT count(*)
        FROM public.lead_purchases lp
        JOIN public.leads l ON l.id = lp.lead_id
        WHERE lp.company_id = p_company_id
          AND lp.created_at >= v_month_start
          AND cp.category = ANY (l.categories)
      ) < cp.monthly_max
  ) INTO v_has_slot;
  IF NOT v_has_slot THEN
    RETURN QUERY SELECT 'company_capacity_full'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  -- 4. Proefperiode: de eerste N leads die dit bedrijf ooit ontvangt zijn gratis.
  --    Telt levenslang (niet per maand) en wordt niet hersteld door credits,
  --    omdat elke ontvangen lead als aankoopregel blijft bestaan.
  SELECT count(*) INTO v_lifetime
  FROM public.lead_purchases
  WHERE company_id = p_company_id;

  v_is_trial := (v_lifetime + 1) <= v_allowance;
  v_trial_seq := CASE WHEN v_is_trial THEN v_lifetime + 1 ELSE NULL END;

  IF v_is_trial THEN
    v_price := 0;
    v_billable := false;
  ELSE
    -- Na de proefperiode gelden de bestaande commerciële regels: eerst het
    -- maandelijkse bundeltegoed van het abonnement, daarna het leadtarief.
    SELECT count(*) INTO v_used_month
    FROM public.lead_purchases
    WHERE company_id = p_company_id AND created_at >= v_month_start;

    v_billable := v_used_month >= COALESCE(v_company.monthly_lead_limit, 0);
    v_price := CASE
      WHEN NOT v_billable THEN 0
      WHEN v_lead.lead_type = 'shared_2' THEN 50
      ELSE 40
    END;
  END IF;

  INSERT INTO public.lead_purchases (
    lead_id, company_id, purchased_by, source, price_ex_vat, billable, is_trial, trial_sequence_number
  )
  VALUES (p_lead_id, p_company_id, p_purchased_by, p_source, v_price, v_billable, v_is_trial, v_trial_seq)
  RETURNING id INTO v_new_id;

  v_count := v_count + 1;
  v_state := CASE
    WHEN v_count >= v_lead.max_partners THEN 'assigned'::lead_state
    ELSE 'underfilled'::lead_state
  END;

  UPDATE public.leads
     SET state = v_state,
         distributed_at = COALESCE(distributed_at, now())
   WHERE id = p_lead_id;

  RETURN QUERY SELECT 'allocated'::text, v_new_id, v_price, v_billable, v_is_trial, v_trial_seq;
END; $function$;

REVOKE ALL ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) TO service_role;

-- 5. Commerciële velden zijn niet zelf aanpasbaar door eigenaren.
DROP POLICY IF EXISTS "Owners update their own company" ON public.companies;
CREATE POLICY "Admins update companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));