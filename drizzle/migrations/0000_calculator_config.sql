CREATE TABLE public.calculator_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  "values" jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("values") = 'object'),
  tariff_sets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tariff_sets) = 'array'),
  note text CHECK (char_length(note) <= 500),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  published_at timestamptz,
  published_by uuid
);
CREATE UNIQUE INDEX calculator_config_one_draft ON public.calculator_config_versions ((true)) WHERE status = 'draft';
CREATE UNIQUE INDEX calculator_config_one_published ON public.calculator_config_versions ((true)) WHERE status = 'published';
GRANT SELECT ON public.calculator_config_versions TO anon, authenticated;
GRANT INSERT, UPDATE ON public.calculator_config_versions TO authenticated;
GRANT ALL ON public.calculator_config_versions TO service_role;
ALTER TABLE public.calculator_config_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published config is public" ON public.calculator_config_versions
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Admins read all config" ON public.calculator_config_versions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins create drafts" ON public.calculator_config_versions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND status = 'draft');
CREATE POLICY "Admins edit drafts" ON public.calculator_config_versions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') AND status = 'draft')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND status = 'draft');

CREATE TABLE public.calculator_config_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.calculator_config_versions(id) ON DELETE CASCADE,
  setting_key text NOT NULL CHECK (char_length(setting_key) <= 120),
  action text NOT NULL DEFAULT 'change' CHECK (action IN ('change','reset','publish')),
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.calculator_config_changes (changed_at DESC);
GRANT SELECT, INSERT ON public.calculator_config_changes TO authenticated;
GRANT ALL ON public.calculator_config_changes TO service_role;
ALTER TABLE public.calculator_config_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read config history" ON public.calculator_config_changes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins log config changes" ON public.calculator_config_changes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND changed_by = auth.uid());
CREATE TRIGGER calculator_config_changes_append_only BEFORE UPDATE OR DELETE ON public.calculator_config_changes
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_mutation();

CREATE OR REPLACE FUNCTION public.publish_calculator_config(_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen platformbeheerders' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.calculator_config_versions WHERE id = _id AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Geen concept om te publiceren'; END IF;
  UPDATE public.calculator_config_versions SET status = 'archived' WHERE status = 'published';
  UPDATE public.calculator_config_versions
    SET status = 'published', published_at = now(), published_by = auth.uid()
    WHERE id = _id RETURNING version INTO v;
  INSERT INTO public.calculator_config_changes(version_id, setting_key, action, new_value, changed_by)
    VALUES (_id, '*', 'publish', to_jsonb(v), auth.uid());
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.publish_calculator_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_calculator_config(uuid) TO authenticated;