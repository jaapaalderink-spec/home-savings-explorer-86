-- Preserve the shared allocator signature while rejecting retired market calls before any delivery work.
DO $$ DECLARE v_definition text; BEGIN SELECT pg_get_functiondef('public.allocate_lead_bundle(uuid,uuid,text[],public.purchase_source,uuid)'::regprocedure) INTO v_definition;
 v_definition:=replace(v_definition, 'IF p_source = ''market'' AND v_lead.market_enabled IS NOT TRUE THEN', 'IF p_source = ''market'' THEN');
 EXECUTE v_definition; END $$;
-- Lock both price sources and purchase correction state before calculating invoice totals.
DO $$ DECLARE v_definition text; BEGIN SELECT pg_get_functiondef('public.issue_company_month_invoice(uuid,integer,integer)'::regprocedure) INTO v_definition;
 v_definition:=replace(v_definition, 'SELECT v_fixed+coalesce(sum(b.amount_ex_vat),0)', 'PERFORM b.id FROM public.delivery_price_bookings b JOIN public.lead_purchases lp ON lp.id=b.purchase_id WHERE b.company_id=p_company AND b.booked_at>=v_begin AND b.booked_at<v_end AND b.invoice_id IS NULL AND lp.billable AND NOT lp.credited AND NOT lp.is_trial AND lp.invoice_id IS NULL ORDER BY b.id FOR UPDATE OF b,lp; SELECT v_fixed+coalesce(sum(b.amount_ex_vat),0)');
 EXECUTE v_definition; END $$;