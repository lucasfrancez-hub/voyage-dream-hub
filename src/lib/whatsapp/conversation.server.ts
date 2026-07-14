/**
 * Persistência de conversas e mensagens do WhatsApp.
 * SERVER-ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WaConversation = {
  id: string;
  wa_phone: string;
  person_id: string | null;
  display_name: string | null;
  mode: "ai" | "human" | "resolved";
  assigned_to: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  identity_verified_at: string | null;
  identity_verified_cpf: string | null;
  last_message_at: string;
  tags: string[];
};

export type WaMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "camila" | "human" | "system";
  content: string;
  wa_message_id: string | null;
  tool_calls: unknown | null;
  created_at: string;
};

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Tenta casar o número de WhatsApp com um registro em `people`.
 * Estratégia: comparar apenas dígitos e sufixo do telefone.
 */
async function findPersonByPhone(waPhone: string): Promise<{ id: string; name: string } | null> {
  const d = digits(waPhone);
  if (d.length < 8) return null;
  const suffix = d.slice(-9); // últimos 9 dígitos (DDD + número BR)

  const { data } = await supabaseAdmin
    .from("people")
    .select("id, name, phone, mobile_phone, business_phone")
    .or(
      `phone.ilike.%${suffix}%,mobile_phone.ilike.%${suffix}%,business_phone.ilike.%${suffix}%`,
    )
    .limit(1);

  const row = data?.[0];
  return row ? { id: row.id, name: row.name } : null;
}

/**
 * Busca a conversa por número; cria se não existir. Tenta vincular a `people`.
 */
export async function getOrCreateConversation(waPhone: string, profileName?: string | null): Promise<WaConversation> {
  const existing = await supabaseAdmin
    .from("wa_conversations")
    .select("*")
    .eq("wa_phone", waPhone)
    .maybeSingle();
  if (existing.data) return existing.data as WaConversation;

  const person = await findPersonByPhone(waPhone);
  const insert = await supabaseAdmin
    .from("wa_conversations")
    .insert({
      wa_phone: waPhone,
      person_id: person?.id ?? null,
      display_name: person?.name ?? profileName ?? null,
    })
    .select("*")
    .single();
  if (insert.error) throw new Error(`create conversation: ${insert.error.message}`);
  return insert.data as WaConversation;
}

/**
 * Salva mensagem. Dedupe por wa_message_id (idempotente para retentativas da Meta).
 */
export async function saveMessage(input: {
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "camila" | "human" | "system";
  content: string;
  wa_message_id?: string | null;
  tool_calls?: unknown | null;
  sender_user_id?: string | null;
}): Promise<WaMessage | null> {
  // Dedupe manual quando temos wa_message_id
  if (input.wa_message_id) {
    const existing = await supabaseAdmin
      .from("wa_messages")
      .select("id")
      .eq("wa_message_id", input.wa_message_id)
      .maybeSingle();
    if (existing.data) return null; // já processada
  }

  const { data, error } = await supabaseAdmin
    .from("wa_messages")
    .insert({
      conversation_id: input.conversation_id,
      direction: input.direction,
      sender: input.sender,
      content: input.content,
      wa_message_id: input.wa_message_id ?? null,
      tool_calls: (input.tool_calls ?? null) as never,
      sender_user_id: input.sender_user_id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[wa/saveMessage] error:", error.message);
    return null;
  }

  // Atualiza metadados da conversa
  await supabaseAdmin
    .from("wa_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: input.content.slice(0, 200),
      unread_count:
        input.direction === "inbound"
          ? // usar rpc para incremento seguro seria melhor; aqui simplificamos
            undefined
          : 0,
    })
    .eq("id", input.conversation_id);

  return data as WaMessage;
}

/**
 * Carrega histórico da conversa (para dar contexto ao modelo).
 */
export async function loadHistory(conversationId: string, limit = 30): Promise<WaMessage[]> {
  const { data } = await supabaseAdmin
    .from("wa_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as WaMessage[]).reverse();
}

/**
 * Registra transferência (Camila -> humano / humano -> Camila).
 */
export async function recordHandoff(input: {
  conversation_id: string;
  from_mode: string;
  to_mode: string;
  reason?: string;
  briefing?: string;
  actor?: string | null;
}): Promise<void> {
  await supabaseAdmin.from("wa_handoff_events").insert({
    conversation_id: input.conversation_id,
    from_mode: input.from_mode,
    to_mode: input.to_mode,
    reason: input.reason ?? null,
    briefing: input.briefing ?? null,
    actor: input.actor ?? null,
  });
}
