DO $$ DECLARE d text; n text; BEGIN
  SELECT pg_get_functiondef('public.allocate_lead_bundle(uuid,uuid,text[],public.purchase_source,uuid)'::regprocedure) INTO d;
  n := replace(d, 'SELECT coalesce(e.categories, ''{}'') INTO v_covered FROM public.eligible_companies_for_lead(p_lead_id) e WHERE e.company_id = p_company_id;',
    'IF coalesce(current_setting(''app.manual_ignore_area'', true), '''') = ''on'' THEN SELECT coalesce(array_agg(cp.category), ''{}'') INTO v_covered FROM public.company_products cp WHERE cp.company_id = p_company_id AND cp.active; ELSE SELECT coalesce(e.categories, ''{}'') INTO v_covered FROM public.eligible_companies_for_lead(p_lead_id) e WHERE e.company_id = p_company_id; END IF;');
  IF n = d THEN RAISE EXCEPTION 'covered pattern not found'; END IF;
  d := n;
  n := replace(d, 'AND public.recipient_area_covers(', 'AND (coalesce(current_setting(''app.manual_ignore_area'', true), '''') = ''on'' OR public.recipient_area_covers(');
  IF n = d THEN RAISE EXCEPTION 'recipient pattern not found'; END IF;
  n := replace(n, 's.provinces, plat, plng, pprov)', 's.provinces, plat, plng, pprov))');
  EXECUTE n;
  SELECT pg_get_functiondef('public.allocate_lead_manual(uuid,uuid,uuid,text,numeric,text)'::regprocedure) INTO d;
  n := replace(d, 'PERFORM set_config(''app.manual_price_mode'', p_mode, true);', 'PERFORM set_config(''app.manual_price_mode'', p_mode, true); PERFORM set_config(''app.manual_ignore_area'', ''on'', true);');
  n := replace(n, 'PERFORM set_config(''app.manual_price_mode'', '''', true);', 'PERFORM set_config(''app.manual_price_mode'', '''', true); PERFORM set_config(''app.manual_ignore_area'', '''', true);');
  IF n = d THEN RAISE EXCEPTION 'manual pattern not found'; END IF;
  EXECUTE n;
END $$;