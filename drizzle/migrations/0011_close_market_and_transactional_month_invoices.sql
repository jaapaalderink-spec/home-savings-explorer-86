-- Close all marketplace writes without changing historical purchases.
ALTER TABLE public.lead_purchases ALTER COLUMN source SET DEFAULT 'assigned';
COMMENT ON COLUMN public.leads.market_enabled IS 'DEPRECATED: marketplace retired; historical values retained only.';
CREATE OR REPLACE FUNCTION public.reject_market_purchase() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.source = 'market' THEN RAISE EXCEPTION 'MARKET_CLOSED'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reject_market_purchase BEFORE INSERT ON public.lead_purchases FOR EACH ROW EXECUTE FUNCTION public.reject_market_purchase();
-- Immutable delivery price snapshots with an exactly-once invoice claim.
CREATE TABLE public.delivery_price_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL UNIQUE,
 company_id uuid NOT NULL REFERENCES public.companies(id), purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id),
 amount_ex_vat numeric(12,2) NOT NULL CHECK(amount_ex_vat >= 0),
 description text NOT NULL, booked_at timestamptz NOT NULL, invoice_id uuid REFERENCES public.invoices(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_price_bookings TO authenticated;
GRANT ALL ON public.delivery_price_bookings TO service_role;
ALTER TABLE public.delivery_price_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_company_read ON public.delivery_price_bookings FOR SELECT TO authenticated USING(company_id=public.current_company_id() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX delivery_bookings_unbilled ON public.delivery_price_bookings(company_id,booked_at) WHERE invoice_id IS NULL;
INSERT INTO public.delivery_price_bookings(source_key,company_id,purchase_id,amount_ex_vat,description,booked_at,invoice_id)
SELECT 'delivery:'||id,company_id,id,price_ex_vat,'Geleverde aanvraag ('||greatest(cardinality(products),1)||' product(en))',created_at,invoice_id FROM public.lead_purchases WHERE billable AND NOT is_trial;
CREATE OR REPLACE FUNCTION public.book_delivery_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.billable AND NOT NEW.is_trial THEN INSERT INTO public.delivery_price_bookings(source_key,company_id,purchase_id,amount_ex_vat,description,booked_at,invoice_id) VALUES('delivery:'||NEW.id,NEW.company_id,NEW.id,NEW.price_ex_vat,'Geleverde aanvraag ('||greatest(cardinality(NEW.products),1)||' product(en))',NEW.created_at,NEW.invoice_id); END IF; RETURN NEW; END $$;
CREATE TRIGGER book_delivery_price AFTER INSERT ON public.lead_purchases FOR EACH ROW EXECUTE FUNCTION public.book_delivery_price();
CREATE OR REPLACE FUNCTION public.guard_delivery_booking() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PRICE_BOOKING_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-'invoice_id') IS DISTINCT FROM (to_jsonb(OLD)-'invoice_id') OR (OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN RAISE EXCEPTION 'PRICE_BOOKING_IMMUTABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_delivery_booking BEFORE UPDATE OR DELETE ON public.delivery_price_bookings FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_booking();
ALTER TABLE public.invoice_lines ADD COLUMN price_booking_id uuid REFERENCES public.delivery_price_bookings(id);
CREATE UNIQUE INDEX invoice_lines_booking_unique ON public.invoice_lines(price_booking_id) WHERE price_booking_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.guard_issued_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE'; END IF; RETURN OLD; END IF;
 IF OLD.status <> 'draft' AND ROW(NEW.company_id,NEW.invoice_number,NEW.period_start,NEW.period_end,NEW.subtotal_ex_vat,NEW.vat_amount,NEW.total_inc_vat,NEW.due_date) IS DISTINCT FROM ROW(OLD.company_id,OLD.invoice_number,OLD.period_start,OLD.period_end,OLD.subtotal_ex_vat,OLD.vat_amount,OLD.total_inc_vat,OLD.due_date) THEN RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE'; END IF;
 IF OLD.status <> 'draft' AND NEW.status='draft' THEN RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_issued_invoice BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_issued_invoice();
CREATE OR REPLACE FUNCTION public.guard_issued_invoice_line() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE v_id uuid; BEGIN
 IF TG_OP<>'INSERT' THEN SELECT id INTO v_id FROM public.invoices WHERE id=OLD.invoice_id AND status<>'draft' FOR UPDATE; IF FOUND THEN RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE'; END IF; END IF;
 IF TG_OP<>'DELETE' THEN SELECT id INTO v_id FROM public.invoices WHERE id=NEW.invoice_id AND status<>'draft' FOR UPDATE; IF FOUND THEN RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE'; END IF; RETURN NEW; END IF; RETURN OLD; END $$;
CREATE TRIGGER guard_issued_invoice_line BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.guard_issued_invoice_line();
CREATE OR REPLACE FUNCTION public.issue_company_month_invoice(p_company uuid,p_year integer,p_month integer) RETURNS TABLE(invoice_id uuid,created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_company public.companies; v_sub public.subscription_versions; v_start date; v_next date; v_id uuid; v_existing uuid; v_booking public.delivery_price_bookings; v_subtotal numeric:=0; v_fixed numeric:=0; v_vat numeric; v_begin timestamptz; v_end timestamptz;
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
 v_fixed:=CASE WHEN v_sub.id IS NOT NULL THEN v_sub.platform_fee_ex_vat+v_sub.paid_seats*v_sub.seat_fee_ex_vat ELSE v_company.monthly_fee_ex_vat END;
 SELECT v_fixed+coalesce(sum(b.amount_ex_vat),0) INTO v_subtotal FROM public.delivery_price_bookings b JOIN public.lead_purchases lp ON lp.id=b.purchase_id WHERE b.company_id=p_company AND b.booked_at>=v_begin AND b.booked_at<v_end AND b.invoice_id IS NULL AND lp.billable AND NOT lp.credited AND NOT lp.is_trial AND lp.invoice_id IS NULL;
 IF v_subtotal<=0 THEN RETURN QUERY SELECT NULL::uuid,false; RETURN; END IF;
 v_vat:=round(v_subtotal*0.21,2);
 INSERT INTO public.invoices(company_id,invoice_number,period_start,period_end,subtotal_ex_vat,vat_amount,total_inc_vat,status,due_date)
 VALUES(p_company,p_year::text||lpad(p_month::text,2,'0')||'-'||upper(substr(p_company::text,1,6)),v_start,v_next-1,v_subtotal,v_vat,v_subtotal+v_vat,'draft',(now() AT TIME ZONE 'Europe/Amsterdam')::date+14) RETURNING id INTO v_id;
 IF v_sub.id IS NOT NULL THEN
 INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Platformbijdrage',1,v_sub.platform_fee_ex_vat,v_sub.platform_fee_ex_vat,0.21);
 IF v_sub.paid_seats>0 THEN INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Accountmanagerplekken',v_sub.paid_seats,v_sub.seat_fee_ex_vat,v_sub.paid_seats*v_sub.seat_fee_ex_vat,0.21); END IF;
 ELSE INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate) VALUES(v_id,'Abonnement '||v_company.plan_name,1,v_fixed,v_fixed,0.21); END IF;
 FOR v_booking IN SELECT b.* FROM public.delivery_price_bookings b JOIN public.lead_purchases lp ON lp.id=b.purchase_id WHERE b.company_id=p_company AND b.booked_at>=v_begin AND b.booked_at<v_end AND b.invoice_id IS NULL AND lp.billable AND NOT lp.credited AND NOT lp.is_trial AND lp.invoice_id IS NULL ORDER BY b.id FOR UPDATE OF b,lp LOOP
 INSERT INTO public.invoice_lines(invoice_id,description,quantity,unit_price_ex_vat,amount_ex_vat,vat_rate,price_booking_id) VALUES(v_id,v_booking.description,1,v_booking.amount_ex_vat,v_booking.amount_ex_vat,0.21,v_booking.id);
 UPDATE public.delivery_price_bookings SET invoice_id=v_id WHERE id=v_booking.id;
 UPDATE public.lead_purchases SET invoice_id=v_id WHERE id=v_booking.purchase_id;
 END LOOP;
 PERFORM public.apply_open_credits(p_company,v_id);
 UPDATE public.invoices SET status='issued' WHERE id=v_id;
 RETURN QUERY SELECT v_id,true;
END $$;
REVOKE ALL ON FUNCTION public.issue_company_month_invoice(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_company_month_invoice(uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.book_delivery_price() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_delivery_price() TO service_role;
