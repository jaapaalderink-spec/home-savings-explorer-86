CREATE TABLE public.energy_bill_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.energy_bill_scans TO service_role;
ALTER TABLE public.energy_bill_scans ENABLE ROW LEVEL SECURITY;
CREATE INDEX energy_bill_scans_client_idx ON public.energy_bill_scans (client_hash, created_at);
CREATE INDEX energy_bill_scans_created_idx ON public.energy_bill_scans (created_at);

CREATE OR REPLACE FUNCTION public.claim_energy_bill_scan(p_client_hash text, p_per_hour integer, p_per_day integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('energy_bill_scans'));
  DELETE FROM energy_bill_scans WHERE created_at < now() - interval '2 days';
  IF (SELECT count(*) FROM energy_bill_scans WHERE created_at > now() - interval '1 day') >= p_per_day THEN
    RETURN 'global_limit';
  END IF;
  IF (SELECT count(*) FROM energy_bill_scans WHERE client_hash = p_client_hash AND created_at > now() - interval '1 hour') >= p_per_hour THEN
    RETURN 'client_limit';
  END IF;
  INSERT INTO energy_bill_scans(client_hash) VALUES (p_client_hash);
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.claim_energy_bill_scan(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_energy_bill_scan(text, integer, integer) TO service_role;