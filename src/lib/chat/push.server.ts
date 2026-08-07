/**
 * Notificações Web Push da Central de Atendimento.
 * SERVER-ONLY. Dispara para todos os aparelhos inscritos (celular + desktop),
 * exceto para quem está com aquela mesma conversa aberta na tela.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enviarPush } from "@/lib/whatsapp/webpush.server";

type Args = {
  conversationId: string;
  titulo: string;
  corpo: string;
  canal?: "whatsapp" | "instagram" | "instagram_comentario";
  messageId?: string;
};

/** Evita disparo duplicado do mesmo evento dentro do mesmo processo. */
const jaEnviados = new Map<string, number>();
function duplicado(chave: string) {
  const agora = Date.now();
  for (const [k, t] of jaEnviados) if (agora - t > 5 * 60_000) jaEnviados.delete(k);
  if (jaEnviados.has(chave)) return true;
  jaEnviados.set(chave, agora);
  return false;
}

function limpar(texto: string) {
  return texto
    .replace(/\[\[media:(audio|image|video|document)\|[^\]]*\]\]/g, (_m, tipo: string) =>
      tipo === "audio" ? "🎤 Áudio" : tipo === "image" ? "📷 Foto" : tipo === "video" ? "🎬 Vídeo" : "📎 Arquivo",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/* Presença não bloqueia mais o envio: o atendente é sempre notificado,
   como no WhatsApp/Mac, mesmo com a conversa aberta. */


/** Total de conversas com mensagens não lidas — usado no badge do ícone. */
async function totalNaoLidas(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("wa_conversations")
    .select("id", { count: "exact", head: true })
    .gt("unread_count", 0);
  return count ?? 0;
}

/** Avisa os atendentes de uma nova mensagem recebida. Nunca lança. */
export async function notificarNovaMensagemChat({
  conversationId,
  titulo,
  corpo,
  canal = "whatsapp",
  messageId,
}: Args) {
  try {
    if (messageId && duplicado(messageId)) return;

    const { data: subs } = await supabaseAdmin
      .from("wa_chat_push_subs")
      .select("id, user_id, endpoint, p256dh, auth, pref_novas, pref_instagram, failure_count")
      .eq("ativo", true);
    if (!subs || subs.length === 0) return;

    const naoLidas = await totalNaoLidas();

    const payload = {
      title: `${canal === "instagram" ? "📸 " : "💬 "}${titulo}`,
      body: limpar(corpo || "Nova mensagem"),
      url: `/chat/inbox?c=${conversationId}`,
      tag: `conv-${conversationId}-${messageId ?? Date.now()}`,
      conversationId,
      messageId: messageId ?? null,
      unreadCount: naoLidas,
    };

    const alvos = subs.filter((s) => (canal === "instagram" ? s.pref_instagram : s.pref_novas));

    await Promise.allSettled(alvos.map((s) => despachar(s, payload)));
  } catch (err) {
    console.error("[chat/push] falha:", err);
  }
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; failure_count?: number | null };

/** Envia e cuida do ciclo de vida da assinatura (expirada / falha temporária). */
export async function despachar(sub: SubRow, payload: Record<string, unknown>) {
  const r = await enviarPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload as never);
  if (r.gone) {
    // 404/410 → assinatura morta: desativa (não apaga as dos outros aparelhos).
    await supabaseAdmin
      .from("wa_chat_push_subs")
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return r;
  }
  if (r.ok) {
    await supabaseAdmin
      .from("wa_chat_push_subs")
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .eq("id", sub.id);
  } else {
    const falhas = (sub.failure_count ?? 0) + 1;
    await supabaseAdmin
      .from("wa_chat_push_subs")
      .update({ failure_count: falhas, ativo: falhas < 10 })
      .eq("id", sub.id);
    console.warn("[chat/push] envio falhou", { status: r.status, falhas });
  }
  return r;
}
