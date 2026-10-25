CREATE TABLE public.company_lead_preferences (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  settings_enabled boolean NOT NULL DEFAULT false,
  accept_extra_products boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lead_recipients (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  can_edit_settings boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE TABLE public.lead_recipient_services (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('solar','heatpump','battery','ev','airco')),
  enabled boolean NOT NULL DEFAULT true,
  monthly_max integer NOT NULL DEFAULT 0 CHECK (monthly_max >= 0 AND monthly_max <= 10000),
  area_mode text CHECK (area_mode IS NULL OR area_mode IN ('radius','provinces','national')),
  center_label text,
  center_lat numeric,
  center_lng numeric,
  radius_km integer CHECK (radius_km IS NULL OR radius_km BETWEEN 1 AND 250),
  provinces text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, category)
);
ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS primary_product text;

GRANT SELECT ON public.company_lead_preferences, public.lead_recipients, public.lead_recipient_services TO authenticated;
GRANT ALL ON public.company_lead_preferences, public.lead_recipients, public.lead_recipient_services TO service_role;
ALTER TABLE public.company_lead_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_recipient_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members read lead preferences" ON public.company_lead_preferences FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "company members read recipients" ON public.lead_recipients FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY "company members read recipient services" ON public.lead_recipient_services FOR SELECT TO authenticated USING (company_id = public.current_company_id());

CREATE OR REPLACE FUNCTION public.recipient_area_covers(p_mode text, p_center_lat numeric, p_center_lng numeric, p_radius integer, p_provinces text[], p_lat numeric, p_lng numeric, p_province text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_mode
    WHEN 'national' THEN true
    WHEN 'provinces' THEN coalesce(p_province = ANY(p_provinces), false)
    WHEN 'radius' THEN p_lat IS NOT NULL AND p_center_lat IS NOT NULL AND public.haversine_km(p_center_lat, p_center_lng, p_lat, p_lng) <= p_radius
    ELSE true END
$$;

CREATE OR REPLACE FUNCTION public.allocate_lead_bundle(p_lead_id uuid, p_company_id uuid, p_products text[], p_source purchase_source DEFAULT 'assigned'::purchase_source, p_purchased_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(result text, purchase_id uuid, price_ex_vat numeric, billable boolean, is_trial boolean, trial_sequence_number integer, products text[])
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_lead public.leads; v_company public.companies; v_sub public.subscription_versions;
  v_count integer; v_cap integer; v_covered text[]; v_bundle text[]; v_month_start timestamptz := date_trunc('month', now());
  v_used integer; v_lifetime integer; v_allowance integer := public.trial_lead_allowance();
  v_is_trial boolean := false; v_trial_seq integer; v_price numeric := 0; v_billable boolean := false;
  v_new_id uuid; v_cat text; i integer := 0;
  v_member_mode boolean := false; v_accept_extra boolean := true; v_user uuid; v_primary text; v_total integer;
  plat numeric; plng numeric; pprov text;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'lead_not_found', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.phone_verified IS NOT TRUE THEN RETURN QUERY SELECT 'lead_not_verified', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.state = 'cancelled' THEN RETURN QUERY SELECT 'lead_not_eligible', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.fraud_status = 'blocked' THEN RETURN QUERY SELECT 'lead_blocked', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF v_lead.duplicate_of_lead_id IS NOT NULL THEN RETURN QUERY SELECT 'lead_duplicate', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;
  IF p_source = 'market' THEN RETURN QUERY SELECT 'market_closed', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.lead_purchases lp WHERE lp.lead_id = p_lead_id AND lp.company_id = p_company_id) THEN
    RETURN QUERY SELECT 'already_assigned', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
  END IF;
  SELECT count(*) INTO v_count FROM public.lead_purchases lp WHERE lp.lead_id = p_lead_id;
  v_cap := least(coalesce(v_lead.max_partners, 4), 4);
  IF v_count >= v_cap THEN RETURN QUERY SELECT 'lead_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN; END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND OR v_company.active IS NOT TRUE THEN
    RETURN QUERY SELECT 'company_not_eligible', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
  END IF;

  SELECT coalesce(e.categories, '{}') INTO v_covered FROM public.eligible_companies_for_lead(p_lead_id) e WHERE e.company_id = p_company_id;
  PERFORM 1 FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.active ORDER BY cp.id FOR UPDATE;
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), '{}') INTO v_bundle
    FROM unnest(coalesce(p_products, v_lead.categories)) c
   WHERE c = ANY(v_lead.categories) AND c = ANY(coalesce(v_covered, '{}'))
     AND EXISTS (SELECT 1 FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.active AND cp.category = c);
  IF cardinality(v_bundle) = 0 THEN
    RETURN QUERY SELECT 'company_not_eligible', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
  END IF;

  -- Leadinstellingen per ontvanger: één primair product bij één ontvanger, binnen ontvanger- en bedrijfscapaciteit.
  SELECT p.settings_enabled, p.accept_extra_products INTO v_member_mode, v_accept_extra
    FROM public.company_lead_preferences p WHERE p.company_id = p_company_id;
  v_member_mode := coalesce(v_member_mode, false);
  IF v_member_mode THEN
    SELECT g.lat, g.lng INTO plat, plng FROM public.postcode_geo g
     WHERE g.postcode IN (upper(v_lead.postcode), left(regexp_replace(v_lead.postcode, '\s', '', 'g'), 4)) LIMIT 1;
    SELECT coalesce(plat, r.lat), coalesce(plng, r.lng), r.province INTO plat, plng, pprov
      FROM public.regions r WHERE r.code = v_lead.region_code;

    SELECT coalesce(sum(s.monthly_max), 0) INTO v_total FROM public.lead_recipient_services s
      JOIN public.profiles pr ON pr.id = s.user_id AND pr.company_id = s.company_id
     WHERE s.company_id = p_company_id AND s.enabled;
    SELECT count(*) INTO v_used FROM public.lead_purchases lp
     WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND lp.primary_product IS NOT NULL;
    IF v_used >= v_total THEN
      RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
    END IF;

    SELECT s.user_id, s.category INTO v_user, v_primary
      FROM public.lead_recipient_services s
      JOIN public.lead_recipients r ON r.company_id = s.company_id AND r.user_id = s.user_id AND NOT r.paused
      JOIN public.profiles pr ON pr.id = s.user_id AND pr.company_id = s.company_id
      CROSS JOIN LATERAL (SELECT count(*)::integer AS n FROM public.lead_purchases lp
         WHERE lp.company_id = s.company_id AND lp.assigned_to = s.user_id AND lp.primary_product = s.category
           AND lp.created_at >= v_month_start) u
      LEFT JOIN LATERAL (SELECT max(lp.assigned_at) AS at FROM public.lead_purchases lp
         WHERE lp.company_id = s.company_id AND lp.assigned_to = s.user_id) last ON true
     WHERE s.company_id = p_company_id AND s.enabled AND s.monthly_max > 0 AND s.category = ANY(v_bundle)
       AND u.n < s.monthly_max
       AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = s.user_id AND ur.role IN ('owner','account_manager'))
       AND public.recipient_area_covers(s.area_mode, s.center_lat, s.center_lng, s.radius_km, s.provinces, plat, plng, pprov)
     ORDER BY (s.monthly_max - u.n)::numeric / s.monthly_max DESC, last.at ASC NULLS FIRST, s.user_id, s.category
     LIMIT 1;
    IF v_user IS NULL THEN
      RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
    END IF;
    v_bundle := ARRAY[v_primary] || CASE WHEN v_accept_extra
      THEN coalesce((SELECT array_agg(c ORDER BY c) FROM unnest(v_bundle) c WHERE c <> v_primary), '{}') ELSE '{}'::text[] END;
  END IF;

  v_sub := public.active_subscription(p_company_id);
  IF v_sub.id IS NOT NULL THEN
    IF NOT v_member_mode THEN
      SELECT count(*) INTO v_used FROM public.lead_purchases lp
       WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND lp.subscription_version_id IS NOT NULL;
      IF v_used >= v_sub.lead_quota_per_month THEN
        RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
      END IF;
    END IF;
    v_price := v_sub.base_lead_price_ex_vat + v_sub.extra_product_price_ex_vat * (cardinality(v_bundle) - 1);
    v_billable := true;
  ELSE
    IF NOT v_member_mode THEN
      SELECT coalesce(array_agg(c ORDER BY c), '{}') INTO v_bundle FROM unnest(v_bundle) c
       WHERE (SELECT count(*) FROM public.lead_purchases lp JOIN public.leads l ON l.id = lp.lead_id
               WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND c = ANY(l.categories))
             < (SELECT cp.monthly_max FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.category = c);
      IF cardinality(v_bundle) = 0 THEN
        RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
      END IF;
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
    trial_sequence_number, subscription_version_id, products, assigned_to, primary_product)
  VALUES (p_lead_id, p_company_id, p_purchased_by, p_source, v_price, v_billable, v_is_trial, v_trial_seq, v_sub.id, v_bundle,
    v_user, v_primary)
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
END $function$;