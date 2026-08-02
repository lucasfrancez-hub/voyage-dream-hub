update public.ai_agents
set tools_habilitadas = '["pesquisar_passagens","reenviar_opcao","encaminhar_para_comercial"]'::jsonb
where slug in ('paula','bruno');