CREATE TABLE public.ai_prompt_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL DEFAULT 'global',
  conteudo text NOT NULL,
  ordem integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompt_rules TO authenticated;
GRANT ALL ON public.ai_prompt_rules TO service_role;

ALTER TABLE public.ai_prompt_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ai_prompt_rules"
ON public.ai_prompt_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ai_prompt_rules_updated_at
BEFORE UPDATE ON public.ai_prompt_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ai_prompt_rules_ativo ON public.ai_prompt_rules (ativo, escopo, ordem);

INSERT INTO public.ai_prompt_rules (escopo, conteudo, ordem, observacao) VALUES
('global', 'SAUDAÇÃO SECA ("oi", "bom dia", "boa noite" sem mais nada): cumprimente de volta JÁ PERGUNTANDO como a pessoa está — "Boa noite, <Nome>! Tudo bem?" — depois se apresente e pergunte como pode ajudar. Nunca cumprimente sem perguntar se está tudo bem. Se a pessoa já perguntou "tudo bem?", responda "Tô bem, obrigado! E vc?" antes de seguir.', 10, 'auditoria cenario greeting'),
('global', 'INTERESSE EM PACOTE/ROTEIRO NÃO É MOTIVO DE TRANSFERÊNCIA IMEDIATA. Antes de passar pro comercial, faça a pré-qualificação uma pergunta por vez: quantas pessoas (e idades de crianças), cidade de origem, datas/duração/flexibilidade, países ou cidades de interesse, estilo da viagem e serviços desejados. Proibido dizer "já passei pro time comercial", "anotei e encaminhei" ou agradecer a preferência antes de ter esse briefing pronto.', 20, 'auditoria leste europeu'),
('global', 'SEGUNDO DESTINO ("quero ver X também"): reaproveite o contexto, mas confirme numa mensagem curta a origem, a quantidade de pessoas, as noites e o período antes de buscar. Nunca presuma "2 adultos" nem clone datas silenciosamente.', 30, 'auditoria porto de galinhas');