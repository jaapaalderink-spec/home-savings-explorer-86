ALTER TABLE public.subscription_versions
  ADD COLUMN package_code text CHECK (package_code IN ('start','groei','team')),
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'actual_delivered' CHECK (billing_mode IN ('actual_delivered','fixed_package')),
  ADD COLUMN package_fee_ex_vat numeric CHECK (package_fee_ex_vat >= 0),
  ADD COLUMN included_seats integer NOT NULL DEFAULT 0 CHECK (included_seats >= 0),
  ADD COLUMN min_term_months integer NOT NULL DEFAULT 0 CHECK (min_term_months >= 0),
  ADD COLUMN notice_months integer NOT NULL DEFAULT 1 CHECK (notice_months >= 0);
ALTER TABLE public.subscription_versions ADD CONSTRAINT fixed_package_needs_fee
  CHECK (billing_mode <> 'fixed_package' OR package_fee_ex_vat IS NOT NULL);

CREATE OR REPLACE FUNCTION public.issue_company_month_invoice(p_company uuid, p_year integer, p_month integer)
 RETURNS TABLE(invoice_id uuid, created boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company public.companies; v_sub public.subscription_versions; v_start date; v_next date; v_id uuid; v_existing uuid; v_booking public.delivery_price_bookings; v_subtotal numeric:=0; v_fixed numeric:=0; v_vat numeric; v_begin timestamptz; v_end timestamptz;
 v_fixed_mode boolean:=false; v_extra_seats integer:=0; v_covered integer:=0; v_amount numeric; v_desc text;
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
   IF v_fixed_mode AND v_covered < v_sub.lead_quota_per_month THEN
     v_covered:=v_covered+1;
     v_amount:=greatest(v_amount - v_sub.base_lead_price_ex_vat, 0);
     v_desc:=v_desc||' — inbegrepen in pakket';
   END IF;
   INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate,price_booking_id) VALUES(v_id,v_desc,1,v_amount,v_amount,0.21,v_booking.id);
   v_subtotal:=v_subtotal+v_amount;
   UPDATE public.delivery_price_bookings SET invoice_id=v_id WHERE id=v_booking.id;
   UPDATE public.lead_purchases SET invoice_id=v_id WHERE id=v_booking.purchase_id;
 END LOOP;
 IF v_subtotal<=0 THEN
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