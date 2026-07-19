import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ATENDENET_ENDPOINT =
  "https://nfse-paranavai.atende.net/atende.php?pg=rest&service=WNERestServiceNFSe&cidade=padrao";
const IBGE_PARANAVAI = "4118402";

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const IBGE_CACHE = new Map<string, Map<string, string>>(); // uf -> (nomeNormalizado -> codigo)

async function resolveIbgeMunicipio(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): Promise<string | null> {
  const nome = (cidade ?? "").trim();
  const ufUp = (uf ?? "").trim().toUpperCase();
  if (!nome || ufUp.length !== 2) return null;
  const key = stripAccents(nome).toLowerCase().replace(/\s+/g, " ").trim();
  try {
    let map = IBGE_CACHE.get(ufUp);
    if (!map) {
      const r = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufUp}/municipios`,
      );
      if (!r.ok) return null;
      const arr = (await r.json()) as Array<{ id: number; nome: string }>;
      map = new Map();
      for (const m of arr) {
        map.set(stripAccents(m.nome).toLowerCase(), String(m.id));
      }
      IBGE_CACHE.set(ufUp, map);
    }
    return map.get(key) ?? null;
  } catch {
    return null;
  }
}


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

function atendenetAuth(cnpj?: string | null): { basic: string; usuario: string } {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  let usuario: string | undefined;
  let senha: string | undefined;
  let userVar = "NFSE_ATENDENET_USUARIO";
  let passVar = "NFSE_ATENDENET_PASSWORD";
  if (digits === "47430791000153") {
    // LFR TRAVEL SERVICES LTDA
    userVar = "NFSE_LFR_ATENDENET_USUARIO";
    passVar = "NFSE_LFR_ATENDENET_PASSWORD";
    usuario = process.env.NFSE_LFR_ATENDENET_USUARIO;
    senha = process.env.NFSE_LFR_ATENDENET_PASSWORD;
  } else {
    usuario = process.env.NFSE_ATENDENET_USUARIO;
    senha = process.env.NFSE_ATENDENET_PASSWORD;
  }
  if (!usuario || !senha) throw new Error(`Credenciais AtendeNet não configuradas (${userVar}/${passVar})`);
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
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const listNfseConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("nfse_config")
      .select("id, cnpj, razao_social, nome_fantasia, inscricao_municipal, item_lista_servico, aliquota_iss, municipio_prestacao, uf_prestacao, padrao, ativo")
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .order("razao_social", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ============================== EMITIR (AtendeNet / IPM 2.0) ============================== */
const emitirInput = z.object({
  orderId: z.string().uuid(),
  prestadorId: z.string().uuid().optional().nullable(),
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
  const endRaw = data.tomador.endereco ?? null;
  const cepDigits = onlyDigits(endRaw?.cep);
  // AtendeNet exige CEP válido (8 dígitos) quando endereco_informado=S.
  // Se não tiver CEP válido, marcamos como não informado para evitar erro 00161.
  const end = endRaw && cepDigits.length === 8 ? endRaw : null;
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
    ${end ? `<cep>${cepDigits}</cep>` : ""}
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

    let cfgQuery = context.supabase.from("nfse_config").select("*").eq("ativo", true);
    if (data.prestadorId) {
      cfgQuery = cfgQuery.eq("id", data.prestadorId);
    } else {
      cfgQuery = cfgQuery.order("padrao", { ascending: false });
    }
    const { data: cfg, error: cfgErr } = await cfgQuery.limit(1).maybeSingle();
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

    // Assinatura digital XMLDSig (enveloped) com o certificado A1 do prestador
    const { signNfseXml } = await import("@/lib/nfse-xmldsig.server");
    const xml = await signNfseXml(unsignedXml, (cfg as { cnpj?: string }).cnpj);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cfgRec = cfg as Record<string, unknown>;
    const prestadorSnap = {
      id: cfgRec.id ?? null,
      nome_fantasia: cfgRec.nome_fantasia ?? null,
      razao_social: cfgRec.razao_social ?? null,
      cnpj: cfgRec.cnpj ?? null,
      inscricao_municipal: cfgRec.inscricao_municipal ?? null,
      cnae_principal: cfgRec.cnae_principal ?? null,
      item_lista_servico: cfgRec.item_lista_servico ?? null,
      aliquota_iss: cfgRec.aliquota_iss ?? null,
      regime_especial: cfgRec.regime_tributario ?? null,
      optante_simples: cfgRec.regime_tributario === "simples_nacional",
      cep: cfgRec.cep ?? null,
      logradouro: cfgRec.logradouro ?? null,
      numero: cfgRec.numero ?? null,
      complemento: cfgRec.complemento ?? null,
      bairro: cfgRec.bairro ?? null,
      municipio: cfgRec.municipio_prestacao ?? null,
      uf: cfgRec.uf_prestacao ?? null,
      email: cfgRec.email ?? null,
      telefone: cfgRec.telefone ?? null,
    };

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
        prestador_id: (cfgRec.id as string | null) ?? null,
        prestador: prestadorSnap as unknown as never,
        created_by: context.userId,
      })
      .select().single();
    if (insErr) throw new Error(insErr.message);


    // Envia para o AtendeNet (POST multipart/form-data, campo "xml", Basic Auth)
    const { basic } = atendenetAuth((cfg as { cnpj?: string }).cnpj);
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
