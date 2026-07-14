
# Plataforma /chat — CRM WhatsApp estilo ChatFunnel (tema claro VIA AIR)

Reestrutura completa do `/chat` atual pra virar uma plataforma modular estilo ChatFunnel, tema claro (cinza-claro/branco), com balões de conversa reais, sidebar fixa, header, e todos os módulos em rotas próprias. Mantém toda a integração Camila + WhatsApp já feita (Fases 1 e 2), só adiciona o **Roberto** (turno noturno) e a lógica de horário.

## Identidade visual

- **Base**: tema claro, fundo `#F5F7FA` (cinza muito claro), cards brancos `#FFFFFF`, bordas sutis `#E5E7EB`.
- **Acentos**: laranja VIA AIR `#F26B1F` só em botões primários, indicadores ativos e badges.
- **Balões WhatsApp**: recebido = branco com sombra suave; enviado = verde-claro `#DCF8C6` (padrão WhatsApp) OU laranja-claro pra manter marca (escolho **verde-claro** pra parecer WhatsApp de verdade, como o ChatFunnel).
- **Fundo da conversa**: bege claro `#EFEAE2` com padrão sutil (igual WhatsApp Web).
- **Tipografia**: mantém a fonte atual do projeto; sem serif.

## Arquitetura de rotas

```
/chat                    → redireciona pra /chat/inbox
/chat/dashboard          → métricas e gráficos
/chat/inbox              → 3 colunas (pastas | conversas | contato)
/chat/inbox/:conversaId  → mesma tela, conversa aberta
/chat/contatos           → tabela de contatos
/chat/crm                → kanban de pipeline
/chat/agentes            → Camila + Roberto (configuração)
/chat/fluxos             → placeholder "em breve"
/chat/broadcast          → placeholder "em breve"
/chat/agenda             → placeholder "em breve"
/chat/config             → WhatsApp, horários, usuários, mensagens automáticas
```

Layout: `src/routes/chat.tsx` vira layout com **Sidebar fixa esquerda** + **Header topo** + `<Outlet />`. Cada rota-filha é arquivo próprio.

## Módulos nesta entrega (Fase A)

Foco no que gera valor imediato e usa dados que já temos (`wa_conversations`, `wa_messages`, `people`, `orders`). Fluxos/Broadcast/Agenda ficam com página-shell "em construção" pra estrutura já existir.

### 1. Layout base (`chat.tsx`)
- Sidebar 240px, colapsável pra 64px (ícones).
- Menu: Dashboard, Caixa de Entrada, Contatos, Agente IA, Fluxos, Broadcast, CRM, Agenda, Pastas, Configurações.
- Header: busca global, notificações, avatar do usuário logado, indicador "Camila online" / "Roberto online" conforme horário.

### 2. Dashboard (`chat.dashboard.tsx`)
Cards de métricas (queries em `wa_conversations` e `wa_messages`):
- Total de contatos, conversas abertas/em andamento/encerradas
- Atendimentos pela IA vs humanos (últimos 30 dias)
- Tempo médio de resposta (mensagens outbound - inbound anterior)
- Gráfico diário (últimos 14 dias) com Recharts
- Últimas atividades (feed de `wa_handoff_events`)

### 3. Caixa de Entrada (`chat.inbox.tsx` + `chat.inbox.$id.tsx`)
**3 colunas** de verdade:

**Coluna 1 — Pastas + lista**
- Filtros: Minha caixa / Atribuídas / Não atribuídas / Todas / IA (Camila/Roberto) / Arquivadas
- Busca por nome/telefone
- Cada item: avatar, nome, prévia da última mensagem, hora, badge de não-lidas, ícone da IA que está atendendo

**Coluna 2 — Conversa**
- Fundo bege claro WhatsApp
- Balões separados por remetente (customer / camila / roberto / human / system)
- Balões com hora, check duplo, agrupamento por dia
- Suporte a texto, imagem, documento, áudio (renderização básica)
- Aviso amarelo no topo se última mensagem inbound > 24h ("janela de atendimento encerrada — use template")
- Composer com: textarea, emoji picker (nativo), anexo, botão enviar, botão "🤖 Assumir da IA" / "Devolver pra IA", botão arquivar
- Notas internas (aba separada, salvo em `wa_messages` com `sender=system` + flag)

**Coluna 3 — Detalhes do contato**
- Nome, telefone, e-mail, tags
- Pedidos vinculados (query em `orders` via `person_id`)
- Timeline de eventos
- Toggle "Permitir IA" (muda `mode` da conversa)
- Botão editar → abre modal `admin.pessoas.$id`

### 4. Contatos (`chat.contatos.tsx`)
Tabela usando `people` já existente:
- Colunas: nome, telefone, e-mail, tags, último atendimento (via `wa_conversations.last_message_at`), atendente
- Busca, filtro por tag, exportar CSV
- Reaproveita muito de `admin.pessoas.tsx`

### 5. CRM Pipeline (`chat.crm.tsx`)
Kanban drag-and-drop (`@dnd-kit/core` — já instalado se disponível, senão adiciono):
- Colunas: Novo Lead, Qualificação, Orçamento, Orçamento Enviado, Pagamento, Contrato, Viagem Confirmada, Pós-venda, Perdido
- Cards ligados a `orders` (mapeando `status` do pedido pra coluna) + conversas sem pedido ainda ficam em "Novo Lead"
- Card mostra: nome, telefone, valor, destino, atendente, data
- Arrastar entre colunas atualiza o status

### 6. Agente IA (`chat.agentes.tsx`)
Duas abas: **Camila** e **Roberto**.
Cada uma edita:
- Nome, avatar, tom de voz, horário de atendimento (Camila 08–18, Roberto 18–08)
- Prompt do sistema (textarea grande, com o `CAMILA_SYSTEM_PROMPT` atual pré-carregado)
- Palavras/temas proibidos
- Ferramentas ativas (checkboxes das tools do `tools.server.ts`)
- Botão Ativar/Desativar
- Teste ao vivo (chat interno igual o `CamilaChat.tsx` atual)

Persistência: nova tabela `ai_agents` (id, nome, prompt, horario_inicio, horario_fim, ativo, tools_habilitadas jsonb).

### 7. Configurações (`chat.config.tsx`)
Abas: WhatsApp Cloud API (mostra status dos secrets), Horários de atendimento, Usuários & permissões, Mensagens automáticas (fora de horário, boas-vindas, ausência).

### 8. Fluxos / Broadcast / Agenda / Pastas
Página com placeholder profissional "🚧 Em breve — próxima fase" pra rota existir e sidebar não ter link morto.

## Roberto + lógica de horário

- Nova tabela `ai_agents` com 2 registros: `camila` (08:00–18:00) e `roberto` (18:00–08:00), fuso America/Sao_Paulo.
- `camila-runner.server.ts` vira `agent-runner.server.ts`:
  1. Ao receber mensagem, calcula horário atual em SP.
  2. Escolhe agente cujo horário cobre o momento.
  3. Se **fora de qualquer horário** (não deve acontecer, pois cobrem 24h), envia mensagem padrão de ausência.
  4. Se **ambos desativados manualmente**: envia "Nossa equipe está fora do horário. Retornaremos no próximo horário útil."
- Prompt do Roberto: focado em suporte/emergência (voo alterado, cancelamento, 2ª via voucher urgente). Camila: pré-venda, cotação, dúvidas comerciais.

## Backend — migrations necessárias

1. **`ai_agents`**: id, slug (unique), nome, avatar_url, system_prompt, horario_inicio (time), horario_fim (time), timezone, ativo (bool), tools_habilitadas (jsonb), tom_voz, temas_proibidos (text[]), created_at, updated_at.
2. **`wa_conversations`**: adicionar coluna `agent_slug` (text) pra saber qual IA atendeu por último.
3. Seed dos dois agentes (Camila + Roberto).
4. GRANTs + RLS: admin gerencia; atendente lê.

## Detalhes técnicos

- **Estado da UI**: TanStack Query pra listas, Supabase realtime pra novas mensagens na inbox.
- **Balões**: componente `<WhatsAppBubble side="in|out" sender={...} timestamp={...} status="sent|delivered|read" />`.
- **Emoji**: `emoji-picker-element` (leve, lazy-loaded) ou fallback `<input>` normal (SO fornece).
- **Drag-and-drop Kanban**: `@dnd-kit/core` + `@dnd-kit/sortable`.
- **Gráficos Dashboard**: `recharts` (já usado no projeto).
- Sidebar usa componentes shadcn `Sidebar` do projeto.

## Ordem de execução (nesta entrega)

1. Migration `ai_agents` + coluna `agent_slug` + seed.
2. Refatorar `chat.tsx` como layout com sidebar+header (tema claro).
3. Criar `chat.dashboard.tsx`, `chat.inbox.tsx`, `chat.contatos.tsx`, `chat.crm.tsx`, `chat.agentes.tsx`, `chat.config.tsx` + placeholders (fluxos/broadcast/agenda).
4. Componentes: `Sidebar`, `Header`, `WhatsAppBubble`, `ConversationView` novo (light + balões), `ContactPanel` atualizado, `KanbanBoard`.
5. `agent-runner.server.ts` com lógica de horário + Roberto.
6. Server functions: `listConversations`, `listContacts`, `getDashboardMetrics`, `updateOrderStatus` (pro kanban), `upsertAgent`.
7. Realtime na inbox.

## Fora do escopo desta entrega

- Fluxos visuais (drag-drop de nós) — placeholder
- Broadcast (envio em massa + templates aprovados Meta) — placeholder
- Agenda com Google Calendar — placeholder
- Áudio gravável no composer (mostra recebidos, não grava novos ainda)
- Multi-tenant / departamentos

Confirma que sigo por aí? Posso ajustar qualquer módulo (ex.: incluir Fluxos já nessa leva, ou trocar cor dos balões pra laranja em vez de verde).
