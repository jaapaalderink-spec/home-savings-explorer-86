-- Naamconflict: de uitvoerkolom total_inc_vat botste met de factuurkolom.
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

  IF v_purchase.is_trial OR COALESCE(v_purchase.price_ex_vat, 0) <= 0 THEN
    RETURN QUERY SELECT 'no_credit_required'::text, NULL::uuid, NULL::text, 0::numeric;
    RETURN;
  END IF;

  IF v_purchase.invoice_id IS NULL THEN
    RETURN QUERY SELECT 'excluded_before_invoice'::text, NULL::uuid, NULL::text, 0::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_purchase.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invoice_not_found'::text, NULL::uuid, NULL::text, NULL::numeric;
    RETURN;
  END IF;

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

  IF v_invoice.status <> 'paid' AND v_invoice.paid_at IS NULL THEN
    UPDATE public.invoices AS inv
       SET credit_applied_inc_vat = LEAST(inv.total_inc_vat, inv.credit_applied_inc_vat + v_total)
     WHERE inv.id = v_invoice.id;
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