REVOKE ALL ON FUNCTION public.audit_leads() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_lead_purchases() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_complaints() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_invoices() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_payments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_credit_notes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_companies() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deny_history_mutation() FROM PUBLIC, anon, authenticated;