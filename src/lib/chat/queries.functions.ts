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
    const { data: rows, error } = await context.supabase
      .from("wa_messages")
      .select("id, direction, sender, content, created_at")
      .eq("protocolo_id", data.protocolo_id)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return rows ?? [];
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
      .select("id, numero, status, assunto_resumo, opened_at, last_activity_at")
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
      .select("id, numero, status, assunto_resumo, opened_at, closed_at")
      .eq("conversation_id", data.conversation_id)
      .order("opened_at", { ascending: false })
      .limit(50);
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
      .select("id, numero, status")
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

    await supabaseAdmin
      .from("wa_protocolos")
      .update({
        status: "encerrado_manual",
        closed_at: new Date().toISOString(),
        funnel_stage_final: conv.funnel_stage ?? null,
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
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name")
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
