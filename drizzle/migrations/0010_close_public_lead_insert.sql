DROP POLICY IF EXISTS "Anyone may submit a lead" ON public.leads;
REVOKE INSERT ON public.leads FROM anon, authenticated;