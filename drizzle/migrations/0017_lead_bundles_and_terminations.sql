CREATE TABLE public.lead_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  size integer NOT NULL CHECK (size IN (3,5,10)),
  unit_price_ex_vat numeric NOT NULL CHECK (unit_price_ex_vat >= 0),
  period_start date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_bundles_company_period ON public.lead_bundles(company_id, period_start);
GRANT SELECT ON public.lead_bundles TO authenticated;
GRANT ALL ON public.lead_bundles TO service_role;
ALTER TABLE public.lead_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bedrijf ziet eigen bundels" ON public.lead_bundles FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(),'admin'));

ALTER TABLE public.lead_purchases ADD COLUMN bundle_id uuid REFERENCES public.lead_bundles(id);
CREATE INDEX lead_purchases_bundle ON public.lead_purchases(bundle_id) WHERE bundle_id IS NOT NULL;

CREATE TABLE public.contract_terminations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_version_id uuid REFERENCES public.subscription_versions(id),
  effective_month date NOT NULL,
  billing_mode text NOT NULL,
  remaining_months integer NOT NULL CHECK (remaining_months >= 0),
  monthly_ex_vat numeric NOT NULL,
  settlement_ex_vat numeric NOT NULL CHECK (settlement_ex_vat >= 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','withdrawn')),
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_by uuid,
  withdrawn_at timestamptz,
  invoice_id uuid REFERENCES public.invoices(id)
);
CREATE UNIQUE INDEX contract_terminations_one_active ON public.contract_terminations(company_id) WHERE status = 'confirmed';
GRANT SELECT ON public.contract_terminations TO authenticated;
GRANT ALL ON public.contract_terminations TO service_role;
ALTER TABLE public.contract_terminations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eigenaar of admin ziet opzegging" ON public.contract_terminations FOR SELECT TO authenticated
  USING ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.allocate_lead_bundle(p_lead_id uuid, p_company_id uuid, p_products text[], p_source purchase_source DEFAULT 'assigned'::purchase_source, p_purchased_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(result text, purchase_id uuid, price_ex_vat numeric, billable boolean, is_trial boolean, trial_sequence_number integer, products text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_lead public.leads; v_company public.companies; v_sub public.subscription_versions;
  v_count integer; v_cap integer; v_covered text[]; v_bundle text[]; v_month_start timestamptz := date_trunc('month', now());
  v_used integer; v_lifetime integer; v_allowance integer := public.trial_lead_allowance();
  v_is_trial boolean := false; v_trial_seq integer; v_price numeric := 0; v_billable boolean := false;
  v_new_id uuid; v_cat text; i integer := 0; v_lb public.lead_bundles; v_use_bundle boolean := false;
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
  IF NOT FOUND OR v_company.active IS NOT TRUE OR EXISTS (SELECT 1 FROM public.contract_terminations t
      WHERE t.company_id = p_company_id AND t.status = 'confirmed' AND (t.effective_month + interval '1 month') <= now()) THEN
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

  SELECT * INTO v_lb FROM public.lead_bundles b
   WHERE (public.active_subscription(p_company_id)).id IS NOT NULL AND b.company_id = p_company_id AND b.period_start = date_trunc('month', now())::date
     AND (SELECT count(*) FROM public.lead_purchases lp WHERE lp.bundle_id = b.id) < b.size
   ORDER BY b.created_at, b.id LIMIT 1 FOR UPDATE;
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
     WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND lp.primary_product IS NOT NULL AND lp.bundle_id IS NULL;
    v_use_bundle := v_used >= v_total;
    IF v_use_bundle AND v_lb.id IS NULL THEN
      RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
    END IF;

    SELECT s.user_id, s.category INTO v_user, v_primary
      FROM public.lead_recipient_services s
      JOIN public.lead_recipients r ON r.company_id = s.company_id AND r.user_id = s.user_id AND NOT r.paused
      JOIN public.profiles pr ON pr.id = s.user_id AND pr.company_id = s.company_id
      CROSS JOIN LATERAL (SELECT count(*)::integer AS n FROM public.lead_purchases lp
         WHERE lp.company_id = s.company_id AND lp.assigned_to = s.user_id AND lp.primary_product = s.category
           AND lp.created_at >= v_month_start AND lp.bundle_id IS NULL) u
      LEFT JOIN LATERAL (SELECT max(lp.assigned_at) AS at FROM public.lead_purchases lp
         WHERE lp.company_id = s.company_id AND lp.assigned_to = s.user_id) last ON true
     WHERE s.company_id = p_company_id AND s.enabled AND s.monthly_max > 0 AND s.category = ANY(v_bundle)
       AND (u.n < s.monthly_max OR v_lb.id IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = s.user_id AND ur.role IN ('owner','account_manager'))
       AND public.recipient_area_covers(s.area_mode, s.center_lat, s.center_lng, s.radius_km, s.provinces, plat, plng, pprov)
     ORDER BY (u.n < s.monthly_max) DESC, (s.monthly_max - u.n)::numeric / s.monthly_max DESC, last.at ASC NULLS FIRST, s.user_id, s.category
     LIMIT 1;
    IF v_user IS NULL THEN
      RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
    END IF;
    IF NOT v_use_bundle AND (SELECT count(*) FROM public.lead_purchases lp WHERE lp.company_id = p_company_id
        AND lp.assigned_to = v_user AND lp.primary_product = v_primary AND lp.created_at >= v_month_start AND lp.bundle_id IS NULL)
        >= (SELECT s.monthly_max FROM public.lead_recipient_services s WHERE s.company_id = p_company_id AND s.user_id = v_user AND s.category = v_primary) THEN
      v_use_bundle := true;
    END IF;
    v_bundle := ARRAY[v_primary] || CASE WHEN v_accept_extra
      THEN coalesce((SELECT array_agg(c ORDER BY c) FROM unnest(v_bundle) c WHERE c <> v_primary), '{}') ELSE '{}'::text[] END;
  END IF;

  v_sub := public.active_subscription(p_company_id);
  IF v_sub.id IS NOT NULL THEN
    IF NOT v_member_mode THEN
      SELECT count(*) INTO v_used FROM public.lead_purchases lp
       WHERE lp.company_id = p_company_id AND lp.created_at >= v_month_start AND lp.subscription_version_id IS NOT NULL AND lp.bundle_id IS NULL;
      v_use_bundle := v_used >= v_sub.lead_quota_per_month;
      IF v_use_bundle AND v_lb.id IS NULL THEN
        RETURN QUERY SELECT 'company_capacity_full', NULL::uuid, NULL::numeric, NULL::boolean, NULL::boolean, NULL::integer, NULL::text[]; RETURN;
      END IF;
    END IF;
    v_price := CASE WHEN v_use_bundle THEN v_lb.unit_price_ex_vat ELSE v_sub.base_lead_price_ex_vat END
      + v_sub.extra_product_price_ex_vat * (cardinality(v_bundle) - 1);
    v_billable := true;
  ELSE
    v_use_bundle := false;
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
    trial_sequence_number, subscription_version_id, products, assigned_to, primary_product, bundle_id)
  VALUES (p_lead_id, p_company_id, p_purchased_by, p_source, v_price, v_billable, v_is_trial, v_trial_seq, v_sub.id, v_bundle,
    v_user, v_primary, CASE WHEN v_use_bundle THEN v_lb.id END)
  RETURNING id INTO v_new_id;

  FOREACH v_cat IN ARRAY v_bundle LOOP
    INSERT INTO public.allocation_products(lead_purchase_id, category, price_ex_vat)
    VALUES (v_new_id, v_cat, CASE
      WHEN v_sub.id IS NULL THEN CASE WHEN i = 0 THEN v_price ELSE 0 END
      WHEN i = 0 THEN v_price - v_sub.extra_product_price_ex_vat * (cardinality(v_bundle) - 1) ELSE v_sub.extra_product_price_ex_vat END);
    i := i + 1;
  END LOOP;

  UPDATE public.leads SET state = CASE WHEN v_count + 1 >= v_cap THEN 'assigned'::lead_state ELSE 'underfilled'::lead_state END,
         distributed_at = coalesce(distributed_at, now())
   WHERE id = p_lead_id;

  RETURN QUERY SELECT 'allocated', v_new_id, v_price, v_billable, v_is_trial, v_trial_seq, v_bundle;
END $function$;

CREATE OR REPLACE FUNCTION public.issue_company_month_invoice(p_company uuid, p_year integer, p_month integer)
 RETURNS TABLE(invoice_id uuid, created boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company public.companies; v_sub public.subscription_versions; v_start date; v_next date; v_id uuid; v_existing uuid; v_booking public.delivery_price_bookings; v_subtotal numeric:=0; v_fixed numeric:=0; v_vat numeric; v_begin timestamptz; v_end timestamptz;
 v_fixed_mode boolean:=false; v_extra_seats integer:=0; v_covered integer:=0; v_amount numeric; v_desc text; v_term public.contract_terminations;
BEGIN
 IF p_year NOT BETWEEN 2025 AND 2100 OR p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'INVALID_BILLING_PERIOD'; END IF;
 v_start:=make_date(p_year,p_month,1); v_next:=(v_start+interval '1 month')::date;
 IF v_next > (now() AT TIME ZONE 'Europe/Amsterdam')::date THEN RAISE EXCEPTION 'BILLING_MONTH_NOT_CLOSED'; END IF;
 v_begin:=v_start::timestamp AT TIME ZONE 'Europe/Amsterdam'; v_end:=v_next::timestamp AT TIME ZONE 'Europe/Amsterdam';
 SELECT * INTO v_company FROM public.companies WHERE id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMPANY_NOT_FOUND'; END IF;
 SELECT i.id INTO v_existing FROM public.invoices i WHERE i.company_id=p_company AND i.period_start=v_start;
 IF FOUND THEN RETURN QUERY SELECT v_existing,false; RETURN; END IF;
 IF v_company.created_at>=v_end THEN RETURN QUERY SELECT NULL::uuid,false; RETURN; END IF;
 v_sub:=public.active_subscription(p_company,v_start);
 IF v_sub.id IS NOT NULL THEN
   v_fixed_mode := v_sub.billing_mode='fixed_package';
   v_extra_seats := greatest(v_sub.paid_seats - v_sub.included_seats, 0);
   v_fixed := CASE WHEN v_fixed_mode THEN v_sub.package_fee_ex_vat ELSE v_sub.platform_fee_ex_vat END + v_extra_seats*v_sub.seat_fee_ex_vat;
 ELSE v_fixed:=v_company.monthly_fee_ex_vat; END IF;
 PERFORM b.id FROM public.delivery_price_bookings b JOIN public.lead_purchases lp ON lp.id=b.purchase_id WHERE b.company_id=p_company AND b.booked_at>=v_begin AND b.booked_at<v_end AND b.invoice_id IS NULL AND lp.billable AND NOT lp.credited AND NOT lp.is_trial AND lp.invoice_id IS NULL ORDER BY b.id FOR UPDATE OF b,lp;
 INSERT INTO public.invoices(company_id,invoice_number,period_start,period_end,subtotal_ex_vat,vat_amount,total_inc_vat,status,due_date)
 VALUES(p_company,p_year::text||lpad(p_month::text,2,'0')||'-'||upper(substr(p_company::text,1,6)),v_start,v_next-1,0,0,0,'draft',(now() AT TIME ZONE 'Europe/Amsterdam')::date+14) RETURNING id INTO v_id;
 IF v_sub.id IS NOT NULL THEN
   IF v_fixed_mode THEN
     INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Vast pakketabonnement '||initcap(coalesce(v_sub.package_code,'maatwerk'))||' ('||v_sub.lead_quota_per_month||' leads inbegrepen)',1,v_sub.package_fee_ex_vat,v_sub.package_fee_ex_vat,0.21);
   ELSE
     INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Platformbijdrage',1,v_sub.platform_fee_ex_vat,v_sub.platform_fee_ex_vat,0.21);
   END IF;
   IF v_extra_seats>0 THEN INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Accountmanagerplekken',v_extra_seats,v_sub.seat_fee_ex_vat,v_extra_seats*v_sub.seat_fee_ex_vat,0.21); END IF;
 ELSE INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Abonnement '||v_company.plan_name,1,v_fixed,v_fixed,0.21); END IF;
 v_subtotal:=v_fixed;
 FOR v_booking IN SELECT b.* FROM public.delivery_price_bookings b JOIN public.lead_purchases lp ON lp.id=b.purchase_id WHERE b.company_id=p_company AND b.booked_at>=v_begin AND b.booked_at<v_end AND b.invoice_id IS NULL AND lp.billable AND NOT lp.credited AND NOT lp.is_trial AND lp.invoice_id IS NULL ORDER BY b.booked_at, b.id FOR UPDATE OF b,lp LOOP
   v_amount:=v_booking.amount_ex_vat; v_desc:=v_booking.description;
   IF v_fixed_mode AND v_covered < v_sub.lead_quota_per_month AND NOT EXISTS (SELECT 1 FROM public.lead_purchases x WHERE x.id = v_booking.purchase_id AND x.bundle_id IS NOT NULL) THEN
     v_covered:=v_covered+1;
     v_amount:=greatest(v_amount - v_sub.base_lead_price_ex_vat, 0);
     v_desc:=v_desc||' — inbegrepen in pakket';
   END IF;
   INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate,price_booking_id) VALUES(v_id,v_desc,1,v_amount,v_amount,0.21,v_booking.id);
   v_subtotal:=v_subtotal+v_amount;
   UPDATE public.delivery_price_bookings SET invoice_id=v_id WHERE id=v_booking.id;
   UPDATE public.lead_purchases SET invoice_id=v_id WHERE id=v_booking.purchase_id;
 END LOOP;
 SELECT * INTO v_term FROM public.contract_terminations t WHERE t.company_id=p_company AND t.status='confirmed' AND t.effective_month=v_start AND t.invoice_id IS NULL AND t.settlement_ex_vat>0 FOR UPDATE;
 IF FOUND THEN
   INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Afkoop resterende minimumtermijn',v_term.remaining_months,v_term.monthly_ex_vat,v_term.settlement_ex_vat,0.21);
   v_subtotal:=v_subtotal+v_term.settlement_ex_vat;
   UPDATE public.contract_terminations SET invoice_id=v_id WHERE id=v_term.id;
 END IF;
 IF v_subtotal<=0 THEN
   UPDATE public.contract_terminations SET invoice_id=NULL WHERE invoice_id=v_id;
   DELETE FROM public.invoice_lines WHERE invoice_lines.invoice_id=v_id;
   DELETE FROM public.invoices WHERE id=v_id;
   RETURN QUERY SELECT NULL::uuid,false; RETURN;
 END IF;
 v_vat:=round(v_subtotal*0.21,2);
 UPDATE public.invoices SET subtotal_ex_vat=v_subtotal, vat_amount=v_vat, total_inc_vat=v_subtotal+v_vat WHERE id=v_id;
 PERFORM public.apply_open_credits(p_company,v_id);
 UPDATE public.invoices SET status='issued' WHERE id=v_id;
 RETURN QUERY SELECT v_id,true;
END $function$;
REVOKE ALL ON FUNCTION public.issue_company_month_invoice(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_company_month_invoice(uuid,integer,integer) TO service_role;