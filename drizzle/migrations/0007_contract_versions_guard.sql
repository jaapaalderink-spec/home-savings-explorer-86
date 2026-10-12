CREATE OR REPLACE FUNCTION public.guard_subscription_versions()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Alleen opruimen samen met het bedrijf zelf; anders zijn contractversies onwijzigbaar.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'SUBSCRIPTION_VERSION_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS subscription_versions_immutable ON public.subscription_versions;
CREATE TRIGGER subscription_versions_immutable BEFORE UPDATE OR DELETE ON public.subscription_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_versions();