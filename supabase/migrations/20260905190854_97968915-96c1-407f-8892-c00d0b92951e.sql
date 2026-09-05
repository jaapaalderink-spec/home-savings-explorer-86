-- Vangnet op databaseniveau: nooit meer toewijzingen dan max_partners.
CREATE OR REPLACE FUNCTION public.enforce_lead_slot_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  SELECT max_partners INTO v_max FROM public.leads WHERE id = NEW.lead_id FOR UPDATE;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'LEAD_NOT_FOUND';
  END IF;
  SELECT count(*) INTO v_count FROM public.lead_purchases WHERE lead_id = NEW.lead_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'LEAD_FULL';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS lead_purchases_slot_limit ON public.lead_purchases;
CREATE TRIGGER lead_purchases_slot_limit
  BEFORE INSERT ON public.lead_purchases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_slot_limit();

-- Enige gezaghebbende toewijzingsroute.
CREATE OR REPLACE FUNCTION public.allocate_lead_to_company(
  p_lead_id uuid,
  p_company_id uuid,
  p_source purchase_source DEFAULT 'assigned',
  p_purchased_by uuid DEFAULT NULL
)
RETURNS TABLE (result text, purchase_id uuid, price_ex_vat numeric, billable boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads;
  v_count integer;
  v_company public.companies;
  v_month_start timestamptz := date_trunc('month', now());
  v_has_region boolean;
  v_has_slot boolean;
  v_used_month integer;
  v_price numeric;
  v_billable boolean;
  v_new_id uuid;
  v_state lead_state;
BEGIN
  -- 1. Vergrendel de lead: hierdoor kan slechts één transactie tegelijk plekken claimen.
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'lead_not_found'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  IF v_lead.phone_verified IS NOT TRUE THEN
    RETURN QUERY SELECT 'lead_not_verified'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  IF v_lead.state = 'cancelled' THEN
    RETURN QUERY SELECT 'lead_not_eligible'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM public.lead_purchases WHERE lead_id = p_lead_id;

  IF EXISTS (
    SELECT 1 FROM public.lead_purchases
    WHERE lead_id = p_lead_id AND company_id = p_company_id
  ) THEN
    RETURN QUERY SELECT 'already_assigned'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  IF v_count >= v_lead.max_partners THEN
    RETURN QUERY SELECT 'lead_full'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND OR v_company.active IS NOT TRUE THEN
    RETURN QUERY SELECT 'company_not_eligible'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_regions cr
    WHERE cr.company_id = p_company_id
      AND v_lead.region_code IS NOT NULL
      AND cr.region_code = v_lead.region_code
  ) INTO v_has_region;
  IF NOT v_has_region THEN
    RETURN QUERY SELECT 'company_not_eligible'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  -- 2. Vergrendel de capaciteitsregels van dit bedrijf: maakt de maandtelling per categorie veilig.
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
    RETURN QUERY SELECT 'company_capacity_full'::text, NULL::uuid, NULL::numeric, NULL::boolean;
    RETURN;
  END IF;

  -- 3. Prijs: bundeltegoed eerst, daarna het tarief van het leadtype. Geen harde stop.
  SELECT count(*) INTO v_used_month
  FROM public.lead_purchases
  WHERE company_id = p_company_id AND created_at >= v_month_start;

  v_billable := v_used_month >= COALESCE(v_company.monthly_lead_limit, 0);
  v_price := CASE
    WHEN NOT v_billable THEN 0
    WHEN v_lead.lead_type = 'shared_2' THEN 50
    ELSE 40
  END;

  INSERT INTO public.lead_purchases (lead_id, company_id, purchased_by, source, price_ex_vat, billable)
  VALUES (p_lead_id, p_company_id, p_purchased_by, p_source, v_price, v_billable)
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

  RETURN QUERY SELECT 'allocated'::text, v_new_id, v_price, v_billable;
END; $$;

-- Alleen de serverrol mag toewijzen; nooit rechtstreeks vanuit de browser.
REVOKE ALL ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) TO service_role;