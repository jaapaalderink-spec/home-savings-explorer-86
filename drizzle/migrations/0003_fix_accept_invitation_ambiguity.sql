CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_token_hash text, p_user uuid, p_email text)
RETURNS TABLE(result text, company_id uuid, role public.app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE inv public.company_invitations%ROWTYPE; cur uuid;
BEGIN
  SELECT * INTO inv FROM public.company_invitations i WHERE i.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::public.app_role; RETURN; END IF;
  IF inv.revoked_at IS NOT NULL THEN RETURN QUERY SELECT 'REVOKED'::text, inv.company_id, inv.role; RETURN; END IF;
  IF inv.accepted_at IS NOT NULL THEN RETURN QUERY SELECT 'USED'::text, inv.company_id, inv.role; RETURN; END IF;
  IF inv.expires_at < now() THEN RETURN QUERY SELECT 'EXPIRED'::text, inv.company_id, inv.role; RETURN; END IF;
  IF lower(inv.email) <> lower(coalesce(p_email,'')) THEN RETURN QUERY SELECT 'EMAIL_MISMATCH'::text, inv.company_id, inv.role; RETURN; END IF;
  SELECT p.company_id INTO cur FROM public.profiles p WHERE p.id = p_user FOR UPDATE;
  IF cur IS NOT NULL AND cur <> inv.company_id THEN RETURN QUERY SELECT 'OTHER_COMPANY'::text, inv.company_id, inv.role; RETURN; END IF;

  UPDATE public.profiles p SET company_id = inv.company_id WHERE p.id = p_user;
  INSERT INTO public.user_roles AS ur (user_id, role) VALUES (p_user, inv.role) ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.company_invitations i SET accepted_at = now(), accepted_by = p_user WHERE i.id = inv.id;
  PERFORM public.log_audit_event('TEAM_INVITE_ACCEPTED'::text,'company'::text, inv.company_id, inv.company_id, p_user, 'partner'::text,
    jsonb_build_object('invitation_id', inv.id, 'role', inv.role, 'seat_fee_ex_vat', inv.seat_fee_ex_vat, 'seat_start_date', inv.seat_start_date));
  RETURN QUERY SELECT 'OK'::text, inv.company_id, inv.role;
END $$;
REVOKE ALL ON FUNCTION public.accept_company_invitation(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text) TO service_role;