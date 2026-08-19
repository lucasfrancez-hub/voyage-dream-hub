# Persistir a fila de cotações manuais

## Objetivo
Garantir que os itens enviados por **Pagamentos → Passagens baratas → Salvar** não desapareçam ao atualizar a página, navegar ou fechar o aplicativo.

## Implementação
- Criar um registro persistente para cada cotação manual, com rota, datas, preço de referência, estado e resultado.
- Fazer o botão **Salvar** registrar primeiro o item na fila e deixar o processamento continuar no servidor.
- Exibir esses itens persistidos no pop-up **Fila**, junto dos agendamentos de Instagram e WhatsApp.
- Permitir retomar automaticamente itens que tenham sido interrompidos, sem duplicar promoções.
- Manter os estados concluído e falhou visíveis para conferência e limpeza.

## Recuperação atual
Os itens exatos da fila perdida não deixaram registro porque a implementação anterior era somente em memória. Não vou misturar novamente os 119 itens do radar automático com esta fila manual.

## Validação
- Enviar uma passagem para a fila e confirmar que ela permanece após recarregar a tela.
- Confirmar a atualização de estados e a criação/atualização da promoção ao concluir.
