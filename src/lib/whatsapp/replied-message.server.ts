/**
 * Bloco estruturado da MENSAGEM RESPONDIDA pelo cliente (botão "Responder" do
 * WhatsApp). Toda a informação já existe em `wa_messages` — aqui a gente lê e
 * entrega pronta pro modelo, em vez de deixar a IA deduzir pelo histórico.
 *
 * Prioridade de resolução:
 *   1. reply_to_message_id (FK interna)
 *   2. reply_to_wa_id (id da Meta)
 * Se nada casar, NÃO chuta a última mensagem: registra `reply_context_not_found`.
 */

export type RepliedMessage = {
  id: string;
  content: string;
  message_type: string | null;
  product_type: string | null;
  quote_id: string | null;
  option_index: number | null;
  card_option: Record<string, unknown> | null;
  agent_name: string | null;
  agent_slug: string | null;
  sender: string;
  direction: string;
  source_tool: string | null;
  transcricao: string | null;
  resumo: string | null;
  created_at: string;
};

export type RepliedContext =
  | { found: true; message: RepliedMessage }
  | { found: false; reason: "no_reply" | "reply_context_not_found" };

export async function loadRepliedMessage(input: {
  conversation_id: string;
  reply_to_message_id?: string | null;
  reply_to_wa_id?: string | null;
}): Promise<RepliedContext> {
  const { reply_to_message_id, reply_to_wa_id } = input;
  if (!reply_to_message_id && !reply_to_wa_id) return { found: false, reason: "no_reply" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cols =
    "id, content, message_type, product_type, quote_id, option_index, card_option, agent_name, agent_slug, sender, direction, source_tool, transcricao, resumo, created_at";

  let row: RepliedMessage | null = null;

  if (reply_to_message_id) {
    const { data } = await supabaseAdmin
      .from("wa_messages")
      .select(cols)
      .eq("id", reply_to_message_id)
      .maybeSingle();
    row = (data as RepliedMessage | null) ?? null;
  }

  if (!row && reply_to_wa_id) {
    const { data } = await supabaseAdmin
      .from("wa_messages")
      .select(cols)
      .eq("wa_message_id", reply_to_wa_id)
      .eq("conversation_id", input.conversation_id)
      .maybeSingle();
    row = (data as RepliedMessage | null) ?? null;
  }

  if (!row) {
    console.log(
      JSON.stringify({
        event: "reply_context_not_found",
        conversation_id: input.conversation_id,
        reply_to_message_id: reply_to_message_id ?? null,
        reply_to_wa_id: reply_to_wa_id ?? null,
        at: new Date().toISOString(),
      }),
    );
    return { found: false, reason: "reply_context_not_found" };
  }

  return { found: true, message: row };
}

function fmtOption(card: Record<string, unknown> | null): string {
  if (!card) return "";
  const get = (k: string) => {
    const v = card[k];
    return v === null || v === undefined || v === "" ? null : String(v);
  };
  const linhas: string[] = [];
  const push = (label: string, ...keys: string[]) => {
    for (const k of keys) {
      const v = get(k);
      if (v) {
        linhas.push(`- ${label}: ${v}`);
        return;
      }
    }
  };
  push("companhia", "companhia", "airline", "cia");
  push("saída", "saida", "partida", "departure");
  push("chegada", "chegada", "arrival");
  push("volta (saída)", "volta_saida");
  push("volta (chegada)", "volta_chegada");
  push("datas", "datas", "data_ida", "periodo");
  push("valor", "valor_formatado", "valor", "preco");
  push("bagagem", "bagagem", "baggage");
  push("conexões", "conexoes", "paradas", "stops");
  push("duração", "duracao");
  return linhas.join("\n");
}

/** Bloco textual que vai ANTES do histórico, como referência principal. */
export function buildRepliedMessageBlock(ctx: RepliedContext): string {
  if (!ctx.found) {
    if (ctx.reason === "reply_context_not_found") {
      return (
        `\n\n## MENSAGEM RESPONDIDA PELO CLIENTE\n` +
        `O cliente respondeu a uma mensagem que não está no nosso histórico interno (reply_context_not_found).\n` +
        `NÃO deduza qual era a mensagem e NÃO assuma que é a última que enviamos. ` +
        `Se a referência for essencial pra responder, peça uma confirmação curta e natural ` +
        `("me confirma qual opção você quis dizer?"). Se não for essencial, siga normalmente.\n`
      );
    }
    return "";
  }

  const m = ctx.message;
  const quem =
    m.direction === "inbound"
      ? "o próprio cliente"
      : m.agent_name || (m.sender === "human" ? "atendente humano" : m.agent_slug || "VIA AIR");
  const conteudo = (m.transcricao || m.content || "").slice(0, 1500);
  const opcao = fmtOption(m.card_option);

  return (
    `\n\n## MENSAGEM RESPONDIDA PELO CLIENTE (REFERÊNCIA PRINCIPAL — use isto antes do histórico)\n` +
    `message_id: ${m.id}\n` +
    `quote_id: ${m.quote_id ?? "—"}\n` +
    `option_index: ${m.option_index ?? "—"}\n` +
    `agent_name: ${quem}\n` +
    `message_type: ${m.message_type ?? "text"}\n` +
    `product_type: ${m.product_type ?? "—"}\n` +
    `source_tool: ${m.source_tool ?? "—"}\n` +
    `enviada_em: ${new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
    (m.resumo ? `resumo: ${m.resumo}\n` : "") +
    `\nConteúdo original:\n"""\n${conteudo}\n"""\n` +
    (opcao ? `\nDados estruturados da opção:\n${opcao}\n` : "") +
    `\nREGRA: quando o cliente disser "quero essa", "essa tem bagagem?", "gostei dessa" ou qualquer ` +
    `referência ambígua, ela aponta para ESTA mensagem — não para a última do histórico e não para outra cotação. ` +
    `Não peça confirmação do que já está aqui.\n`
  );
}
