
ALTER TABLE public.wa_protocolos
  ADD COLUMN IF NOT EXISTS agent_slug text,
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS prompt_type text,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS origin_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS origin_confirmed_by_message_id uuid,
  ADD COLUMN IF NOT EXISTS origin_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_quote_id uuid,
  ADD COLUMN IF NOT EXISTS last_option_index integer,
  ADD COLUMN IF NOT EXISTS last_reference_message_id uuid,
  ADD COLUMN IF NOT EXISTS last_reference_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_reset_at timestamptz;

CREATE TABLE IF NOT EXISTS public.wa_protocol_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  protocolo_id uuid,
  event text NOT NULL,
  agent_slug text,
  trigger_message_id uuid,
  deployment_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_protocol_events_proto_idx ON public.wa_protocol_events (protocolo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_protocol_events_conv_idx ON public.wa_protocol_events (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_protocol_events_event_idx ON public.wa_protocol_events (event, created_at DESC);

GRANT SELECT ON public.wa_protocol_events TO authenticated;
GRANT ALL ON public.wa_protocol_events TO service_role;
ALTER TABLE public.wa_protocol_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff reads protocol events" ON public.wa_protocol_events;
CREATE POLICY "staff reads protocol events"
  ON public.wa_protocol_events FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.close_protocol_and_reset_runtime(
  p_protocol_id uuid,
  p_status text DEFAULT 'encerrado_manual',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv uuid;
  v_stage text;
  v_closed integer := 0;
BEGIN
  SELECT conversation_id INTO v_conv FROM public.wa_protocolos WHERE id = p_protocol_id;
  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'protocol_not_found');
  END IF;

  SELECT funnel_stage INTO v_stage FROM public.wa_conversations WHERE id = v_conv;

  UPDATE public.wa_protocolos
     SET status = p_status,
         closed_at = COALESCE(closed_at, now()),
         funnel_stage_final = COALESCE(funnel_stage_final, v_stage),
         agent_slug = NULL,
         agent_name = NULL,
         prompt_type = NULL,
         product_type = NULL,
         origin = NULL,
         origin_status = 'missing',
         origin_confirmed_by_message_id = NULL,
         origin_confirmed_at = NULL,
         last_quote_id = NULL,
         last_option_index = NULL,
         last_reference_message_id = NULL,
         last_reference_at = NULL,
         runtime_reset_at = now()
   WHERE id = p_protocol_id
     AND status = 'aberto';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.wa_conversations
     SET protocolo_ativo_id = CASE WHEN protocolo_ativo_id = p_protocol_id THEN NULL ELSE protocolo_ativo_id END,
         agent_slug = NULL,
         central_slug = NULL,
         central_desde = NULL,
         central_brief = NULL,
         central_busca = NULL,
         ai_instruction = NULL,
         ai_instruction_at = NULL,
         ai_instruction_by = NULL,
         ai_debounce_until = NULL,
         ultima_quote_referenciada = NULL,
         ultima_opcao_referenciada = NULL,
         ultima_referencia_at = NULL,
         ultima_referencia_source = NULL,
         ultima_referencia_assunto = NULL,
         ultima_companhia_referenciada = NULL,
         ultima_opcao_hotel_referenciada = NULL,
         ultimo_pacote_referenciado = NULL,
         tags = COALESCE(
           ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest(ARRAY['aguardando_humano','escalada_implicita','transferencia_nominal'])),
           '{}'::text[]
         )
   WHERE id = v_conv;

  UPDATE public.wa_flight_quotes
     SET cancelled_at = COALESCE(cancelled_at, now()),
         cancelled_reason = COALESCE(cancelled_reason, 'protocolo_encerrado')
   WHERE protocolo_id = p_protocol_id
     AND cards_sent_at IS NULL
     AND cancelled_at IS NULL;

  INSERT INTO public.wa_protocol_events (conversation_id, protocolo_id, event, payload)
  VALUES
    (v_conv, p_protocol_id, 'protocol_closed', jsonb_build_object('status', p_status, 'reason', p_reason, 'already_closed', v_closed = 0)),
    (v_conv, p_protocol_id, 'protocol_runtime_reset', jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv, 'closed', v_closed > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.close_protocol_and_reset_runtime(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_protocol_and_reset_runtime(uuid, text, text) TO service_role;
