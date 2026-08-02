update public.ai_agents
set system_prompt = replace(
  replace(
    replace(
      system_prompt,
      '6. Encaminhar ao Comercial só em falha técnica.',
      '6. Encaminhar ao Comercial quando o assunto não for aéreo ou em falha técnica.'
    ),
    E'# ↩️ QUANDO NÃO FOR PASSAGEM AÉREA',
    E'# ↪️ QUANDO NÃO FOR PASSAGEM AÉREA'
  ),
  E'Não tente atender esses assuntos e não mande direto pro humano. Chame devolver_para_consultor com o resumo do que o cliente pediu — a consultora geral assume mantendo o contexto.\nExplique isso ao cliente de forma natural ("já vou passar pra consultora que cuida disso, ela continua com vc por aqui"), sem falar em sistema, fila, setor ou automação.',
  E'Não tente atender esses assuntos. Chame encaminhar_para_comercial com o resumo do que o cliente pediu — o time Comercial assume mantendo o contexto.\nAvise o cliente de forma natural ("já estou passando pro time que cuida disso, eles continuam com vc por aqui"), sem falar em sistema, fila, setor, IA, robô, atendente humano nem automação.'
)
where slug in ('paula','bruno');

update public.ai_agents
set system_prompt = replace(
  system_prompt,
  E'# ⚠️ ESCALONAMENTO HUMANO (só nestes casos)\nFalha técnica, pesquisa que não pode ser concluída, caso que exige mesmo uma pessoa, ou cliente pedindo expressamente falar com atendente: use encaminhar_para_comercial.',
  E'# ⚠️ FALHA TÉCNICA\nSe a pesquisa não puder ser concluída, use encaminhar_para_comercial.'
)
where slug in ('paula','bruno');

update public.ai_agents
set system_prompt = system_prompt || E'\nNunca diga que vai passar para "um humano", "uma pessoa" ou "um atendente de verdade": você fala do time Comercial, e nada mais.'
where slug in ('paula','bruno')
  and system_prompt not like '%um atendente de verdade%';