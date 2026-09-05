CREATE OR REPLACE FUNCTION public.audit_companies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.audit_actor();
  v_profile jsonb := '[]'::jsonb;
  v_commercial jsonb := '[]'::jsonb;
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    v_profile := v_profile || jsonb_build_object('field', 'name', 'old', OLD.name, 'new', NEW.name);
  END IF;
  IF NEW.address IS DISTINCT FROM OLD.address THEN
    v_profile := v_profile || jsonb_build_object('field', 'address', 'old', OLD.address, 'new', NEW.address);
  END IF;
  IF NEW.billing_email IS DISTINCT FROM OLD.billing_email THEN
    v_profile := v_profile || jsonb_build_object('field', 'billing_email', 'old', OLD.billing_email, 'new', NEW.billing_email);
  END IF;
  IF NEW.vat_number IS DISTINCT FROM OLD.vat_number THEN
    v_profile := v_profile || jsonb_build_object('field', 'vat_number', 'old', OLD.vat_number, 'new', NEW.vat_number);
  END IF;

  IF NEW.plan_name IS DISTINCT FROM OLD.plan_name THEN
    v_commercial := v_commercial || jsonb_build_object('field', 'plan_name', 'old', OLD.plan_name, 'new', NEW.plan_name);
  END IF;
  IF NEW.monthly_lead_limit IS DISTINCT FROM OLD.monthly_lead_limit THEN
    v_commercial := v_commercial || jsonb_build_object('field', 'monthly_lead_limit', 'old', OLD.monthly_lead_limit, 'new', NEW.monthly_lead_limit);
  END IF;
  IF NEW.monthly_fee_ex_vat IS DISTINCT FROM OLD.monthly_fee_ex_vat THEN
    v_commercial := v_commercial || jsonb_build_object('field', 'monthly_fee_ex_vat', 'old', OLD.monthly_fee_ex_vat, 'new', NEW.monthly_fee_ex_vat);
  END IF;
  IF NEW.categories IS DISTINCT FROM OLD.categories THEN
    v_commercial := v_commercial || jsonb_build_object('field', 'categories', 'old', to_jsonb(OLD.categories), 'new', to_jsonb(NEW.categories));
  END IF;

  IF jsonb_array_length(v_profile) > 0 THEN
    PERFORM public.log_audit_event('COMPANY_PROFILE_UPDATED'::public.audit_event_type, 'company'::public.audit_entity,
      NEW.id, NEW.id, v_actor,
      public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'partner' END),
      jsonb_build_object('changes', v_profile));
  END IF;

  IF jsonb_array_length(v_commercial) > 0 THEN
    PERFORM public.log_audit_event('COMPANY_COMMERCIAL_SETTINGS_UPDATED'::public.audit_event_type, 'company'::public.audit_entity,
      NEW.id, NEW.id, v_actor,
      public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END),
      jsonb_build_object('changes', v_commercial));
  END IF;

  IF NEW.active IS DISTINCT FROM OLD.active THEN
    PERFORM public.log_audit_event(
      (CASE WHEN NEW.active THEN 'COMPANY_ACTIVATED' ELSE 'COMPANY_DEACTIVATED' END)::public.audit_event_type,
      'company'::public.audit_entity, NEW.id, NEW.id, v_actor,
      public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END),
      jsonb_build_object('field', 'active', 'old', OLD.active, 'new', NEW.active));
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.audit_companies() FROM PUBLIC, anon, authenticated;