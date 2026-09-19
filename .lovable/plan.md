# Auditoria da quebra de carros: Sky Hub → VIA AIR

## Objetivo

Determinar, sem alterar código, configuração ou dados, por que a Sky Hub ainda trata aluguel de carro como indisponível e em qual ponto o fluxo deixa de chegar à VIA AIR.

## Evidências já confirmadas

- A VIA AIR publicada contém e reconhece estas rotas:
  - `POST /api/public/internal/v1/cars/locations`
  - `POST /api/public/internal/v1/cars/search`
  - `POST /api/public/internal/v1/cars/select`
  - `GET` e `POST /api/public/internal/v1/cars/selection`
- Sem token, `POST /cars/search` chega ao handler publicado e responde `401 JSON`; portanto a rota está ativa, não é 404.
- Todas as rotas exigem `cars:read`.
- O token ativo principal da Sky Hub tem aéreo, serviços e pacotes, mas **não possui `cars:read`**.
- Não existe chamada de carros registrada para esse token; as chamadas recentes de aéreo chegam normalmente.
- A Sky Hub já possui a tela e a server function `buscarCarrosPacote`, mas ela encerra o fluxo localmente com a mensagem “ainda não está liberada” e não chama a VIA AIR (`src/lib/packages.functions.ts:209-230`).
- O cliente HTTP da Sky Hub possui métodos de serviços, mas ainda não possui métodos `carsLocations`, `carsSearch`, `carsSelect` ou `carsSelection` (`src/lib/viaair/client.server.ts:317-329`).
- A camada universal ainda grava carros como `nao_liberado` de forma fixa (`src/lib/locations/resolve.server.ts:191-223`), e `temCarro` depende de dados que esse mesmo código nunca preenche (`src/lib/locations.functions.ts:13-31`).

## Auditoria final

1. Consolidar o contrato real da VIA AIR, incluindo métodos, permissão, schemas, nomes de campos e resposta normalizada.
2. Confirmar o formato real de localidade:
   - primeiro `POST /cars/locations` com texto de cidade ou IATA;
   - depois usar o `codigo` retornado em `retirada`/`devolucao`;
   - documentar que a busca não aceita latitude/longitude e não deve receber nome livre sem resolução prévia.
3. Rastrear o caminho completo da Sky Hub: tela → `buscarCarrosPacote` → cliente VIA AIR → token → rota.
4. Comparar o payload atual da Sky Hub com o contrato da VIA AIR e listar as incompatibilidades de nomes e campos.
5. Verificar os registros de chamadas para separar falha local, falta de permissão e eventual erro do fornecedor.
6. Executar somente testes não destrutivos:
   - rota publicada sem credencial, para provar existência e formato do erro;
   - server function atual da Sky Hub, para provar se ela interrompe antes da rede;
   - busca autenticada direta apenas se a credencial existente puder ser usada pelo runtime da própria Sky Hub, sem revelar, copiar, rotacionar ou criar token.
7. Não executar `select` nem criar seleção durante esta auditoria. Se o teste autenticado direto não for tecnicamente possível sem expor/criar credencial, registrar claramente como “NÃO FOI POSSÍVEL CONFIRMAR” e usar os registros reais já existentes como evidência histórica.

## Entrega

Relatório objetivo com:

- **PROBLEMA ENCONTRADO**
- **ONDE ESTÁ**
- **COMO CORRIGIR**
- **ARQUIVOS ENVOLVIDOS**
- **TESTE REAL DA ROTA**
- **PAYLOAD CORRETO**
- **RESPOSTA REAL**
- comparação VIA AIR direta × Sky Hub → VIA AIR
- correção mínima separada em três pontos: liberar `cars:read` no token existente, adicionar os métodos de carro no cliente/server functions da Sky Hub e substituir o bloqueio fixo da localidade por resolução via `/cars/locations`.

## Limites

- Nenhuma alteração de código, banco, token ou configuração.
- Nenhuma publicação ou deploy.
- Nenhuma reserva, seleção, cobrança, Pix ou emissão.
- Nenhuma credencial será exibida ou copiada.
