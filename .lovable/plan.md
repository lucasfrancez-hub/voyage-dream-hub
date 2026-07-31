## Importador Automático de Catálogo — Infotravel

O vídeo mostra o portal Infotravel (`/infotravel/admin/main.xhtml`, JSF/PrimeFaces) na aba **Serviços**, com campos Destino / Ida / Volta / Passageiros. É uma aplicação de sessão autenticada — a importação vai rodar **dentro do navegador do usuário logado**, via extensão Via Air (já existe, `extension/`), e enviar os dados para o banco da Via Air.

### Arquitetura

```text
Chrome (você logado no Infotravel)
   │  extensão Via Air  →  content script "infotravel-catalog.js"
   │     1. intercepta chamadas XHR/JSON da busca (modo rápido)
   │     2. fallback DOM: preenche datas, pesquisa, pagina, abre detalhes
   ▼
POST /api/public/catalog-import  (token do usuário)
   ▼
Banco Via Air: operadoras, categorias, destinos, produtos,
               imagens, disponibilidades, tarifas, logs
   ▼
Tela /admin/catalogo  (progresso, filtros, relatório)
```

### 1. Banco de dados (Lovable Cloud)

Novas tabelas, todas com RLS admin + GRANTs:

- `catalog_operators` — operadora (nome, slug, portal)
- `catalog_categories` — categoria/subcategoria
- `catalog_destinations` — destino, cidade, estado, país
- `catalog_products` — identificação, nome, subtítulo, descrição, resumo, destaques, tipo, duração, idioma, horários, dias, local de saída/retorno, ponto de encontro, políticas (cancelamento/alteração), informações importantes, observações, requisitos, inclui/não inclui, fornecedor, URL, status, `imported_at`, `updated_at`
- `catalog_product_images` — url, ordem
- `catalog_availabilities` — produto + período pesquisado (nunca sobrescreve períodos anteriores)
- `catalog_rates` — moeda, valor, tipo de tarifa, vinculada à disponibilidade
- `catalog_import_runs` + `catalog_import_logs` — progresso, erros, relatório
- `catalog_product_history` — snapshot a cada alteração

Chave única de produto: `operator_id + external_code` (fallback: hash de nome+destino+URL). Produto que some da varredura completa vira `status = 'inativo'` (nunca é apagado).

### 2. Extensão — robô de varredura

Novo content script para `*.infotravel.com.br`:

- **Modo rápido (prioritário):** hook em `fetch`/`XMLHttpRequest` para capturar os JSON de listagem e detalhe que o próprio portal já usa. Se o JSON tiver tudo, nem abre página de detalhe.
- **Modo DOM (fallback):** navega Reservar → Serviços → Destino → Ida → Volta → Pesquisar, percorre todas as páginas, abre cada serviço, extrai e volta.
- Gera automaticamente as janelas de busca: hoje + 12 meses, blocos de 30 dias, com sobreposição configurável.
- Fila com concorrência configurável (padrão 2), delay entre requisições, retry com backoff, checkpoint salvo em `chrome.storage` → retoma após queda.
- Erro em uma página é logado e a varredura continua.

Segurança: nenhuma senha armazenada, só a sessão que você já abriu; sem burlar MFA/CAPTCHA; rate-limit respeitado.

### 3. Endpoint de ingestão

`src/routes/api/public/catalog-import.ts` — recebe lotes de produtos, valida com Zod, faz upsert inteligente (novo / atualizado / inalterado), grava imagens, disponibilidades e tarifas, devolve contadores para a barra de progresso.

### 4. Tela `/admin/catalogo`

- Filtros: operadora, destino, categoria, período, "importar tudo"
- Botões: Importar, Pausar, Continuar, Cancelar, Atualizar
- Progresso ao vivo: operadora, destino, página, produto atual, importados, novos, atualizados, erros, tempo restante
- Relatório final: não importados, erros, tempo total

### 5. Aba Pacotes — campo de teste

No formulário de "Adicionar" pacote, novo tipo/campo **SERVIÇOS IMPORTADOS (TESTE)**, que lista e permite selecionar um produto já importado do catálogo para preencher o cadastro.

---

## O que preciso de você

Para escrever os seletores/endpoints certos (o vídeo é filmado da tela e não dá para ler o HTML), preciso de **uma captura de rede real**, logado:

1. Abra o Infotravel logado, vá em **Serviços**, faça uma busca (ex.: Orlando, 01/08 a 31/08).
2. Abra **DevTools → Network → Fetch/XHR**, marque *Preserve log*.
3. Faça a busca, vá para a página 2 e abra 1 serviço.
4. Botão direito na lista → **Save all as HAR with content** e me envie o `.har`.

Se preferir mais simples: em vez do HAR, mande **3 prints do DevTools** (aba Network, request de listagem com a resposta JSON aberta; request de detalhe; e o Elements de um card da lista) — mas o HAR é bem melhor.

Também me diga: **quais operadoras** do Infotravel entram na primeira leva e **quais destinos** prioritários.

## Ordem de execução

1. Migração do banco + endpoint de ingestão + tela `/admin/catalogo` (funciona já com dados de teste)
2. Campo "SERVIÇOS IMPORTADOS (TESTE)" na aba Pacotes
3. Robô da extensão — depende do HAR para ficar preciso
