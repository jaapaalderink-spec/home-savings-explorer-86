CREATE OR REPLACE FUNCTION public.purge_prelaunch_test_data()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
  tabs text[] := ARRAY['lead_risk_events','phone_verifications','allocation_products','credit_note_lines','financial_events','invoice_lines','delivery_price_bookings','contract_terminations','credit_notes','complaints','payments','lead_appointments','lead_purchase_status_history','purchase_product_crm','purchase_quotes','lead_purchases','lead_bundles','invoices','leads','audit_events','background_jobs','company_invitations','company_lead_preferences','company_products','company_quality_scores','company_regions','lead_recipient_services','lead_recipients','service_areas','price_reviews','subscription_versions','profiles','companies','energy_bill_scans','credit_number_counters'];
BEGIN
  FOREACH t IN ARRAY tabs LOOP EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t); END LOOP;
  UPDATE public.invoices SET active_payment_id = NULL WHERE active_payment_id IS NOT NULL;
  UPDATE public.leads SET duplicate_of_lead_id = NULL WHERE duplicate_of_lead_id IS NOT NULL;
  UPDATE public.profiles SET company_id = NULL WHERE company_id IS NOT NULL;
  FOREACH t IN ARRAY tabs LOOP
    IF t <> 'profiles' THEN EXECUTE format('DELETE FROM public.%I WHERE true', t); END IF;
  END LOOP;
  DELETE FROM public.user_roles WHERE role IN ('owner','account_manager');
  FOREACH t IN ARRAY tabs LOOP EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t); END LOOP;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.purge_prelaunch_test_data() FROM PUBLIC, anon, authenticated;