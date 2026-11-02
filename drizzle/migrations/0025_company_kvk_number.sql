ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS kvk_number text;
ALTER TABLE public.companies ADD CONSTRAINT companies_kvk_number_format CHECK (kvk_number IS NULL OR kvk_number ~ '^[0-9]{8}$');