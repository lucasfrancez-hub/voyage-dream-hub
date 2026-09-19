# Locadora "FL" nos carros — auditoria concluída

Nada foi alterado, nada publicado, nada reservado. Só leitura e consultas de busca/catálogo.

## Resposta curta

**"FL" é a sigla oficial da locadora "Foco Locadora"** no cadastro de fornecedores do Compre Fácil. Não é grupo, não é ACRISS, não é código interno da VIA AIR. A busca de carros devolve **só a sigla** — o nome comercial não vem na oferta, mas existe um catálogo oficial na própria operadora que resolve sigla → nome.

## 1) Chamada original à operadora

`src/lib/comprefacil/carros.server.ts`

- `GET /api/lojascarro/list/{texto}` (linha 91-110) — lojas de retirada/devolução
- `POST /api/carro/buscaasync` (linha 165-168) — abre a busca
- `POST /api/Carro/busca` (linha 180-183) — lê o resultado pelo mesmo Guid

Busca real feita agora (Recife Aeroporto REC20, 10→13/11/2026, 2 adultos): **30 ofertas**, fornecedores devolvidos nos metadados: `["MOV","FL"]`.

Campos reais de uma oferta "FL" (recorte do JSON bruto):

```text
"ModeloNome": "Fiat Mobi, Renault Kwid ou similar"
"ModeloCodigo": "ECMR"
"CodigoCliente": "ECMR"
"Fornecedor": "FL"
"WebServiceId": 316
"Imagem": "https://cms.aluguefoco.com.br/uploads/B_2f2707969f.png"
"PagamentoCodigo": "FTA"
"CondutorDocumentoTipo": "CPF"
"ValorTotalListagem": 345
```

Lista completa de chaves da oferta (busca real): Descricao, ModeloCodigo, ModeloNome, Pax, Bagagem, TemAirCondicionado, KmLivre, Categoria, Offline, Tipo, TransmissaoTipo, Tracao, Portas, Imagem, LocalOrigem, LocalDevolucao, Enderecos/Lat/Long, DataHoraOrigem, DataHoraDevolucao, ReservaId, CodigoInterno, **Fornecedor**, Status, StatusDesc, CondutorDocumentoTipo, PagamentoCodigo, CodigoCliente, **WebServiceId**, Extra, valores/moedas/taxas, MarkupId, ItemGuid, ProtecoesOcultas, Id, Erros.

**Não existe** nenhum campo com nome comercial, nem `NomeFornecedor`, `Locadora`, `Vendor`, `Logo`.

## 2) "FL" é o quê — comprovado

Catálogo oficial da operadora: `GET /api/webservice` (225 registros, campo `Carro: true`). Retorno real:

| Id | Descricao | Sigla | SiglaInterna |
|---|---|---|---|
| 316 | **Foco Locadora** | **FL** | FL |
| 241 | MOVIDA | MOV | MOV |
| 326 | Hertz - SG Rental | HRTZ | SGR |
| 329 | Dollar - SG Rental | DLR | SGR |
| 330 | Thrifty - SG Rental | THRFT | SGR |

O `WebServiceId: 316` da oferta casa exatamente com `Id: 316 = Foco Locadora`. Evidência secundária coerente: a imagem da oferta vem de `cms.aluguefoco.com.br` e o HTML de detalhe usa classes `foco-detalhe-*`.

Ou seja: há **duas chaves oficiais** para resolver o nome — `Fornecedor` (= Sigla) e `WebServiceId` (= Id). O Id é o mais seguro (a sigla "SGR" se repete entre Hertz/Dollar/Thrifty).

## 3) Nome comercial e logo na oferta

- Nome comercial: **não vem** na busca de carros.
- Logo da locadora: **não vem**. `Imagem` é a foto do veículo (hospedada no domínio da locadora, o que é indício, não dado estruturado).

## 4) Catálogo de locadoras na operadora

Sim: `GET /api/webservice?Pagina=&ItensPorPagina=` — é a lista oficial de fornecedores, com flag por produto (`Carro`). Testados e inexistentes: `/api/locadora`, `/api/locadoras`, `/api/fornecedorcarro`, `/api/fornecedor` (404), `/api/carro/locadoras`, `/api/carro/fornecedores` (400). A busca também devolve as siglas ativas em `MetaData.MetaDados.Fornecedores` (`["MOV","FL"]`), só siglas.

## 5) Tabela código→nome na integração

**Não existe** hoje — nenhuma constante, JSON ou tabela. `rg` por "locadora"/"Fornecedor" só encontra o mapeamento direto do campo.

## 6) Onde o campo é mapeado

`src/lib/cars/comprefacil-cars.server.ts:189` → `locadora: c.Fornecedor ?? null` (por isso a Sky Hub vê "FL").
`src/lib/cars/comprefacil-cars.server.ts:240` → `locadora_codigo: c.Fornecedor` no bloco interno.
`src/lib/cars/comprefacil-cars.server.ts:243` → `webservice_id: c.WebServiceId` — guardado, porém **só no bloco sigiloso**, removido por `paraSkyHub` (linha 118-121).

Nada com nome comercial está sendo descartado, porque a origem não manda nome. O que **é** descartado é a única chave que permite resolvê-lo: `WebServiceId`.

## 7) Contrato atual para a Sky Hub

`POST /api/public/internal/v1/cars/search` devolve por oferta `locadora: "FL"` (string crua) e, no topo, `locadoras: ["MOV","FL"]`. Mesma coisa em `/cars/select` e `/cars/selection`.

## Plano proposto (não implementado)

1. **Catálogo de locadoras server-side** — novo `src/lib/comprefacil/locadoras.server.ts`: lê `GET /api/webservice`, filtra `Carro: true`, monta índice por `Id` e por `Sigla`, com cache em memória (TTL de horas). Nome vem sempre da operadora; nunca inventado.
2. **Normalização** — em `src/lib/cars/comprefacil-cars.server.ts`, passar o catálogo para `normalizar()` e emitir:
   - `locadora_codigo`: `c.Fornecedor` (ex.: "FL")
   - `locadora_nome`: nome do catálogo por `WebServiceId`, com fallback por sigla; **`null`** se não achar (nunca repetir "FL")
   - `locadora`: mantido por compatibilidade, passando a valer o nome quando existir, senão o código (decidir junto com você).
   - `locadoras` no topo vira lista de `{ codigo, nome }`.
3. **Contrato** — atualizar o tipo `CarroNormalizado`/`CarsSearchResult` e o comentário de contrato; as três rotas (`cars.search`, `cars.select`, `cars.selection`) herdam automaticamente.
4. **Teste real** de busca em Recife e Guarulhos comprovando `FL → "Foco Locadora"` e `MOV → "MOVIDA"`, sem publicar.

Arquivos que mudariam: `src/lib/comprefacil/locadoras.server.ts` (novo) e `src/lib/cars/comprefacil-cars.server.ts`. As rotas não precisam mudar.

### Ponto a decidir

Manter o campo `locadora` como está (para não quebrar a Sky Hub que já lê ele) e só **acrescentar** `locadora_codigo` + `locadora_nome`, ou trocar `locadora` para o nome comercial?
