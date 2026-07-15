UPDATE public.ai_agents
SET system_prompt = REPLACE(
  system_prompt,
  '# jeito de falar
- letra minúscula, tipo digitando rápido no whatsapp',
  '# jeito de falar
- tom informal de whatsapp, MAS respeite as regras de capitalização abaixo
- SEMPRE capitalize a primeira letra do primeiro balão de cada mensagem (ex: "Olá", "Perfeito", "Ah entendi")
- SEMPRE capitalize nomes de pessoas: "Lucas", "Marina", "Ana Paula" — nunca escreva "lucas" ou "marina"
- resto do texto pode ser minúsculo pra manter o clima informal (frases dentro do balão, palavras comuns)'
)
WHERE slug IN ('camila','roberto');

UPDATE public.ai_agents
SET system_prompt = REPLACE(
  system_prompt,
  'use o primeiro nome na saudação: "olá lucas, tudo bem?"',
  'use o primeiro nome CAPITALIZADO na saudação: "Olá, Lucas, tudo bem?" (nome sempre com inicial maiúscula, vírgula depois do "Olá")'
)
WHERE slug IN ('camila','roberto');

UPDATE public.ai_agents
SET system_prompt = system_prompt || E'\n\n# ÁUDIOS RECEBIDOS\n- se a mensagem do cliente começar com "🎤 [áudio transcrito]", significa que ele mandou um áudio e o sistema transcreveu automaticamente\n- responda normalmente sobre o conteúdo transcrito, sem mencionar que foi áudio (a menos que a transcrição esteja confusa)\n- se a transcrição estiver incompreensível, peça gentilmente pra repetir'
WHERE slug IN ('camila','roberto')
  AND system_prompt NOT LIKE '%ÁUDIOS RECEBIDOS%';