import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Config sandbox vs produção.
// - Se CLICKSIGN_SANDBOX_API_TOKEN estiver setado e CLICKSIGN_ENV != "production", usa sandbox
// - Caso contrário, usa produção com CLICKSIGN_API_TOKEN
function getClickSignConfig(): { token: string; baseUrl: string; endpoint: string; env: "sandbox" | "production" } {
  const sandboxToken = process.env.CLICKSIGN_SANDBOX_API_TOKEN;
  const prodToken = process.env.CLICKSIGN_API_TOKEN;
  const forceProd = process.env.CLICKSIGN_ENV === "production";
  const useSandbox = !!sandboxToken && !forceProd;
  if (useSandbox) {
    return {
      token: sandboxToken!,
      baseUrl: "https://sandbox.clicksign.com/api/v1",
      endpoint: "https://sandbox.clicksign.com",
      env: "sandbox",
    };
  }
  if (!prodToken) throw new Error("CLICKSIGN_API_TOKEN não configurado");
  return {
    token: prodToken,
    baseUrl: "https://app.clicksign.com/api/v1",
    endpoint: "https://app.clicksign.com",
    env: "production",
  };
}

function agenciaConfig() {
  const email = process.env.AGENCIA_EMAIL_ASSINATURA;
  const nome = process.env.AGENCIA_NOME_ASSINATURA ?? "Viaair Turismo";
  if (!email) throw new Error("AGENCIA_EMAIL_ASSINATURA não configurado");
  return { email, nome };
}

async function csFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = getClickSignConfig();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${cfg.baseUrl}${path}${sep}access_token=${encodeURIComponent(cfg.token)}`;

  // Retry transitório: 502/503/504 (Gateway Time-out) + falhas de rede.
  // Backoff: 500ms, 1500ms, 3500ms. Total: até 3 tentativas extras.
  const MAX_ATTEMPTS = 4;
  const backoffs = [500, 1500, 3500];
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      if (res.ok) return text ? (JSON.parse(text) as T) : ({} as T);

      const transient = res.status === 502 || res.status === 503 || res.status === 504;
      console.error(`[ClickSign ${cfg.env}] ${res.status} ${path} (tentativa ${attempt + 1}/${MAX_ATTEMPTS}) → ${text.slice(0, 300)}`);
      if (transient && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, backoffs[attempt] ?? 3500));
        continue;
      }
      if (transient) {
        throw new Error("A ClickSign está temporariamente indisponível (gateway timeout). Tente novamente em alguns instantes.");
      }
      throw new Error(`ClickSign ${res.status}: ${text.slice(0, 300)}`);
    } catch (err) {
      lastErr = err;
      // Erro de rede/abort: tenta de novo se ainda houver tentativas
      const isNetwork = err instanceof TypeError;
      if (isNetwork && attempt < MAX_ATTEMPTS - 1) {
        console.error(`[ClickSign ${cfg.env}] network error ${path} (tentativa ${attempt + 1}/${MAX_ATTEMPTS})`, err);
        await new Promise((r) => setTimeout(r, backoffs[attempt] ?? 3500));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Falha ao chamar ClickSign");
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
    cliente: { nome: string; email: string; cpf: string; nascimento: string /* YYYY-MM-DD */; telefone: string };
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
          telefone: z.string().min(8, "Telefone (WhatsApp) do cliente é obrigatório"),
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

    // ClickSign: enviar só DDD + número (sem código do país 55).
    const rawPhoneDigits = data.cliente.telefone.replace(/\D/g, "");
    const phoneNational = rawPhoneDigits.length > 11 && rawPhoneDigits.startsWith("55")
      ? rawPhoneDigits.slice(2)
      : rawPhoneDigits;
    const phoneE164 = phoneNational;

    // 2) Cria signers
    type SignerResp = { signer: { key: string } };

    const clienteResp = await csFetch<SignerResp>("/signers", {
      method: "POST",
      body: JSON.stringify({
        signer: {
          email: data.cliente.email,
          phone_number: phoneE164,
          name: data.cliente.nome,
          documentation: cpfDigits,
          birthday: data.cliente.nascimento,
          has_documentation: true,
          auths: ["whatsapp"],
          liveness_enabled: true, // Prova de vida (selfie dinâmica com movimento)
          official_document_enabled: true, // Foto do documento oficial (RG/CNH)
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
          sign_as: "party",
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
          sign_as: "contractee",
          refusable: false,
        },
      }),
    });

    // 4) Dispara notificações — cliente via e-mail + WhatsApp; agência via e-mail
    await csFetch(`/notifications`, {
      method: "POST",
      body: JSON.stringify({
        request_signature_key: clienteList.list.request_signature_key,
        message: `Olá! Seu contrato do pedido ${data.orderNumber} está pronto para assinatura.`,
      }),
    });
    try {
      await csFetch(`/notify_by_whatsapp`, {
        method: "POST",
        body: JSON.stringify({
          request_signature_key: clienteList.list.request_signature_key,
        }),
      });
    } catch (err) {
      // WhatsApp pode falhar (número inválido, plano etc.) — não bloqueia o envio
      console.warn("[ClickSign] WhatsApp notify falhou:", err);
    }
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

    return { assinatura: { ...assinatura, signed_pdf_url: signedPdfUrl }, signers: (signers ?? []) as SignerRow[] };
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

// -----------------------------------------------------------------------------
// syncSignatureFromClickSign — busca status atual + baixa PDF assinado
// (útil quando o webhook não foi entregue)
// -----------------------------------------------------------------------------

export const syncSignatureFromClickSign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assinaturaId: string }) =>
    z.object({ assinaturaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: a } = await supabase
      .from("pedido_assinaturas")
      .select("id,pedido_id,clicksign_document_key,status,signed_pdf_path")
      .eq("id", data.assinaturaId)
      .maybeSingle();
    if (!a) throw new Error("Assinatura não encontrada");
    if (!a.clicksign_document_key) throw new Error("Sem document_key da ClickSign");

    type DocFull = {
      document: {
        key: string;
        status: string; // running | closed | canceled | refused
        finished_at?: string | null;
        downloads?: { signed_file_url?: string; original_file_url?: string };
        signers?: Array<{ key?: string; sign_at?: string | null; refusal?: string | null }>;
      };
    };
    const doc = await csFetch<DocFull>(`/documents/${a.clicksign_document_key}`, { method: "GET" });
    const csStatus = doc.document.status;

    const { data: signers } = await supabase
      .from("pedido_assinatura_signers")
      .select("id,clicksign_signer_key,status")
      .eq("assinatura_id", a.id);

    // Atualiza cada signatário
    for (const s of signers ?? []) {
      const match = doc.document.signers?.find((x) => x.key === s.clicksign_signer_key);
      if (!match) continue;
      if (match.sign_at && s.status !== "signed") {
        await supabase
          .from("pedido_assinatura_signers")
          .update({ status: "signed", signed_at: match.sign_at })
          .eq("id", s.id);
      } else if (match.refusal && s.status !== "refused") {
        await supabase
          .from("pedido_assinatura_signers")
          .update({ status: "refused", refused_at: new Date().toISOString() })
          .eq("id", s.id);
      }
    }

    // Se fechado, baixa PDF e anexa em Vouchers e contratos
    let downloadedPath: string | null = a.signed_pdf_path;
    if (csStatus === "closed" || csStatus === "auto_closed" || csStatus === "finished") {
      const signedUrl = doc.document.downloads?.signed_file_url;
      if (signedUrl) {
        try {
          const pdfRes = await fetch(signedUrl);
          if (pdfRes.ok) {
            const buf = new Uint8Array(await pdfRes.arrayBuffer());
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

            const path = `${a.pedido_id}/${a.clicksign_document_key}.pdf`;
            const { error: e1 } = await supabaseAdmin.storage
              .from("assinaturas")
              .upload(path, buf, { contentType: "application/pdf", upsert: true });
            if (!e1) downloadedPath = path;

            const friendlyName = `${Date.now()}-contrato-assinado.pdf`;
            const contratoPath = `${a.pedido_id}/${friendlyName}`;
            await supabaseAdmin.storage
              .from("order-documents")
              .upload(contratoPath, buf, { contentType: "application/pdf", upsert: true });
          }
        } catch (err) {
          console.error("[syncSignature] erro ao baixar PDF:", err);
        }
      }
      await supabase
        .from("pedido_assinaturas")
        .update({ status: "closed", ...(downloadedPath ? { signed_pdf_path: downloadedPath } : {}) })
        .eq("id", a.id);
    } else if (csStatus === "refused") {
      await supabase.from("pedido_assinaturas").update({ status: "refused" }).eq("id", a.id);
    } else if (csStatus === "canceled") {
      await supabase.from("pedido_assinaturas").update({ status: "canceled" }).eq("id", a.id);
    }

    return { ok: true, clicksignStatus: csStatus };
  });

// =============================================================================
// EMBEDDED WIDGET — usado no link de cartão seguro (/pagar).
// Fluxo público (sem auth): cliente preenche dados, gera PDF da autorização
// no browser, chama esta fn, abre o widget, assina, e depois a fn
// consumePendingAuthorizationSignature vincula o PDF assinado ao pedido
// quando o "Fazer pedido" é enviado.
// =============================================================================

export const getEmbeddedClickSignEndpoint = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = getClickSignConfig();
  return { endpoint: cfg.endpoint, env: cfg.env };
});

export const createEmbeddedAuthorization = createServerFn({ method: "POST" })
  .inputValidator((input: {
    pdfBase64: string;
    orderReference: string;
    cliente: { nome: string; email: string; cpf: string; nascimento: string; telefone: string };
    snapshot?: Record<string, unknown>;
  }) =>
    z
      .object({
        pdfBase64: z.string().min(100),
        orderReference: z.string().min(1).max(120),
        cliente: z.object({
          nome: z.string().min(2),
          email: z.string().email(),
          cpf: z.string().min(11),
          nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato YYYY-MM-DD"),
          telefone: z.string().min(8),
        }),
        snapshot: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const cfg = getClickSignConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Cria documento
    const docPath = `/autorizacoes/autorizacao-${data.orderReference}-${Date.now()}.pdf`;
    type DocResp = { document: { key: string; deadline_at: string; status: string } };
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 7);
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

    // 2) Cria signer com selfie liveness + foto do documento + geolocalização obrigatória
    const cpfDigits = data.cliente.cpf.replace(/\D/g, "");
    const rawPhoneDigits = data.cliente.telefone.replace(/\D/g, "");
    const phoneNational = rawPhoneDigits.length > 11 && rawPhoneDigits.startsWith("55")
      ? rawPhoneDigits.slice(2)
      : rawPhoneDigits;
    // Enviar telefone apenas com DDD + número (sem DDI 55), conforme padrão do projeto.
    const phoneE164 = phoneNational;

    type SignerResp = { signer: { key: string } };
    const signerResp = await csFetch<SignerResp>("/signers", {
      method: "POST",
      body: JSON.stringify({
        signer: {
          email: data.cliente.email,
          phone_number: phoneE164,
          name: data.cliente.nome,
          documentation: cpfDigits,
          birthday: data.cliente.nascimento,
          has_documentation: true,
          auths: ["whatsapp"],
          // Fluxo no widget:
          // 1) Confirmação dos dados (nome completo + CPF + data de nascimento) — automático porque has_documentation=true + birthday
          // 2) Prova de vida (liveness — selfie dinâmica)
          // 3) Foto do documento oficial (RG/CNH)
          liveness_enabled: true,
          official_document_enabled: true,
          location_required_enabled: true, // geolocalização OBRIGATÓRIA
          selfie_enabled: false, // usar liveness, não selfie estática
          handwritten_enabled: false, // sem assinatura manuscrita
        },
      }),
    });

    // 3) Vincula signer ao documento — sem enviar notificações (widget)
    type ListResp = { list: { request_signature_key: string } };
    const listResp = await csFetch<ListResp>("/lists", {
      method: "POST",
      body: JSON.stringify({
        list: {
          document_key: documentKey,
          signer_key: signerResp.signer.key,
          sign_as: "party",
          refusable: true,
          message: `Autorização de débito — ${data.orderReference}`,
          skip_email: true,
        },
      }),
    });
    const requestSignatureKey = listResp.list.request_signature_key;

    // 4) Persiste registro pendente
    const { data: pending, error } = await supabaseAdmin
      .from("pending_authorization_signatures")
      .insert({
        clicksign_document_key: documentKey,
        clicksign_signer_key: signerResp.signer.key,
        clicksign_request_signature_key: requestSignatureKey,
        status: "pending",
        snapshot: (data.snapshot ?? {}) as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      pendingId: pending.id,
      requestSignatureKey,
      documentKey,
      endpoint: cfg.endpoint,
      env: cfg.env,
    };
  });

export const getPendingAuthorizationStatus = createServerFn({ method: "GET" })
  .inputValidator((input: { pendingId: string }) =>
    z.object({ pendingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("pending_authorization_signatures")
      .select("id,status,signed_at,clicksign_document_key")
      .eq("id", data.pendingId)
      .maybeSingle();
    if (!row) throw new Error("Assinatura pendente não encontrada");
    return { id: row.id, status: row.status, signedAt: row.signed_at };
  });

// Chamada após o "Fazer pedido" — copia PDF assinado pro pedido e cria registro
// em pedido_assinaturas pra manter histórico consistente com o resto do sistema.
export const consumePendingAuthorizationSignature = createServerFn({ method: "POST" })
  .inputValidator((input: { pendingId: string; orderId: string }) =>
    z.object({ pendingId: z.string().uuid(), orderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pending, error: eGet } = await supabaseAdmin
      .from("pending_authorization_signatures")
      .select("*")
      .eq("id", data.pendingId)
      .maybeSingle();
    if (eGet) throw new Error(eGet.message);
    if (!pending) throw new Error("Assinatura pendente não encontrada");
    if (pending.status === "consumed") return { ok: true, alreadyConsumed: true };
    if (pending.status !== "signed") throw new Error("Assinatura ainda não foi concluída");
    if (!pending.signed_pdf_path) throw new Error("PDF assinado indisponível");

    // Copia PDF para storage do pedido (order-documents) para aparecer em "Vouchers e contratos"
    const { data: pdfBlob, error: eDl } = await supabaseAdmin.storage
      .from("assinaturas")
      .download(pending.signed_pdf_path);
    if (eDl || !pdfBlob) throw new Error(`Falha ao ler PDF assinado: ${eDl?.message ?? "desconhecido"}`);
    const buf = new Uint8Array(await pdfBlob.arrayBuffer());

    const friendly = `${Date.now()}-autorizacao-debito-assinada.pdf`;
    const contratoPath = `${data.orderId}/${friendly}`;
    await supabaseAdmin.storage
      .from("order-documents")
      .upload(contratoPath, buf, { contentType: "application/pdf", upsert: true });

    // Cria registro em pedido_assinaturas (closed) pra aparecer no card de assinaturas do pedido
    await supabaseAdmin.from("pedido_assinaturas").insert({
      pedido_id: data.orderId,
      clicksign_document_key: pending.clicksign_document_key,
      status: "closed",
      signed_pdf_path: pending.signed_pdf_path,
    });

    await supabaseAdmin
      .from("pending_authorization_signatures")
      .update({ status: "consumed", consumed_order_id: data.orderId })
      .eq("id", data.pendingId);

    return { ok: true };
  });
