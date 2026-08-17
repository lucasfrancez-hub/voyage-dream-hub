# Corrigir gargalo “Datas reais” do Radar

## Diagnóstico confirmado
- “Datas reais” abre o detalhe de cada rota no radar externo para obter datas concretas de ida/volta e o preço de referência; o motor VIA AIR precisa dessas datas para fazer a cotação final.
- A etapa não substitui a validação VIA AIR e não pode ser eliminada sem outra fonte de datas. Ela pode, porém, ser simplificada e estritamente limitada.
- O checkpoint atual é salvo apenas depois de um lote de 4 oportunidades. A UI mostra `4/20` antes de o lote terminar, mas o banco ainda guarda a fase anterior (`leads`). Se a invocação expira durante o lote, a retomada reconstrói a curadoria e consulta novamente as mesmas quatro rotas.
- Evidência na execução ativa: nota `Datas reais — 4/20`, todas as 10 origens concluídas, mas checkpoint ainda em `stage=leads`, com zero datas concluídas. Esse é o motivo da alternância aparente e do bloqueio antes da validação.

## Implementação
1. Persistir a entrada em `datas` antes da primeira consulta, com fila, total e progresso acumulado.
2. Processar e confirmar uma oportunidade por vez; após cada tentativa, remover apenas aquela oportunidade da fila e salvar imediatamente o checkpoint.
3. Dar a cada consulta de datas um prazo próprio e único, sem reiniciar o lote inteiro; falha/ausência de datas avança para a próxima rota em vez de travar o ciclo.
4. Preservar `total`, `concluídas` e candidatas encontradas entre invocações, evitando denominador regressivo e reprocessamento.
5. Mostrar progresso real e monotônico na UI, no formato `Consultando oportunidades 55/55 · Datas reais 18/55`, até mudar definitivamente para validação VIA AIR.
6. Adicionar teste de regressão para retomada no meio de “Datas reais” e executar os testes focados do Radar.

## Resultado esperado
- Cada rota da etapa “Datas reais” é consultada no máximo uma vez por execução.
- A retomada continua exatamente da próxima rota pendente.
- A fase avança sozinha para `validando` assim que a fila de datas termina.
- A UI deixa claro que são duas etapas sequenciais, sem parecer que o Radar voltou para trás.
