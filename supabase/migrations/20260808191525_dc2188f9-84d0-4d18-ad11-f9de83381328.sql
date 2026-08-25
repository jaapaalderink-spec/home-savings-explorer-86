-- ============ ENUMS ============
CREATE TYPE public.lead_type AS ENUM ('shared_2','shared_4');
CREATE TYPE public.lead_state AS ENUM ('new','assigned','underfilled','cancelled');
CREATE TYPE public.purchase_source AS ENUM ('assigned','market');
CREATE TYPE public.complaint_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.complaint_reason AS ENUM ('unreachable','invalid_phone','duplicate','out_of_area','no_interest','spam');
CREATE TYPE public.invoice_status AS ENUM ('draft','issued','paid','overdue','cancelled','credited');

-- ============ REGIONS ============
CREATE TABLE public.regions (
  code text PRIMARY KEY,
  name text NOT NULL
);
GRANT SELECT ON public.regions TO anon, authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Regions are public" ON public.regions FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.regions (code, name) VALUES
('10','Amsterdam Centrum'),('11','Amsterdam Noord/Zuidoost'),('12','Hilversum e.o.'),('13','Almere'),('14','Amstelveen e.o.'),
('15','Zaanstreek'),('16','Purmerend e.o.'),('17','Kop van Noord-Holland'),('18','Alkmaar e.o.'),('19','Beverwijk/IJmond'),
('20','Haarlem'),('21','Bloemendaal/Hoofddorp'),('22','Katwijk/Noordwijk'),('23','Leiden e.o.'),('24','Alphen aan den Rijn'),
('25','Den Haag Noord'),('26','Delft e.o.'),('27','Zoetermeer e.o.'),('28','Rijswijk/Voorburg'),('29','Capelle/Krimpen'),
('30','Rotterdam Centrum'),('31','Rotterdam West'),('32','Vlaardingen/Schiedam'),('33','Dordrecht e.o.'),('34','Nieuwegein/IJsselstein'),
('35','Utrecht Noordwest'),('36','Maarssen/Nieuwegein'),('37','Zeist/Amersfoort'),('38','Amersfoort e.o.'),('39','Veenendaal e.o.'),
('40','Tiel e.o.'),('41','Culemborg e.o.'),('42','Gorinchem e.o.'),('43','Zeeland Noord'),('44','Middelburg/Vlissingen'),
('45','Terneuzen e.o.'),('46','Bergen op Zoom/Goes'),('47','Roosendaal e.o.'),('48','Breda e.o.'),('49','Oosterhout e.o.'),
('50','Tilburg'),('51','Waalwijk e.o.'),('52','s-Hertogenbosch'),('53','Oss/Zaltbommel'),('54','Uden/Veghel'),
('55','Valkenswaard e.o.'),('56','Eindhoven'),('57','Helmond e.o.'),('58','Weert e.o.'),('59','Venlo e.o.'),
('60','Venray/Horst'),('61','Sittard e.o.'),('62','Maastricht e.o.'),('63','Heerlen e.o.'),('64','Roermond e.o.'),
('65','Nijmegen'),('66','Wijchen/Bemmel'),('67','Arnhem/Renkum'),('68','Arnhem e.o.'),('69','Zevenaar e.o.'),
('70','Ede/Wageningen'),('71','Doetinchem e.o.'),('72','Zutphen e.o.'),('73','Apeldoorn'),('74','Winterswijk e.o.'),
('75','Enschede'),('76','Hengelo/Almelo'),('77','Rijssen e.o.'),('78','Deventer/Zwolle'),('79','Kampen e.o.'),
('80','Zwolle'),('81','Zwolle e.o.'),('82','Harderwijk/Elburg'),('83','Emmeloord e.o.'),('84','Steenwijk e.o.'),
('85','Heerenveen e.o.'),('86','Sneek e.o.'),('87','Zuidwest-Friesland'),('88','Leeuwarden'),('89','Noord-Friesland'),
('90','Groningen'),('91','Groningen e.o.'),('92','Delfzijl e.o.'),('93','Assen e.o.'),('94','Veendam e.o.'),
('95','Winschoten e.o.'),('96','Emmen e.o.'),('97','Hoogeveen e.o.'),('98','Stadskanaal e.o.'),('99','Noordoost-Groningen');

-- ============ COMPANY WORK AREAS ============
CREATE TABLE public.company_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  region_code text NOT NULL REFERENCES public.regions(code),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, region_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_regions TO authenticated;
GRANT ALL ON public.company_regions TO service_role;
ALTER TABLE public.company_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own work areas" ON public.company_regions FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners insert work areas" ON public.company_regions FOR INSERT TO authenticated
  WITH CHECK ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners delete work areas" ON public.company_regions FOR DELETE TO authenticated
  USING ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'));

-- ============ COMPANY PRODUCT CAPACITY ============
CREATE TABLE public.company_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  monthly_max integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_products TO authenticated;
GRANT ALL ON public.company_products TO service_role;
ALTER TABLE public.company_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own capacity" ON public.company_products FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners insert capacity" ON public.company_products FOR INSERT TO authenticated
  WITH CHECK ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners update capacity" ON public.company_products FOR UPDATE TO authenticated
  USING ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners delete capacity" ON public.company_products FOR DELETE TO authenticated
  USING ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'owner')) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER company_products_touch BEFORE UPDATE ON public.company_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ COMPANIES EXTRA ============
ALTER TABLE public.companies
  ADD COLUMN monthly_fee_ex_vat numeric(10,2) NOT NULL DEFAULT 249,
  ADD COLUMN billing_email text,
  ADD COLUMN address text,
  ADD COLUMN vat_number text,
  ADD COLUMN active boolean NOT NULL DEFAULT true;

-- ============ LEADS EXTRA ============
ALTER TABLE public.leads
  ADD COLUMN region_code text,
  ADD COLUMN lead_type public.lead_type NOT NULL DEFAULT 'shared_4',
  ADD COLUMN state public.lead_state NOT NULL DEFAULT 'new',
  ADD COLUMN phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN distributed_at timestamptz;

-- ============ PURCHASES / ASSIGNMENTS EXTRA ============
ALTER TABLE public.lead_purchases
  ADD COLUMN source public.purchase_source NOT NULL DEFAULT 'market',
  ADD COLUMN price_ex_vat numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN billable boolean NOT NULL DEFAULT true,
  ADD COLUMN credited boolean NOT NULL DEFAULT false,
  ADD COLUMN invoice_id uuid,
  ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN opened_at timestamptz,
  ADD COLUMN first_contact_at timestamptz,
  ADD COLUMN contacted_within_24h boolean,
  ADD COLUMN contacted_within_48h boolean,
  ADD COLUMN response_score integer NOT NULL DEFAULT 0;

-- SLA scoring trigger: derives opened/contact metrics server-side only
CREATE OR REPLACE FUNCTION public.sync_purchase_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE hrs numeric;
BEGIN
  IF NEW.status <> 'new' AND OLD.first_contact_at IS NULL AND NEW.first_contact_at IS NULL THEN
    NEW.first_contact_at := now();
  END IF;
  IF NEW.first_contact_at IS NOT NULL THEN
    hrs := EXTRACT(EPOCH FROM (NEW.first_contact_at - NEW.assigned_at)) / 3600;
    NEW.contacted_within_24h := hrs <= 24;
    NEW.contacted_within_48h := hrs <= 48;
    NEW.response_score := CASE WHEN hrs <= 24 THEN 100 WHEN hrs <= 48 THEN 75 ELSE 50 END;
  ELSIF NEW.opened_at IS NOT NULL THEN
    NEW.response_score := CASE
      WHEN EXTRACT(EPOCH FROM (NEW.opened_at - NEW.assigned_at)) / 3600 <= 24 THEN 25 ELSE 0 END;
  ELSE
    NEW.response_score := 0;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER lead_purchases_sla BEFORE UPDATE ON public.lead_purchases
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_sla();

-- ============ COMPLAINTS ============
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid,
  reason public.complaint_reason NOT NULL,
  details text,
  status public.complaint_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  credit_ex_vat numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id)
);
GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own complaints" ON public.complaints FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Company files complaints" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Admins review complaints" ON public.complaints FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER complaints_touch BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  subtotal_ex_vat numeric(10,2) NOT NULL DEFAULT 0,
  vat_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_inc_vat numeric(10,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'issued',
  due_date date NOT NULL DEFAULT (now() + interval '14 days')::date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_start)
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own invoices" ON public.invoices FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price_ex_vat numeric(10,2) NOT NULL DEFAULT 0,
  amount_ex_vat numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own invoice lines" ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
    AND (i.company_id = public.current_company_id() OR public.has_role(auth.uid(),'admin'))));

ALTER TABLE public.lead_purchases
  ADD CONSTRAINT lead_purchases_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_company_regions_region ON public.company_regions(region_code);
CREATE INDEX idx_leads_region ON public.leads(region_code);
CREATE INDEX idx_purchases_company_created ON public.lead_purchases(company_id, created_at);