-- 1. Statussen en documentnummering ---------------------------------------
CREATE TYPE public.credit_note_status AS ENUM ('open', 'applied', 'refunded');

CREATE TABLE public.credit_number_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.credit_number_counters TO service_role;
ALTER TABLE public.credit_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_credit_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::int;
  v_seq integer;
BEGIN
  INSERT INTO public.credit_number_counters (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = public.credit_number_counters.last_number + 1
  RETURNING last_number INTO v_seq;
  RETURN 'CN-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END; $$;
REVOKE ALL ON FUNCTION public.next_credit_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_credit_number() TO service_role;

-- 2. Btw-percentage op factuurregels ---------------------------------------
ALTER TABLE public.invoice_lines
  ADD COLUMN vat_rate numeric(5,4) NOT NULL DEFAULT 0.2100;

ALTER TABLE public.invoices
  ADD COLUMN credit_applied_inc_vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN amount_due_inc_vat numeric(12,2)
    GENERATED ALWAYS AS (total_inc_vat - credit_applied_inc_vat) STORED;

-- 3. Creditnota's ----------------------------------------------------------
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_number text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  original_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  complaint_id uuid NOT NULL UNIQUE REFERENCES public.complaints(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.lead_purchases(id) ON DELETE SET NULL,
  status public.credit_note_status NOT NULL DEFAULT 'open',
  subtotal_ex_vat numeric(12,2) NOT NULL,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.2100,
  vat_amount numeric(12,2) NOT NULL,
  total_inc_vat numeric(12,2) NOT NULL,
  reason text,
  description text,
  applied_to_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  applied_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own credit notes" ON public.credit_notes
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX credit_notes_company_idx ON public.credit_notes (company_id, status);
CREATE INDEX credit_notes_invoice_idx ON public.credit_notes (original_invoice_id);
CREATE TRIGGER credit_notes_touch BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  lead_purchase_id uuid REFERENCES public.lead_purchases(id) ON DELETE SET NULL,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_amount_ex_vat numeric(12,2) NOT NULL,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.2100,
  line_total_ex_vat numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_note_lines TO authenticated;
GRANT ALL ON public.credit_note_lines TO service_role;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own credit note lines" ON public.credit_note_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.credit_notes cn
    WHERE cn.id = credit_note_id
      AND (cn.company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'))
  ));
CREATE INDEX credit_note_lines_note_idx ON public.credit_note_lines (credit_note_id);

-- 4. Financieel logboek ----------------------------------------------------
CREATE TABLE public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.lead_purchases(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  amount_inc_vat numeric(12,2),
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_events TO authenticated;
GRANT ALL ON public.financial_events TO service_role;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read financial events" ON public.financial_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX financial_events_company_idx ON public.financial_events (company_id, created_at DESC);

-- 5. Creditnota bepalen en aanmaken (idempotent) ---------------------------
CREATE OR REPLACE FUNCTION public.ensure_credit_note_for_complaint(
  p_complaint_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS TABLE(result text, credit_note_id uuid, credit_number text, total_inc_vat numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complaint public.complaints;
  v_purchase public.lead_purchases;
  v_invoice public.invoices;
  v_rate numeric(5,4);
  v_price numeric(12,2);
  v_vat numeric(12,2);
  v_total numeric(12,2);
  v_existing public.credit_notes;
  v_number text;
  v_id uuid;
  v_lead_ref text;
BEGIN
  SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'complaint_not_found'::text, NULL::uuid, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_existing FROM public.credit_notes WHERE complaint_id = p_complaint_id;
  IF FOUND THEN
    RETURN QUERY SELECT 'existing'::text, v_existing.id, v_existing.credit_number, v_existing.total_inc_vat;
    RETURN;
  END IF;

  IF v_complaint.status <> 'approved' THEN
    RETURN QUERY SELECT 'not_approved'::text, NULL::uuid, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_purchase FROM public.lead_purchases WHERE id = v_complaint.purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'purchase_not_found'::text, NULL::uuid, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  -- Proeflead of nulwaarde: nooit een financiële creditnota.
  IF v_purchase.is_trial OR COALESCE(v_purchase.price_ex_vat, 0) <= 0 THEN
    RETURN QUERY SELECT 'no_credit_required'::text, NULL::uuid, NULL::text, 0::numeric;
    RETURN;
  END IF;

  -- Nog niet gefactureerd: alleen uitsluiten van toekomstige facturatie.
  IF v_purchase.invoice_id IS NULL THEN
    RETURN QUERY SELECT 'excluded_before_invoice'::text, NULL::uuid, NULL::text, 0::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_purchase.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invoice_not_found'::text, NULL::uuid, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  -- Btw volgt de oorspronkelijke factuurregel, niet een aanname.
  SELECT max(il.vat_rate) INTO v_rate FROM public.invoice_lines il WHERE il.invoice_id = v_invoice.id;
  IF v_rate IS NULL THEN
    v_rate := CASE
      WHEN COALESCE(v_invoice.subtotal_ex_vat, 0) > 0
      THEN round(v_invoice.vat_amount / v_invoice.subtotal_ex_vat, 4)
      ELSE 0.2100 END;
  END IF;

  v_price := round(v_purchase.price_ex_vat::numeric, 2);
  v_vat := round(v_price * v_rate, 2);
  v_total := v_price + v_vat;

  SELECT COALESCE('OO-L-' || upper(substr(l.id::text, 1, 8)), 'lead')
    INTO v_lead_ref
  FROM public.leads l WHERE l.id = v_purchase.lead_id;

  v_number := public.next_credit_number();

  INSERT INTO public.credit_notes (
    credit_number, company_id, original_invoice_id, complaint_id, purchase_id,
    status, subtotal_ex_vat, vat_rate, vat_amount, total_inc_vat,
    reason, description, created_by
  ) VALUES (
    v_number, v_complaint.company_id, v_invoice.id, v_complaint.id, v_purchase.id,
    'open', v_price, v_rate, v_vat, v_total,
    v_complaint.reason::text,
    'Creditering ' || COALESCE(v_lead_ref, 'lead') || ' (factuur ' || v_invoice.invoice_number || ')',
    p_actor
  )
  ON CONFLICT (complaint_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT * INTO v_existing FROM public.credit_notes WHERE complaint_id = p_complaint_id;
    RETURN QUERY SELECT 'existing'::text, v_existing.id, v_existing.credit_number, v_existing.total_inc_vat;
    RETURN;
  END IF;

  INSERT INTO public.credit_note_lines (
    credit_note_id, lead_purchase_id, complaint_id, description,
    quantity, unit_amount_ex_vat, vat_rate, line_total_ex_vat
  ) VALUES (
    v_id, v_purchase.id, v_complaint.id,
    'Creditering ' || COALESCE(v_lead_ref, 'lead'),
    1, v_price, v_rate, v_price
  );

  -- Onbetaalde factuur: het credit verlaagt direct het openstaande bedrag.
  -- Betaalde factuur: het credit blijft open als tegoed van het bedrijf.
  IF v_invoice.status <> 'paid' AND v_invoice.paid_at IS NULL THEN
    UPDATE public.invoices
       SET credit_applied_inc_vat = LEAST(total_inc_vat, credit_applied_inc_vat + v_total)
     WHERE id = v_invoice.id;
    UPDATE public.credit_notes
       SET status = 'applied', applied_to_invoice_id = v_invoice.id, applied_at = now()
     WHERE id = v_id;
  END IF;

  INSERT INTO public.financial_events (
    event_type, company_id, complaint_id, purchase_id, invoice_id, credit_note_id,
    amount_inc_vat, actor_id, detail
  ) VALUES (
    'credit_note_created', v_complaint.company_id, v_complaint.id, v_purchase.id,
    v_invoice.id, v_id, v_total, p_actor,
    jsonb_build_object('credit_number', v_number, 'vat_rate', v_rate, 'subtotal_ex_vat', v_price)
  );

  RETURN QUERY SELECT 'credit_note_created'::text, v_id, v_number, v_total;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_credit_note_for_complaint(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_credit_note_for_complaint(uuid, uuid) TO service_role;

-- 6. Reclamatie beoordelen inclusief financiële afhandeling ----------------
CREATE OR REPLACE FUNCTION public.review_complaint_with_credit(
  p_complaint_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS TABLE(result text, credit_note_id uuid, credit_number text, total_inc_vat numeric, credit_ex_vat numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complaint public.complaints;
  v_purchase public.lead_purchases;
  v_credit numeric(12,2) := 0;
  v_row record;
BEGIN
  SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'complaint_not_found'::text, NULL::uuid, NULL::text, NULL::numeric, 0::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_purchase FROM public.lead_purchases WHERE id = v_complaint.purchase_id FOR UPDATE;

  IF NOT p_approve THEN
    UPDATE public.complaints
       SET status = 'rejected', reviewed_by = p_actor, reviewed_at = now(),
           review_note = p_note, credit_ex_vat = 0
     WHERE id = p_complaint_id;
    INSERT INTO public.financial_events (event_type, company_id, complaint_id, purchase_id, actor_id)
    VALUES ('complaint_rejected', v_complaint.company_id, v_complaint.id, v_complaint.purchase_id, p_actor);
    RETURN QUERY SELECT 'rejected'::text, NULL::uuid, NULL::text, NULL::numeric, 0::numeric;
    RETURN;
  END IF;

  IF v_purchase.id IS NOT NULL AND NOT v_purchase.is_trial THEN
    v_credit := round(COALESCE(v_purchase.price_ex_vat, 0)::numeric, 2);
  END IF;

  UPDATE public.complaints
     SET status = 'approved', reviewed_by = p_actor, reviewed_at = now(),
         review_note = p_note, credit_ex_vat = v_credit
   WHERE id = p_complaint_id;

  IF v_purchase.id IS NOT NULL THEN
    UPDATE public.lead_purchases SET credited = true, billable = false WHERE id = v_purchase.id;
  END IF;

  INSERT INTO public.financial_events (event_type, company_id, complaint_id, purchase_id, invoice_id, amount_inc_vat, actor_id)
  VALUES ('complaint_approved', v_complaint.company_id, v_complaint.id, v_complaint.purchase_id,
          v_purchase.invoice_id, v_credit, p_actor);

  SELECT * INTO v_row FROM public.ensure_credit_note_for_complaint(p_complaint_id, p_actor);
  RETURN QUERY SELECT v_row.result, v_row.credit_note_id, v_row.credit_number, v_row.total_inc_vat, v_credit;
END; $$;
REVOKE ALL ON FUNCTION public.review_complaint_with_credit(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_complaint_with_credit(uuid, boolean, text, uuid) TO service_role;

-- 7. Openstaande credits verrekenen met een nieuwe factuur -----------------
CREATE OR REPLACE FUNCTION public.apply_open_credits(p_company_id uuid, p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_remaining numeric(12,2);
  v_applied numeric(12,2) := 0;
  v_cn public.credit_notes;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.company_id <> p_company_id THEN RETURN 0; END IF;

  v_remaining := v_invoice.total_inc_vat - v_invoice.credit_applied_inc_vat;

  FOR v_cn IN
    SELECT * FROM public.credit_notes
     WHERE company_id = p_company_id AND status = 'open'
     ORDER BY issued_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    CONTINUE WHEN v_cn.total_inc_vat > v_remaining; -- geen deelverrekening
    UPDATE public.credit_notes
       SET status = 'applied', applied_to_invoice_id = p_invoice_id, applied_at = now()
     WHERE id = v_cn.id;
    v_remaining := v_remaining - v_cn.total_inc_vat;
    v_applied := v_applied + v_cn.total_inc_vat;
    INSERT INTO public.financial_events (event_type, company_id, credit_note_id, invoice_id, amount_inc_vat)
    VALUES ('credit_applied', p_company_id, v_cn.id, p_invoice_id, v_cn.total_inc_vat);
  END LOOP;

  IF v_applied > 0 THEN
    UPDATE public.invoices
       SET credit_applied_inc_vat = credit_applied_inc_vat + v_applied
     WHERE id = p_invoice_id;
  END IF;

  RETURN v_applied;
END; $$;
REVOKE ALL ON FUNCTION public.apply_open_credits(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_open_credits(uuid, uuid) TO service_role;

-- 8. Backfill: bestaande goedgekeurde klachten over gefactureerde leads ----
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.id
    FROM public.complaints c
    JOIN public.lead_purchases lp ON lp.id = c.purchase_id
    WHERE c.status = 'approved'
      AND lp.invoice_id IS NOT NULL
      AND lp.is_trial = false
      AND COALESCE(lp.price_ex_vat, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.credit_notes cn WHERE cn.complaint_id = c.id)
    ORDER BY c.reviewed_at NULLS LAST, c.created_at
  LOOP
    PERFORM public.ensure_credit_note_for_complaint(r.id, NULL);
  END LOOP;
END $$;