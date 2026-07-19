
# Robô LATAM — modo A/B: Código vs Visão IA

Objetivo: rodar os dois robôs lado a lado dentro do painel de check-in pra ver qual finaliza o cartão mais rápido e com mais confiança.

## O que muda pra você (UI)

Em cada linha de check-in (aba **Check-in** do pedido e página `/admin/checkins`):

- **Dois botões separados** onde hoje só tem "Fazer check-in":
  - `⚙️ Rodar (código)` — robô atual, seletores de HTML
  - `👁 Rodar (Visão IA)` — robô novo, print + Gemini decide onde clicar
- **Badge do modo usado** na linha: `Código` (cinza) ou `Visão IA` (roxo)
- **Tempo de execução** e **custo estimado** (só na Visão) aparecem depois que roda
- Uma nova mini-tabela no topo de `/admin/checkins`: **Comparativo A/B** com contagem de sucessos, falhas e tempo médio de cada modo dos últimos 30 dias

Nada do que já funciona é removido — o robô "código" continua idêntico. Cron automático continua usando o modo código (mais barato).

## Como o robô de Visão IA funciona

Ciclo por passo (Playwright/Browserless + Gemini 3.5 Flash Vision):

```text
[screenshot da tela]
     │
     ▼
[Gemini Vision + prompt do passo atual]
"Aqui está a tela da LATAM. Preciso clicar no campo
 'Código da reserva'. Devolva JSON: {x, y, action, text?}"
     │
     ▼
[page.mouse.move → click → keyboard.type]
     │
     ▼
[aguarda 1s → próximo passo]
```

Passos roteirizados (o mesmo fluxo que o robô código faz hoje):
1. Aceitar cookies (se aparecer)
2. Digitar código de reserva
3. Digitar sobrenome
4. Clicar "Continuar"
5. Escolher trecho elegível (ignora "Voo realizado")
6. Clicar "Fazer check-in"
7. Recusar contato de emergência → Salvar
8. Dispensar aviso "Entendi" (elementos perigosos)
9. Clicar "Baixar PDF" e capturar

Se algum passo não encontrar o elemento em 3 tentativas → falha registrada com screenshot pra debug.

## Backend

**Migração:**
- `flight_checkins.mode` (`'code' | 'vision'`, default `'code'`)
- `flight_checkins.run_duration_ms` (int)
- `flight_checkins.vision_cost_cents` (int, null pro modo código)

**Arquivos novos:**
- `src/lib/checkin/latam-vision.server.ts` — robô novo (screenshot → Gemini → mouse)
- `src/lib/checkin/vision-decide.server.ts` — chamada ao Lovable AI Gateway (Gemini 3.5 Flash Vision), com prompt e parser JSON
- `runCheckinVision` em `checkin.functions.ts` — mirror do `runCheckin`, chama o robô novo e salva `mode='vision'`
- `listCheckinModeStats` — retorna o comparativo pra dashboard

**Nenhum arquivo do robô atual é alterado.** Cron `run-checkins.ts` continua chamando `runCheckin` (modo código).

## Custos e tempo esperados

| Modo | Tempo médio | Custo por check-in | Quebra se LATAM mudar HTML? |
|------|-------------|--------------------|-----------------------------|
| Código | 40-50s (após corte de sleeps) | R$ 0,00 (só Browserless) | Sim |
| Visão IA | 60-90s | ~R$ 0,05 (6-9 chamadas Gemini) | Não |

## Fora de escopo desta fase
- Modo híbrido automático (fallback código → visão)
- Trocar o cron pra usar visão
- Debug UI mostrando cada screenshot que a IA analisou (fica só nos logs por enquanto)

Vou salvar cada tentativa da Visão com um `debug_log` (array de passos + coordenadas retornadas) na coluna `error` quando falhar, pra você conseguir ver o que a IA "enxergou" errado.
