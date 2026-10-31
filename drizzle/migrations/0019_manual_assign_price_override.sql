CREATE OR REPLACE FUNCTION public.apply_manual_price_override()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE m text := current_setting('app.manual_price_mode', true); v numeric; n text;
BEGIN
  IF m IS NULL OR m = '' OR m = 'standard' THEN RETURN NEW; END IF;
  v := nullif(current_setting('app.manual_price_value', true), '')::numeric;
  n := nullif(current_setting('app.manual_price_note', true), '');
  IF m = 'free' THEN NEW.price_ex_vat := 0; NEW.billable := false;
  ELSIF m = 'percent' THEN NEW.price_ex_vat := round(NEW.price_ex_vat * (100 - v) / 100, 2);
  ELSIF m = 'fixed' THEN NEW.price_ex_vat := round(v, 2); NEW.billable := v > 0;
  END IF;
  IF NEW.price_ex_vat <= 0 THEN NEW.billable := false; NEW.price_ex_vat := 0; END IF;
  NEW.note := concat_ws(' — ', NEW.note, 'Handmatig: ' || CASE m WHEN 'free' THEN 'gratis' WHEN 'percent' THEN v || '% korting' ELSE 'vaste prijs €' || v END || coalesce(' ('||n||')',''));
  RETURN NEW;
END $$;

CREATE TRIGGER a_manual_price_override BEFORE INSERT ON public.lead_purchases
FOR EACH ROW EXECUTE FUNCTION public.apply_manual_price_override();

CREATE OR REPLACE FUNCTION public.allocate_lead_manual(p_lead_id uuid, p_company_id uuid, p_actor uuid, p_mode text, p_value numeric, p_note text)
RETURNS TABLE(result text, purchase_id uuid, price_ex_vat numeric, billable boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_mode NOT IN ('standard','free','percent','fixed') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
  IF p_mode = 'percent' AND (p_value IS NULL OR p_value <= 0 OR p_value > 100) THEN RAISE EXCEPTION 'INVALID_PERCENT'; END IF;
  IF p_mode = 'fixed' AND (p_value IS NULL OR p_value < 0 OR p_value > 1000) THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  PERFORM set_config('app.manual_price_mode', p_mode, true);
  PERFORM set_config('app.manual_price_value', coalesce(p_value::text,''), true);
  PERFORM set_config('app.manual_price_note', left(coalesce(p_note,''),200), true);
  RETURN QUERY SELECT a.result, a.purchase_id,
    (SELECT lp.price_ex_vat FROM lead_purchases lp WHERE lp.id = a.purchase_id),
    (SELECT lp.billable FROM lead_purchases lp WHERE lp.id = a.purchase_id)
  FROM public.allocate_lead_bundle(p_lead_id, p_company_id, NULL, 'assigned', p_actor) a;
  PERFORM set_config('app.manual_price_mode', '', true);
END $$;

REVOKE ALL ON FUNCTION public.allocate_lead_manual(uuid,uuid,uuid,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lead_manual(uuid,uuid,uuid,text,numeric,text) TO service_role;