import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ATENDENET_ENDPOINT =
  "https://nfse-paranavai.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao";
const IBGE_PARANAVAI = "4118402";

function onlyDigits(s: string | number | null | undefined) {
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

function brDateTime(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("day")}/${part("month")}/${part("year")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}

function ipmDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace(".", ",");
}

function responseTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim() || null;
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
    telefone: z.string().optional().nullable(),
    inscricaoMunicipal: z.string().optional().nullable(),
    endereco: z.object({
      logradouro: z.string().optional().nullable(),
      numero: z.string().optional().nullable(),
      complemento: z.string().optional().nullable(),
      bairro: z.string().optional().nullable(),
      cidade: z.string().optional().nullable(),
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
  numeroRps: number;
  serieRps: string;
  valorIss: number;
}): string {
  const { cfg, data, reference, numeroRps, serieRps, valorIss } = args;
  const cpfCnpj = onlyDigits(data.tomador.cpfCnpj);
  const isPJ = cpfCnpj.length === 14;
  const end = data.tomador.endereco ?? null;
  const issuedAt = brDateTime();

  const aliquota = Number(cfg.aliquota_iss ?? 4);
  const itemLc = onlyDigits(cfg.item_lista_servico as string);
  const codigoAtividade = onlyDigits(
    (cfg as { ipm_codigo_atividade?: string }).ipm_codigo_atividade
      ?? (cfg as { ipm_codigo_servico?: string }).ipm_codigo_servico
      ?? "23015",
  );
  const cidadeTomador = onlyDigits(end?.codigoMunicipio) || IBGE_PARANAVAI;

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfse id="nota">
  <identificador>${xmlEscape(reference)}</identificador>
  <rps>
    <nro_recibo_provisorio>${numeroRps}</nro_recibo_provisorio>
    <serie_recibo_provisorio>${xmlEscape(serieRps)}</serie_recibo_provisorio>
    <data_emissao_recibo_provisorio>${issuedAt.date}</data_emissao_recibo_provisorio>
    <hora_emissao_recibo_provisorio>${issuedAt.time}</hora_emissao_recibo_provisorio>
  </rps>
  <nf>
    <data_fato_gerador>${issuedAt.date}</data_fato_gerador>
    <valor_total>${ipmDecimal(data.valorServicos)}</valor_total>
    <valor_desconto>0,00</valor_desconto>
    <valor_ir>0,00</valor_ir>
    <valor_inss>0,00</valor_inss>
    <valor_contribuicao_social>0,00</valor_contribuicao_social>
    <valor_rps>0,00</valor_rps>
    <valor_pis>0,00</valor_pis>
    <valor_cofins>0,00</valor_cofins>
  </nf>
  <prestador>
    <cpfcnpj>${onlyDigits(cfg.cnpj as string)}</cpfcnpj>
    <cidade>${IBGE_PARANAVAI}</cidade>
  </prestador>
  <tomador>
    <endereco_informado>${end ? "S" : "N"}</endereco_informado>
    <tipo>${isPJ ? "J" : "F"}</tipo>
    <cpfcnpj>${cpfCnpj}</cpfcnpj>
    <nome_razao_social>${xmlEscape(data.tomador.razaoSocial)}</nome_razao_social>
    ${end?.logradouro ? `<logradouro>${xmlEscape(end.logradouro)}</logradouro>` : ""}
    ${data.tomador.email ? `<email>${xmlEscape(data.tomador.email)}</email>` : ""}
    ${end ? `<numero_residencia>${xmlEscape(end.numero || "S/N")}</numero_residencia>` : ""}
    ${end?.complemento ? `<complemento>${xmlEscape(end.complemento)}</complemento>` : ""}
    ${end?.bairro ? `<bairro>${xmlEscape(end.bairro)}</bairro>` : ""}
    ${end ? `<cidade>${cidadeTomador}</cidade>` : ""}
    ${end?.cep ? `<cep>${onlyDigits(end.cep)}</cep>` : ""}
  </tomador>
  <itens>
    <lista>
      <tributa_municipio_prestador>1</tributa_municipio_prestador>
      <codigo_local_prestacao_servico>${IBGE_PARANAVAI}</codigo_local_prestacao_servico>
      <codigo_item_lista_servico>${itemLc}</codigo_item_lista_servico>
      <codigo_atividade>${codigoAtividade}</codigo_atividade>
      <descritivo>${xmlEscape(data.discriminacao)}</descritivo>
      <aliquota_item_lista_servico>${ipmDecimal(aliquota, 4)}</aliquota_item_lista_servico>
      <situacao_tributaria>0</situacao_tributaria>
      <valor_tributavel>${ipmDecimal(data.valorServicos)}</valor_tributavel>
      <valor_deducao>0,00</valor_deducao>
      <valor_issrf>0,00</valor_issrf>
    </lista>
  </itens>
  <forma_pagamento>
    <tipo_pagamento>1</tipo_pagamento>
  </forma_pagamento>
</nfse>`;
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

    // Próximo número de RPS sequencial. O cadastro fiscal começa em 116.
    const { data: numeroRps, error: rpsErr } = await context.supabase.rpc("nfse_next_rps");
    if (rpsErr || typeof numeroRps !== "number") {
      throw new Error(`Falha ao obter número do RPS: ${rpsErr?.message ?? "resposta inválida"}`);
    }
    const serieRps = onlyDigits((cfg as { serie_rps?: string }).serie_rps).slice(0, 2) || "1";

    const unsignedXml = buildAtendenetXml({
      cfg: cfg as Record<string, unknown>,
      data,
      reference,
      numeroRps,
      serieRps,
      valorIss,
    });

    // Assinatura digital XMLDSig (enveloped) com o certificado A1
    const { signNfseXml } = await import("@/lib/nfse-xmldsig.server");
    const xml = await signNfseXml(unsignedXml);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: insErr } = await supabaseAdmin
      .from("nfse_emissoes")
      .insert({
        order_id: data.orderId,
        reference,
        status: "processando",
        numero_rps: numeroRps,
        serie: serieRps,
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

    const providerMessage = responseTag(respBody, "codigo") || responseTag(respBody, "mensagem");
    const numeroNfse = responseTag(respBody, "numero_nfse");
    const codigoVerificacao = responseTag(respBody, "cod_verificador_autenticidade");
    const urlNfse = responseTag(respBody, "link_nfse");
    const situacaoCodigo = responseTag(respBody, "situacao_codigo_nfse");
    // AtendeNet retorna "00001 - Sucesso" quando a nota é emitida com êxito.
    const providerSuccess = /^0*1\b|^0*1\s*-\s*Sucesso/i.test(providerMessage || "")
      || (!!numeroNfse && (situacaoCodigo === "1" || situacaoCodigo === ""));
    const providerRejected = !providerSuccess && Boolean(
      providerMessage
      || /XSD\s+Error|<erro\b|<erros\b|inv[aá]lid|rejeitad/i.test(respBody),
    );
    const httpOk = respStatus >= 200 && respStatus < 300 && !networkError;
    const ok = httpOk && !providerRejected;
    const finalStatus = ok ? (numeroNfse ? "autorizado" : "processando") : "erro";

    await supabaseAdmin.from("nfse_emissoes").update({
      focus_ref: reference,
      focus_status: String(respStatus || "network_error"),
      focus_response: providerResponse as unknown as never,
      status: finalStatus,
      numero_nfse: numeroNfse,
      codigo_verificacao: codigoVerificacao,
      url_pdf: urlNfse,
      data_emissao: numeroNfse ? new Date().toISOString() : null,
    }).eq("id", row.id);

    if (!ok) {
      const msg = networkError
        || providerMessage
        || `Prefeitura respondeu ${respStatus}. ${respBody.slice(0, 300)}`;
      throw new Error(msg);
    }

    return { id: row.id, reference, status: finalStatus, numeroNfse };
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

    // Cancelamento local (a NFS-e permanece emitida na prefeitura até implementarmos o pedidoCancelamentoNfse assinado).
    const { error: upErr } = await context.supabase
      .from("nfse_emissoes")
      .update({
        status: "cancelado",
        motivo_cancelamento: data.justificativa ?? null,
        cancelada_em: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, local: true, status: row.status };
  });

/* ============================== EXCLUIR (somente erro/cancelado) ============================== */
export const deleteNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin.data) throw new Error("Apenas administradores");

    const { data: row, error: selErr } = await context.supabase
      .from("nfse_emissoes").select("id,status").eq("id", data.id).maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row) throw new Error("Emissão não encontrada");
    if (row.status !== "erro" && row.status !== "cancelado") {
      throw new Error("Só é possível excluir emissões com erro ou canceladas.");
    }

    const { error } = await context.supabase
      .from("nfse_emissoes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
