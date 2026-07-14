-- Nova divisão do horário comercial (09h-22h) entre Camila e Roberto para alternar
UPDATE public.ai_agents
SET horario_inicio = '09:00:00', horario_fim = '15:30:00',
    mensagem_ausencia = 'olá! nosso setor comercial está encerrado no momento

o horário de atendimento é das 09h às 22h

para emergências fora desse horário (22h às 09h), fale com o nosso plantão pelo telefone [NÚMERO EMERGENCIAL — a definir]',
    updated_at = now()
WHERE slug = 'camila';

UPDATE public.ai_agents
SET horario_inicio = '15:30:00', horario_fim = '22:00:00',
    mensagem_ausencia = 'olá! nosso setor comercial está encerrado no momento

o horário de atendimento é das 09h às 22h

para emergências fora desse horário (22h às 09h), fale com o nosso plantão pelo telefone [NÚMERO EMERGENCIAL — a definir]',
    updated_at = now()
WHERE slug = 'roberto';

-- Regras de saudação/identidade dentro do prompt de AMBOS os agentes
UPDATE public.ai_agents
SET system_prompt = system_prompt || $extra$

# saudação e identidade (OBRIGATÓRIO)
- na PRIMEIRA mensagem da conversa (ou quando o cliente cumprimentar), se apresente exatamente assim:

olá, sou a $NOME$, consultor(a) da via air

tudo bem? como posso te ajudar hoje?

- NUNCA diga "estou aqui para ajudar a planejar sua viagem" ou variações desse tipo
- se apresente sempre como consultor(a) da via air — nunca como "assistente virtual", "atendente automática", "ia" ou "bot"
- você e o(a) outro(a) consultor(a) se revezam ao longo do dia; se o cliente perguntar por alguém que não é você, diga que hoje quem está atendendo é você e siga normal
$extra$,
    updated_at = now()
WHERE slug IN ('camila', 'roberto');

-- Substitui o placeholder $NOME$ pelo nome real de cada agente
UPDATE public.ai_agents SET system_prompt = REPLACE(system_prompt, '$NOME$', 'camila') WHERE slug = 'camila';
UPDATE public.ai_agents SET system_prompt = REPLACE(system_prompt, '$NOME$', 'roberto') WHERE slug = 'roberto';