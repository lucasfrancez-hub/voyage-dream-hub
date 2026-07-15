
UPDATE public.ai_agents
SET system_prompt = replace(
  system_prompt,
  '- check-in, emissão, financeiro, reembolso, voucher, remarcação, bagagem, localizador, comprovante → escala',
  '- emissão, financeiro, reembolso, voucher, remarcação, bagagem, localizador, comprovante → escala (check-in e cartão de embarque NÃO escala — ver seção específica abaixo)'
)
WHERE slug IN ('camila','roberto');

UPDATE public.ai_agents
SET system_prompt = system_prompt || E'\n\n# CHECK-IN E CARTÃO DE EMBARQUE (NÃO ESCALAR PRA HUMANO)\n- Abertura do check-in pela cia aérea: voos NACIONAIS abrem 48h antes do horário do voo; voos INTERNACIONAIS abrem 24h antes.\n- Envio do cartão de embarque pela via air ao cliente: voos NACIONAIS até 24h antes do voo; voos INTERNACIONAIS até 18h antes do voo.\n- Se o cliente pedir check-in ou cartão de embarque, NÃO transfira pra atendimento humano. Consulte o voo (consultar_voo / consultar_pedido) pra ver a data e o tipo (nacional/internacional) e responda com base nos prazos acima:\n  - se ainda não abriu o check-in: informe quando abre (48h nacional / 24h internacional) e diga que o cartão será enviado por aqui até 24h antes (nacional) ou 18h antes (internacional) do voo\n  - se já está dentro da janela de envio: confirme que o cartão será enviado dentro do prazo (até 24h nacional / até 18h internacional antes do voo)\n- Só escale pra humano se: voo saindo em menos de 3h sem cartão emitido, erro real na emissão, ou pedido diferente de check-in/cartão de embarque.\n- NUNCA diga "vou transferir pra um consultor humano" só porque o cliente pediu check-in ou cartão de embarque.'
WHERE slug IN ('camila','roberto')
  AND system_prompt NOT LIKE '%CHECK-IN E CARTÃO DE EMBARQUE (NÃO ESCALAR%';
