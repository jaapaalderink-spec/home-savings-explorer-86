-- Contractversies (nieuwe commerciële regels). Bedrijven zonder versie houden hun oude afspraken.
CREATE TABLE public.subscription_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  valid_from date NOT NULL CHECK (extract(day FROM valid_from) = 1),
  lead_quota_per_month integer NOT NULL CHECK (lead_quota_per_month BETWEEN 0 AND 10000),
  paid_seats integer NOT NULL DEFAULT 0 CHECK (paid_seats >= 0),
  platform_fee_ex_vat numeric NOT NULL DEFAULT 25,
  seat_fee_ex_vat numeric NOT NULL DEFAULT 15,
  base_lead_price_ex_vat numeric NOT NULL DEFAULT 15,
  extra_product_price_ex_vat numeric NOT NULL DEFAULT 10,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, version),
  UNIQUE (company_id, valid_from)
);
GRANT SELECT ON public.subscription_versions TO authenticated;
GRANT ALL ON public.subscription_versions TO service_role;
ALTER TABLE public.subscription_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and admins read contracts" ON public.subscription_versions FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER subscription_versions_immutable BEFORE UPDATE OR DELETE ON public.subscription_versions
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_mutation();

CREATE OR REPLACE FUNCTION public.active_subscription(p_company uuid, p_on date DEFAULT current_date)
RETURNS public.subscription_versions LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM public.subscription_versions
   WHERE company_id = p_company AND valid_from <= p_on
   ORDER BY valid_from DESC LIMIT 1
$$;

-- Gebundelde producten per toewijzing, met prijssnapshot.
CREATE TABLE public.allocation_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id) ON DELETE CASCADE,
  category text NOT NULL,
  price_ex_vat numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_purchase_id, category)
);
GRANT SELECT ON public.allocation_products TO authenticated;
GRANT ALL ON public.allocation_products TO service_role;
ALTER TABLE public.allocation_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and admins read allocation products" ON public.allocation_products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lead_purchases lp WHERE lp.id = lead_purchase_id
                 AND (lp.company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'))));

ALTER TABLE public.lead_purchases
  ADD COLUMN IF NOT EXISTS subscription_version_id uuid REFERENCES public.subscription_versions(id),
  ADD COLUMN IF NOT EXISTS products text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS market_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfillment_status text CHECK (fulfillment_status IN ('complete','partial','waiting','undeliverable')),
  ADD COLUMN IF NOT EXISTS retry_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_allocation_attempt_at timestamptz;
-- Bestaande aanvragen blijven in de leadmarkt; nieuwe aanvragen niet meer.
UPDATE public.leads SET market_enabled = true;
UPDATE public.leads SET retry_until = created_at + interval '30 days' WHERE retry_until IS NULL;
ALTER TABLE public.leads ALTER COLUMN retry_until SET DEFAULT (now() + interval '30 days');
CREATE INDEX IF NOT EXISTS leads_fulfillment_retry_idx ON public.leads(fulfillment_status, retry_until);

-- Eén gezaghebbende toewijzing: één regel per bedrijf, met gebundelde producten.
CREATE OR REPLACE FUNCTION public.allocate_lead_bundle(
  p_lead_id uuid, p_company_id uuid, p_products text[],
  p_source purchase_source DEFAULT 'assigned', p_purchased_by uuid DEFAULT NULL)
RETURNS TABLE(result text, purchase_id uuid, price_ex_vat numeric, billable boolean, is_trial boolean,
  trial_sequence_number integer, products text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_lead public.leads; v_company public.companies; v_sub public.subscription_versions;
  v_count integer; v_cap integer; v_covered text[]; v_bundle text[]; v_month_start timestamptz := date_trunc('month', now());
  v_used integer; v_lifetime integer; v_allowance integer := public.trial_lead_allowance();
  v_is_trial boolean := false; v_trial_seq integer; v_price numeric := 0; v_billable boolean := false;
  v_new_id uuid; v_cat text; i integer := 0;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'lead_not_found', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.phone_verified IS NOT TRUE THEN RETURN QUERY SELECT 'lead_not_verified', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.state = 'cancelled' THEN RETURN QUERY SELECT 'lead_not_eligible', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.fraud_status = 'blocked' THEN RETURN QUERY SELECT 'lead_blocked', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.duplicate_of_lead_id IS NOT NULL THEN RETURN QUERY SELECT 'lead_duplicate', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF p_source = 'market' AND v_lead.market_enabled IS NOT TRUE THEN RETURN QUERY SELECT 'market_closed', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.lead_purchases lp WHERE lp.lead_id = p_lead_id AND lp.company_id = p_company_id) THEN
    RETURN QUERY SELECT 'already_assigned', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
  END IF;
  -- Maximaal 4 bedrijven per aanvraag, ooit: gecrediteerde toewijzingen tellen mee.
  SELECT count(*) INTO v_count FROM public.lead_purchases lp WHERE lp.lead_id = p_lead_id;
  v_cap := least(coalesce(v_lead.max_partners, 4), 4);
  IF v_count >= v_cap THEN RETURN QUERY SELECT 'lead_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND OR v_company.active IS NOT TRUE THEN
    RETURN QUERY SELECT 'company_not_eligible', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
  END IF;

  -- Producten die dit bedrijf op deze plek levert (werkgebied per product + actieve dienst).
  SELECT coalesce(e.categories, '{}') INTO v_covered FROM public.eligible_companies_for_lead(p_lead_id) e WHERE e.company_id = p_company_id;
  PERFORM 1 FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.active ORDER BY cp.id FOR UPDATE;
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), '{}') INTO v_bundle
    FROM unnest(coalesce(p_products, v_lead.categories)) c
   WHERE c = ANY(v_lead.categories) AND c = ANY(coalesce(v_covered, '{}'))
     AND EXISTS (SELECT 1 FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.active AND cp.category = c);
  IF cardinality(v_bundle) = 0 THEN
    RETURN QUERY SELECT 'company_not_eligible', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
  END IF;

  v_sub := public.active_subscription(p_company_id);
  IF v_sub.id IS NOT NULL THEN
    -- Nieuw contract: één leadplaats per toewijzing tegen het maandquotum.
    SELECT count(*) INTO v_used FROM public.lead_purchases lp
     WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND lp.subscription_version_id IS NOT NULL;
    IF v_used >= v_sub.lead_quota_per_month THEN
      RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
    END IF;
    v_price := v_sub.base_lead_price_ex_vat + v_sub.extra_product_price_ex_vat * (cardinality(v_bundle) - 1);
    v_billable := true;
  ELSE
    -- Oud contract: alleen producten met ruimte in de maandcapaciteit, oude prijzen en proefleads.
    SELECT coalesce(array_agg(c ORDER BY c), '{}') INTO v_bundle FROM unnest(v_bundle) c
     WHERE (SELECT count(*) FROM public.lead_purchases lp JOIN public.leads l ON l.id = lp.lead_id
             WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND c = ANY(l.categories))
           < (SELECT cp.monthly_max FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.category = c);
    IF cardinality(v_bundle) = 0 THEN
      RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
    END IF;
    SELECT count(*) INTO v_lifetime FROM public.lead_purchases lp WHERE lp.company_id = p_company_id;
    v_is_trial := (v_lifetime + 1) <= v_allowance;
    v_trial_seq := CASE WHEN v_is_trial THEN v_lifetime + 1 END;
    IF NOT v_is_trial THEN
      SELECT count(*) INTO v_used FROM public.lead_purchases lp WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start;
      v_billable := v_used >= coalesce(v_company.monthly_lead_limit, 0);
      v_price := CASE WHEN NOT v_billable THEN 0 WHEN v_lead.lead_type = 'shared_2' THEN 50 ELSE 40 END;
    END IF;
  END IF;

  INSERT INTO public.lead_purchases (lead_id, company_id, purchased_by, source, price_ex_vat, billable, is_trial,
    trial_sequence_number, subscription_version_id, products)
  VALUES (p_lead_id, p_company_id, p_purchased_by, p_source, v_price, v_billable, v_is_trial, v_trial_seq, v_sub.id, v_bundle)
  RETURNING id INTO v_new_id;

  FOREACH v_cat IN ARRAY v_bundle LOOP
    INSERT INTO public.allocation_products(lead_purchase_id, category, price_ex_vat)
    VALUES (v_new_id, v_cat, CASE
      WHEN v_sub.id IS NULL THEN CASE WHEN i = 0 THEN v_price ELSE 0 END
      WHEN i = 0 THEN v_sub.base_lead_price_ex_vat ELSE v_sub.extra_product_price_ex_vat END);
    i := i + 1;
  END LOOP;

  UPDATE public.leads SET state = CASE WHEN v_count + 1 >= v_cap THEN 'assigned'::lead_state ELSE 'underfilled'::lead_state END,
         distributed_at = coalesce(distributed_at, now())
   WHERE id = p_lead_id;

  RETURN QUERY SELECT 'allocated', v_new_id, v_price, v_billable, v_is_trial, v_trial_seq, v_bundle;
END $$;

-- De oude route delegeert naar de nieuwe, zodat markt, handmatig en automatisch dezelfde controles gebruiken.
CREATE OR REPLACE FUNCTION public.allocate_lead_to_company(p_lead_id uuid, p_company_id uuid,
  p_source purchase_source DEFAULT 'assigned', p_purchased_by uuid DEFAULT NULL)
RETURNS TABLE(result text, purchase_id uuid, price_ex_vat numeric, billable boolean, is_trial boolean, trial_sequence_number integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.result, b.purchase_id, b.price_ex_vat, b.billable, b.is_trial, b.trial_sequence_number
  FROM public.allocate_lead_bundle(p_lead_id, p_company_id, NULL, p_source, p_purchased_by) b
$$;

-- Leverstatus: volledig / gedeeltelijk / wachtend / niet leverbaar.
CREATE OR REPLACE FUNCTION public.update_lead_fulfillment(p_lead uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.leads; n integer; covered text[]; s text;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*), coalesce(array_agg(DISTINCT c) FILTER (WHERE c IS NOT NULL AND NOT lp.credited), '{}')
    INTO n, covered
    FROM public.lead_purchases lp LEFT JOIN LATERAL unnest(CASE WHEN cardinality(lp.products) > 0 THEN lp.products ELSE l.categories END) c ON true
   WHERE lp.lead_id = p_lead;
  SELECT count(DISTINCT lp.id) INTO n FROM public.lead_purchases lp WHERE lp.lead_id = p_lead;
  s := CASE
    WHEN n >= least(l.max_partners, 4) AND l.categories <@ covered THEN 'complete'
    WHEN n > 0 THEN 'partial'
    WHEN coalesce(l.retry_until, l.created_at + interval '30 days') > now() THEN 'waiting'
    ELSE 'undeliverable' END;
  UPDATE public.leads SET fulfillment_status = s, last_allocation_attempt_at = now() WHERE id = p_lead;
  RETURN s;
END $$;

REVOKE ALL ON FUNCTION public.allocate_lead_bundle(uuid, uuid, text[], purchase_source, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_lead_fulfillment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.active_subscription(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_lead_bundle(uuid, uuid, text[], purchase_source, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_lead_fulfillment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.active_subscription(uuid, date) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lead_to_company(uuid, uuid, purchase_source, uuid) TO service_role;