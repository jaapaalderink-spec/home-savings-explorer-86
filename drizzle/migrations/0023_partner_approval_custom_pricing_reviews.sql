ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_reason text;
ALTER TABLE public.companies ADD CONSTRAINT companies_approval_status_chk
  CHECK (approval_status IN ('pending','approved','closed'));

ALTER TABLE public.subscription_versions
  ADD COLUMN IF NOT EXISTS custom_pricing boolean NOT NULL DEFAULT false;

CREATE TABLE public.price_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_version_id uuid REFERENCES public.subscription_versions(id) ON DELETE SET NULL,
  review_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  outcome text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  completed_at timestamptz
);
GRANT ALL ON public.price_reviews TO service_role;
ALTER TABLE public.price_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX price_reviews_open_idx ON public.price_reviews(review_date) WHERE status = 'open';

-- Alleen goedgekeurde, actieve bedrijven kunnen leveringen ontvangen (alle toewijzingspaden).
CREATE OR REPLACE FUNCTION public.guard_purchase_company_approved()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c
                 WHERE c.id = NEW.company_id AND c.active AND c.approval_status = 'approved') THEN
    RAISE EXCEPTION 'COMPANY_NOT_APPROVED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lead_purchases_company_approved
  BEFORE INSERT ON public.lead_purchases
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_company_approved();