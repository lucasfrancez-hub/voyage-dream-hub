import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "./send.server";

const CLAIM = "__reenviando__";

/**
 * Varredor de balões que saíram do chatbot mas NÃO chegaram no WhatsApp.
 *
 * Acontecia quando o worker era cortado no meio da sequência de balões
 * (pausa humana + typing): a linha ficava salva com `wa_message_id` nulo e
 * sem erro, então na nossa central aparecia enviado e o cliente nunca recebia.
 * Aqui reenviamos essas linhas, com claim atômico pra não duplicar.
 */
export async function retryUndeliveredOutbound(limit = 15): Promise<number> {
  const agora = Date.now();
  const desde = new Date(agora - 30 * 60 * 1000).toISOString();
  const ate = new Date(agora - 25 * 1000).toISOString(); // dá tempo do envio normal terminar

  const { data: pendentes, error } = await supabaseAdmin
    .from("wa_messages")
    .select("id, conversation_id, content, sender, media_url, created_at")
    .eq("direction", "outbound")
    .is("wa_message_id", null)
    .is("error", null)
    .is("media_url", null)
    .is("deleted_at", null)
    .neq("sender", "system")
    .gte("created_at", desde)
    .lte("created_at", ate)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[wa/retry-undelivered] select:", error.message);
    return 0;
  }
  if (!pendentes?.length) return 0;

  let reenviados = 0;
  for (const row of pendentes) {
    const texto = (row.content ?? "").trim();
    if (!texto || texto.startsWith("⚠️")) continue;
    // Linhas de MÍDIA (artes de voo/hotel) nunca podem ser reenviadas como
    // texto — o marcador vazaria no WhatsApp como link quebrado. O reenvio
    // dessas artes é feito pelo fluxo de cartões (sendPendingFlightCards).
    if (/\[\[media:/i.test(texto)) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ error: "mídia não reenviada como texto" })
        .eq("id", row.id);
      continue;
    }

    // Claim atômico: só segue quem conseguir marcar a linha.
    const { data: claimed } = await supabaseAdmin
      .from("wa_messages")
      .update({ error: CLAIM })
      .eq("id", row.id)
      .is("wa_message_id", null)
      .is("error", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: conv } = await supabaseAdmin
      .from("wa_conversations")
      .select("wa_phone")
      .eq("id", row.conversation_id)
      .maybeSingle();
    if (!conv?.wa_phone) {
      await supabaseAdmin.from("wa_messages").update({ error: "sem telefone na conversa" }).eq("id", row.id);
      continue;
    }

    const res = await sendWhatsAppText(conv.wa_phone, texto);
    if (res.id) {
      await supabaseAdmin.from("wa_messages").update({ wa_message_id: res.id, error: null }).eq("id", row.id);
      reenviados++;
      console.log(`[wa/retry-undelivered] balão reenviado ${row.id} -> ${res.id}`);
    } else {
      await supabaseAdmin
        .from("wa_messages")
        .update({ error: res.error ?? "Não entregue pelo WhatsApp" })
        .eq("id", row.id);
      console.warn(`[wa/retry-undelivered] falhou ${row.id}:`, res.error);
    }
    // Espaço mínimo entre reenvios pra manter a ordem no aparelho do cliente.
    await new Promise((r) => setTimeout(r, 700));
  }
  return reenviados;
}
