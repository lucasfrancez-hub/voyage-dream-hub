/**
 * Server functions para o dashboard/inbox/CRM.
 * Todas autenticadas via requireSupabaseAuth (RLS aplica).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FUNNEL_STAGE_KEYS } from "@/lib/chat/funnel-stages";

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_conversations")
      .select("id, wa_phone, display_name, mode, agent_slug, assigned_to, last_message_at, last_message_preview, unread_count, tags, person_id, funnel_stage, protocolo_ativo_id")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const convs = data ?? [];

    // Puxa números dos protocolos ativos (batch)
    const protoIds = Array.from(new Set(convs.map((c) => c.protocolo_ativo_id).filter((v): v is string => !!v)));
    const protoMap: Record<string, string> = {};
    if (protoIds.length > 0) {
      const { data: protos } = await context.supabase
        .from("wa_protocolos")
        .select("id, numero")
        .in("id", protoIds);
      for (const p of protos ?? []) protoMap[p.id] = p.numero;
    }
    return convs.map((c) => ({
      ...c,
      protocolo_numero: c.protocolo_ativo_id ? protoMap[c.protocolo_ativo_id] ?? null : null,
    }));
  });

export const listProtocolos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      status: z.enum(["aberto", "encerrado_inatividade", "encerrado_manual"]).optional(),
      search: z.string().optional(),
    }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("wa_protocolos")
      .select("id, numero, conversation_id, status, assunto_resumo, opened_at, last_activity_at, closed_at, funnel_stage_final")
      .order("opened_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("numero", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    // Junta com display_name/wa_phone da conversa
    const convIds = Array.from(new Set(list.map((r) => r.conversation_id)));
    const convMap: Record<string, { display_name: string | null; wa_phone: string }> = {};
    if (convIds.length > 0) {
      const { data: convs } = await context.supabase
        .from("wa_conversations")
        .select("id, display_name, wa_phone")
        .in("id", convIds);
      for (const c of convs ?? []) convMap[c.id] = { display_name: c.display_name, wa_phone: c.wa_phone };
    }
    return list.map((r) => ({
      ...r,
      cliente_nome: convMap[r.conversation_id]?.display_name ?? null,
      wa_phone: convMap[r.conversation_id]?.wa_phone ?? null,
    }));
  });

export const listProtocoloMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ protocolo_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    let { data: rows, error } = await context.supabase
      .from("wa_messages")
      .select("id, direction, sender, content, created_at, sender_user_id")
      .eq("protocolo_id", data.protocolo_id)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    // Fallback: protocolos antigos podem não ter mensagens vinculadas via protocolo_id.
    // Nesse caso, buscamos pela janela de tempo do protocolo dentro da conversa.
    if (!rows || rows.length === 0) {
      const { data: proto } = await context.supabase
        .from("wa_protocolos")
        .select("conversation_id, opened_at, closed_at")
        .eq("id", data.protocolo_id)
        .maybeSingle();
      if (proto?.conversation_id) {
        const { data: prev } = await context.supabase
          .from("wa_protocolos")
          .select("closed_at")
          .eq("conversation_id", proto.conversation_id)
          .lt("opened_at", proto.opened_at)
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const fromTs = prev?.closed_at ?? "1970-01-01T00:00:00Z";
        const toTs = proto.closed_at ?? new Date().toISOString();
        const { data: winRows } = await context.supabase
          .from("wa_messages")
          .select("id, direction, sender, content, created_at, sender_user_id")
          .eq("conversation_id", proto.conversation_id)
          .gt("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: true })
          .limit(1000);
        rows = winRows ?? [];
      }
    }

    const list = rows ?? [];
    const userIds = Array.from(new Set(list.map((m) => m.sender_user_id).filter((id): id is string => !!id)));
    const names: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) names[p.id] = p.full_name?.trim() || null;
    }
    return list.map((m) => ({ ...m, sender_full_name: m.sender_user_id ? names[m.sender_user_id] ?? null : null }));

  });

export const getActiveProtocolo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("wa_conversations")
      .select("protocolo_ativo_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!conv?.protocolo_ativo_id) return null;
    const { data: proto } = await context.supabase
      .from("wa_protocolos")
      .select("id, numero, status, assunto_resumo, numero_pedido, numero_reserva, opened_at, last_activity_at, resumo_conversa")
      .eq("id", conv.protocolo_ativo_id)
      .maybeSingle();
    return proto ?? null;
  });

export const listConversationProtocolos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wa_protocolos")
      .select("id, numero, status, assunto_resumo, numero_pedido, numero_reserva, opened_at, closed_at, resumo_conversa")
      .eq("conversation_id", data.conversation_id)
      .order("opened_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProtocoloDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ protocolo_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: proto, error } = await context.supabase
      .from("wa_protocolos")
      .select("id, numero, status, assunto_resumo, resumo_conversa, numero_pedido, numero_reserva, opened_at, closed_at, conversation_id")
      .eq("id", data.protocolo_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return proto ?? null;
  });



export const ensureProtocoloResumo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ protocolo_id: z.string().uuid(), force: z.boolean().optional() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: proto, error } = await supabaseAdmin
      .from("wa_protocolos")
      .select("id, assunto_resumo, resumo_conversa, status, conversation_id, opened_at, closed_at")
      .eq("id", data.protocolo_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proto) throw new Error("Protocolo não encontrado");

    const hasResumo = !!(proto.resumo_conversa ?? "").trim();
    const hasNecessidade = !!(proto.assunto_resumo ?? "").trim();
    if (!data.force && hasResumo && hasNecessidade) {
      return { ok: true, updated: false, resumo_conversa: proto.resumo_conversa, assunto_resumo: proto.assunto_resumo };
    }

    // 1) tenta pelas mensagens vinculadas ao protocolo
    let { data: msgs } = await supabaseAdmin
      .from("wa_messages")
      .select("direction, sender, content, created_at")
      .eq("protocolo_id", proto.id)
      .order("created_at", { ascending: true })
      .limit(300);

    // 2) fallback: se não há mensagens vinculadas, usa a janela da conversa
    //    (do fim do protocolo anterior até o closed_at deste, ou até agora se ainda aberto)
    if ((!msgs || msgs.length === 0) && proto.conversation_id) {
      const { data: prev } = await supabaseAdmin
        .from("wa_protocolos")
        .select("closed_at")
        .eq("conversation_id", proto.conversation_id)
        .lt("opened_at", proto.opened_at)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const fromTs = prev?.closed_at ?? "1970-01-01T00:00:00Z";
      const toTs = proto.closed_at ?? new Date().toISOString();
      const { data: winMsgs } = await supabaseAdmin
        .from("wa_messages")
        .select("direction, sender, content, created_at")
        .eq("conversation_id", proto.conversation_id)
        .gt("created_at", fromTs)
        .lte("created_at", toTs)
        .order("created_at", { ascending: true })
        .limit(300);
      msgs = winMsgs ?? [];
    }

    const transcript = (msgs ?? [])
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => {
        const who = m.direction === "inbound"
          ? "Cliente"
          : m.sender === "system"
            ? "Sistema"
            : m.sender === "human"
              ? "Atendente"
              : "IA";
        return `${who}: ${m.content}`;
      })
      .join("\n");

    if (!transcript.trim()) {
      return { ok: true, updated: false, resumo_conversa: proto.resumo_conversa, assunto_resumo: proto.assunto_resumo };
    }


    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const { text } = await generateText({
      model: gateway("openai/gpt-5.5"),
      prompt:
        "Analise a conversa abaixo entre um cliente da VIA AIR e o atendimento (IA/humano) e retorne APENAS um JSON válido (sem markdown, sem crase, sem texto extra) no formato:\n" +
        '{"necessidade":"...","resumo":"..."}\n\n' +
        "- necessidade: 1 a 2 frases curtas em português descrevendo o que o cliente precisa/quer.\n" +
        "- resumo: em português, tom objetivo, no máximo 6 bullets curtos separados por \\n, começando com \"• \". Inclua: o que o cliente queria, informações trocadas (datas, valores, localizadores, pedidos), o que foi resolvido e pendências. Sem saudações, sem cabeçalho.\n\n" +
        "CONVERSA:\n" + transcript,
    });

    let necessidadeIA: string | null = null;
    let resumoIA: string | null = null;
    try {
      const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const parsed = JSON.parse(raw) as { necessidade?: string; resumo?: string };
      necessidadeIA = (parsed.necessidade ?? "").trim() || null;
      resumoIA = (parsed.resumo ?? "").trim() || null;
    } catch {
      resumoIA = text.trim() || null;
    }

    const patch: { resumo_conversa?: string; assunto_resumo?: string } = {};
    if (resumoIA && (data.force || !hasResumo)) patch.resumo_conversa = resumoIA;
    if (necessidadeIA && (data.force || !hasNecessidade)) patch.assunto_resumo = necessidadeIA;

    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("wa_protocolos").update(patch).eq("id", proto.id);
    }
    return {
      ok: true,
      updated: Object.keys(patch).length > 0,
      resumo_conversa: patch.resumo_conversa ?? proto.resumo_conversa,
      assunto_resumo: patch.assunto_resumo ?? proto.assunto_resumo,
    };
  });

export const updateProtocoloDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      conversation_id: z.string().uuid(),
      protocolo_id: z.string().uuid(),
      numero_pedido: z.string().trim().max(100).nullable(),
      numero_reserva: z.string().trim().max(100).nullable(),
      assunto_resumo: z.string().trim().max(4000).nullable(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_protocolos")
      .update({
        numero_pedido: data.numero_pedido || null,
        numero_reserva: data.numero_reserva || null,
        assunto_resumo: data.assunto_resumo || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.protocolo_id)
      .eq("conversation_id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const getConversationOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("wa_conversations")
      .select("wa_phone, person_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!conv) return [];
    // Normaliza últimos 10 dígitos pra bater com variações de DDI/DDD
    const last10 = conv.wa_phone.replace(/\D/g, "").slice(-10);

    const { data: rows, error } = await context.supabase
      .from("orders")
      .select("id, order_number, airline_locator, status, trip_title, phone, created_at")
      .ilike("phone", `%${last10}`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });



export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wa_messages")
      .select("id, direction, sender, content, created_at, tool_calls, sender_user_id")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    // Puxa nomes dos humanos que enviaram alguma mensagem (batch).
    // Fallback: se profile.full_name estiver vazio, usa local-part do e-mail
    // (via supabaseAdmin) — assim o nome do atendente sempre aparece.
    const userIds = Array.from(
      new Set(list.map((m) => m.sender_user_id).filter((id): id is string => !!id)),
    );
    const names: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) names[p.id] = p.full_name?.trim() || null;

      const missing = userIds.filter((id) => !names[id]);
      if (missing.length > 0) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          for (const uid of missing) {
            const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
            const email = u?.user?.email ?? null;
            if (email) {
              const local = email.split("@")[0]!.replace(/[._-]+/g, " ");
              names[uid] = local.replace(/\b\w/g, (c) => c.toUpperCase());
            }
          }
        } catch {
          // silencioso — fallback só melhora UX
        }
      }
    }
    return list.map((m) => ({
      ...m,
      sender_full_name: m.sender_user_id ? names[m.sender_user_id] ?? null : null,
    }));
  });




export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    return { id: context.userId, full_name: data?.full_name ?? null };
  });

export const sendHumanReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      conversation_id: z.string().uuid(),
      content: z.string().min(1).max(4000),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error: cErr } = await context.supabase
      .from("wa_conversations")
      .select("id, wa_phone, mode")
      .eq("id", data.conversation_id)
      .single();
    if (cErr || !conv) throw new Error("Conversa não encontrada");

    // Nome do admin logado (pra prefixar o balão)
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");
    const { saveMessage } = await import("@/lib/whatsapp/conversation.server");
    const { buildSenderPrefix, capitalizeBubbles, capitalizeKnownNames } = await import("@/lib/whatsapp/text-utils.server");

    // Nome pra prefixar: full_name se tiver, senão local-part do email ("lucas@voeair.com" → "Lucas")
    const emailLocal = typeof context.claims.email === "string"
      ? context.claims.email.split("@")[0]?.replace(/[._-]+/g, " ")
      : null;
    const senderName = profile?.full_name?.trim() || emailLocal || null;

    // Pega nome do cliente pra capitalizar quando aparecer no texto
    const { data: convFull } = await context.supabase
      .from("wa_conversations")
      .select("display_name")
      .eq("id", conv.id)
      .maybeSingle();

    const content = capitalizeKnownNames(capitalizeBubbles(data.content), [convFull?.display_name?.split(/\s+/)[0]]);
    const prefix = buildSenderPrefix(senderName);

    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "human",
      content,
      sender_user_id: context.userId,
    });

    await sendWhatsAppBubbles(conv.wa_phone, content, prefix);
    return { ok: true };
  });

export const sendHumanMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      conversation_id: z.string().uuid(),
      kind: z.enum(["image", "document"]),
      filename: z.string().min(1).max(240),
      mime_type: z.string().min(1).max(120),
      /** conteúdo em base64 (sem prefixo data:) */
      data_base64: z.string().min(1),
      caption: z.string().max(1000).optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error: cErr } = await context.supabase
      .from("wa_conversations")
      .select("id, wa_phone")
      .eq("id", data.conversation_id)
      .single();
    if (cErr || !conv) throw new Error("Conversa não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsAppImage, sendWhatsAppDocument } = await import("@/lib/whatsapp/send.server");
    const { saveMessage } = await import("@/lib/whatsapp/conversation.server");

    // Upload no bucket privado
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${conv.id}/${Date.now()}-${safeName}`;
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(path, bytes, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

    // URL assinada válida por 24h (Meta baixa uma vez no ato)
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("chat-media")
      .createSignedUrl(path, 60 * 60 * 24);
    if (sErr || !signed?.signedUrl) throw new Error(`URL assinada falhou: ${sErr?.message ?? "?"}`);

    // Nome pra prefixar
    const { data: profile } = await context.supabase
      .from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const emailLocal = typeof context.claims.email === "string"
      ? context.claims.email.split("@")[0]?.replace(/[._-]+/g, " ") : null;
    const senderName = profile?.full_name?.trim() || emailLocal || null;
    const captionWithPrefix = senderName
      ? `*${senderName.split(/\s+/)[0]}:*${data.caption ? `\n${data.caption}` : ""}`
      : (data.caption ?? undefined);

    const sendRes = data.kind === "image"
      ? await sendWhatsAppImage(conv.wa_phone, signed.signedUrl, captionWithPrefix ?? null)
      : await sendWhatsAppDocument(conv.wa_phone, signed.signedUrl, data.filename, captionWithPrefix ?? null);

    if (sendRes.error) throw new Error(sendRes.error);

    // Marcador embutido pra UI renderizar o preview
    const marker = `[[media:${data.kind}|${signed.signedUrl}|${data.filename}]]`;
    const content = data.caption ? `${marker}\n${data.caption}` : marker;

    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "human",
      content,
      sender_user_id: context.userId,
      wa_message_id: sendRes.id,
    });

    return { ok: true };
  });

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("Número inválido");
  // Se veio sem DDI, assume Brasil (55)
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export const startOutboundConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      phone: z.string().min(8).max(20),
      display_name: z.string().max(120).optional().nullable(),
      content: z.string().min(1).max(4000),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone);
    const { getOrCreateConversation, saveMessage } = await import("@/lib/whatsapp/conversation.server");
    const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");
    const { buildSenderPrefix, capitalizeBubbles } = await import("@/lib/whatsapp/text-utils.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const conv = await getOrCreateConversation(phone, data.display_name ?? null);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const emailLocal = typeof context.claims.email === "string"
      ? context.claims.email.split("@")[0]?.replace(/[._-]+/g, " ")
      : null;
    const senderName = profile?.full_name?.trim() || emailLocal || null;
    const content = capitalizeBubbles(data.content);
    const prefix = buildSenderPrefix(senderName);

    // Conversa iniciada manualmente → modo humano por padrão (IA desligada).
    await supabaseAdmin
      .from("wa_conversations")
      .update({
        mode: "human",
        assigned_to: context.userId,
        display_name: data.display_name?.trim() || undefined,
      })
      .eq("id", conv.id);

    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "human",
      content,
      sender_user_id: context.userId,
    });

    await sendWhatsAppBubbles(phone, content, prefix);
    return { ok: true, conversation_id: conv.id };
  });


export const toggleConversationMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      conversation_id: z.string().uuid(),
      mode: z.enum(["ai", "human", "resolved"]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({
        mode: data.mode,
        assigned_to: data.mode === "human" ? context.userId : null,
      })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeProtocoloManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { saveMessage } = await import("@/lib/whatsapp/conversation.server");
    const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");

    const { data: conv, error: cErr } = await context.supabase
      .from("wa_conversations")
      .select("id, wa_phone, funnel_stage, protocolo_ativo_id")
      .eq("id", data.conversation_id)
      .single();
    if (cErr || !conv) throw new Error("Conversa não encontrada");
    if (!conv.protocolo_ativo_id) throw new Error("Nenhum protocolo ativo nessa conversa");

    const { data: proto } = await supabaseAdmin
      .from("wa_protocolos")
      .select("id, numero, status, assunto_resumo")
      .eq("id", conv.protocolo_ativo_id)
      .maybeSingle();
    if (!proto) throw new Error("Protocolo não encontrado");

    const encerramentoMsg =
      `Seu protocolo ${proto.numero} foi encerrado. ✅\n\n` +
      `Obrigado pelo contato com a VIA AIR! Se precisar de qualquer outra coisa, é só chamar por aqui que a gente abre um novo atendimento.`;

    await sendWhatsAppBubbles(conv.wa_phone, encerramentoMsg);

    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: encerramentoMsg,
      skip_protocolo: true,
    });

    // Gera resumo automático da conversa do protocolo via IA (+ necessidade do cliente se estiver vazia)
    let resumoConversa: string | null = null;
    let necessidadeIA: string | null = null;
    try {
      const { data: msgs } = await supabaseAdmin
        .from("wa_messages")
        .select("direction, sender, content, created_at")
        .eq("protocolo_id", proto.id)
        .order("created_at", { ascending: true })
        .limit(300);
      const transcript = (msgs ?? [])
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => {
          const who = m.direction === "inbound"
            ? "Cliente"
            : m.sender === "system"
              ? "Sistema"
              : m.sender === "human"
                ? "Atendente"
                : "IA";
          return `${who}: ${m.content}`;
        })
        .join("\n");

      const apiKey = process.env.LOVABLE_API_KEY;
      if (transcript.trim().length > 0 && apiKey) {
        const { generateText } = await import("ai");
        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(apiKey);
        const { text } = await generateText({
          model: gateway("openai/gpt-5.5"),
          prompt:
            "Analise a conversa abaixo entre um cliente da VIA AIR e o atendimento (IA/humano) e retorne APENAS um JSON válido (sem markdown, sem crase, sem texto extra) no formato:\n" +
            '{"necessidade":"...","resumo":"..."}\n\n' +
            "- necessidade: 1 a 2 frases curtas em português descrevendo o que o cliente precisa/quer (ex.: \"Cotação de pacote para Fernando de Noronha em janeiro/2027 para 2 adultos\").\n" +
            "- resumo: em português, tom objetivo, no máximo 6 bullets curtos separados por \\n, começando com \"• \". Inclua: o que o cliente queria, informações trocadas (datas, valores, localizadores, pedidos), o que foi resolvido e pendências. Sem saudações, sem cabeçalho.\n\n" +
            "CONVERSA:\n" + transcript,
        });
        try {
          const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
          const parsed = JSON.parse(raw) as { necessidade?: string; resumo?: string };
          necessidadeIA = (parsed.necessidade ?? "").trim() || null;
          resumoConversa = (parsed.resumo ?? "").trim() || null;
        } catch {
          resumoConversa = text.trim() || null;
        }
      }
    } catch (err) {
      console.error("[closeProtocoloManually] erro ao gerar resumo:", err);
    }

    const currentNecessidade = (proto.assunto_resumo ?? "").trim();
    const shouldFillNecessidade = !currentNecessidade && !!necessidadeIA;

    await supabaseAdmin
      .from("wa_protocolos")
      .update({
        status: "encerrado_manual",
        closed_at: new Date().toISOString(),
        funnel_stage_final: conv.funnel_stage ?? null,
        resumo_conversa: resumoConversa,
        ...(shouldFillNecessidade ? { assunto_resumo: necessidadeIA } : {}),
      })
      .eq("id", proto.id);

    await supabaseAdmin
      .from("wa_conversations")
      .update({ protocolo_ativo_id: null, mode: "resolved" })
      .eq("id", conv.id);

    return { ok: true, numero: proto.numero };
  });



export const setFunnelStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      conversation_id: z.string().uuid(),
      funnel_stage: z.enum(FUNNEL_STAGE_KEYS).nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({ funnel_stage: data.funnel_stage })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      conversation_id: z.string().uuid(),
      assigned_to: z.string().uuid().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wa_conversations")
      .update({
        assigned_to: data.assigned_to,
        mode: data.assigned_to ? "human" : "ai",
      })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAttendants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Só usuários com role "admin" (equipe interna VIA AIR) podem atender.
    // Parceiros/terceiros ficam de fora.
    const { data: roles, error: rErr } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rErr) throw new Error(rErr.message);
    const adminIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (adminIds.length === 0) return [];
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", adminIds)
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [conv, msg, contacts] = await Promise.all([
      context.supabase.from("wa_conversations").select("mode, agent_slug", { count: "exact" }),
      context.supabase
        .from("wa_messages")
        .select("created_at, sender, direction", { count: "exact" })
        .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()),
      context.supabase.from("people").select("id", { count: "exact", head: true }),
    ]);

    const conversations = conv.data ?? [];
    const messages = msg.data ?? [];

    const byDay: Record<string, number> = {};
    for (const m of messages) {
      const d = new Date(m.created_at).toISOString().slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + 1;
    }
    const daily = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      totalContacts: contacts.count ?? 0,
      totalConversations: conv.count ?? 0,
      openConversations: conversations.filter((c) => c.mode === "ai" || c.mode === "human").length,
      resolvedConversations: conversations.filter((c) => c.mode === "resolved").length,
      humanConversations: conversations.filter((c) => c.mode === "human").length,
      aiConversations: conversations.filter((c) => c.mode === "ai").length,
      messages14d: msg.count ?? 0,
      byAgent: {
        camila: conversations.filter((c) => c.agent_slug === "camila").length,
        roberto: conversations.filter((c) => c.agent_slug === "roberto").length,
      },
      daily,
    };
  });

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_agents")
      .select("*")
      .order("slug");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      nome: z.string().min(1),
      system_prompt: z.string().min(10),
      horario_inicio: z.string(),
      horario_fim: z.string(),
      ativo: z.boolean(),
      tom_voz: z.string().nullable().optional(),
      mensagem_ausencia: z.string().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_agents")
      .update({
        nome: data.nome,
        system_prompt: data.system_prompt,
        horario_inicio: data.horario_inicio,
        horario_fim: data.horario_fim,
        ativo: data.ativo,
        tom_voz: data.tom_voz ?? null,
        mensagem_ausencia: data.mensagem_ausencia ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
