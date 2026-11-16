DROP POLICY IF EXISTS "Regions are public" ON public.regions;
DROP POLICY IF EXISTS "Authenticated users read postcode coordinates" ON public.postcode_geo;
REVOKE SELECT ON public.regions FROM anon, authenticated;
REVOKE SELECT ON public.postcode_geo FROM anon, authenticated;
GRANT ALL ON public.regions TO service_role;
GRANT ALL ON public.postcode_geo TO service_role;