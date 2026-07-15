## O que vai mudar

Cada conversa passa a ter **protocolos** numerados. Um protocolo abre quando o cliente inicia contato, e fecha automaticamente após **1 hora sem resposta**. Se o cliente voltar a falar depois disso, a Camila/Roberto avaliam: se é continuação do mesmo assunto, retomam o protocolo anterior; se é assunto novo, abrem um novo.

## 1. Banco (migration)

Nova tabela `wa_protocolos`:
- `numero` (bigint, sequencial via sequence, exibido como `2026071500123`)
- `conversation_id` (FK → wa_conversations)
- `status` (`aberto` | `encerrado_inatividade` | `encerrado_manual`)
- `assunto_resumo` (texto curto que a IA preenche pra decidir reabertura)
- `opened_at`, `closed_at`, `last_activity_at`
- `funnel_stage_final` (snapshot do estágio no encerramento)

Em `wa_messages`: adicionar `protocolo_id` (FK) — cada mensagem pertence a um protocolo.

Em `wa_conversations`: adicionar `protocolo_ativo_id` (FK, nullable).

## 2. Abertura automática

Ao receber a **primeira mensagem inbound** sem protocolo ativo, cria protocolo novo. Camila/Roberto informam o número no **primeiro balão da saudação**:  
*"Olá Lucas, sou Camila da VIA AIR"* → *"Seu protocolo de atendimento é 2026071500123"* → segue conversa normal.

## 3. Encerramento por inatividade (cron)

Job `pg_cron` a cada 5 min chama `/api/public/hooks/close-inactive-protocols`:
- Busca protocolos `aberto` cujo `last_activity_at < now() - interval '1 hour'`
- Envia mensagem final via WhatsApp:  
  *"Devido à inatividade, estou encerrando o protocolo 2026071500123 por aqui. Se ainda tiver interesse ou qualquer dúvida, é só chamar de novo que a gente continua o atendimento."*
- Marca protocolo `encerrado_inatividade` e limpa `protocolo_ativo_id` da conversa.

## 4. Reabertura inteligente

Quando chega inbound e conversa não tem protocolo ativo mas tem protocolo recente encerrado (< 7 dias):
- Runner passa contexto pra IA: "último protocolo #X, assunto: <assunto_resumo>. Cliente disse: <msg>. Isso é continuação ou assunto novo?"
- IA responde via tool `retomar_protocolo` OU `novo_protocolo`
- Retomar: reativa o protocolo antigo, associa a mensagem, saúda "Oi de novo, retomando nosso protocolo X"
- Novo: cria novo protocolo, informa o número.

## 5. UI — nova aba Protocolos

Nova rota `/chat/protocolos` (item de menu abaixo de "Agente de Chat" na sidebar do /chat).

Lista tabular:
- Número | Cliente | Assunto | Status | Abertura | Encerramento | Estágio final
- Filtros: status, período, busca por número/nome
- Clicar → drawer com histórico completo daquele protocolo (mensagens read-only, ordenadas)
- Botão "Abrir conversa" leva pro inbox no cliente

No **inbox atual**: badge com número do protocolo ativo no header do chat.

## 6. Detalhes técnicos

- Sequence `wa_protocolo_seq` + função `gerar_numero_protocolo()` retorna `YYYYMMDD` + 5 dígitos.
- Server functions: `listProtocolos`, `getProtocoloMessages`, `closeProtocoloManual`.
- Ferramentas IA: `retomar_protocolo(protocolo_id)`, `encerrar_protocolo(motivo)`.
- Todas mensagens (inbound e outbound) atualizam `last_activity_at` do protocolo ativo.
- Mensagem de encerramento é enviada via `send.server.ts` como agente system, não conta como reset de inatividade.

## Fora do escopo (confirmar depois)
- Notificação push/email pro admin quando protocolo é encerrado por inatividade
- Métrica de tempo médio de atendimento por protocolo no dashboard
- Reabrir manualmente um protocolo encerrado pelo painel
