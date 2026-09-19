# Auditoria de lentidão na busca de Serviços (somente leitura)

Objetivo: medir com números reais por que a busca de serviços demora ou estoura o tempo, e propor uma arquitetura que não trave o pacote. Nada de código alterado, nada publicado, nada selecionado ou reservado.

## O que já foi confirmado lendo o código

Caminho da chamada:

```text
Sky Hub -> POST /api/public/internal/v1/services/search   (src/routes/api/public/internal/v1/services.search.ts:15)
        -> buscarServicos()                                (src/lib/services/comprefacil-services.server.ts:340)
           -> resolverCidade()  (catálogo de cidades)      (:277)
           -> em paralelo:
              buscarServicosDestinoCF()  POST /api/Servico/busca   (src/lib/comprefacil/servicos.server.ts:195)
              buscarSegurosCF()          POST /api/Seguro/busca    (src/lib/comprefacil/seguros.server.ts:185)
           -> normaliza + grava a busca em api_offer_refs  (:434)
```

Tempos já visíveis no código (a confirmar na medição):

- Tempo-limite por chamada à operadora: 60 s — `src/lib/comprefacil/auth.server.ts:11` e `:347`.
- Serviços: abre a busca e faz polling sobreposto com intervalos de 700 ms a 5 s, teto de segurança de 60 s — `servicos.server.ts:250` e `:266`; depois pode fazer mais 1 chamada de até 15 s (`:283`) ou até 3 páginas em paralelo de 12 s (`:302`).
- Seguro: até 14 voltas de polling com 2 s de espera fixa entre cada uma, em série — `seguros.server.ts:221-223`. Pior caso isolado passa de 30 s.
- Catálogo de cidades: até 25 páginas em série, em cache de memória — `localidades.server.ts:19-42`. Primeira busca depois de um reinício paga esse custo inteiro.
- A rota da Internal API não tem tempo-limite próprio: ela espera o que a operadora levar.
- Histórico existe: `api_request_logs` grava `duration_ms` por requisição — `src/lib/api/auth.server.ts:138-149`.

## Medições a executar

1. Seis buscas reais (2 adultos, datas nos próximos 60 dias): Recife, Maceió, Natal, Porto Seguro, Rio de Janeiro e Gramado. Duas delas repetidas para medir o efeito do cache.
2. Instrumentação apenas na execução do teste (script temporário fora do projeto, sem tocar no código da aplicação): tempo de cada chamada à operadora (abertura, cada leitura de polling, catálogo de cidades), tempo interno da Via Air, tempo total, resultados por categoria, tamanho da resposta em KB, retries e timeouts.
3. Histórico: distribuição real de duração das buscas de serviços vindas da Sky Hub (mínimo, mediana, p90, máximo), quantidade de erros/timeouts e o texto dos erros, a partir de `api_request_logs` e dos eventos de integração.

## Entrega

- Tabela com os tempos medidos por busca e por chamada.
- Tempo-limite atual de cada camada.
- Causa principal com números: operadora, processamento da Via Air, rede ou lado da Sky Hub.
- Tempo-limite mínimo recomendado para a Sky Hub, com base no p90 e no máximo medidos.
- Proposta (sem implementar) comparando: busca assíncrona com `search_id` + polling pela Sky Hub, cache por destino+data, aumento controlado de tempo-limite, retorno parcial por categoria e job separado — com prós, contras e impacto esperado, para que aéreo e hotel carreguem o pacote e serviços entrem na tela quando chegarem.

## Restrições respeitadas

Somente leitura e medição. Sem alterar código, sem publicar, sem deploy, sem seleção ou reserva, sem tocar em hotel/Utravel, sem expor credenciais.
