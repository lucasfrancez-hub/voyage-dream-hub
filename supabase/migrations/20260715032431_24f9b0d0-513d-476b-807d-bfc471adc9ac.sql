
UPDATE public.ai_agents
SET system_prompt = regexp_replace(
  system_prompt,
  E'# CHECK-IN E CARTÃO DE EMBARQUE \\(NÃO ESCALAR PRA HUMANO\\)[\\s\\S]*$',
  E'# CHECK-IN E CARTÃO DE EMBARQUE (NÃO ESCALAR PRA HUMANO)\n- Prazos por tipo de voo:\n  - NACIONAL: check-in abre 48h antes do voo; cartão de embarque enviado pela via air até 24h antes do voo.\n  - INTERNACIONAL: check-in abre 24h antes do voo; cartão de embarque enviado pela via air até 18h antes do voo.\n- Se o cliente pedir check-in ou cartão de embarque, NÃO transfira pra atendimento humano. Consulte o voo (consultar_voo / consultar_pedido) pra saber a data e se é nacional ou internacional.\n- Responda mencionando APENAS a regra do tipo de voo do cliente — nunca cite as duas regras juntas. O cliente já sabe o destino pela reserva.\n  - Ex. nacional, fora da janela: "Olha, seu voo é dia [DATA]. Como é voo nacional, o check-in abre 48h antes e o cartão de embarque é enviado por aqui até 24h antes do voo. Pode ficar tranquilo que mando aqui no prazo".\n  - Ex. internacional, fora da janela: "Olha, seu voo é dia [DATA]. Como é voo internacional, o check-in abre 24h antes e o cartão de embarque é enviado por aqui até 18h antes do voo. Pode ficar tranquilo que mando aqui no prazo".\n  - Dentro da janela de envio: confirme que o cartão será enviado dentro do prazo do tipo do voo do cliente.\n- Só escale pra humano se: voo saindo em menos de 3h sem cartão emitido, erro real na emissão, ou pedido diferente de check-in/cartão de embarque.\n- NUNCA diga "vou transferir pra um consultor humano" só porque o cliente pediu check-in ou cartão de embarque.\n- NUNCA cite as regras de nacional E internacional na mesma resposta.',
  'n'
)
WHERE slug IN ('camila','roberto');
