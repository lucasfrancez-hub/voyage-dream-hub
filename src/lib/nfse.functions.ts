import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ATENDENET_ENDPOINT =
  "https://nfse-paranavai.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao";
const IBGE_PARANAVAI = "4118402";

function onlyDigits(s: string | null | numberundefined) {
  return (s ?? "").toString().replace(/\D/g, "");
}

function xmlEscape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function atendenetAuth(): { basic: string; usuario: string } {
  const usuario = process.env.NFSE_ATENDENET_USUARIO;
  const senha = process.env.NFSE_ATENDENET_PASSWORD;
  if (!usuario || !senha) throw new Error("Credenciais AtendeNet não configuradas");
  return { basic: Buffer.from(`${usuario}:${senha}`).toString("base64"), usuario };
}

/* ============================== LIST ============================== */
export const listNfseByOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("nfse_emissoes")
      .select("*")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ============================== LIST ALL ============================== */
export const listAllNfse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string | null; limit?: number } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nfse_emissoes")
      .select("*, orders(order_number, full_name)")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ============================== CONFIG ============================== */
export const getNfseConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("nfse_config")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/* ============================== EMITIR (AtendeNet / IPM 2.0) ============================== */
const emitirInput = z.object({
  orderId: z.string().uuid(),
  valorServicos: z.number().positive(),
  discriminacao: z.string().min(5),
  tomador: z.object({
    razaoSocial: z.string().min(2),
    cpfCnpj: z.string().min(11),
    email: z.string().email().optional().nullable(),
    endereco: z.object({
      logradouro: z.string().optional().nullable(),
      numero: z.string().optional().nullable(),
      complemento: z.string().optional().nullable(),
      bairro: z.string().optional().nullable(),
      codigoMunicipio: z.string().optional().nullable(),
      uf: z.string().optional().nullable(),
      cep: z.string().optional().nullable(),
    }).optional().nullable(),
  }),
});

function buildAtendenetXml(args: {
  cfg: Record<string, unknown>;
  data: z.infer<typeof emitirInput>;
  reference: string;
  valorIss: number;
}): string {
  const { cfg, data, reference, valorIss } = args;
  const cpfCnpj = onlyDigits(data.tomador.cpfCnpj);
  const isPJ = cpfCnpj.length === 14;
  const end = data.tomador.endereco ?? null;
  // Data/hora Brasília
  const nowBr = new Date(Date.now() - 3 * 60 * 60 * 1000 - 5000)
    .toISOString()
    .replace("Z", "-03:00");

  const aliquota = Number(cfg.aliquota_iss ?? 4);
  const itemLc = xmlEscape(cfg.item_lista_servico ?? "");
  const codMunTrib = xmlEscape(cfg.codigo_tributario_municipio ?? "");
  const cnae = xmlEscape((cfg as { cnae_principal?: string }).cnae_principal ?? "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Nfse xmlns="http://www.publica.inf.br" versao="2.00">
  <Rps id="${xmlEscape(reference)}">
    <IdentificacaoRps>
      <Numero>${xmlEscape(reference)}</Numero>
      <Serie>RPS</Serie>
      <Tipo>1</Tipo>
    </IdentificacaoRps>
    <DataEmissao>${nowBr}</DataEmissao>
    <NaturezaOperacao>1</NaturezaOperacao>
    <OptanteSimplesNacional>2</OptanteSimplesNacional>
    <IncentivadorCultural>2</IncentivadorCultural>
    <Status>1</Status>
    <Servico>
      <Valores>
        <ValorServicos>${data.valorServicos.toFixed(2)}</ValorServicos>
        <ValorDeducoes>0.00</ValorDeducoes>
        <ValorPis>0.00</ValorPis>
        <ValorCofins>0.00</ValorCofins>
        <ValorInss>0.00</ValorInss>
        <ValorIr>0.00</ValorIr>
        <ValorCsll>0.00</ValorCsll>
        <IssRetido>2</IssRetido>
        <ValorIss>${valorIss.toFixed(2)}</ValorIss>
        <Aliquota>${aliquota.toFixed(2)}</Aliquota>
        <DescontoIncondicionado>0.00</DescontoIncondicionado>
        <DescontoCondicionado>0.00</DescontoCondicionado>
      </Valores>
      <ItemListaServico>${itemLc}</ItemListaServico>
      <CodigoCnae>${cnae}</CodigoCnae>
      <CodigoTributacaoMunicipio>${codMunTrib}</CodigoTributacaoMunicipio>
      <Discriminacao>${xmlEscape(data.discriminacao)}</Discriminacao>
      <CodigoMunicipio>${IBGE_PARANAVAI}</CodigoMunicipio>
    </Servico>
    <Prestador>
      <Cnpj>${xmlEscape(onlyDigits(cfg.cnpj as string))}</Cnpj>
      <InscricaoMunicipal>${xmlEscape(onlyDigits(cfg.inscricao_municipal as string))}</InscricaoMunicipal>
    </Prestador>
    <Tomador>
      <IdentificacaoTomador>
        <CpfCnpj>
          ${isPJ ? `<Cnpj>${cpfCnpj}</Cnpj>` : `<Cpf>${cpfCnpj}</Cpf>`}
        </CpfCnpj>
      </IdentificacaoTomador>
      <RazaoSocial>${xmlEscape(data.tomador.razaoSocial)}</RazaoSocial>
      ${end ? `<Endereco>
        <Endereco>${xmlEscape(end.logradouro ?? "")}</Endereco>
        <Numero>${xmlEscape(end.numero ?? "S/N")}</Numero>
        ${end.complemento ? `<Complemento>${xmlEscape(end.complemento)}</Complemento>` : ""}
        <Bairro>${xmlEscape(end.bairro ?? "")}</Bairro>
        <CodigoMunicipio>${xmlEscape(end.codigoMunicipio ?? IBGE_PARANAVAI)}</CodigoMunicipio>
        <Uf>${xmlEscape(end.uf ?? "PR")}</Uf>
        <Cep>${xmlEscape(onlyDigits(end.cep ?? ""))}</Cep>
      </Endereco>` : ""}
      ${data.tomador.email ? `<Contato><Email>${xmlEscape(data.tomador.email)}</Email></Contato>` : ""}
    </Tomador>
  </Rps>
</Nfse>`;
}

export const emitirNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof emitirInput>) => emitirInput.parse(d))
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin.data) throw new Error("Apenas administradores podem emitir NFS-e");

    const { data: cfg, error: cfgErr } = await context.supabase
      .from("nfse_config").select("*").limit(1).maybeSingle();
    if (cfgErr || !cfg) throw new Error("Configuração fiscal não encontrada");

    const reference = `viaair-${data.orderId.slice(0, 8)}-${Date.now()}`;
    const valorIss = Number((data.valorServicos * Number(cfg.aliquota_iss) / 100).toFixed(2));
    const xml = buildAtendenetXml({ cfg: cfg as Record<string, unknown>, data, reference, valorIss });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: insErr } = await supabaseAdmin
      .from("nfse_emissoes")
      .insert({
        order_id: data.orderId,
        reference,
        status: "processando",
        valor_servicos: data.valorServicos,
        valor_iss: valorIss,
        aliquota_iss: Number(cfg.aliquota_iss),
        tomador: data.tomador as unknown as never,
        discriminacao: data.discriminacao,
        created_by: context.userId,
      })
      .select().single();
    if (insErr) throw new Error(insErr.message);

    // Envia para o AtendeNet (POST multipart/form-data, campo "xml", Basic Auth)
    const { basic } = atendenetAuth();
    const form = new FormData();
    form.append("xml", new Blob([xml], { type: "application/xml" }), `${reference}.xml`);

    let respStatus = 0;
    let respBody = "";
    let networkError: string | null = null;
    try {
      const resp = await fetch(ATENDENET_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: "application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
        },
        body: form,
      });
      respStatus = resp.status;
      respBody = await resp.text();
    } catch (err) {
      networkError = err instanceof Error ? err.message : String(err);
    }

    const providerResponse = {
      provider: "atendenet",
      endpoint: ATENDENET_ENDPOINT,
      httpStatus: respStatus,
      networkError,
      bodyPreview: respBody.slice(0, 8000),
      sentXml: xml,
    };

    const ok = respStatus >= 200 && respStatus < 300 && !networkError;
    await supabaseAdmin.from("nfse_emissoes").update({
      focus_ref: reference,
      focus_status: String(respStatus || "network_error"),
      focus_response: providerResponse as unknown as never,
      status: ok ? "processando" : "erro",
    }).eq("id", row.id);

    if (!ok) {
      const msg = networkError
        || `Prefeitura respondeu ${respStatus}. ${respBody.slice(0, 300)}`;
      throw new Error(msg);
    }

    return { id: row.id, reference, status: "processando" as const };
  });

/* ============================== CONSULTAR (placeholder AtendeNet) ============================== */
export const consultarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("nfse_emissoes").select("*").eq("id", data.id).single();
    if (error || !row) throw new Error("Emissão não encontrada");
    // TODO: implementar consulta de RPS via AtendeNet (pedidoConsultaNfseRps)
    return { status: row.status, provider: "atendenet", pending: true };
  });

/* ============================== CANCELAR (placeholder AtendeNet) ============================== */
export const cancelarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; justificativa: string }) => d)
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin.data) throw new Error("Apenas administradores");

    const { data: row } = await context.supabase
      .from("nfse_emissoes").select("*").eq("id", data.id).single();
    if (!row) throw new Error("Emissão inválida");

    // TODO: implementar cancelamento via AtendeNet (pedidoCancelamentoNfse assinado)
    throw new Error("Cancelamento via AtendeNet ainda não implementado (assinatura digital pendente).");
  });
