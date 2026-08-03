/**
 * Janela de 24h da Meta (erro 131047).
 *
 * A Meta bloqueia mensagem livre quando o cliente não responde há mais de 24h.
 * Esse bloqueio é do WhatsApp, não nosso — a única forma oficial de falar é
 * mandar um MODELO (template) aprovado. Aqui ficam:
 *   - janelaAberta(): checa se ainda dá pra mandar texto livre
 *   - marcarAguardandoJanela(): põe a mensagem na fila de retomada
 *   - liberarFilaDaJanela(): quando o cliente responde, reenvia tudo que ficou
 *     preso por 131047 (últimas 48h), na ordem certa
 *
 * SERVER-ONLY.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "./send.server";

export const AGUARDANDO_JANELA = "[aguardando-janela-24h]";

/** Erro da Meta que indica janela fechada. */
export function ehErroJanela(msg?: string | null): boolean {
  if (!msg) return false;
  return /131047|24 hours have passed|24 horas/i.test(msg);
}

/** Última mensagem recebida do cliente nessa conversa (ISO) ou null. */
export async function ultimaEntradaCliente(conversationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("wa_messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}

/** true = dá pra mandar texto livre; false = só modelo aprovado. */
export async function janelaAberta(conversationId: string): Promise<boolean> {
  const last = await ultimaEntradaCliente(conversationId);
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < 24 * 60 * 60 * 1000;
}

/** Marca a mensagem como "vai sair assim que o cliente responder". */
export async function marcarAguardandoJanela(rowId: string): Promise<void> {
  await supabaseAdmin
    .from("wa_messages")
    .update({ error: AGUARDANDO_JANELA })
    .eq("id", rowId);
}

/**
 * Chamado quando chega mensagem do cliente: a janela reabriu, então tudo que
 * falhou por 131047 (ou ficou aguardando) nas últimas 48h é reenviado.
 */
export async function liberarFilaDaJanela(conversationId: string, waPhone: string): Promise<number> {
  const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: presas } = await supabaseAdmin
    .from("wa_messages")
    .select("id, content, error, reply_to_wa_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .not("error", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: true });

  const fila = (presas ?? []).filter(
    (m) => m.error === AGUARDANDO_JANELA || ehErroJanela(m.error as string),
  );
  if (!fila.length) return 0;

  let enviadas = 0;
  for (const m of fila) {
    const texto = (m.content ?? "").trim();
    if (!texto) continue;
    try {
      const res = await sendWhatsAppText(waPhone, texto, null);
      if (res.id) {
        await supabaseAdmin
          .from("wa_messages")
          .update({ wa_message_id: res.id, error: null, delivery_status: "sent" })
          .eq("id", m.id);
        enviadas++;
      } else {
        await supabaseAdmin.from("wa_messages").update({ error: res.error ?? "falha" }).eq("id", m.id);
      }
    } catch (err) {
      console.error("[janela-24h] falha ao reenviar", m.id, err);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`[janela-24h] fila liberada: ${enviadas} mensagem(ns) reenviada(s)`);
  return enviadas;
}
