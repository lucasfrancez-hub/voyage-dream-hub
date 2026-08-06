/**
 * Importação retroativa do Instagram (DMs + comentários).
 *
 * Puxa o histórico direto da Graph API e grava em `instagram_conversations`,
 * `instagram_messages` e `instagram_comments`, espelhando as DMs no inbox do
 * chat. NÃO aciona a IA em nenhum momento — é só carga de histórico.
 */
const GRAPH = "https://graph.instagram.com/v21.0";

export type BackfillResult = {
  conta: string;
  conversas: number;
  mensagens: number;
  publicacoes: number;
  comentarios: number;
  erros: string[];
};

async function graph<T = Record<string, unknown>>(path: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
  const body = await res.text();
  if (!res.ok) throw new Error(`Graph ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body) as T;
}

type Paged<T> = { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } };

/** Percorre páginas até o limite indicado. */
async function paginar<T>(primeiraPath: string, token: string, maxPaginas: number): Promise<T[]> {
  const itens: T[] = [];
  let path: string | null = primeiraPath;
  for (let i = 0; i < maxPaginas && path; i++) {
    const page: Paged<T> = await graph<Paged<T>>(path, token);
    itens.push(...(page.data ?? []));
    const after = page.paging?.cursors?.after;
    path = page.paging?.next && after ? `${primeiraPath}&after=${encodeURIComponent(after)}` : null;
  }
  return itens;
}

type IGConversation = {
  id: string;
  updated_time?: string;
  participants?: { data?: Array<{ id: string; username?: string }> };
  messages?: {
    data?: Array<{
      id: string;
      created_time?: string;
      from?: { id: string; username?: string };
      to?: { data?: Array<{ id: string; username?: string }> };
      message?: string;
      attachments?: { data?: Array<{ image_data?: { url?: string }; video_data?: { url?: string }; file_url?: string }> };
    }>;
  };
};

type IGMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments?: { data?: Array<{ id: string; text?: string; timestamp?: string; username?: string; from?: { id?: string; username?: string }; parent_id?: string }> };
};

export async function backfillInstagramAccount(params: {
  /** username OU ig_user_id da conta já cadastrada. */
  conta: string;
  /** Quantas páginas de conversas/publicações puxar (25 itens por página). */
  paginas?: number;
  /** Espelhar as DMs no inbox do chat. */
  espelhar?: boolean;
}): Promise<BackfillResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const maxPaginas = Math.min(Math.max(params.paginas ?? 4, 1), 20);

  const { data: account } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, username, access_token")
    .or(`username.eq.${params.conta},ig_user_id.eq.${params.conta}`)
    .maybeSingle();
  if (!account?.access_token) throw new Error(`Conta ${params.conta} não encontrada ou sem token`);

  const result: BackfillResult = {
    conta: account.username ?? account.ig_user_id,
    conversas: 0,
    mensagens: 0,
    publicacoes: 0,
    comentarios: 0,
    erros: [],
  };
  const token = account.access_token;
  const meusIds = new Set([account.ig_user_id, account.page_id].filter(Boolean) as string[]);

  // ================= DMs =================
  try {
    const conversas = await paginar<IGConversation>(
      `/me/conversations?platform=instagram&limit=20&fields=${encodeURIComponent("id,updated_time,participants")}`,
      token,
      maxPaginas,
    );

    for (const conv of conversas) {
      // As mensagens vêm numa segunda chamada: pedir tudo junto estoura o
      // limite de payload da Graph API ("reduce the amount of data").
      try {
        const detalhe = await graph<IGConversation>(
          `/${conv.id}?fields=${encodeURIComponent("messages.limit(30){id,created_time,from,message}")}`,
          token,
        );
        conv.messages = detalhe.messages;
      } catch (e) {
        result.erros.push(`mensagens ${conv.id}: ${(e as Error).message}`);
      }
      const participantes = conv.participants?.data ?? [];
      // O próprio perfil aparece nos participantes com o id business; registra.
      for (const p of participantes) {
        if (p.username && account.username && p.username.toLowerCase() === account.username.toLowerCase()) {
          meusIds.add(p.id);
        }
      }
      const contato = participantes.find((p) => !meusIds.has(p.id));
      if (!contato) continue;

      const mensagens = (conv.messages?.data ?? []).slice().reverse();
      const ultima = mensagens[mensagens.length - 1];

      const { data: igConv, error: convErr } = await supabaseAdmin
        .from("instagram_conversations")
        .upsert(
          {
            account_id: account.id,
            contact_ig_id: contato.id,
            contact_username: contato.username ?? null,
            ig_thread_id: conv.id,
            last_message_at: conv.updated_time ?? ultima?.created_time ?? new Date().toISOString(),
            last_message_preview: (ultima?.message ?? "[mídia]").slice(0, 140),
          },
          { onConflict: "account_id,contact_ig_id" },
        )
        .select("id")
        .single();
      if (convErr || !igConv) {
        result.erros.push(`conversa ${conv.id}: ${convErr?.message ?? "falhou"}`);
        continue;
      }
      result.conversas++;

      const ids = mensagens.map((m) => m.id);
      const { data: jaSalvas } = ids.length
        ? await supabaseAdmin.from("instagram_messages").select("ig_message_id").in("ig_message_id", ids)
        : { data: [] as Array<{ ig_message_id: string | null }> };
      const existentes = new Set((jaSalvas ?? []).map((r) => r.ig_message_id));

      for (const m of mensagens) {
        if (existentes.has(m.id)) continue;
        const souEu = m.from?.id ? meusIds.has(m.from.id) : false;
        const anexo =
          m.attachments?.data?.[0]?.image_data?.url ??
          m.attachments?.data?.[0]?.video_data?.url ??
          m.attachments?.data?.[0]?.file_url ??
          null;

        const { error: msgErr } = await supabaseAdmin.from("instagram_messages").upsert(
          {
            conversation_id: igConv.id,
            ig_message_id: m.id,
            direction: souEu ? "outbound" : "inbound",
            message_type: anexo ? "image" : "text",
            text: m.message ?? null,
            attachment_url: anexo,
            status: souEu ? "sent" : "received",
            created_at: m.created_time ?? new Date().toISOString(),
          },
          { onConflict: "ig_message_id", ignoreDuplicates: true },
        );
        if (msgErr) {
          result.erros.push(`msg ${m.id}: ${msgErr.message}`);
          continue;
        }
        result.mensagens++;

        if (params.espelhar !== false) {
          try {
            const { mirrorInstagramMessage } = await import("./bridge.server");
            await mirrorInstagramMessage({
              igAccountRowId: account.id,
              igConversationId: igConv.id,
              contactIgId: contato.id,
              displayName: contato.username ? `@${contato.username}` : null,
              username: contato.username ?? null,
              direction: souEu ? "outbound" : "inbound",
              text: m.message ?? null,
              messageType: anexo ? "image" : "text",
              attachmentUrl: anexo,
              igMessageId: m.id,
              timestamp: m.created_time ? Date.parse(m.created_time) : null,
              skipProtocolo: true,
            });
          } catch (e) {
            result.erros.push(`espelho ${m.id}: ${(e as Error).message}`);
          }
        }
      }
    }
  } catch (e) {
    result.erros.push(`DMs: ${(e as Error).message}`);
  }

  // ================= Comentários =================
  try {
    const mediaFields =
      "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments.limit(50){id,text,timestamp,username,from,parent_id}";
    const midias = await paginar<IGMedia>(
      `/me/media?limit=25&fields=${encodeURIComponent(mediaFields)}`,
      token,
      maxPaginas,
    );

    for (const midia of midias) {
      const comentarios = midia.comments?.data ?? [];
      if (!comentarios.length) continue;
      result.publicacoes++;

      const ids = comentarios.map((c) => c.id);
      const { data: jaTem } = await supabaseAdmin
        .from("instagram_comments")
        .select("comment_id")
        .in("comment_id", ids);
      const existentes = new Set((jaTem ?? []).map((r) => r.comment_id));

      for (const c of comentarios) {
        if (existentes.has(c.id)) continue;
        const { error } = await supabaseAdmin.from("instagram_comments").insert({
          account_id: account.id,
          media_id: midia.id,
          comment_id: c.id,
          parent_comment_id: c.parent_id ?? null,
          from_ig_id: c.from?.id ?? null,
          from_username: c.username ?? c.from?.username ?? null,
          text: c.text ?? null,
          media_caption: midia.caption ?? null,
          media_thumbnail: midia.thumbnail_url ?? midia.media_url ?? null,
          media_type: midia.media_type ?? null,
          media_permalink: midia.permalink ?? null,
          created_at: c.timestamp ?? new Date().toISOString(),
          metadata: { origem: "backfill" },
        });
        if (error) {
          result.erros.push(`comentário ${c.id}: ${error.message}`);
          continue;
        }
        result.comentarios++;
      }
    }
  } catch (e) {
    result.erros.push(`Comentários: ${(e as Error).message}`);
  }

  return result;
}
