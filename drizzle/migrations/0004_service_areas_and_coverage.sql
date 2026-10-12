ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS lat numeric, ADD COLUMN IF NOT EXISTS lng numeric, ADD COLUMN IF NOT EXISTS province text;
UPDATE public.regions r SET lat = v.lat, lng = v.lng, province = v.province
FROM (VALUES
('10',52.37,4.9,'Noord-Holland'), ('11',52.4,4.95,'Noord-Holland'), ('12',52.23,5.17,'Noord-Holland'), ('13',52.37,5.22,'Flevoland'), ('14',52.31,4.86,'Noord-Holland'), ('15',52.44,4.82,'Noord-Holland'), ('16',52.51,4.96,'Noord-Holland'), ('17',52.85,4.75,'Noord-Holland'), ('18',52.63,4.75,'Noord-Holland'), ('19',52.48,4.66,'Noord-Holland'), ('20',52.38,4.63,'Noord-Holland'), ('21',52.31,4.69,'Noord-Holland'), ('22',52.2,4.42,'Zuid-Holland'), ('23',52.16,4.49,'Zuid-Holland'), ('24',52.13,4.66,'Zuid-Holland'), ('25',52.09,4.3,'Zuid-Holland'), ('26',52.01,4.36,'Zuid-Holland'), ('27',52.06,4.49,'Zuid-Holland'), ('28',52.04,4.32,'Zuid-Holland'), ('29',51.93,4.58,'Zuid-Holland'), ('30',51.92,4.48,'Zuid-Holland'), ('31',51.91,4.42,'Zuid-Holland'), ('32',51.91,4.34,'Zuid-Holland'), ('33',51.81,4.68,'Zuid-Holland'), ('34',52.03,5.09,'Utrecht'), ('35',52.1,5.11,'Utrecht'), ('36',52.14,5.04,'Utrecht'), ('37',52.09,5.24,'Utrecht'), ('38',52.16,5.39,'Utrecht'), ('39',52.03,5.55,'Utrecht'), ('40',51.89,5.43,'Gelderland'), ('41',51.95,5.22,'Gelderland'), ('42',51.83,4.97,'Zuid-Holland'), ('43',51.65,3.9,'Zeeland'), ('44',51.5,3.61,'Zeeland'), ('45',51.33,3.83,'Zeeland'), ('46',51.49,4.29,'Noord-Brabant'), ('47',51.53,4.46,'Noord-Brabant'), ('48',51.59,4.78,'Noord-Brabant'), ('49',51.64,4.86,'Noord-Brabant'), ('50',51.56,5.09,'Noord-Brabant'), ('51',51.69,5.07,'Noord-Brabant'), ('52',51.7,5.3,'Noord-Brabant'), ('53',51.76,5.52,'Noord-Brabant'), ('54',51.62,5.55,'Noord-Brabant'), ('55',51.35,5.46,'Noord-Brabant'), ('56',51.44,5.47,'Noord-Brabant'), ('57',51.48,5.66,'Noord-Brabant'), ('58',51.25,5.71,'Limburg'), ('59',51.37,6.17,'Limburg'), ('60',51.53,5.97,'Limburg'), ('61',51.0,5.87,'Limburg'), ('62',50.85,5.69,'Limburg'), ('63',50.89,5.98,'Limburg'), ('64',51.19,6.0,'Limburg'), ('65',51.84,5.86,'Gelderland'), ('66',51.89,5.9,'Gelderland'), ('67',51.98,5.9,'Gelderland'), ('68',51.98,6.0,'Gelderland'), ('69',51.93,6.07,'Gelderland'), ('70',52.04,5.66,'Gelderland'), ('71',51.97,6.29,'Gelderland'), ('72',52.14,6.2,'Gelderland'), ('73',52.21,5.97,'Gelderland'), ('74',52.0,6.72,'Gelderland'), ('75',52.22,6.89,'Overijssel'), ('76',52.26,6.79,'Overijssel'), ('77',52.31,6.52,'Overijssel'), ('78',52.25,6.16,'Overijssel'), ('79',52.55,5.91,'Overijssel'), ('80',52.51,6.09,'Overijssel'), ('81',52.52,6.15,'Overijssel'), ('82',52.34,5.62,'Gelderland'), ('83',52.71,5.75,'Flevoland'), ('84',52.79,6.12,'Overijssel'), ('85',52.96,5.92,'Friesland'), ('86',53.03,5.66,'Friesland'), ('87',52.96,5.42,'Friesland'), ('88',53.2,5.8,'Friesland'), ('89',53.3,5.66,'Friesland'), ('90',53.22,6.57,'Groningen'), ('91',53.24,6.62,'Groningen'), ('92',53.33,6.92,'Groningen'), ('93',52.99,6.56,'Drenthe'), ('94',53.1,6.87,'Groningen'), ('95',53.14,7.03,'Groningen'), ('96',52.78,6.9,'Drenthe'), ('97',52.72,6.48,'Drenthe'), ('98',52.99,6.95,'Groningen'), ('99',53.4,6.75,'Groningen')
) AS v(code, lat, lng, province) WHERE r.code = v.code;

CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('radius','provinces','national')),
  center_label text,
  center_lat numeric,
  center_lng numeric,
  radius_km integer CHECK (radius_km BETWEEN 1 AND 250),
  provinces text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, category),
  CONSTRAINT service_area_radius_complete CHECK (mode <> 'radius' OR (center_lat IS NOT NULL AND center_lng IS NOT NULL AND radius_km IS NOT NULL)),
  CONSTRAINT service_area_provinces_complete CHECK (mode <> 'provinces' OR cardinality(provinces) > 0)
);
GRANT SELECT ON public.service_areas TO authenticated;
GRANT ALL ON public.service_areas TO service_role;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and admins read service areas" ON public.service_areas FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER service_areas_touch BEFORE UPDATE ON public.service_areas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (2 * 6371 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
  )))::numeric
$$;

CREATE OR REPLACE FUNCTION public.service_area_covers(a public.service_areas, p_lat numeric, p_lng numeric, p_province text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE a.mode
    WHEN 'national' THEN true
    WHEN 'provinces' THEN coalesce(p_province = ANY(a.provinces), false)
    ELSE p_lat IS NOT NULL AND public.haversine_km(a.center_lat, a.center_lng, p_lat, p_lng) <= a.radius_km
  END
$$;

CREATE OR REPLACE FUNCTION public.eligible_companies_for_lead(p_lead uuid)
RETURNS TABLE(company_id uuid, categories text[], distance_km numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE l public.leads; plat numeric; plng numeric; pprov text;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT g.lat, g.lng INTO plat, plng FROM public.postcode_geo g
   WHERE g.postcode IN (upper(l.postcode), left(regexp_replace(l.postcode, '\s', '', 'g'), 4)) LIMIT 1;
  SELECT coalesce(plat, r.lat), coalesce(plng, r.lng), r.province INTO plat, plng, pprov
    FROM public.regions r WHERE r.code = l.region_code;
  RETURN QUERY
  WITH area AS (
    SELECT a.company_id AS cid, a.category AS cat,
      CASE WHEN a.mode = 'radius' THEN round(public.haversine_km(a.center_lat, a.center_lng, plat, plng), 1) END AS d
    FROM public.service_areas a
    WHERE a.category = ANY(l.categories) AND public.service_area_covers(a, plat, plng, pprov)
  ), legacy AS (
    SELECT cr.company_id AS cid, cp.category AS cat, NULL::numeric AS d
    FROM public.company_regions cr
    JOIN public.company_products cp ON cp.company_id = cr.company_id AND cp.category = ANY(l.categories)
    WHERE cr.region_code = l.region_code
      AND NOT EXISTS (SELECT 1 FROM public.service_areas s WHERE s.company_id = cr.company_id)
  ), u AS (SELECT * FROM area UNION ALL SELECT * FROM legacy)
  SELECT u.cid, array_agg(DISTINCT u.cat), min(u.d) FROM u GROUP BY u.cid;
END $$;

CREATE OR REPLACE FUNCTION public.sync_company_regions_from_areas(p_company uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.service_areas WHERE company_id = p_company) THEN RETURN -1; END IF;
  DELETE FROM public.company_regions WHERE company_id = p_company;
  INSERT INTO public.company_regions(company_id, region_code)
  SELECT DISTINCT p_company, r.code FROM public.regions r
  JOIN public.service_areas a ON a.company_id = p_company AND public.service_area_covers(a, r.lat, r.lng, r.province);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.coverage_by_region(p_days integer DEFAULT 90)
RETURNS TABLE(region_code text, region_name text, province text, lat numeric, lng numeric, category text,
  providers integer, capacity integer, demand integer, gap_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cats AS (SELECT DISTINCT cp.category FROM public.company_products cp),
  prov AS (
    SELECT r.code, c.category, co.id AS company_id, coalesce(cp.monthly_max, 0) AS cap, coalesce(cp.active, false) AS active
    FROM public.regions r CROSS JOIN cats c
    JOIN public.companies co ON co.active
    LEFT JOIN public.company_products cp ON cp.company_id = co.id AND cp.category = c.category
    WHERE EXISTS (SELECT 1 FROM public.service_areas a WHERE a.company_id = co.id AND a.category = c.category
                    AND public.service_area_covers(a, r.lat, r.lng, r.province))
       OR (NOT EXISTS (SELECT 1 FROM public.service_areas s WHERE s.company_id = co.id)
           AND EXISTS (SELECT 1 FROM public.company_regions cr WHERE cr.company_id = co.id AND cr.region_code = r.code)
           AND cp.company_id IS NOT NULL)
  ),
  agg AS (
    SELECT p.code, p.category, count(*) FILTER (WHERE p.active)::int AS providers,
      coalesce(sum(p.cap) FILTER (WHERE p.active), 0)::int AS capacity, count(*)::int AS any_providers
    FROM prov p GROUP BY p.code, p.category
  ),
  dem AS (
    SELECT l.region_code AS code, c AS category, count(*)::int AS demand
    FROM public.leads l, unnest(l.categories) c
    WHERE l.created_at > now() - make_interval(days => p_days) GROUP BY 1, 2
  )
  SELECT r.code, r.name, r.province, r.lat, r.lng, c.category,
    coalesce(a.providers, 0), coalesce(a.capacity, 0), coalesce(d.demand, 0),
    CASE
      WHEN coalesce(a.any_providers, 0) = 0 THEN 'geen_aanbieder'
      WHEN coalesce(a.providers, 0) = 0 THEN 'product_inactief'
      WHEN coalesce(a.capacity, 0) = 0 THEN 'geen_capaciteit'
      WHEN coalesce(d.demand, 0) * 30.0 / greatest(p_days, 1) * 2 > a.capacity THEN 'capaciteit_te_laag'
      ELSE NULL
    END
  FROM public.regions r CROSS JOIN cats c
  LEFT JOIN agg a ON a.code = r.code AND a.category = c.category
  LEFT JOIN dem d ON d.code = r.code AND d.category = c.category
$$;

REVOKE ALL ON FUNCTION public.eligible_companies_for_lead(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_company_regions_from_areas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coverage_by_region(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_companies_for_lead(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_company_regions_from_areas(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.coverage_by_region(integer) TO service_role;