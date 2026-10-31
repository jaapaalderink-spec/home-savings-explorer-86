CREATE TABLE public.site_integrations (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ga_measurement_id text CHECK (ga_measurement_id IS NULL OR ga_measurement_id ~ '^G-[A-Z0-9]{4,20}$'),
  gtm_container_id text CHECK (gtm_container_id IS NULL OR gtm_container_id ~ '^GTM-[A-Z0-9]{4,12}$'),
  ads_conversion_id text CHECK (ads_conversion_id IS NULL OR ads_conversion_id ~ '^AW-[0-9]{6,15}$'),
  search_console_token text CHECK (search_console_token IS NULL OR search_console_token ~ '^[A-Za-z0-9_-]{10,100}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.site_integrations TO anon, authenticated;
GRANT ALL ON public.site_integrations TO service_role;
ALTER TABLE public.site_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read site tags" ON public.site_integrations FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.site_integrations (id) VALUES (true);