CREATE OR REPLACE FUNCTION public.coverage_by_region(p_days integer DEFAULT 90)
RETURNS TABLE(region_code text, region_name text, province text, lat numeric, lng numeric, category text,
  providers integer, capacity integer, demand integer, gap_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cats AS (SELECT unnest(ARRAY['solar','heatpump','battery','ev','airco']) AS category),
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
REVOKE ALL ON FUNCTION public.coverage_by_region(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coverage_by_region(integer) TO service_role;