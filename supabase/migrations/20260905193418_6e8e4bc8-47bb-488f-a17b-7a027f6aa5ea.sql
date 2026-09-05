CREATE TYPE public.payment_status AS ENUM ('open', 'pending', 'paid', 'failed', 'expired', 'canceled');

ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'open';

CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mollie',
  provider_payment_id text NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'open',
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  checkout_url text,
  paid_at timestamp with time zone,
  failed_at timestamp with time zone,
  expires_at timestamp with time zone,
  amount_mismatch boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_payment_unique UNIQUE (provider, provider_payment_id)
);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company reads own payments" ON public.payments
  FOR SELECT TO authenticated
  USING ((company_id = public.current_company_id()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX payments_invoice_idx ON public.payments (invoice_id, created_at DESC);
CREATE INDEX payments_status_idx ON public.payments (status);

CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.invoices
  ADD COLUMN payment_status public.payment_status,
  ADD COLUMN active_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN last_payment_attempt_at timestamp with time zone,
  ADD COLUMN payment_review_required boolean NOT NULL DEFAULT false;

UPDATE public.invoices
   SET payment_status = CASE WHEN status = 'paid' THEN 'paid'::public.payment_status ELSE 'open'::public.payment_status END;

ALTER TABLE public.invoices ALTER COLUMN payment_status SET DEFAULT 'open'::public.payment_status;
ALTER TABLE public.invoices ALTER COLUMN payment_status SET NOT NULL;