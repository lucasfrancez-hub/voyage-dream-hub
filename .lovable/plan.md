# Carros do Compre Fácil — auditoria e contrato proposto

Nada implementado, nada publicado. Aéreo, hotel e serviços intactos.

## 1. A integração existe e funciona

Sim. Fiz uma busca real (São Paulo/Guarulhos, 10/11 a 13/11/2026, 2 adultos) e o fornecedor devolveu **32 opções**, de R$ 273,51 a R$ 1.444,56, das locadoras **Movida e Localiza** (o sistema também tem Hertz e Thrifty habilitadas).

Como funciona, em duas etapas:
1. abrir a busca (assíncrona) — o fornecedor devolve um identificador da busca;
2. consultar o resultado com esse identificador até as locadoras responderem (no teste, ~4 segundos).

Os pontos de retirada/devolução vêm de uma consulta própria de lojas (ex.: "foz" devolve Foz do Iguaçu Aeroporto, sigla IGU).

## 2. O que é obrigatório informar

- local de retirada e local de devolução (sigla da loja/cidade, vinda da consulta de lojas)
- tipo do local (loja ou cidade/aeroporto)
- data e hora de retirada e data e hora de devolução
- quantidade de adultos e idades de crianças
- identificador da agência e identificador da busca

**Não é exigido** idade do condutor nem residência/nacionalidade na busca (o tipo de documento do condutor já vem na resposta: CPF).

## 3. O que vem em cada opção (confirmado no retorno real)

| Item | Vem? |
|---|---|
| locadora | sim (Movida, Localiza) |
| modelo / categoria / grupo | sim ("Fiat Mobi ou similar", grupo AX, código ACRISS ECMM) |
| câmbio | sim (manual/automático) |
| ar-condicionado | sim |
| passageiros / malas / portas | sim |
| quilometragem | sim (livre ou não) |
| imagem do veículo | sim (foto real da locadora) |
| local e endereço de retirada/devolução | sim |
| datas e horas | sim |
| preço da diária, total, taxas, moeda | sim (em reais) |
| proteções | sim — 4 por opção, com título, descrição, valor e se é obrigatória |
| adicionais/comodidades | sim, na mesma lista de proteções |
| política de combustível | **não vem em campo próprio** |
| franquia/coparticipação | **não vem em campo próprio** (só citada no texto das proteções) |
| política de cancelamento | **não vem** na busca |

## 4. Comissão

Igual a Serviços: **não há campo de comissão da agência**. O retorno traz uma taxa administrativa (15%) e um identificador interno de markup do fornecedor. Não vou inferir que isso seja comissão. Mantenho a mesma regra já aprovada: valor = valor do fornecedor, markup Via Air = 0, comissão = não informada.

## 5. Identificadores a preservar (só no servidor)

Identificador da busca, identificador do item, id numérico da oferta, código do grupo, fornecedor, código de pagamento, id do webservice, identificador de markup. Nada disso vai para o Sky Hub — ele recebe só uma referência opaca, como em Serviços.

Reserva futura usa um endpoint próprio do fornecedor por id da oferta; consulta por id também existe (serve como revalidação antes de reservar). Fora desta fase.

## 6. Contrato proposto

Permissão dedicada: `cars:read`. Sky Hub nunca fala com o fornecedor.

- `POST /api/public/internal/v1/cars/locations` — lojas/cidades por texto (necessário para montar a busca)
- `POST /api/public/internal/v1/cars/search` — retirada, devolução, datas/horas, adultos, idades de crianças; a espera pelas locadoras acontece no servidor; devolve lista normalizada + `busca_id`
- `POST /api/public/internal/v1/cars/select` — grava a escolha (com ou sem proteções) e devolve `reserva.realizada: false`
- `GET /api/public/internal/v1/cars/selection?selecaoId=` — recupera a escolha

Resposta por opção (português, igual ao padrão de Serviços):
locadora, categoria, grupo, modelo, cambio, ar_condicionado, passageiros, malas, portas, quilometragem_livre, imagem, retirada {local, endereco, data_hora}, devolucao {local, endereco, data_hora}, diarias, valor_diaria, valor_total, moeda, taxas, protecoes[] {codigo, titulo, descricao, valor, obrigatoria}, combustivel (null), franquia (null), cancelamento (null), referencia_fornecedor (opaca, com validade) e o bloco fixo
`precificacao: { origem_valor: "operadora", markup_viaair: 0, comissao_agencia: null, comissao_agencia_status: "nao_informada_pela_api" }`.

Persistência reaproveita `api_offer_refs` (sem migração). Sem reserva, pagamento ou emissão.

## Próximo passo

Aguardo sua autorização para implementar. Nada será publicado.
