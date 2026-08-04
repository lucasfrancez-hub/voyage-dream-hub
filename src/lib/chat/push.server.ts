/**
 * Notificações push da Central de Atendimento.
 * SERVER-ONLY. Dispara para todos os aparelhos inscritos (celular + desktop).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enviarPush } from "@/lib/whatsapp/webpush.server";

type Args = {
  conversationId: string;
  titulo: string;
  corpo: string;
  canal?: "whatsapp" | "instagram";
};

function limpar(texto: string) {
  return texto
    .replace(/\[\[media:(audio|image|video|document)\|[^\]]*\]\]/g, (_m, tipo: string) =>
      tipo === "audio" ? "🎤 Áudio" : tipo === "image" ? "📷 Foto" : tipo === "video" ? "🎬 Vídeo" : "📎 Arquivo",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Avisa os atendentes de uma nova mensagem recebida. Nunca lança. */
export async function notificarNovaMensagemChat({ conversationId, titulo, corpo, canal = "whatsapp" }: Args) {
  try {
    const { data: subs } = await supabaseAdmin
      .from("wa_chat_push_subs")
      .select("id, endpoint, p256dh, auth, pref_novas, pref_instagram")
      .eq("ativo", true);
    if (!subs || subs.length === 0) return;

    const payload = {
      title: `${canal === "instagram" ? "📸 " : "💬 "}${titulo}`,
      body: limpar(corpo || "Nova mensagem"),
      url: `/chat/inbox?c=${conversationId}`,
      tag: `conv-${conversationId}`,
    };

    await Promise.allSettled(
      subs
        .filter((s) => (canal === "instagram" ? s.pref_instagram : s.pref_novas))
        .map(async (s) => {
          const r = await enviarPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
          if (r.gone) {
            await supabaseAdmin.from("wa_chat_push_subs").delete().eq("id", s.id);
          }
        }),
    );
  } catch (err) {
    console.error("[chat/push] falha:", err);
  }
}
