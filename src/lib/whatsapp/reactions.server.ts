/**
 * Reações (emoji) das mensagens do WhatsApp.
 *
 * As reações não são mensagens novas: elas ficam guardadas na própria
 * mensagem reagida, no campo `wa_messages.reactions` (jsonb).
 *
 * SERVER-ONLY.
 */

export type WaReacao = {
  emoji: string;
  /** quem reagiu: cliente (contato) ou nós */
  from: "customer" | "business";
  sender?: string | null;
  at: string;
};

export function parseReacoes(value: unknown): WaReacao[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const emoji = typeof o.emoji === "string" ? o.emoji : "";
    if (!emoji) return [];
    return [
      {
        emoji,
        from: o.from === "business" ? "business" : "customer",
        sender: typeof o.sender === "string" ? o.sender : null,
        at: typeof o.at === "string" ? o.at : new Date().toISOString(),
      } satisfies WaReacao,
    ];
  });
}

/** Aplica (ou remove, quando o emoji vem vazio) a reação de um autor. */
export function aplicarNaLista(
  atual: WaReacao[],
  nova: { emoji: string; from: "customer" | "business"; sender?: string | null; at?: string },
): WaReacao[] {
  // Cada lado só tem uma reação por mensagem — igual ao WhatsApp.
  const semAutor = atual.filter((r) => r.from !== nova.from);
  if (!nova.emoji) return semAutor;
  return [
    ...semAutor,
    { emoji: nova.emoji, from: nova.from, sender: nova.sender ?? null, at: nova.at ?? new Date().toISOString() },
  ];
}

/**
 * Registra no banco a reação a uma mensagem identificada pelo id do WhatsApp.
 * Aceita o id com ou sem o prefixo "owner:" usado pela UazAPI.
 */
export async function registrarReacaoPorWaId(args: {
  waMessageId: string;
  owner?: string | null;
  emoji: string;
  from: "customer" | "business";
  sender?: string | null;
  at?: string;
}): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bruto = args.waMessageId.trim();
  if (!bruto) return false;
  const partes = bruto.split(":");
  const semPrefixo = partes[partes.length - 1] ?? bruto;
  const candidatos = Array.from(
    new Set([bruto, semPrefixo, args.owner ? `${args.owner}:${semPrefixo}` : null].filter(Boolean)),
  ) as string[];

  let { data: row } = await supabaseAdmin
    .from("wa_messages")
    .select("id, reactions")
    .in("wa_message_id", candidatos)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // O webhook frequentemente entrega só o id final (3EB0...), enquanto as
  // mensagens sincronizadas ficam como "owner:3EB0...". Quando o evento não
  // traz `owner`, casa pelo sufixo para não perder a reação do cliente.
  if (!row && semPrefixo) {
    const fallback = await supabaseAdmin
      .from("wa_messages")
      .select("id, reactions")
      .like("wa_message_id", `%:${semPrefixo}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = fallback.data;
  }
  if (!row) return false;

  const lista = aplicarNaLista(parseReacoes((row as { reactions?: unknown }).reactions), {
    emoji: args.emoji,
    from: args.from,
    sender: args.sender ?? null,
    at: args.at,
  });

  const { error } = await supabaseAdmin
    .from("wa_messages")
    .update({ reactions: lista } as never)
    .eq("id", (row as { id: string }).id);
  return !error;
}
