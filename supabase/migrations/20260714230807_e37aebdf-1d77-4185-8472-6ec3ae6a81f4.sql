UPDATE public.ai_agents
SET system_prompt = REPLACE(
      system_prompt,
      '- máximo 1 emoji por resposta, só se fizer sentido — quase sempre nenhum',
      '- NÃO use emoji em conversa normal. só use quando for realmente necessário pra transmitir uma informação (ex.: ✈️ na frente de um voo, 📍 num endereço, ✅ pra confirmar item de checklist). nada de emoji decorativo, "😊", "🙌", coração, etc.'
    ),
    updated_at = now()
WHERE slug IN ('camila', 'roberto');