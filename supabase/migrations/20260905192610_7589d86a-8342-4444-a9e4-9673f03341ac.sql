-- Fase 2D: duplicaatdetectie, snelheidslimieten en misbruikbescherming.

-- 1. Status voor de kwaliteitsbeoordeling van een aanvraag.
DO $$ BEGIN
  CREATE TYPE public.lead_fraud_status AS ENUM ('clean', 'review', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Genormaliseerde zoekvelden + kwaliteitsvelden op leads.
--    email_normalized en identity_fingerprint zijn deterministisch berekend
--    (generated), zodat bestaande rijen automatisch meegaan zonder backfill en
--    nooit uit de pas kunnen lopen met de bronwaarden.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_normalized text
    GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  ADD COLUMN IF NOT EXISTS identity_fingerprint text
    GENERATED ALWAYS AS (
      md5(
        lower(btrim(email)) || '|' ||
        btrim(phone) || '|' ||
        upper(replace(btrim(postcode), ' ', '')) || '|' ||
        lower(btrim(coalesce(house_number, '')))
      )
    ) STORED,
  ADD COLUMN IF NOT EXISTS fraud_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_status public.lead_fraud_status NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS duplicate_of_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_fraud_score_range;
ALTER TABLE public.leads ADD CONSTRAINT leads_fraud_score_range
  CHECK (fraud_score >= 0 AND fraud_score <= 100);

-- 3. Indexen voor snelle opzoek binnen een tijdvenster.
--    Bewust GEEN unieke index op telefoon of e-mail: dezelfde consument mag
--    later opnieuw een aanvraag doen.
CREATE INDEX IF NOT EXISTS leads_phone_created_idx ON public.leads (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_created_idx ON public.leads (email_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_address_created_idx
  ON public.leads (postcode, house_number, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_fingerprint_created_idx
  ON public.leads (identity_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_fraud_status_idx ON public.leads (fraud_status);
CREATE INDEX IF NOT EXISTS leads_review_required_idx
  ON public.leads (created_at DESC) WHERE review_required;

-- 4. Auditspoor: waarom is een aanvraag gemarkeerd?
CREATE TABLE IF NOT EXISTS public.lead_risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  signal text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_risk_events TO authenticated;
GRANT ALL ON public.lead_risk_events TO service_role;

ALTER TABLE public.lead_risk_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read risk events" ON public.lead_risk_events;
CREATE POLICY "Admins read risk events" ON public.lead_risk_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS lead_risk_events_lead_idx
  ON public.lead_risk_events (lead_id, created_at DESC);

-- 5. Toewijzingsfunctie: extra poort voor geblokkeerde en dubbele aanvragen.
CREATE OR REPLACE FUNCTION public.allocate_lead_to_company(p_lead_id uuid, p_company_id uuid, p_source purchase_source DEFAULT 'assigned'::purchase_source, p_purchased_by uuid DEFAULT NULL::uuid)
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

  -- Fraudepoort: geblokkeerde leads en dubbele aanvragen worden nooit toegewezen.
  IF v_lead.fraud_status = 'blocked' THEN
    RETURN QUERY SELECT 'lead_blocked'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
    RETURN;
  END IF;

  IF v_lead.duplicate_of_lead_id IS NOT NULL THEN
    RETURN QUERY SELECT 'lead_duplicate'::text, NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer;
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

REVOKE ALL ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid)
  TO service_role;