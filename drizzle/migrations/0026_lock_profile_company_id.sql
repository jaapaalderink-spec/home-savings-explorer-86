CREATE OR REPLACE FUNCTION public.guard_profile_company_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Bedrijfskoppeling kan niet zelf worden gewijzigd.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_guard_company_id ON public.profiles;
CREATE TRIGGER profiles_guard_company_id BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_company_id();

DROP POLICY IF EXISTS "Update own profile" ON public.profiles;
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND company_id IS NOT DISTINCT FROM public.current_company_id());