CREATE TABLE public.staff_permissions (
  user_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN ('leads','partners','billing','quality','calculator','coverage')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);
GRANT SELECT ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and self read staff permissions" ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL CHECK (role IN ('owner','account_manager')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid,
  seat_fee_ex_vat numeric NOT NULL DEFAULT 0,
  seat_start_date date,
  monthly_total_ex_vat numeric,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_invitations_company_idx ON public.company_invitations(company_id);
CREATE UNIQUE INDEX company_invitations_open_email_idx ON public.company_invitations(company_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
GRANT SELECT ON public.company_invitations TO authenticated;
GRANT ALL ON public.company_invitations TO service_role;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read invitations" ON public.company_invitations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Uitnodiging accepteren: eenmalig, verlopend, e-mail moet overeenkomen.
CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_token_hash text, p_user uuid, p_email text)
RETURNS TABLE(result text, company_id uuid, role public.app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.company_invitations%ROWTYPE; cur uuid;
BEGIN
  SELECT * INTO inv FROM public.company_invitations WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::public.app_role; RETURN; END IF;
  IF inv.revoked_at IS NOT NULL THEN RETURN QUERY SELECT 'REVOKED'::text, inv.company_id, inv.role; RETURN; END IF;
  IF inv.accepted_at IS NOT NULL THEN RETURN QUERY SELECT 'USED'::text, inv.company_id, inv.role; RETURN; END IF;
  IF inv.expires_at < now() THEN RETURN QUERY SELECT 'EXPIRED'::text, inv.company_id, inv.role; RETURN; END IF;
  IF lower(inv.email) <> lower(coalesce(p_email,'')) THEN RETURN QUERY SELECT 'EMAIL_MISMATCH'::text, inv.company_id, inv.role; RETURN; END IF;
  SELECT p.company_id INTO cur FROM public.profiles p WHERE p.id = p_user FOR UPDATE;
  IF cur IS NOT NULL AND cur <> inv.company_id THEN RETURN QUERY SELECT 'OTHER_COMPANY'::text, inv.company_id, inv.role; RETURN; END IF;

  UPDATE public.profiles SET company_id = inv.company_id WHERE id = p_user;
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user, inv.role) ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.company_invitations SET accepted_at = now(), accepted_by = p_user WHERE id = inv.id;
  PERFORM public.log_audit_event('TEAM_INVITE_ACCEPTED','company', inv.company_id, inv.company_id, p_user, 'partner',
    jsonb_build_object('invitation_id', inv.id, 'role', inv.role, 'seat_fee_ex_vat', inv.seat_fee_ex_vat, 'seat_start_date', inv.seat_start_date));
  RETURN QUERY SELECT 'OK'::text, inv.company_id, inv.role;
END $$;

-- Rol wijzigen of lid verwijderen; laatste eigenaar blijft beschermd.
CREATE OR REPLACE FUNCTION public.team_update_member(p_company uuid, p_target uuid, p_action text, p_actor uuid, p_source text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_company uuid; target_is_owner boolean; owners int;
BEGIN
  IF p_action NOT IN ('make_owner','make_account_manager','remove') THEN RETURN 'BAD_ACTION'; END IF;
  PERFORM 1 FROM public.companies WHERE id = p_company FOR UPDATE;
  SELECT company_id INTO target_company FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF target_company IS DISTINCT FROM p_company THEN RETURN 'NOT_MEMBER'; END IF;
  IF p_target = p_actor AND p_source <> 'admin' THEN RETURN 'SELF'; END IF;

  target_is_owner := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_target AND role = 'owner');
  SELECT count(*) INTO owners FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'owner'
    WHERE p.company_id = p_company;
  IF target_is_owner AND p_action <> 'make_owner' AND owners <= 1 THEN RETURN 'LAST_OWNER'; END IF;

  IF p_action = 'make_owner' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (p_target, 'owner') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = p_target AND role = 'account_manager';
  ELSIF p_action = 'make_account_manager' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (p_target, 'account_manager') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = p_target AND role = 'owner';
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_target AND role IN ('owner','account_manager');
    UPDATE public.profiles SET company_id = NULL WHERE id = p_target;
    UPDATE public.lead_purchases SET assigned_to = NULL WHERE company_id = p_company AND assigned_to = p_target;
  END IF;

  PERFORM public.log_audit_event(CASE WHEN p_action = 'remove' THEN 'TEAM_MEMBER_REMOVED' ELSE 'TEAM_ROLE_CHANGED' END,
    'company', p_company, p_company, p_actor, p_source, jsonb_build_object('target_user', p_target, 'action', p_action));
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION public.accept_company_invitation(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_update_member(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_update_member(uuid, uuid, text, uuid, text) TO service_role;