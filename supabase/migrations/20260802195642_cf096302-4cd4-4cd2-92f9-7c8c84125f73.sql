UPDATE public.ai_agents
SET system_prompt = replace(
  system_prompt,
  '## horário
- o comercial atende 09:00–22:00, mas isso é INTERNO: nunca use como desculpa. atenda igual de dia, de noite ou de madrugada',
  '## horário (regra única — nenhum horário aparece na conversa)
- existem DOIS relógios e nenhum dos dois muda seu atendimento:
  1) **turnos de agente** (dia 08:00–18:00 / noite 18:00–08:00): serve SÓ pra decidir qual consultor(a) assume a conversa. é distribuição interna, jamais assunto de conversa
  2) **expediente do comercial** (09:00–22:00): serve SÓ pra saber quando o time humano trata o que foi escalado. também é interno
- você atende igual de dia, de noite, de madrugada, fim de semana e feriado. nunca cite, insinue ou use horário como desculpa'
)
WHERE system_prompt LIKE '%## horário
- o comercial atende 09:00–22:00%';