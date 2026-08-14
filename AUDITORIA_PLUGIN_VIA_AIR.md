# AUDITORIA TÉCNICA — PLUGIN "VIA AIR ORÇAMENTOS"

Data: 14/08/2026 · Versão auditada da extensão: **1.0.0** (publicada em `public/via-air-orcamentos.zip`, idêntica ao fonte em `extension-orcamentos/`)
Versão de diagnóstico gerada nesta auditoria: **1.0.1** (mesma lógica + logs, ver §10)

---

## 1. Arquitetura atual

```
Infotravel (aba do navegador)
 ├─ page-hook.js      (world: MAIN, document_start)  → intercepta window.open / clique em <a> / history.pushState
 │     └─ window.postMessage({__viaair_quote, url, trigger})
 ├─ content.js        (world: ISOLATED, document_idle) → botão flutuante + MutationObserver em <a href> + listener do postMessage
 │     └─ chrome.runtime.sendMessage({type:"viaair-quotes-import", url})
 └─ background.js     (service worker MV3) → fila/retry (chrome.alarms 1min) + fetch autenticado
       └─ POST https://pedidos.viaair.tur.br/api/public/v1/quote-imports   (Bearer <token da extensão>)
             └─ src/routes/api/public/v1/quote-imports.ts
                   └─ src/lib/quotes/import.server.ts  → src/lib/quotes/infotravel-parser.server.ts
                         └─ tabelas: quote_imports, quotes, quote_options, extension_tokens
```

Arquivos por etapa:

| Etapa | Arquivo |
|---|---|
| Permissões / matches | `extension-orcamentos/manifest.json` |
| Detecção de ação (MAIN) | `extension-orcamentos/page-hook.js` |
| Detecção Infotravel, botão, captura de URL | `extension-orcamentos/content.js` |
| Autenticação, fila, chamada à API | `extension-orcamentos/background.js` |
| Configuração do token | `extension-orcamentos/popup.html` / `popup.js` |
| Endpoint público | `src/routes/api/public/v1/quote-imports.ts` |
| Pipeline de importação | `src/lib/quotes/import.server.ts` |
| Parser Infotravel | `src/lib/quotes/infotravel-parser.server.ts` |
| Geração do token | `src/lib/quotes/quotes.functions.ts` (`gerarTokenExtensao`) |
| Portal / conversão | `src/routes/admin.orcamentos.index.tsx` |
| Schema | `supabase/migrations/20260814200504_*.sql` |

## 2. Como a extensão detecta a Infotravel

- `matches` e `host_permissions`: **apenas `*://*.infotravel.com.br/*`**.
- `content.js` ainda revalida: encerra se `location.hostname` não terminar em `infotravel.com.br`.
- Não há nenhum log de carregamento na versão 1.0.0 → era impossível distinguir "não carregou" de "carregou e não detectou".

## 3. Como detecta o "Enviar Orçamento Web"

Estratégia implementada (nenhuma outra):

| Mecanismo | Implementado? |
|---|---|
| Hook de `window.open` | Sim (`page-hook.js`) |
| Clique em `<a href>` | Sim (capture phase) |
| `history.pushState/replaceState` | Sim |
| `MutationObserver` sobre `<a href>` inseridos | Sim (`content.js`) |
| Abertura do WhatsApp (`wa.me`, `api.whatsapp.com`) | Sim, apenas via `window.open`/`<a>` |
| **Interceptação de rede (`fetch`/`XHR`)** | **Não** |
| **`navigator.clipboard.writeText` (botão "copiar link")** | **Não** |
| **Leitura de `<input>/<textarea>` com o link do orçamento** | **Não** |
| **Modal/iframe que exibe o link como texto (sem `<a>`)** | **Não** |
| **Detecção dentro de iframes** | **Não** (`content.js` roda com `all_frames: false`) |

Só há captura se o link do orçamento aparecer como **âncora clicável, `window.open` ou navegação**. Se a Infotravel gera o Orçamento Web por chamada assíncrona e apresenta o link em campo de texto/modal com botão "copiar", **o listener atual nunca dispara** (item 5 do briefing: confirmado como risco real e não coberto).

## 4. Como captura a URL

`content.js → extractQuoteUrl()` exige que a URL case com:

```
/https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*(orcamento|proposta|quote)[^\s"'<>]*/i
```

Ou seja: **o path precisa conter literalmente `orcamento`, `proposta` ou `quote`**. O backend (`normalizeSourceUrl`) é bem mais tolerante (aceita qualquer URL do domínio). **Divergência**: se o link real for, por exemplo, `.../checkout/share/<id>` ou `.../b/<hash>`, a extensão descarta a URL mesmo tendo detectado a ação (cenário C).

## 5. Como envia para a Via Air / endpoint

- **Endpoint:** `POST https://pedidos.viaair.tur.br/api/public/v1/quote-imports`
- **Headers:** `content-type: application/json`, `authorization: Bearer <token>`
- **Payload:** `{ source:"INFOTRAVEL", sourceUrl, detectedAt, browserExtension:true }`
- **Resposta OK:** `{ importId, status: READY|PROCESSING, duplicate, quoteId, quote }`
- **Erros:** `401 {"error":"unauthorized"}`, `400 invalid_body`, `422 invalid_url`
- **CORS:** `Access-Control-Allow-Origin: *`, `OPTIONS` 204 — correto para MV3.
- **Persistência:** `quote_imports` (fingerprint = sha256 de `source|host+path`), `quotes`, `quote_options`.

## 6. Autenticação

- Token opaco de 32 bytes gerado em **Orçamentos → Conectar plugin** (`gerarTokenExtensao`), guardado **hasheado (SHA-256)** em `public.extension_tokens`.
- Guardado na extensão em `chrome.storage.local.viaairToken` (persistente, sobrevive ao descarte do service worker).
- **Não depende do portal Via Air aberto** — conforme o briefing. Sem expiração, sem refresh; revogação por `revoked_at`.
- 401/403 → status `UNAUTHORIZED` (não vai para fila de retry). Correto.

## 7. Testes efetivamente executados

| Teste | Resultado |
|---|---|
| `POST` sem token válido (produção) | **401** `{"error":"unauthorized"}` — rota pública ativa, sem bloqueio de auth do site |
| `OPTIONS`/CORS | Headers CORS presentes e corretos |
| `POST` com token válido (token temporário de auditoria) | **200 READY** — criou `quote_imports` + `quote #2` |
| Banco: `extension_tokens` | 2 tokens reais existentes, **`last_used_at = NULL` nos dois** |
| Banco: `quote_imports` | **0 registros** antes do teste |
| ZIP publicado × fonte | md5 idênticos — o usuário está usando o código atual |
| Sintaxe dos 3 scripts | OK |

## 8. O que funciona × o que não funciona

**Funciona:** geração/hash/validação de token; endpoint público; CORS; pipeline de importação; criação de orçamento e opções; fila/retry por `chrome.alarms` (compatível com MV3 — listeners registrados no topo do SW, sem estado em memória).

**Não funciona / não comprovado:** nenhuma requisição da extensão jamais chegou à API (`last_used_at` nulo nos dois tokens e `quote_imports` vazio). O fluxo **para antes do envio**.

## 9. Hipótese de causa raiz (ordem de probabilidade)

1. **(B/C) A ação de "Enviar Orçamento Web" não passa por `<a>` nem por `window.open`.** É o caminho mais provável: SPA que gera o link por requisição assíncrona e o exibe em modal/campo com "copiar". Nenhum hook de `fetch`/XHR/clipboard/input foi implementado → o listener escuta um evento que não acontece.
2. **(A) A extensão pode nem estar carregando**: `matches` cobre só `*.infotravel.com.br`. Se o sistema usado for whitelabel/outro domínio ou subdomínio fora desse TLD, o content script nunca roda — e, sem logs, isso era indistinguível.
3. **(C) Regex exigindo `orcamento|proposta|quote` no path**, mais restritiva que o backend.
4. **(iframe)** `all_frames: false` no content script — se o botão vive num iframe, o clique é observado só pelo `page-hook` (que roda em todos os frames) e o `postMessage` não chega ao content script do topo (`postMessage(..., "*")` do iframe fica no próprio frame).
5. Token nunca colado no popup (menos provável, mas indistinguível sem log — agora aparece "token ausente").

## 10. Correções aplicadas nesta auditoria (apenas diagnóstico, lógica preservada)

| Problema | Arquivo | Alteração | Motivo |
|---|---|---|---|
| Impossível saber se carregou | `page-hook.js`, `content.js`, `background.js` | logs `[Via Air Orçamentos]` em: SW iniciado, content script carregado, Infotravel detectada, botão injetado, ação detectada, URL detectada, enviando, HTTP status, importação criada | itens 6 e 12 do briefing |
| Ação detectada sem URL válida era silenciosa | `content.js` | `console.warn` com o trecho analisado e o gatilho | separar cenário C de B |
| `catch` mascarando erros | `page-hook.js`, `background.js` | `console.error` com message + stack; `logEvent` grava `stack` e `httpStatus` | item 13 |
| Erro genérico para tudo | `background.js` | resposta passa a conter `stage` (`AUTH`/`API`/`NETWORK`), `httpStatus`, `detail` | item 6 |
| 403 caía em retry infinito | `background.js` | 403 tratado como `UNAUTHORIZED` | evita fila inútil |
| Botão podia sumir em rerender | `content.js` | `MutationObserver` reinjeta o host se for removido | item 11 |
| Versão | `manifest.json` | 1.0.0 → **1.0.1** | identificar o build de diagnóstico |

**Nada da lógica de detecção/captura/envio foi substituído** — as lacunas de §3 e §9 foram documentadas, não "corrigidas às cegas".

## 11. Correções recomendadas (após a validação externa)

1. **Interceptar rede no MAIN world**: hook em `fetch` e `XMLHttpRequest` procurando na *resposta* qualquer URL de orçamento — cobre SPA/assíncrono.
2. **Hook de `navigator.clipboard.writeText`** e varredura de `input/textarea[value*=infotravel]` — cobre o botão "copiar link".
3. **Afrouxar a regex** do content script para aceitar qualquer URL `infotravel.com.br` (deixar a validação fina para o backend, que já é tolerante).
4. **`all_frames: true`** também no `content.js`, ou repassar o `postMessage` do iframe para o topo (`window.top.postMessage`).
5. **Confirmar o domínio real** da Infotravel usada pela VIA AIR e incluí-lo em `matches`/`host_permissions` (ou usar `optional_host_permissions` + campo no popup).
6. Backend: `processQuoteImport` criou um orçamento a partir de uma página **404** (título "404"). Deve marcar `IMPORT_ERROR` quando o fetch não retorna 2xx ou não encontra produtos.
7. Popup: exibir os últimos eventos de `viaairLogs` para diagnóstico sem abrir DevTools.

## 12. Como reproduzir o diagnóstico

1. Instalar a v1.0.1 (`chrome://extensions` → Modo desenvolvedor → Carregar sem compactação).
2. Colar o token (Pedidos → Orçamentos → Conectar plugin) no popup.
3. Abrir a Infotravel, **F12 → Console** e filtrar por `Via Air Orçamentos`.
4. Gerar o Orçamento Web e ler a sequência de logs:
   - nenhum log → **A** (não carregou: domínio fora de `matches`);
   - "Content script carregado" mas nada ao gerar → **B** (evento nunca ocorre);
   - "ação detectada, mas nenhuma URL…" → **C** (regex/formato da URL);
   - "Enviando para Via Air…" sem "API respondeu" → **D** (rede/host permission);
   - "API respondeu HTTP 401/4xx" → **E**;
   - "Importação criada" sem orçamento no portal → **F** (parser).
5. Service worker: `chrome://extensions` → "service worker" → Console (exceções do SW).

## 13. Segredos

Nenhum token, chave ou `.env` real está incluído no ZIP. Ver `.env.example`. O token de auditoria criado para o teste do endpoint foi **revogado** ao fim da auditoria.
