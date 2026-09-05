CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event text,
  p_entity text,
  p_entity_id uuid,
  p_company uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.log_audit_event(
    p_event::public.audit_event_type,
    p_entity::public.audit_entity,
    p_entity_id,
    p_company,
    p_actor,
    p_source::public.audit_source,
    p_metadata
  )
$$;
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, uuid, uuid, text, jsonb) TO service_role;