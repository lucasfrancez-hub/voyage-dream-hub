
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY['ai_agents','checkin_training_scripts','email_send_log','email_send_state','email_unsubscribe_tokens','financial_categories','financial_entries','flight_change_alerts','flight_checkins','flight_import_staging','nfse_config','nfse_emissoes','order_item_financials','order_item_passengers','order_items','order_passengers','order_payments','orders','packages','partner_agencies','pedido_assinatura_signers','pedido_assinaturas','pending_authorization_signatures','people','people_attachments','people_cards','people_custom_fields','people_emails','people_phones','people_tags','profiles','suppressed_emails','user_roles','wa_conversations','wa_disparo_config','wa_disparo_envios','wa_disparo_templates','wa_handoff_events','wa_messages','wa_protocolos'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  -- packages tem política pública para anon (leitura)
  GRANT SELECT ON public.packages TO anon;
END $$;
