CREATE TABLE public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'retry',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id)
);
GRANT SELECT ON public.background_jobs TO authenticated;
GRANT ALL ON public.background_jobs TO service_role;
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read jobs" ON public.background_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Beheerdersrol telt in browsercontext alleen mee na tweestapsverificatie (aal2).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    AND (
      _role <> 'admin'
      OR auth.uid() IS NULL
      OR auth.uid() <> _user_id
      OR coalesce(auth.jwt()->>'aal', '') = 'aal2'
    )
$$;