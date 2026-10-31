ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz, ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS paid_manually_by uuid;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS payment_suspended_at timestamptz;

-- Pauzeer bij >= 2 vervallen onbetaalde facturen; heractiveer zodra dat < 2 is (alleen als de pauze door wanbetaling kwam).
CREATE OR REPLACE FUNCTION public.sync_company_payment_suspension(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_overdue int; v_c record;
BEGIN
  SELECT count(*) INTO v_overdue FROM invoices
   WHERE company_id = p_company_id AND payment_status <> 'paid'
     AND status NOT IN ('draft','paid','cancelled','credited')
     AND due_date < (now() AT TIME ZONE 'Europe/Amsterdam')::date
     AND COALESCE(amount_due_inc_vat, total_inc_vat) > 0;
  SELECT id, active, approval_status, payment_suspended_at INTO v_c FROM companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_overdue >= 2 AND v_c.payment_suspended_at IS NULL AND v_c.approval_status = 'approved' AND v_c.active THEN
    UPDATE companies SET active = false, payment_suspended_at = now() WHERE id = p_company_id;
    RETURN true;
  ELSIF v_overdue < 2 AND v_c.payment_suspended_at IS NOT NULL THEN
    UPDATE companies SET payment_suspended_at = NULL,
      active = (approval_status = 'approved') WHERE id = p_company_id;
  END IF;
  RETURN v_overdue >= 2;
END $$;
REVOKE ALL ON FUNCTION public.sync_company_payment_suspension(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_company_payment_suspension(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_all_payment_suspensions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT company_id FROM invoices UNION SELECT id FROM companies WHERE payment_suspended_at IS NOT NULL LOOP
    PERFORM sync_company_payment_suspension(r.company_id);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.sync_all_payment_suspensions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_all_payment_suspensions() TO service_role;

CREATE OR REPLACE FUNCTION public.trg_invoice_payment_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sync_company_payment_suspension(NEW.company_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_payment_suspension ON public.invoices;
CREATE TRIGGER invoice_payment_suspension AFTER INSERT OR UPDATE OF payment_status, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_payment_suspension();

-- Handmatige afboeking (bankoverschrijving) door platformbeheer.
CREATE OR REPLACE FUNCTION public.mark_invoice_paid_manually(p_invoice_id uuid, p_admin uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT id, status, payment_status INTO v FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v.payment_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v.status IN ('draft','cancelled','credited') THEN RETURN 'not_payable'; END IF;
  UPDATE invoices SET payment_status = 'paid', status = 'paid', paid_at = now(), paid_manually_by = p_admin WHERE id = p_invoice_id;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.mark_invoice_paid_manually(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_manually(uuid, uuid) TO service_role;