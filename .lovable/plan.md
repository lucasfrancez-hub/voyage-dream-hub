
# Camila IA — atendimento WhatsApp com handoff humano

Objetivo: reduzir ao máximo o tempo de atendimento humano. Camila resolve tudo que dá com dados do admin; o que exige criatividade/negociação (cotação nova, voo alterado, reclamação) ela coleta briefing e joga na fila do `/chat` interno pros vendedores.

## Arquitetura

```text
WhatsApp Cloud API
        │
        ▼
/api/public/whatsapp-webhook  ──►  persiste mensagem em `wa_messages`
                                   ├─ cria/atualiza `wa_conversations`
                                   └─ se conversa NÃO está com humano:
                                          dispara runCamila(conversationId)

runCamila (server fn, streamText + tools)
   ├─ identifica cliente (people + orders pelo phone)
   ├─ carrega histórico da conversa
   ├─ system prompt + tools
   ├─ executa loop AI SDK (stepCountIs(50))
   └─ envia respostas via Cloud API → grava no DB

/chat (inbox interno)
   ├─ lista de conversas com filtros: [Todas] [Camila] [Aguardando humano] [Minhas]
   ├─ conversa selecionada com mensagens em tempo real (Supabase realtime)
   ├─ botão "Assumir" → seta assigned_to = user, mode = 'human'
   └─ botão "Devolver pra Camila" → mode = 'ai'
```

## Fases

### Fase 1 — Fundação de dados e webhook (backend)
- Migration: `wa_conversations`, `wa_messages`, `wa_handoff_events`.
- Webhook: além de validar assinatura, salva mensagem, resolve conversa por `wa_phone`, e enfileira `runCamila` só se `mode = 'ai'`.
- Server fn `sendWhatsAppMessage(to, text)` usando `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.
- Identificação: match do telefone contra `people.phone` e `orders` do CRM.

### Fase 2 — Camila com tools (IA)
Server fn `runCamila` usando AI SDK + Lovable AI Gateway (`google/gemini-3.5-flash`, bom em tool-calling e barato). Tools:

- `consultar_pedido({ numero | cpf })` → status, itens, pagamentos, voos, hotel
- `consultar_voo({ pedido_numero, direcao? })` → datas, horários, localizador, cia
- `gerar_2via_voucher({ pedido_numero })` → gera PDF e devolve URL assinada
- `reenviar_link_pagamento({ pedido_numero })` → cria link novo e envia
- `buscar_pacotes({ destino?, mes?, pax?, orcamento? })` → lista pacotes do admin
- `pedir_confirmacao_identidade({ motivo })` → força cliente a confirmar CPF antes de acessar dados sensíveis
- `escalar_para_humano({ motivo, briefing })` → seta `mode='human'`, `priority`, adiciona tag; Camila para de responder

**Regra de segurança da identificação (implementada no system prompt + guard nas tools):**
- Consultas por número de WhatsApp reconhecido: liberadas pra info não-sensível (nome, datas de voo).
- Dados financeiros, voucher, cartão, alteração: exige confirmação de CPF ou data de nascimento na sessão. Se ainda não confirmou, Camila chama `pedir_confirmacao_identidade`.

### Fase 3 — Inbox /chat interno
Reformar `/chat` existente com AI Elements:
- `InboxList` com abas e badges de não-lidas
- `CamilaChat` renomeado pra `ConversationView` — mostra mensagens da Camila E do humano, com avatar diferente
- `ContactPanel` (lateral direita): dados do cliente, últimos pedidos, botões rápidos (abrir pedido no admin, gerar voucher)
- Botões no header da conversa: **Assumir** / **Devolver pra Camila** / **Marcar resolvido**
- Realtime via Supabase channel em `wa_messages`

### Fase 4 — Lembretes automáticos (cron)
`pg_cron` diário chama `/api/public/hooks/enviar-lembretes`:
- Voos em 24h → template `lembrete_embarque`
- Boletos vencendo em 2 dias → template `boleto_vencendo`
- Pagamentos pendentes há 3+ dias → follow-up

## Detalhes técnicos

**Novas tabelas** (migration Fase 1):
```sql
wa_conversations (
  id uuid pk,
  wa_phone text unique,
  person_id uuid null references people(id),
  mode text check (mode in ('ai','human','resolved')) default 'ai',
  assigned_to uuid null references auth.users(id),
  priority text default 'normal',
  identity_verified_at timestamptz,
  last_message_at timestamptz,
  created_at, updated_at
)

wa_messages (
  id uuid pk,
  conversation_id uuid fk,
  direction text check (direction in ('inbound','outbound')),
  sender text check (sender in ('customer','camila','human','system')),
  content text,
  wa_message_id text,   -- id da Meta pra dedupe
  tool_calls jsonb null,-- se foi resposta de tool
  created_at
)

wa_handoff_events (
  id uuid pk, conversation_id uuid, from_mode text, to_mode text,
  reason text, briefing text, actor uuid null, created_at
)
```
RLS: só usuários com role `admin` ou `atendente` leem/escrevem.

**Stack IA**: AI SDK (`streamText` no chat interno pra ver em tempo real, `generateText` no webhook porque não precisa streaming), Lovable AI Gateway com helper existente em `src/lib/ai-gateway.server.ts`. System prompt em `src/lib/chat/camila-prompt.ts` (já existe, será atualizado).

**Fora do escopo desta primeira entrega:**
- Roberto (pós-venda) — fica pra depois
- Envio proativo de templates HSM fora dos lembretes (marketing em massa)
- Multi-idioma
- Voz/áudio (só texto por ora)

## Ordem de entrega sugerida

Entrego **Fase 1 + 2 juntas** (Camila já responde no WhatsApp usando dados do admin), você testa com seu próprio número, e depois vamos pra Fase 3 (inbox) e Fase 4 (cron de lembretes).

Se aprovar, começo pela migration e webhook.
