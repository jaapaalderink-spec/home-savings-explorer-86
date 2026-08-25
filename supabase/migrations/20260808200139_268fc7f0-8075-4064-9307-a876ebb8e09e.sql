CREATE TABLE public.postcode_geo (
  postcode text PRIMARY KEY,
  lng numeric NOT NULL,
  lat numeric NOT NULL,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.postcode_geo TO authenticated;
GRANT ALL ON public.postcode_geo TO service_role;

ALTER TABLE public.postcode_geo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read postcode coordinates"
ON public.postcode_geo FOR SELECT TO authenticated USING (true);