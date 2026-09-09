# Integração Comprar Viagem / Oner — Etapa 1: mapeamento e base

Objetivo desta etapa: descobrir na prática como a Comprar Viagem funciona por dentro, e deixar pronta toda a fundação (banco, sessão, OTP, máquina de estados, painel administrativo) para que a etapa seguinte abra o fluxo ao cliente final.

## O que já existe e será reaproveitado

- Conexão direta com a API da Oner (busca de voos, hotéis, carros, extras).
- Um conector de checkout já funcional: envio do código de acesso por e-mail, validação, leitura do carrinho e gravação de passageiros.
- Toda a estrutura de captação automática de códigos de acesso por e-mail já usada com outros fornecedores.
- Cobrança Pix da VIA AIR (QR + copia e cola + confirmação por webhook) e pagamentos/transferências bancárias já integrados.

Ou seja: não começamos do zero — ampliamos o que já responde hoje.

## 1. Compra de teste e mapeamento

Vou fazer uma reserva de teste real com a conta operacional VIA AIR, indo até a criação do pedido F-... sem concluir pagamento, registrando cada chamada interna: login, código de acesso, carrinho, passageiros, criação do pedido, geração do Pix, acompanhamento do carrinho, lista de vendas e detalhe da venda.

Resultado: um documento interno com endereços, dados enviados, dados recebidos e os identificadores de ligação entre pedido e venda. Prioridade absoluta para as chamadas de dados; automação de navegador só onde não houver alternativa, com todos os localizadores de tela centralizados num único arquivo.

## 2. Banco de dados

Tabelas novas, exclusivas da integração:

- `integration_orders` — liga o pedido VIA AIR ao carrinho, ao pedido F-..., à venda, ao valor, aos dois pagamentos (cliente e fornecedor), ao localizador e à etapa atual.
- `integration_passengers` — passageiros da reserva.
- `integration_tickets` — bilhete, localizador, companhia e situação por passageiro.
- `integration_events` — histórico completo, com hora e descrição de cada passo.
- `oner_sessions` — sessão da conta operacional, guardada de forma cifrada.
- `oner_otp_requests` — tentativas de login aguardando código.

Cada identificador em seu próprio campo; nenhum sobrescreve o outro.

## 3. Sessão e código de acesso

- Gerenciador de sessão que reaproveita a sessão válida, detecta expiração e só pede novo código quando realmente precisa.
- Endereço próprio para receber o e-mail encaminhado com o código, protegido por segredo, com validação de remetente, janela curta de validade, uso único e vínculo com a tentativa de login em andamento.
- O código nunca aparece em registro nenhum — só a informação de que chegou e foi usado.
- Se a captura automática falhar, o administrador digita o código na tela e a operação continua sozinha do ponto onde parou.

## 4. Máquina de estados e retomada

Todas as etapas listadas no pedido (do carrinho criado até concluído, com revisão manual e falha) viram estados persistidos. Um serviço de recuperação varre periodicamente tudo que não chegou ao fim e continua de onde parou — sempre consultando antes de agir, para nunca cobrar o cliente duas vezes nem pagar o fornecedor duas vezes.

Regras de proteção: chave de idempotência por pedido (`oner_pix_F-...`); em caso de tempo esgotado, primeiro consulta o pagamento anterior, só depois decide.

## 5. Acompanhamento e sincronização

- Consulta periódica com intervalo crescente: frequente nos primeiros minutos, mais espaçada depois.
- Detecta quando o pedido F-... vira venda, descobre o número da venda dinamicamente e abre o detalhe correspondente.
- Extrai localizador, bilhetes por passageiro, dados de voo, hospedagem, carro, extras e documentos disponíveis.
- Continua consultando quando a venda existe mas o localizador ou o bilhete ainda não saíram — não trata isso como erro.

## 6. Pagamento ao fornecedor

O sistema lê o QR Code gerado pela Comprar Viagem e confere valor, beneficiário, documento e vencimento contra o pedido antes de qualquer coisa. Só então dispara o pagamento automático pela conta bancária da VIA AIR. Divergência de qualquer campo interrompe e manda para revisão manual.

## 7. Painel administrativo

Em Configurações → Integrações → Comprar Viagem:

- Situação da conexão (conectada / código necessário / expirada), última autenticação, última atividade, última sincronização, com botões de testar e renovar sessão.
- Lista de operações em andamento: pedido VIA AIR, pedido F-..., cliente, valor, situação e etapa.
- Detalhe de cada operação com a linha do tempo completa e o histórico com horários.
- Ações de recuperação: tentar novamente, consultar carrinho, consultar vendas, sincronizar venda, informar número da venda, localizador ou bilhete manualmente.

## 8. Fora desta etapa (etapa 2)

Carrinho, formulário de passageiros, Pix e "Meus Pedidos" visíveis ao cliente final, além da tela própria de pagamento com cartão. A base desta etapa já é construída pensando nisso.

## Detalhes técnicos

- Módulo isolado em `src/lib/integrations/oner/` com adaptadores separados: sessão, código de acesso, carrinho, passageiros, pedido, Pix, vendas, detalhe da venda, sincronização e recuperação. Nada de regra da Oner espalhada pelo sistema.
- Tudo em funções de servidor; nenhuma credencial chega ao navegador do cliente.
- Endereço público apenas para o recebimento do código, com validação de segredo.
- Consultas periódicas disparadas por agendamento no banco chamando um endereço interno protegido.
- Segredos novos: segredo do recebimento de código e chave de cifra da sessão.
