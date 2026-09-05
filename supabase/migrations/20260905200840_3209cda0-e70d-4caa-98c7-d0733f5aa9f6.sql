-- ===========================================================================
-- FASE 3C — Audit trail, CRM-statusgeschiedenis en actorregistratie
-- ===========================================================================

CREATE TYPE public.audit_source AS ENUM ('partner', 'admin', 'system', 'webhook');

CREATE TYPE public.audit_entity AS ENUM (
  'lead', 'lead_purchase', 'company', 'complaint', 'invoice', 'credit_note', 'payment'
);

CREATE TYPE public.audit_event_type AS ENUM (
  'LEAD_CREATED', 'PHONE_VERIFIED', 'LEAD_FLAGGED', 'LEAD_BLOCKED', 'LEAD_ALLOCATED',
  'LEAD_OPENED', 'LEAD_CONTACTED', 'LEAD_STATUS_CHANGED',
  'COMPLAINT_CREATED', 'COMPLAINT_APPROVED', 'COMPLAINT_REJECTED',
  'INVOICE_CREATED', 'PAYMENT_CREATED', 'PAYMENT_STATUS_CHANGED', 'INVOICE_PAID',
  'CREDIT_NOTE_CREATED', 'CREDIT_APPLIED',
  'COMPANY_PROFILE_UPDATED', 'COMPANY_COMMERCIAL_SETTINGS_UPDATED',
  'COMPANY_ACTIVATED', 'COMPANY_DEACTIVATED',
  'CURRENT_STATUS_SNAPSHOT'
);

-- 1. Tabellen ---------------------------------------------------------------
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.audit_event_type NOT NULL,
  entity_type public.audit_entity NOT NULL,
  entity_id uuid NOT NULL,
  actor_user_id uuid,
  actor_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_role text,
  source public.audit_source NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_purchase_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status public.lead_status,
  to_status public.lead_status NOT NULL,
  changed_by uuid,
  changed_by_role text,
  source public.audit_source NOT NULL DEFAULT 'system',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_purchase_status_history TO authenticated;
GRANT ALL ON public.lead_purchase_status_history TO service_role;
ALTER TABLE public.lead_purchase_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX audit_events_entity_idx ON public.audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_company_idx ON public.audit_events (actor_company_id, created_at DESC);
CREATE INDEX audit_events_type_idx ON public.audit_events (event_type, created_at DESC);
CREATE INDEX lp_status_history_purchase_idx
  ON public.lead_purchase_status_history (lead_purchase_id, created_at DESC);
CREATE INDEX lp_status_history_company_idx
  ON public.lead_purchase_status_history (company_id, created_at DESC);

-- 2. Zichtbaarheid ----------------------------------------------------------
-- Partnerzichtbare gebeurtenissen: nooit fraudesignalen of commerciële instellingen.
CREATE OR REPLACE FUNCTION public.audit_partner_visible(_type public.audit_event_type)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _type IN (
    'LEAD_ALLOCATED', 'LEAD_OPENED', 'LEAD_CONTACTED', 'LEAD_STATUS_CHANGED',
    'COMPLAINT_CREATED', 'COMPLAINT_APPROVED', 'COMPLAINT_REJECTED',
    'INVOICE_CREATED', 'PAYMENT_CREATED', 'PAYMENT_STATUS_CHANGED', 'INVOICE_PAID',
    'CREDIT_NOTE_CREATED', 'CREDIT_APPLIED', 'COMPANY_PROFILE_UPDATED',
    'CURRENT_STATUS_SNAPSHOT'
  )::boolean
$$;

CREATE POLICY "Admins read all audit events"
  ON public.audit_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company reads own audit events"
  ON public.audit_events FOR SELECT TO authenticated
  USING (
    actor_company_id IS NOT NULL
    AND actor_company_id = public.current_company_id()
    AND public.audit_partner_visible(event_type)
  );

CREATE POLICY "Admins read all status history"
  ON public.lead_purchase_status_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company reads own status history"
  ON public.lead_purchase_status_history FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- 3. Append-only: wijzigen en verwijderen is voor iedereen geblokkeerd -------
CREATE OR REPLACE FUNCTION public.deny_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_APPEND_ONLY';
END; $$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_mutation();

CREATE TRIGGER lp_status_history_append_only
  BEFORE UPDATE OR DELETE ON public.lead_purchase_status_history
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_mutation();

-- 4. Actor: expliciet meegegeven, anders de transactie-instelling, anders niemand
CREATE OR REPLACE FUNCTION public.audit_actor()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.actor_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.audit_source_setting(_fallback public.audit_source DEFAULT 'system')
RETURNS public.audit_source
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.actor_source', true), '')::public.audit_source, _fallback)
$$;

CREATE OR REPLACE FUNCTION public.audit_actor_role(_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ur.role::text FROM public.user_roles ur
   WHERE ur.user_id = _user
   ORDER BY CASE ur.role WHEN 'admin' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event public.audit_event_type,
  p_entity public.audit_entity,
  p_entity_id uuid,
  p_company uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_source public.audit_source DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor, public.audit_actor());
  v_id uuid;
BEGIN
  INSERT INTO public.audit_events (
    event_type, entity_type, entity_id, actor_user_id, actor_company_id,
    actor_role, source, metadata
  ) VALUES (
    p_event, p_entity, p_entity_id, v_actor, p_company,
    public.audit_actor_role(v_actor),
    COALESCE(p_source, public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'partner' END)),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.log_audit_event(public.audit_event_type, public.audit_entity, uuid, uuid, uuid, public.audit_source, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(public.audit_event_type, public.audit_entity, uuid, uuid, uuid, public.audit_source, jsonb) TO service_role;

-- 5. Triggers op leads ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('LEAD_CREATED', 'lead', NEW.id, NULL, NULL, 'system',
      jsonb_build_object('region_code', NEW.region_code, 'lead_type', NEW.lead_type,
                         'categories', to_jsonb(NEW.categories)));
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.phone_verified, false) IS DISTINCT FROM COALESCE(NEW.phone_verified, false)
     AND NEW.phone_verified THEN
    PERFORM public.log_audit_event('PHONE_VERIFIED', 'lead', NEW.id, NULL, NULL, 'system',
      jsonb_build_object('verified_at', NEW.phone_verified_at));
  END IF;

  IF OLD.fraud_status IS DISTINCT FROM NEW.fraud_status THEN
    IF NEW.fraud_status = 'blocked' THEN
      PERFORM public.log_audit_event('LEAD_BLOCKED', 'lead', NEW.id, NULL, NULL, 'system',
        jsonb_build_object('from', OLD.fraud_status, 'to', NEW.fraud_status, 'score', NEW.fraud_score));
    ELSIF NEW.fraud_status = 'review' THEN
      PERFORM public.log_audit_event('LEAD_FLAGGED', 'lead', NEW.id, NULL, NULL, 'system',
        jsonb_build_object('from', OLD.fraud_status, 'to', NEW.fraud_status, 'score', NEW.fraud_score));
    END IF;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER leads_audit
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_leads();

-- 6. Triggers op lead_purchases (toewijzing, openen, contact, status) -------
CREATE OR REPLACE FUNCTION public.audit_lead_purchases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_source public.audit_source;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('LEAD_ALLOCATED', 'lead_purchase', NEW.id, NEW.company_id,
      NEW.purchased_by, CASE WHEN NEW.purchased_by IS NULL THEN 'system' ELSE 'partner' END,
      jsonb_build_object('lead_id', NEW.lead_id, 'source', NEW.source,
                         'price_ex_vat', NEW.price_ex_vat, 'is_trial', NEW.is_trial));
    RETURN NEW;
  END IF;

  v_actor := public.audit_actor();
  v_source := public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'partner' END);

  -- Eerste keer openen: precies één gebeurtenis, herhaald openen telt niet mee.
  IF OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL THEN
    PERFORM public.log_audit_event('LEAD_OPENED', 'lead_purchase', NEW.id, NEW.company_id,
      v_actor, v_source, jsonb_build_object('opened_at', NEW.opened_at));
  END IF;

  -- Eerste contact met de bijbehorende SLA-uitkomst uit de database, niet uit de browser.
  IF OLD.first_contact_at IS NULL AND NEW.first_contact_at IS NOT NULL THEN
    PERFORM public.log_audit_event('LEAD_CONTACTED', 'lead_purchase', NEW.id, NEW.company_id,
      v_actor, v_source,
      jsonb_build_object('first_contact_at', NEW.first_contact_at,
                         'within_24h', NEW.contacted_within_24h,
                         'within_48h', NEW.contacted_within_48h,
                         'response_score', NEW.response_score));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_purchase_status_history (
      lead_purchase_id, company_id, from_status, to_status, changed_by, changed_by_role, source, note
    ) VALUES (
      NEW.id, NEW.company_id, OLD.status, NEW.status, v_actor,
      public.audit_actor_role(v_actor), v_source,
      NULLIF(current_setting('app.status_note', true), '')
    );
    PERFORM public.log_audit_event('LEAD_STATUS_CHANGED', 'lead_purchase', NEW.id, NEW.company_id,
      v_actor, v_source, jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER lead_purchases_audit
  AFTER INSERT OR UPDATE ON public.lead_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_lead_purchases();

-- 7. Triggers op complaints -------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_complaints()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit public.credit_notes;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('COMPLAINT_CREATED', 'complaint', NEW.id, NEW.company_id,
      NEW.created_by, CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'partner' END,
      jsonb_build_object('purchase_id', NEW.purchase_id, 'reason', NEW.reason));
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved', 'rejected') THEN
    SELECT * INTO v_credit FROM public.credit_notes WHERE complaint_id = NEW.id;
    PERFORM public.log_audit_event(
      CASE WHEN NEW.status = 'approved' THEN 'COMPLAINT_APPROVED' ELSE 'COMPLAINT_REJECTED' END,
      'complaint', NEW.id, NEW.company_id, NEW.reviewed_by,
      CASE WHEN NEW.reviewed_by IS NULL THEN 'system' ELSE 'admin' END,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'review_note', NEW.review_note,
                         'credit_ex_vat', NEW.credit_ex_vat,
                         'credit_note_id', v_credit.id, 'credit_number', v_credit.credit_number));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER complaints_audit
  AFTER INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.audit_complaints();

-- 8. Triggers op invoices (aanmaak, betaald, creditverrekening) -------------
CREATE OR REPLACE FUNCTION public.audit_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('INVOICE_CREATED', 'invoice', NEW.id, NEW.company_id,
      public.audit_actor(), public.audit_source_setting('system'),
      jsonb_build_object('invoice_number', NEW.invoice_number, 'total_inc_vat', NEW.total_inc_vat,
                         'period_start', NEW.period_start, 'period_end', NEW.period_end));
    RETURN NEW;
  END IF;

  IF (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'paid')
     OR (OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL) THEN
    PERFORM public.log_audit_event('INVOICE_PAID', 'invoice', NEW.id, NEW.company_id,
      NULL, 'webhook',
      jsonb_build_object('invoice_number', NEW.invoice_number, 'paid_at', NEW.paid_at,
                         'total_inc_vat', NEW.total_inc_vat));
  END IF;

  IF COALESCE(OLD.credit_applied_inc_vat, 0) IS DISTINCT FROM COALESCE(NEW.credit_applied_inc_vat, 0) THEN
    PERFORM public.log_audit_event('CREDIT_APPLIED', 'invoice', NEW.id, NEW.company_id,
      public.audit_actor(), public.audit_source_setting('system'),
      jsonb_build_object('invoice_number', NEW.invoice_number,
                         'old', OLD.credit_applied_inc_vat, 'new', NEW.credit_applied_inc_vat,
                         'amount_due_inc_vat', NEW.total_inc_vat - NEW.credit_applied_inc_vat));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER invoices_audit
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_invoices();

-- 9. Triggers op payments (idempotent: alleen echte overgangen) -------------
CREATE OR REPLACE FUNCTION public.audit_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('PAYMENT_CREATED', 'payment', NEW.id, NEW.company_id,
      public.audit_actor(), public.audit_source_setting('partner'),
      jsonb_build_object('invoice_id', NEW.invoice_id, 'provider', NEW.provider,
                         'provider_payment_id', NEW.provider_payment_id,
                         'amount', NEW.amount, 'currency', NEW.currency));
    RETURN NEW;
  END IF;

  -- Dezelfde webhookstatus opnieuw verwerken levert geen tweede gebeurtenis op.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_audit_event('PAYMENT_STATUS_CHANGED', 'payment', NEW.id, NEW.company_id,
      NULL, 'webhook',
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'invoice_id', NEW.invoice_id,
                         'provider_payment_id', NEW.provider_payment_id));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER payments_audit
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_payments();

-- 10. Triggers op credit_notes ---------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_credit_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('CREDIT_NOTE_CREATED', 'credit_note', NEW.id, NEW.company_id,
      NEW.created_by, CASE WHEN NEW.created_by IS NULL THEN 'system' ELSE 'admin' END,
      jsonb_build_object('credit_number', NEW.credit_number, 'total_inc_vat', NEW.total_inc_vat,
                         'original_invoice_id', NEW.original_invoice_id,
                         'complaint_id', NEW.complaint_id, 'status', NEW.status));
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'applied' THEN
    PERFORM public.log_audit_event('CREDIT_APPLIED', 'credit_note', NEW.id, NEW.company_id,
      public.audit_actor(), public.audit_source_setting('system'),
      jsonb_build_object('credit_number', NEW.credit_number, 'total_inc_vat', NEW.total_inc_vat,
                         'applied_to_invoice_id', NEW.applied_to_invoice_id));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER credit_notes_audit
  AFTER INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_credit_notes();

-- 11. Triggers op companies (profiel versus commerciële instellingen) -------
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
    PERFORM public.log_audit_event('COMPANY_PROFILE_UPDATED', 'company', NEW.id, NEW.id,
      v_actor, public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'partner' END),
      jsonb_build_object('changes', v_profile));
  END IF;

  IF jsonb_array_length(v_commercial) > 0 THEN
    PERFORM public.log_audit_event('COMPANY_COMMERCIAL_SETTINGS_UPDATED', 'company', NEW.id, NEW.id,
      v_actor, public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END),
      jsonb_build_object('changes', v_commercial));
  END IF;

  IF NEW.active IS DISTINCT FROM OLD.active THEN
    PERFORM public.log_audit_event(
      CASE WHEN NEW.active THEN 'COMPANY_ACTIVATED' ELSE 'COMPANY_DEACTIVATED' END,
      'company', NEW.id, NEW.id, v_actor,
      public.audit_source_setting(CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END),
      jsonb_build_object('field', 'active', 'old', OLD.active, 'new', NEW.active));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER companies_audit
  AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.audit_companies();

-- 12. Handelingen mét actor: één transactie, dus de trigger ziet de actor ---
CREATE OR REPLACE FUNCTION public.set_purchase_status(
  p_purchase_id uuid,
  p_company_id uuid,
  p_status public.lead_status,
  p_note text DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_source public.audit_source DEFAULT 'partner'
)
RETURNS TABLE(result text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.lead_purchases;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('app.actor_source', p_source::text, true);
  PERFORM set_config('app.status_note', COALESCE(p_note, ''), true);

  SELECT * INTO v_purchase FROM public.lead_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND OR v_purchase.company_id <> p_company_id THEN
    RETURN QUERY SELECT 'not_found'::text, false;
    RETURN;
  END IF;

  IF v_purchase.status = p_status THEN
    -- Geen echte wijziging: alleen de notitie bijwerken, geen historieregel.
    IF p_note IS NOT NULL THEN
      UPDATE public.lead_purchases SET note = p_note WHERE id = p_purchase_id;
    END IF;
    RETURN QUERY SELECT 'unchanged'::text, false;
    RETURN;
  END IF;

  UPDATE public.lead_purchases
     SET status = p_status,
         note = COALESCE(p_note, note)
   WHERE id = p_purchase_id;

  RETURN QUERY SELECT 'updated'::text, true;
END; $$;
REVOKE ALL ON FUNCTION public.set_purchase_status(uuid, uuid, public.lead_status, text, uuid, public.audit_source) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_purchase_status(uuid, uuid, public.lead_status, text, uuid, public.audit_source) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_purchase_opened(
  p_purchase_id uuid,
  p_company_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('app.actor_source', 'partner', true);

  UPDATE public.lead_purchases
     SET opened_at = now()
   WHERE id = p_purchase_id
     AND company_id = p_company_id
     AND opened_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END; $$;
REVOKE ALL ON FUNCTION public.mark_purchase_opened(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_purchase_opened(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.update_company_profile_audited(
  p_company_id uuid,
  p_actor uuid,
  p_name text,
  p_address text DEFAULT NULL,
  p_billing_email text DEFAULT NULL,
  p_vat_number text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('app.actor_source', 'partner', true);

  UPDATE public.companies
     SET name = p_name,
         address = p_address,
         billing_email = p_billing_email,
         vat_number = p_vat_number
   WHERE id = p_company_id;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.update_company_profile_audited(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_profile_audited(uuid, uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_company_commercial(
  p_company_id uuid,
  p_actor uuid,
  p_plan_name text DEFAULT NULL,
  p_monthly_lead_limit integer DEFAULT NULL,
  p_monthly_fee_ex_vat numeric DEFAULT NULL,
  p_active boolean DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('app.actor_source', 'admin', true);

  UPDATE public.companies
     SET plan_name = COALESCE(p_plan_name, plan_name),
         monthly_lead_limit = COALESCE(p_monthly_lead_limit, monthly_lead_limit),
         monthly_fee_ex_vat = COALESCE(p_monthly_fee_ex_vat, monthly_fee_ex_vat),
         active = COALESCE(p_active, active)
   WHERE id = p_company_id;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.update_company_commercial(uuid, uuid, text, integer, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_commercial(uuid, uuid, text, integer, numeric, boolean) TO service_role;

-- 13. Backfill: één beginregel per bestaande aankoop, zonder verzonnen tijden
INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_company_id, source, metadata)
SELECT 'CURRENT_STATUS_SNAPSHOT', 'lead_purchase', lp.id, lp.company_id, 'system',
       jsonb_build_object('status', lp.status, 'assigned_at', lp.assigned_at,
                          'opened_at', lp.opened_at, 'first_contact_at', lp.first_contact_at,
                          'imported', true)
FROM public.lead_purchases lp;

INSERT INTO public.lead_purchase_status_history (
  lead_purchase_id, company_id, from_status, to_status, source, note
)
SELECT lp.id, lp.company_id, NULL, lp.status, 'system',
       'Beginstand bij invoering van de geschiedenis'
FROM public.lead_purchases lp;