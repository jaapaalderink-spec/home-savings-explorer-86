ALTER TABLE public.lead_purchases
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.lead_purchases SET assigned_to = purchased_by WHERE assigned_to IS NULL AND purchased_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_purchases_company_assigned_idx ON public.lead_purchases (company_id, assigned_to);