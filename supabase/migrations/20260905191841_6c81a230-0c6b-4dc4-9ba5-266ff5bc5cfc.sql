ALTER FUNCTION public.trial_lead_allowance() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.trial_lead_allowance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_lead_allowance() TO service_role;