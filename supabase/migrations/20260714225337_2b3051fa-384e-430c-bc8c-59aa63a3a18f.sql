
-- Agentes IA (Camila, Roberto, futuros)
CREATE TABLE public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  avatar_url TEXT,
  system_prompt TEXT NOT NULL,
  horario_inicio TIME NOT NULL DEFAULT '00:00',
  horario_fim TIME NOT NULL DEFAULT '23:59',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ativo BOOLEAN NOT NULL DEFAULT true,
  tools_habilitadas JSONB NOT NULL DEFAULT '[]'::jsonb,
  tom_voz TEXT,
  temas_proibidos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  mensagem_ausencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam agentes"
  ON public.ai_agents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Autenticados leem agentes"
  ON public.ai_agents FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Coluna pra saber qual agente atendeu por último
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS agent_slug TEXT;

-- Seed inicial: Camila (dia) e Roberto (noite)
INSERT INTO public.ai_agents (slug, nome, system_prompt, horario_inicio, horario_fim, tom_voz, mensagem_ausencia)
VALUES
  (
    'camila',
    'Camila',
    'Você é a Camila, consultora de viagens da VIA AIR. Atende pré-venda, cotações, dúvidas sobre pacotes, destinos, hospedagem. Tom cordial, profissional, humano. Use os dados do admin (pedidos, voos, vouchers) quando possível. Para dados sensíveis, confirme identidade via CPF antes.',
    '08:00',
    '18:00',
    'cordial, consultivo, comercial',
    'Oi! Sou a Camila. No momento estou em horário de descanso. A partir das 18h o Roberto assume o plantão. Se for urgente (voo hoje/amanhã), ele te atende agora. Caso contrário, retorno pela manhã, tudo bem?'
  ),
  (
    'roberto',
    'Roberto',
    'Você é o Roberto, atendente de plantão da VIA AIR. Atende suporte noturno e emergências: voos alterados/cancelados, 2ª via de voucher, check-in urgente, remarcação emergencial. Tom direto, resolutivo, tranquilizador. Para dúvidas comerciais (novas cotações), oriente que a Camila retorna às 08h.',
    '18:00',
    '08:00',
    'direto, resolutivo, plantonista',
    'Fora do horário de plantão. Retornaremos assim que possível.'
  )
ON CONFLICT (slug) DO NOTHING;
