
# Broadcast VIA AIR — Canal + Grupos

Área nova no admin (`/admin/disparos`) usada por marketing pra programar postagens no **canal WhatsApp comercial** e em **grupos**, com fila, agendamento, mídia rica, métricas e integração com o inbox atual.

Nada de disparo 1:1 em massa — só canal e grupos, exatamente como você pediu.

---

## 1. Descobrir canais e grupos da instância UazAPI

Rota nova `POST /api/public/hooks/uazapi-sync-destinos` (chamada sob demanda pelo botão "Sincronizar" no admin):

- Chama `POST {UAZAPI_URL}/group/list` → traz todos os grupos que a instância participa (JID, nome, foto, se é admin).
- Chama `POST {UAZAPI_URL}/channel/list` (endpoint de newsletters/canais da UazAPI) → traz canais WhatsApp que a linha comercial gerencia, com JID `@newsletter`.
- Persiste em `wa_broadcast_destinos` com flag `pode_postar` (true só quando somos admin/owner do canal ou grupo).

Sem sincronização manual toda hora: um botãozinho de refresh na tela + sync automático 1x/dia via `pg_cron`.

---

## 2. Novas tabelas

```text
wa_broadcast_destinos       um registro por canal/grupo detectado
  jid, tipo (channel|group), nome, foto_url, participantes,
  is_admin, pode_postar, tags[], ativo, ultima_sync

wa_broadcast_campanhas      a campanha em si
  nome, criado_por, status (rascunho|agendada|enviando|concluida|falhou|cancelada),
  scheduled_at (timestamptz), sent_at, aprovada_por,
  destino_ids[] (fk pra wa_broadcast_destinos),
  observacoes_marketing

wa_broadcast_mensagens      blocos da campanha (permite sequência)
  campanha_id, ordem,
  tipo (text|image|video|document|buttons),
  texto, midia_url, midia_filename, midia_caption,
  botoes jsonb  [{ id, label, tipo (reply|url), valor }]

wa_broadcast_envios         resultado por destino x mensagem
  campanha_id, destino_id, mensagem_id,
  status (pendente|enviado|entregue|lido|falhou),
  wa_message_id, error, sent_at, delivered_at, read_at
```

Tudo com RLS por `has_role('admin')` **ou** `has_role('marketing')` (papel novo).

---

## 3. Papel "marketing"

- Adiciona valor `marketing` no enum `app_role`.
- Menu `/admin/disparos` só aparece pra admin + marketing.
- Marketing pode: criar rascunho, agendar, ver métricas.
- Só admin pode: aprovar campanha, criar destinos manualmente, alterar janela de envio.

---

## 4. UI `/admin/disparos`

Três abas:

**a) Campanhas** — lista com status colorido, próximas agendadas no topo, botão "Nova campanha".

**b) Nova campanha (wizard 4 passos)**
1. Nome interno + selecionar destinos (checkbox de canais/grupos, agrupados por tipo, com filtro por tag e busca).
2. Compor mensagens (drag-and-drop pra ordenar blocos; cada bloco = texto OU mídia + legenda OU botões). Anexar pacote pronto abre um seletor que gera automaticamente 1 bloco imagem (folder já existente) + 1 bloco texto (curadoria).
3. Agendar: `datetime-local`. Validação: só permite horários dentro da janela **09h-21h America/Sao_Paulo** (mesma regra do comercial). Também aceita "Enviar agora".
4. Revisão + botão "Salvar rascunho" ou "Enviar pra aprovação".

**c) Destinos** — lista de canais/grupos sincronizados, gerencia tags, botão "Sincronizar agora".

Preview lateral em bolha WhatsApp escura (reaproveita `WhatsAppBubble`) mostrando exatamente como vai aparecer.

---

## 5. Motor de envio

Cron `wa-broadcast-dispatcher` (a cada 1min) chama `POST /api/public/hooks/broadcast-dispatch`:

1. Pega campanhas com `status='agendada'` e `scheduled_at <= now()`.
2. Marca `status='enviando'`.
3. Pra cada `destino × mensagem` na ordem: chama UazAPI `send/text` ou `send/media` passando o JID do canal/grupo, com **throttle de 3s entre destinos** (evita ban).
4. Salva `wa_message_id` retornado em `wa_broadcast_envios`.
5. Ao terminar, `status='concluida'` (ou `'falhou'` se todos falharam).

Botão "Cancelar" só funciona enquanto `status ∈ (agendada, rascunho)`.

---

## 6. Métricas (aba "Métricas" dentro da campanha)

Cards: enviados / entregues / lidos / falhas / respostas geradas.

Timeline por destino com tempo médio até entrega. Ranking dos destinos que mais engajaram.

Alimentado por:
- webhook UazAPI já existente (`uazapi-webhook.server.ts`) — adiciona um handler pra eventos `message.ack` (delivered/read) casando pelo `wa_message_id` gravado.
- respostas: quando webhook detecta mensagem inbound de um número que estava em algum grupo destino recente, incrementa `respostas_geradas` da campanha. Canais WhatsApp não têm resposta direta — só reações.

---

## 7. Integração com o inbox

Mensagens de grupo já entram no fluxo normal do webhook — vira uma conversa `wa_conversations` marcada como `is_group=true` (coluna nova). Inbox ganha filtro "Grupos" pra separar do 1:1. Camila/Roberto **não respondem grupos automaticamente**; ficam sempre em modo humano.

Canais são unidirecionais — não geram conversa no inbox.

---

## 8. Regras de conteúdo (IA validadora leve)

Antes de agendar, roda uma checagem local (sem chamar IA externa):
- Bloqueia se aparecer "assessoria" ou "assessoria completa" (regra permanente sua).
- Alerta se o texto ultrapassar 1024 chars num único bloco (limite de caption).
- Alerta se agendou fora da janela 09h-21h.

---

## Detalhes técnicos

- Migração única cria: enum `marketing`, tabelas acima, índices em `(campanha_id, status)` e `(scheduled_at) WHERE status='agendada'`, RLS por role, trigger de `updated_at`.
- Cron via `pg_cron` + `pg_net` batendo em `/api/public/hooks/broadcast-dispatch` (padrão que já usamos em `dispatch-ai-debounced` e `close-inactive-protocols`).
- Sync destinos: cron diário 05h + botão manual.
- Server functions em `src/lib/broadcast/*.functions.ts` protegidas com `requireSupabaseAuth` + checagem de role.
- UazAPI: reaproveita `UAZAPI_URL`/`UAZAPI_TOKEN`/`UAZAPI_INSTANCE` já configurados. Endpoints usados: `/group/list`, `/channel/list`, `/send/text`, `/send/media`, `/send/buttons`.
- Upload de mídia usa bucket novo `broadcast-media` (privado, URL assinada de 7 dias pra envio).
- Componentes reaproveitados: `WhatsAppBubble`, `AlertDialog`, `confirm`, `PromptInput` (composer), estética glass do inbox.

---

## Fora do escopo (podemos fazer depois)

- Disparo 1:1 em massa pra lista de contatos.
- IA reescrevendo copy / escolha de melhor horário por contato / A/B test.
- Fluxo de aprovação multi-etapas (por ora: marketing cria, admin dispara com 1 clique).
