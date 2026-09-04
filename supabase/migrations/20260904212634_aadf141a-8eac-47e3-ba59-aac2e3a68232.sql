CREATE TABLE public.phone_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX phone_verifications_token_key ON public.phone_verifications(token);
CREATE INDEX phone_verifications_phone_created_idx ON public.phone_verifications(phone, created_at DESC);

GRANT ALL ON public.phone_verifications TO service_role;

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER phone_verifications_touch
BEFORE UPDATE ON public.phone_verifications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();