update public.ai_agents
set tools_habilitadas = '["pesquisar_passagens","reenviar_opcao","reservar_opcao","transferir_para_consultores","encaminhar_para_comercial"]'::jsonb
where slug in ('bruno','paula');