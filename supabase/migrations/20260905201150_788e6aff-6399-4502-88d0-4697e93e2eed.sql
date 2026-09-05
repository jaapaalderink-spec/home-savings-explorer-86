CREATE OR REPLACE FUNCTION public.audit_source_setting(_fallback text)
RETURNS public.audit_source
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.actor_source', true), '')::public.audit_source,
    _fallback::public.audit_source
  )
$$;
REVOKE ALL ON FUNCTION public.audit_source_setting(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_source_setting(text) TO service_role;
REVOKE ALL ON FUNCTION public.audit_source_setting(public.audit_source) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_source_setting(public.audit_source) TO service_role;
REVOKE ALL ON FUNCTION public.audit_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_actor_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_partner_visible(public.audit_event_type) FROM PUBLIC, anon;