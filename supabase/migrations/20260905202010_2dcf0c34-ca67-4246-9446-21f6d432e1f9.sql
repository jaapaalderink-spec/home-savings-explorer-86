CREATE TABLE public.company_quality_scores (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  overall_score numeric(6,2) NOT NULL DEFAULT 50,
  response_score numeric(6,2) NOT NULL DEFAULT 50,
  complaint_score numeric(6,2) NOT NULL DEFAULT 50,
  engagement_score numeric(6,2) NOT NULL DEFAULT 50,
  conversion_score numeric(6,2) NOT NULL DEFAULT 50,
  sample_size integer NOT NULL DEFAULT 0,
  quality_warning boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_quality_scores TO authenticated;
GRANT ALL ON public.company_quality_scores TO service_role;

ALTER TABLE public.company_quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all quality scores"
  ON public.company_quality_scores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners read own quality score"
  ON public.company_quality_scores FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE TRIGGER touch_company_quality_scores
  BEFORE UPDATE ON public.company_quality_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX company_quality_scores_overall_idx ON public.company_quality_scores (overall_score DESC);

CREATE OR REPLACE FUNCTION public.company_quality_metrics(p_company_id uuid DEFAULT NULL)
RETURNS TABLE(
  company_id uuid,
  leads_total integer,
  leads_sla_eligible integer,
  opened_count integer,
  contacted_count integer,
  within_24h integer,
  within_48h integer,
  closed_count integer,
  won_count integer,
  quoted_plus_count integer,
  untouched_count integer,
  approved_complaints integer,
  recent_7d integer,
  last_assigned_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    count(lp.id)::int,
    count(lp.id) FILTER (WHERE lp.assigned_at < now() - interval '48 hours')::int,
    count(lp.id) FILTER (WHERE lp.opened_at IS NOT NULL)::int,
    count(lp.id) FILTER (WHERE lp.first_contact_at IS NOT NULL)::int,
    count(lp.id) FILTER (WHERE lp.contacted_within_24h IS TRUE)::int,
    count(lp.id) FILTER (WHERE lp.contacted_within_48h IS TRUE)::int,
    count(lp.id) FILTER (WHERE lp.status IN ('won','lost'))::int,
    count(lp.id) FILTER (WHERE lp.status = 'won')::int,
    count(lp.id) FILTER (WHERE lp.status IN ('quoted','won','lost'))::int,
    count(lp.id) FILTER (WHERE lp.status = 'new' AND lp.opened_at IS NULL
                           AND lp.assigned_at < now() - interval '48 hours')::int,
    count(cp.id) FILTER (WHERE cp.status = 'approved')::int,
    count(lp.id) FILTER (WHERE lp.assigned_at > now() - interval '7 days')::int,
    max(lp.assigned_at)
  FROM public.companies c
  LEFT JOIN public.lead_purchases lp ON lp.company_id = c.id
  LEFT JOIN public.complaints cp ON cp.purchase_id = lp.id
  WHERE p_company_id IS NULL OR c.id = p_company_id
  GROUP BY c.id
$$;

REVOKE ALL ON FUNCTION public.company_quality_metrics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_quality_metrics(uuid) TO service_role;