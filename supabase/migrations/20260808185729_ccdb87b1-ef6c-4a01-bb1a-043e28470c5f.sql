-- ROLES ---------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'owner', 'account_manager');
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'quoted', 'won', 'lost');

-- COMPANIES -----------------------------------------------------------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_name text NOT NULL DEFAULT 'starter',
  monthly_lead_limit integer NOT NULL DEFAULT 20,
  categories text[] NOT NULL DEFAULT '{}',
  join_code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- PROFILES ------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  phone text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES ----------------------------------------------------------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- LEADS ---------------------------------------------------------------
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  postcode text NOT NULL,
  house_number text,
  city text,
  categories text[] NOT NULL DEFAULT '{}',
  contract_type text,
  house_type text,
  current_heating text,
  build_year integer,
  annual_consumption_kwh integer,
  annual_feedin_kwh integer,
  panel_count integer,
  ev_status text,
  annual_km integer,
  airco_rooms integer,
  smart_devices text[] NOT NULL DEFAULT '{}',
  battery_goals text[] NOT NULL DEFAULT '{}',
  estimated_savings integer NOT NULL DEFAULT 0,
  notes text,
  max_partners integer NOT NULL DEFAULT 3,
  purchase_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone may submit a lead" ON public.leads FOR INSERT TO anon, authenticated WITH CHECK (true);

-- LEAD PURCHASES ------------------------------------------------------
CREATE TABLE public.lead_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchased_by uuid,
  status public.lead_status NOT NULL DEFAULT 'new',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, company_id)
);
GRANT SELECT, UPDATE ON public.lead_purchases TO authenticated;
GRANT ALL ON public.lead_purchases TO service_role;
ALTER TABLE public.lead_purchases ENABLE ROW LEVEL SECURITY;

-- POLICIES ------------------------------------------------------------
CREATE POLICY "Members see their own company" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners update their own company" ON public.companies FOR UPDATE TO authenticated
  USING ((id = public.current_company_id() AND public.has_role(auth.uid(), 'owner')) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "See own profile and colleagues" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid()
     OR (company_id IS NOT NULL AND company_id = public.current_company_id())
     OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "See own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company sees own purchases" ON public.lead_purchases FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Company updates own purchases" ON public.lead_purchases FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));

-- TRIGGERS ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER purchases_touch BEFORE UPDATE ON public.lead_purchases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.sync_lead_purchase_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.leads l
  SET purchase_count = (SELECT count(*) FROM public.lead_purchases p WHERE p.lead_id = l.id)
  WHERE l.id = COALESCE(NEW.lead_id, OLD.lead_id);
  RETURN NULL;
END; $$;

CREATE TRIGGER lead_purchases_count AFTER INSERT OR DELETE ON public.lead_purchases
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_purchase_count();