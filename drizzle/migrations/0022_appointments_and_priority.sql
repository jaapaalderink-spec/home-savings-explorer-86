ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE public.lead_purchases ADD CONSTRAINT lead_purchases_priority_check CHECK (priority IN ('high','normal','low'));

CREATE TABLE public.lead_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text,
  scheduled_at timestamptz NOT NULL,
  kind text NOT NULL DEFAULT 'onsite' CHECK (kind IN ('onsite','phone','video')),
  note text CHECK (note IS NULL OR length(note) <= 500),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_appointments_company_time ON public.lead_appointments(company_id, scheduled_at);
CREATE INDEX lead_appointments_purchase ON public.lead_appointments(purchase_id);

GRANT SELECT ON public.lead_appointments TO authenticated;
GRANT ALL ON public.lead_appointments TO service_role;
ALTER TABLE public.lead_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read own appointments" ON public.lead_appointments
FOR SELECT TO authenticated
USING (public.can_access_purchase(purchase_id, auth.uid()));

CREATE TRIGGER lead_appointments_touch BEFORE UPDATE ON public.lead_appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();