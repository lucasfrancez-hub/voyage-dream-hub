import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FOCUS_BASE = "https://api.focusnfe.com.br";
const IBGE_PARANAVAI = "4118402";

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

function authHeader() {
  const token = process.env.FOCUS_NFE_TOKEN;
  if (!token) throw new Error("FOCUS_NFE_TOKEN não configurado");
  return "Basic " + Buffer.from(`${token}:`).toString("base64");
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

/* ============================== EMITIR ============================== */
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

    const cpfCnpj = onlyDigits(data.tomador.cpfCnpj);
    const isPJ = cpfCnpj.length === 14;
    const reference = `viaair-${data.orderId.slice(0, 8)}-${Date.now()}`;
    const valorIss = Number((data.valorServicos * Number(cfg.aliquota_iss) / 100).toFixed(2));

    const payload: Record<string, unknown> = {
      data_emissao: new Date().toISOString(),
      prestador: {
        cnpj: onlyDigits(cfg.cnpj),
        inscricao_municipal: onlyDigits(cfg.inscricao_municipal),
        codigo_municipio: IBGE_PARANAVAI,
      },
      tomador: {
        [isPJ ? "cnpj" : "cpf"]: cpfCnpj,
        razao_social: data.tomador.razaoSocial,
        email: data.tomador.email || undefined,
        endereco: data.tomador.endereco ? {
          logradouro: data.tomador.endereco.logradouro || undefined,
          numero: data.tomador.endereco.numero || undefined,
          complemento: data.tomador.endereco.complemento || undefined,
          bairro: data.tomador.endereco.bairro || undefined,
          codigo_municipio: data.tomador.endereco.codigoMunicipio || IBGE_PARANAVAI,
          uf: data.tomador.endereco.uf || "PR",
          cep: onlyDigits(data.tomador.endereco.cep || "") || undefined,
        } : undefined,
      },
      servico: {
        aliquota: Number(cfg.aliquota_iss),
        iss_retido: "false",
        item_lista_servico: cfg.item_lista_servico,
        codigo_tributario_nacional: (cfg as { codigo_tributario_nacional?: string | null }).codigo_tributario_nacional || cfg.item_lista_servico,
        codigo_tributario_municipio: cfg.codigo_tributario_municipio || undefined,
        discriminacao: data.discriminacao,
        codigo_municipio: IBGE_PARANAVAI,
        valor_servicos: data.valorServicos,
        valor_iss: valorIss,
      },
    };

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

    const resp = await fetch(`${FOCUS_BASE}/v2/nfse?ref=${encodeURIComponent(reference)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader() },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));

    await supabaseAdmin.from("nfse_emissoes").update({
      focus_ref: reference,
      focus_status: String(body?.status ?? resp.status),
      focus_response: body,
      status: resp.ok || resp.status === 202 ? "processando" : "erro",
    }).eq("id", row.id);

    if (!resp.ok && resp.status !== 202) {
      throw new Error(body?.mensagem || body?.erros?.[0]?.mensagem || `Erro Focus (${resp.status})`);
    }

    return { id: row.id, reference, status: "processando" as const };
  });

/* ============================== CONSULTAR ============================== */
export const consultarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("nfse_emissoes").select("*").eq("id", data.id).single();
    if (error || !row) throw new Error("Emissão não encontrada");
    if (!row.reference) throw new Error("Sem referência Focus");

    const resp = await fetch(`${FOCUS_BASE}/v2/nfse/${encodeURIComponent(row.reference)}`, {
      headers: { Authorization: authHeader() },
    });
    const body = await resp.json().catch(() => ({}));

    const status = body?.status as string | undefined;
    let newStatus = row.status;
    if (status === "autorizado") newStatus = "autorizado";
    else if (status === "cancelado") newStatus = "cancelado";
    else if (status === "erro_autorizacao" || status === "erro") newStatus = "erro";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("nfse_emissoes").update({
      focus_status: status,
      focus_response: body,
      status: newStatus,
      numero_nfse: body?.numero || row.numero_nfse,
      serie: body?.serie || row.serie,
      codigo_verificacao: body?.codigo_verificacao || row.codigo_verificacao,
      chave_acesso: body?.chave_acesso || body?.chave || row.chave_acesso,
      data_emissao: body?.data_emissao || row.data_emissao,
      url_pdf: body?.url_danfse || body?.url || row.url_pdf,
      url_xml: body?.caminho_xml_nota_fiscal ? `${FOCUS_BASE}${body.caminho_xml_nota_fiscal}` : row.url_xml,
    }).eq("id", row.id);

    return { status: newStatus, focus_status: status, response: body };
  });

/* ============================== CANCELAR ============================== */
export const cancelarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; justificativa: string }) => d)
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin.data) throw new Error("Apenas administradores");

    const { data: row } = await context.supabase
      .from("nfse_emissoes").select("*").eq("id", data.id).single();
    if (!row?.reference) throw new Error("Emissão inválida");

    const resp = await fetch(`${FOCUS_BASE}/v2/nfse/${encodeURIComponent(row.reference)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: authHeader() },
      body: JSON.stringify({ justificativa: data.justificativa }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok && resp.status !== 202) {
      throw new Error(body?.mensagem || `Erro ao cancelar (${resp.status})`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("nfse_emissoes").update({
      status: "cancelando",
      motivo_cancelamento: data.justificativa,
      focus_response: body,
    }).eq("id", row.id);

    return { ok: true };
  });
