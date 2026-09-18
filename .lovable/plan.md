# Teste real da API de Serviços no site publicado

Objetivo: confirmar, com um token válido, que busca, seleção e recuperação de serviços funcionam em pedidos.viaair.tur.br — sem alterar código e sem publicar nada.

## O que será feito

1. Chamada de busca de serviços em produção (destino simples, ex.: Foz do Iguaçu, período curto, 2 adultos) e conferência de: quantidade de itens, tipos retornados e bloco de precificação (valor da operadora, markup zero, comissão não informada).
2. Seleção de um item da busca e conferência de que a resposta confirma a escolha sem reservar nada.
3. Recuperação da seleção pelo identificador devolvido, conferindo que o conteúdo é idêntico ao da seleção.
4. Varredura das três respostas para garantir que nenhum dado interno do fornecedor aparece.
5. Relatório curto com status de cada chamada, valores e resultado da varredura.

## O que NÃO será feito

- Nenhuma alteração de código, banco ou configuração.
- Nenhuma reserva, pagamento ou emissão.
- Nenhuma publicação.

## O que preciso de você

Um token de acesso válido da API interna com a permissão de leitura de serviços. Ele é exibido apenas uma vez na tela de tokens; me envie aqui para eu usar somente nestas três chamadas. O token não será gravado em arquivo nem repetido em respostas.

## Observação técnica

As chamadas serão feitas com o cabeçalho de autorização padrão (`Authorization: Bearer ...`) contra `pedidos.viaair.tur.br`. A busca grava uma referência temporária de oferta (validade de 2 horas) e a seleção grava uma referência de seleção — é o comportamento normal da API, sem efeito comercial.
