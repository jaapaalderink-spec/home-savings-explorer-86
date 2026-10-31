-- Het gratis startaanbod (eerste 10 leads gratis) wordt stopgezet: nieuwe toewijzingen zijn nooit meer proefleads. Bestaande is_trial-regels blijven als historie bestaan.
CREATE OR REPLACE FUNCTION public.trial_lead_allowance()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 0 $$;