# Instagram + Meta App Review — Plano

Escopo travado pelas suas respostas: DMs, respostas automáticas de comentários, publicação de Story e Feed, abas WhatsApp/Instagram na caixa de entrada, e um MP4 de demonstração gravado no sandbox.

## 1. Fundação (mesma arquitetura do WhatsApp)

**Migração de banco** (`instagram_*`):
- `instagram_accounts`: `ig_user_id`, `page_id`, `username`, `access_token` (criptografado), `token_expires_at`, `webhook_verify_token`.
- `instagram_conversations`: espelho de `whatsapp_conversations` com `ig_user_id`/`ig_thread_id`.
- `instagram_messages`: DM inbound/outbound + reply threading.
- `instagram_comments`: `media_id`, `comment_id`, `parent_id`, `from_username`, `text`, `auto_replied_at`.
- `instagram_media`: registros de posts/stories publicados (`media_type`, `permalink`, `caption`, `published_at`, `scheduled_for`).
- RLS + GRANT em todas.

**Secrets** (via `add_secret` no próximo turno):
`META_APP_ID`, `META_APP_SECRET`, `META_IG_VERIFY_TOKEN`, `META_IG_LONG_LIVED_TOKEN`, `META_IG_BUSINESS_ID`, `META_PAGE_ID`.

## 2. Webhook + envio (`/api/public/instagram/webhook`)

- GET → hub challenge (verify token).
- POST → validação HMAC `x-hub-signature-256`, roteamento:
  - `messages` → `instagram_messages` + reaproveita `dispatch-ai-debounced` (mesmo agente Camila/Roberto/Maria/Giovani, mesma stickiness).
  - `comments` → `instagram_comments` + auto-resposta (regra: IA responde pública curta + DM ao autor com pacote sugerido).
  - `mentions` → mesmo pipeline de comentários.

**Envio** (`src/lib/instagram/send.server.ts`): DM texto, DM com botão de link (pacote), reply a comentário, DM privado ao autor do comentário — reaproveita `splitToBubbles` e adaptive debounce.

**Publicação** (`src/lib/instagram/publish.server.ts`): Story (imagem/vídeo), Feed foto única, carrossel, Reels — fluxo `POST /media` → `POST /media_publish`. Botões no admin de pacotes prontos: "Publicar Story" / "Publicar Feed".

## 3. Caixa de entrada — abas WhatsApp | Instagram

Em `src/routes/chat.inbox.tsx`:
- Duas abas no topo (`WhatsApp` | `Instagram`) trocam a fonte da lista (`channel` param).
- Filtros existentes (Minha caixa, Não lidas, Aguardando humano, Arquivadas, funil) permanecem por baixo, atuando sobre o canal ativo.
- Badge de contador de não lidas em cada aba.
- Bubble adaptada com ícone Instagram + link pra thread; comentários aparecem como card inline.

## 4. Gravação de demo pra Meta App Review

Script Playwright headless + ffmpeg em `scripts/record-meta-demo.mjs`:
1. Login mock no admin.
2. Abre Caixa de entrada → alterna aba pra Instagram → mostra DM chegando (seed).
3. IA sugere resposta → humano aprova → envia.
4. Vai em `/admin/instagram/comentarios` → mostra comentário respondido automaticamente + DM privado enviado.
5. Vai em `/admin/pacotes` → clica "Publicar Story" → mostra preview → confirma → registra `instagram_media`.
6. Mesma coisa para Feed.
7. Legenda sobreposta em cada cena explicando permissão usada (`instagram_business_manage_messages`, `_manage_comments`, `_content_publish`).

Saída: `/mnt/documents/meta-app-review-instagram.mp4` (1280x800, ~90s, MP4 h264 mudo — Meta aceita sem áudio).

## 5. Ordem de execução

1. Migração + tipos + secrets scaffold.
2. Webhook + verify + HMAC.
3. DM inbound/outbound + integração com agent-runner (Camila reaproveitada).
4. Comentários auto-reply.
5. Publicação Story/Feed + UI no admin de pacotes.
6. Abas WhatsApp/Instagram na inbox.
7. Script de gravação + geração do MP4.
8. Página `/admin/instagram/setup` com passo-a-passo (Facebook Page → IG Business → App Meta → tokens → webhook URL) e link do MP4 pra você anexar na revisão.

## Detalhes técnicos

- Endpoints: `graph.facebook.com/v21.0/{ig-user-id}/messages`, `/media`, `/media_publish`, `/{comment-id}/replies`.
- Webhook URL fixa: `https://project--{id}.lovable.app/api/public/instagram/webhook`.
- Token de longa duração renovado por cron (`/api/public/hooks/refresh-ig-token`) a cada 45 dias.
- Rate limit Meta: 200 chamadas/hora/usuário — respeitar via fila reutilizando `broadcast-dispatch` pattern.
- Reuso máximo: `agent-runner`, `dispatch-ai-debounced`, `splitToBubbles`, `camila-prompt`, confirm dialogs, RLS pattern.

Confirma que posso seguir? Se sim, começo pela migração + webhook + abas na inbox (partes que não precisam dos secrets ainda) e no fim gero o MP4 de demonstração.
