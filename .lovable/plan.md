
## Objetivo

Transformar o Treinador de Check-in num "navegador ao vivo": abre a LATAM uma única vez, e cada ação (clicar / digitar / scroll) roda **na hora** na mesma aba, sem reabrir a página. O print atualiza depois de cada ação, como se você tivesse um mini-navegador dentro do painel.

## Como vai funcionar (fluxo novo)

1. Botão **"Abrir sessão"** — abre a LATAM no Browserless com proxy/stealth, guarda o endpoint da sessão e devolve o primeiro print.
2. Você escreve a pergunta → **Perguntar pra IA** → aparecem os alvos (igual hoje).
3. Você clica em **Clicar** / **Digitar PNR** / **Digitar sobrenome** no alvo:
   - o passo é adicionado à lista de "Passos aprendidos"
   - **e já executa na sessão viva** — a página avança de verdade
   - retorna o novo print automaticamente
4. Botões auxiliares na mesma sessão: **Print agora**, **Voltar** (undo do último passo), **Fechar sessão**.
5. No fim, botão **"Salvar script"** grava a lista de passos como script reutilizável do autopilot.

O botão antigo "Executar & Print" vira **"Repetir do zero"** (opcional, pra validar que o script inteiro funciona do começo).

## Como manter a sessão viva

Browserless retorna um `browserWSEndpoint` (reconnect URL) quando a sessão é aberta com stealth. Vou:

- Guardar `{ sessionId, wsEndpoint, expiresAt }` num Map em memória no server (chaveado pelo `userId` admin — 1 sessão por admin por vez).
- Cada ação nova reconecta no mesmo `wsEndpoint` via `puppeteer.connect()`, roda o passo, tira print, e devolve. Puppeteer desconecta ao fim da chamada, mas a sessão remota do Browserless continua viva.
- TTL de 10 min de inatividade. Se expirar, o front avisa "sessão encerrada, abra novamente".

## Arquivos

- `src/lib/checkin/training-session.server.ts` — novo. Map em memória `openSession()`, `getSession()`, `closeSession()`, `runStepOnSession()`.
- `src/lib/checkin/training.functions.ts` — adicionar 4 server fns: `openTrainingSession`, `runStepLive`, `screenshotSession`, `closeTrainingSession`. Manter as antigas (`runTrainingScript`, `askVisionAboutScreenshot`) intactas.
- `src/routes/admin.checkin-treino.tsx` — trocar o botão principal por **Abrir sessão** + estado `sessionId`. Ao clicar em Clicar/Digitar, chama `runStepLive` em vez de só acumular passo. Adicionar botões Voltar / Fechar / Repetir do zero.

## Detalhes técnicos

- **Persistência real**: Map em memória do worker. Um worker Cloudflare pode reciclar entre requests, então o `wsEndpoint` também vai pra `sessionStorage` do navegador como fallback — se o Map perdeu, o front reenvia o endpoint e o server reconecta.
- **Concorrência**: 1 sessão ativa por admin. Abrir uma nova fecha a anterior.
- **Erro de sessão morta**: se `puppeteer.connect()` falhar (Browserless matou por timeout), server responde `SESSION_EXPIRED` e o front mostra "reabrir sessão".
- **Print**: JPEG 60 (já tá assim), viewport 1280×900. Retornado como base64 pro `<img>`.
- **Undo (Voltar)**: navegador não tem `undo` universal — o "Voltar" faz `page.goBack()` + print. Suficiente pra corrigir clique errado na maioria dos casos.

## Fora do escopo

- Não vou mexer no `latam-autopilot.server.ts` (o executor de produção continua igual).
- Não vou mudar a estrutura do JSON dos passos salvos — os scripts gravados continuam compatíveis com o autopilot atual.
