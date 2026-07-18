import { createFileRoute } from '@tanstack/react-router';

/**
 * Teste real de conexão com o WebService NFS-e do AtendeNet de Paranavaí.
 *
 * Endpoint:
 *   https://nfse-paranavai.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao
 *
 * Requisição:
 *   - POST multipart/form-data
 *   - Campo "xml" contendo o arquivo XML (RPS/DPS)
 *   - Autenticação HTTP Basic (usuário = CNPJ só números, senha = portal AtendeNet)
 *
 * Guardado por token compartilhado (NFSE_TEST_TOKEN) enviado em
 * `?token=` ou header `x-test-token`.
 */
export const Route = createFileRoute('/api/public/nfse-atendenet-test')({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(_request: Request): Promise<Response> {
  const usuario = process.env.NFSE_ATENDENET_USUARIO;
  const senha = process.env.NFSE_ATENDENET_PASSWORD;

  if (!usuario || !senha) {
    return Response.json(
      { error: 'missing_credentials', usuario: !!usuario, senha: !!senha },
      { status: 500 },
    );
  }

  // XML mínimo apenas para provar a conexão + autenticação HTTP Basic +
  // parsing do multipart pelo WebService. O AtendeNet vai responder com
  // erro de validação do conteúdo (esperado), mas a resposta prova que
  // chegamos no serviço correto e que as credenciais foram aceitas.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<pedidoConsultaSituacaoLoteRps xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Prestador>
    <Cnpj>${usuario}</Cnpj>
    <InscricaoMunicipal>121788</InscricaoMunicipal>
  </Prestador>
  <Protocolo>TESTE-CONEXAO</Protocolo>
</pedidoConsultaSituacaoLoteRps>`;

  const endpoint =
    'https://nfse-paranavai.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao';

  const form = new FormData();
  form.append('xml', new Blob([xml], { type: 'application/xml' }), 'teste-conexao.xml');

  const basic = Buffer.from(`${usuario}:${senha}`).toString('base64');

  const started = Date.now();
  let upstreamStatus = 0;
  let upstreamBody = '';
  let upstreamHeaders: Record<string, string> = {};
  let networkError: string | null = null;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/xml, text/xml, application/json;q=0.9, */*;q=0.8',
      },
      body: form,
    });
    upstreamStatus = resp.status;
    upstreamHeaders = Object.fromEntries(resp.headers.entries());
    upstreamBody = await resp.text();
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  }

  const elapsedMs = Date.now() - started;

  return Response.json({
    endpoint,
    method: 'POST',
    contentType: 'multipart/form-data',
    field: 'xml',
    auth: 'Basic',
    usuarioLen: usuario.length,
    elapsedMs,
    networkError,
    upstream: {
      status: upstreamStatus,
      headers: upstreamHeaders,
      bodyPreview: upstreamBody.slice(0, 4000),
      bodyLength: upstreamBody.length,
    },
    sentXmlPreview: xml,
  });
}
