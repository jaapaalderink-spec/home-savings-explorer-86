DROP POLICY IF EXISTS "Owners insert capacity" ON public.company_products;
DROP POLICY IF EXISTS "Owners update capacity" ON public.company_products;
DROP POLICY IF EXISTS "Owners delete capacity" ON public.company_products;
REVOKE INSERT, UPDATE, DELETE ON public.company_products FROM anon, authenticated;
DROP POLICY IF EXISTS "Owners insert work areas" ON public.company_regions;
DROP POLICY IF EXISTS "Owners delete work areas" ON public.company_regions;
REVOKE INSERT, UPDATE, DELETE ON public.company_regions FROM anon, authenticated;
DROP POLICY IF EXISTS "Public can read site tags" ON public.site_integrations;
REVOKE ALL ON public.site_integrations FROM anon, authenticated;
GRANT ALL ON public.site_integrations TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (coalesce(auth.role(), '') NOT IN ('authenticated','anon') OR _user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    AND (
      _role <> 'admin'
      OR auth.uid() IS NULL
      OR auth.uid() <> _user_id
      OR coalesce(auth.jwt()->>'aal', '') = 'aal2'
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_purchase(p_id uuid, p_actor uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (coalesce(auth.role(), '') NOT IN ('authenticated','anon') OR p_actor = auth.uid())
   AND (EXISTS(SELECT 1 FROM public.lead_purchases lp JOIN public.profiles pr ON pr.id=p_actor AND pr.company_id=lp.company_id
     WHERE lp.id=p_id AND (lp.assigned_to=p_actor OR public.has_role(p_actor,'owner')))
   OR (p_actor=auth.uid() AND public.has_role(p_actor,'admin')))
$function$;