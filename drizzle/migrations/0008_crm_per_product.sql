CREATE TABLE public.purchase_product_crm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  status public.lead_status NOT NULL DEFAULT 'new',
  follow_up_date date,
  lost_reason text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, category)
);
GRANT SELECT ON public.purchase_product_crm TO authenticated;
GRANT ALL ON public.purchase_product_crm TO service_role;
ALTER TABLE public.purchase_product_crm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own product CRM" ON public.purchase_product_crm
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.purchase_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.lead_purchases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  version integer NOT NULL,
  amount_ex_vat numeric(12,2) NOT NULL CHECK (amount_ex_vat >= 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, category, version)
);
GRANT SELECT ON public.purchase_quotes TO authenticated;
GRANT ALL ON public.purchase_quotes TO service_role;
ALTER TABLE public.purchase_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads own quotes" ON public.purchase_quotes
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER purchase_quotes_append_only BEFORE UPDATE OR DELETE ON public.purchase_quotes
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_mutation();
CREATE TRIGGER purchase_product_crm_touch BEFORE UPDATE ON public.purchase_product_crm
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TYPE public.audit_event_type ADD VALUE IF NOT EXISTS 'ADMIN_PREVIEW_OPENED';
ALTER TYPE public.audit_event_type ADD VALUE IF NOT EXISTS 'PRODUCT_STATUS_CHANGED';
ALTER TYPE public.audit_event_type ADD VALUE IF NOT EXISTS 'QUOTE_ADDED';