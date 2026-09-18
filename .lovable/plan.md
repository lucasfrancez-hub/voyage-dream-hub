# Auditoria da divergência de produção da API de Serviços

## Objetivo
Determinar, com uma única conclusão sustentada por evidências, por que o teste anterior registrou sucesso autenticado enquanto a verificação independente recebeu HTML/404 no domínio `pedidos.viaair.tur.br`.

## Restrições
- Somente leitura.
- Não alterar código, banco, domínio, cache, configuração ou publicação.
- Não publicar.
- Não criar token nem fazer novo teste autenticado.
- Não executar nova busca, seleção, reserva, cobrança, Pix ou emissão.
- Não expor credenciais, cabeçalhos de autorização ou referências internas.

## Etapas
1. **Reconstruir a execução anterior**
   - Localizar comandos, arquivos temporários remanescentes e registros do teste.
   - Identificar exatamente protocolo, hostname, caminho e método usados em `search`, `select` e `selection`.
   - Confirmar, apenas pelos registros existentes, os status HTTP, os 90 resultados e os identificadores não sensíveis necessários para correlacionar a execução.
   - Registrar explicitamente qualquer evidência que não esteja mais disponível, sem inferir.

2. **Comparar os ambientes publicamente, sem autenticação**
   - Consultar `version.json` no domínio personalizado, no endereço publicado `*.lovable.app` e no preview.
   - Chamar as rotas de Serviços somente sem token, com os métodos corretos, registrando status, `content-type`, redirecionamentos e cabeçalhos de cache/proxy relevantes.
   - Comparar também `/health` como controle.
   - Verificar DNS público, domínio primário e eventual diferença de build entre os hosts.

3. **Auditar roteamento e autenticação no código**
   - Conferir registro das três rotas no mapa atual e a ordem entre resolução da rota, validação do método e autenticação.
   - Determinar pelo código as respostas esperadas para: rota inexistente sem token; rota existente sem token; rota existente com token inválido; rota existente com token válido.
   - Identificar fallback HTML, rewrite, proxy interno, override de URL-base ou resolução especial em chamadas originadas no servidor.

4. **Verificar estado do acesso e dados do teste**
   - Confirmar no banco que o acesso temporário não existe, não está ativo e não deixou credencial derivada, sem revelar segredo.
   - Identificar a tabela/estrutura onde a seleção foi persistida, quantos registros o teste criou e como reconhecê-los futuramente.
   - Confirmar por leitura que não houve reserva, cobrança, Pix ou emissão vinculada ao teste.
   - Não remover o registro da seleção.

5. **Auditar Cloudflare e publicação**
   - Usar os dados públicos e a configuração de domínio disponível para verificar apontamento, domínio primário, cache e sinais de Worker/Pages/rewrite.
   - Se não houver acesso de leitura à conta Cloudflare, declarar a limitação e não afirmar ausência de regras privadas.
   - Comparar horários/builds sem usar `builtAt` isoladamente como prova.

## Entrega
Relatório objetivo em português contendo:
- URL real e origem da execução anterior;
- tabela comparativa dos hosts e métodos;
- matriz autenticado versus não autenticado;
- estado do acesso temporário e dos dados persistidos;
- evidências de domínio/cache/proxy;
- uma única classificação entre A, B, C, D ou E;
- causa confirmada, evidências, lacunas e risco;
- nenhuma correção executada e nenhuma publicação.
