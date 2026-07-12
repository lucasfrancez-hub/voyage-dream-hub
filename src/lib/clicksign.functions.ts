import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CLICKSIGN_BASE_URL = "https://app.clicksign.com/api/v1";

function getToken(): string {
  const token = process.env.CLICKSIGN_API_TOKEN;
  if (!token) throw new Error("CLICKSIGN_API_TOKEN não configurado");
  return token;
}

function agenciaConfig() {
  const email = process.env.AGENCIA_EMAIL_ASSINATURA;
  const nome = process.env.AGENCIA_NOME_ASSINATURA ?? "Viaair Turismo";
  if (!email) throw new Error("AGENCIA_EMAIL_ASSINATURA não configurado");
  return { email, nome };
}

async function csFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${CLICKSIGN_BASE_URL}${path}${sep}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[ClickSign] ${res.status} ${path} → ${text.slice(0, 500)}`);
    throw new Error(`ClickSign ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const sb = context.supabase as {
    rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "user" | "moderator" }) => Promise<{ data: boolean | null }>;
  };
  const { data: isAdmin } = await sb.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

// -----------------------------------------------------------------------------
// createSignatureRequest — recebe PDF gerado no browser (base64) e monta tudo
// -----------------------------------------------------------------------------

export const createSignatureRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    pedidoId: string;
    pdfBase64: string; // sem prefixo data:
    orderNumber: string;
    cliente: { nome: string; email: string; cpf: string; nascimento: string /* YYYY-MM-DD */ };
    deadlineDays?: number;
  }) =>
    z
      .object({
        pedidoId: z.string().uuid(),
        pdfBase64: z.string().min(100),
        orderNumber: z.string().min(1),
        cliente: z.object({
          nome: z.string().min(2),
          email: z.string().email(),
          cpf: z.string().min(11),
          nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato YYYY-MM-DD"),
        }),
        deadlineDays: z.number().int().min(1).max(90).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const agencia = agenciaConfig();

    // Impede duplicidade em andamento
    const { data: existing } = await supabase
      .from("pedido_assinaturas")
      .select("id,status")
      .eq("pedido_id", data.pedidoId)
      .in("status", ["draft", "running"])
      .maybeSingle();
    if (existing) throw new Error("Já existe uma assinatura em andamento para este pedido. Cancele-a antes de criar outra.");

    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + (data.deadlineDays ?? 15));

    // 1) Cria documento
    const docPath = `/pedidos/contrato-${data.orderNumber}-${Date.now()}.pdf`;
    type DocResp = { document: { key: string; deadline_at: string; status: string } };
    const docResp = await csFetch<DocResp>("/documents", {
      method: "POST",
      body: JSON.stringify({
        document: {
          path: docPath,
          content_base64: `data:application/pdf;base64,${data.pdfBase64}`,
          deadline_at: deadlineAt.toISOString(),
          auto_close: true,
          locale: "pt-BR",
          sequence_enabled: false,
        },
      }),
    });
    const documentKey = docResp.document.key;

    const cpfDigits = data.cliente.cpf.replace(/\D/g, "");

    // 2) Cria signers
    type SignerResp = { signer: { key: string } };

    const clienteResp = await csFetch<SignerResp>("/signers", {
      method: "POST",
      body: JSON.stringify({
        signer: {
          email: data.cliente.email,
          name: data.cliente.nome,
          documentation: cpfDigits,
          birthday: data.cliente.nascimento,
          has_documentation: true,
          auths: ["email"],
          selfie_enabled: true, // biometria dinâmica
        },
      }),
    });

    const agenciaResp = await csFetch<SignerResp>("/signers", {
      method: "POST",
      body: JSON.stringify({
        signer: {
          email: agencia.email,
          name: agencia.nome,
          has_documentation: false,
          auths: ["email"],
        },
      }),
    });

    // 3) Vincula ao documento (list)
    type ListResp = { list: { request_signature_key: string } };
    const clienteList = await csFetch<ListResp>("/lists", {
      method: "POST",
      body: JSON.stringify({
        list: {
          document_key: documentKey,
          signer_key: clienteResp.signer.key,
          sign_as: "party", // "parte"
          refusable: true,
          message: `Contrato e recibo do pedido ${data.orderNumber}. Por favor, revise e assine.`,
        },
      }),
    });
    const agenciaList = await csFetch<ListResp>("/lists", {
      method: "POST",
      body: JSON.stringify({
        list: {
          document_key: documentKey,
          signer_key: agenciaResp.signer.key,
          sign_as: "contractee", // "contratada"
          refusable: false,
        },
      }),
    });

    // 4) Dispara e-mails
    await csFetch(`/notifications`, {
      method: "POST",
      body: JSON.stringify({
        request_signature_key: clienteList.list.request_signature_key,
        message: `Olá! Seu contrato do pedido ${data.orderNumber} está pronto para assinatura.`,
      }),
    });
    await csFetch(`/notifications`, {
      method: "POST",
      body: JSON.stringify({
        request_signature_key: agenciaList.list.request_signature_key,
      }),
    });

    // 5) Persiste no banco
    const { data: assinatura, error: e1 } = await supabase
      .from("pedido_assinaturas")
      .insert({
        pedido_id: data.pedidoId,
        clicksign_document_key: documentKey,
        status: "running",
        deadline_at: deadlineAt.toISOString(),
        created_by: userId,
      })
      .select()
      .single();
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabase.from("pedido_assinatura_signers").insert([
      {
        assinatura_id: assinatura.id,
        clicksign_signer_key: clienteResp.signer.key,
        clicksign_request_signature_key: clienteList.list.request_signature_key,
        papel: "cliente",
        nome: data.cliente.nome,
        email: data.cliente.email,
        cpf: cpfDigits,
        nascimento: data.cliente.nascimento,
        sort_order: 0,
      },
      {
        assinatura_id: assinatura.id,
        clicksign_signer_key: agenciaResp.signer.key,
        clicksign_request_signature_key: agenciaList.list.request_signature_key,
        papel: "agencia",
        nome: agencia.nome,
        email: agencia.email,
        sort_order: 1,
      },
    ]);
    if (e2) throw new Error(e2.message);

    return { assinaturaId: assinatura.id, documentKey };
  });

// -----------------------------------------------------------------------------
// getSignatureStatus
// -----------------------------------------------------------------------------

export type SignerRow = {
  id: string;
  assinatura_id: string;
  clicksign_signer_key: string | null;
  clicksign_request_signature_key: string | null;
  papel: "cliente" | "agencia" | "testemunha";
  nome: string;
  email: string;
  cpf: string | null;
  nascimento: string | null;
  status: "pending" | "signed" | "refused";
  signed_at: string | null;
  refused_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const getSignatureStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pedidoId: string }) => z.object({ pedidoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: assinatura } = await supabase
      .from("pedido_assinaturas")
      .select("*")
      .eq("pedido_id", data.pedidoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!assinatura) return { assinatura: null, signers: [] as SignerRow[] };

    const { data: signers } = await supabase
      .from("pedido_assinatura_signers")
      .select("*")
      .eq("assinatura_id", assinatura.id)
      .order("sort_order", { ascending: true });

    // Se tem PDF assinado, gera signed URL curta
    let signedPdfUrl: string | null = null;
    if (assinatura.status === "closed" && assinatura.signed_pdf_path) {
      const { data: signed } = await supabase.storage
        .from("assinaturas")
        .createSignedUrl(assinatura.signed_pdf_path, 60 * 60);
      signedPdfUrl = signed?.signedUrl ?? null;
    }

    return { assinatura: { ...assinatura, signed_pdf_url: signedPdfUrl }, signers: signers ?? [] };
  });

// -----------------------------------------------------------------------------
// cancelSignatureRequest
// -----------------------------------------------------------------------------

export const cancelSignatureRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assinaturaId: string }) =>
    z.object({ assinaturaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: a } = await supabase
      .from("pedido_assinaturas")
      .select("clicksign_document_key,status")
      .eq("id", data.assinaturaId)
      .maybeSingle();
    if (!a) throw new Error("Assinatura não encontrada");
    if (a.status === "closed") throw new Error("Documento já foi assinado, não pode ser cancelado.");

    if (a.clicksign_document_key) {
      await csFetch(`/documents/${a.clicksign_document_key}/cancel`, { method: "POST" });
    }
    await supabase.from("pedido_assinaturas").update({ status: "canceled" }).eq("id", data.assinaturaId);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// resendSignerEmail
// -----------------------------------------------------------------------------

export const resendSignerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signerId: string }) =>
    z.object({ signerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: s } = await supabase
      .from("pedido_assinatura_signers")
      .select("clicksign_request_signature_key,status")
      .eq("id", data.signerId)
      .maybeSingle();
    if (!s) throw new Error("Signatário não encontrado");
    if (s.status === "signed") throw new Error("Este signatário já assinou.");
    if (!s.clicksign_request_signature_key) throw new Error("Chave da ClickSign ausente.");

    await csFetch(`/notifications`, {
      method: "POST",
      body: JSON.stringify({ request_signature_key: s.clicksign_request_signature_key }),
    });
    return { ok: true };
  });
