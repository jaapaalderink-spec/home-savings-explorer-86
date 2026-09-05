ALTER TABLE public.phone_verifications
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE INDEX IF NOT EXISTS phone_verifications_lead_idx
  ON public.phone_verifications(lead_id);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

REVOKE ALL ON public.phone_verifications FROM anon, authenticated;
GRANT ALL ON public.phone_verifications TO service_role;