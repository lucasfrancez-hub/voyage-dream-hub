import { createFileRoute } from "@tanstack/react-router";

/**
 * Sincronização do histórico do WhatsApp (UazAPI).
 *
 * Importa as conversas e mensagens já existentes no aparelho conectado para o
 * chat interno. Tudo entra como HISTÓRICO: a IA não responde nada do que for
 * importado (regra da janela de silêncio em `ai-silence.server`).
 *
 * Chamada protegida por UAZAPI_WEBHOOK_TOKEN (`?token=`).
 */
export const Route = createFileRoute("/api/public/hooks/uaz-sync-history")({
  server: {
    handlers: {
      POST: async ({ request }) => rodar(request),
      GET: async ({ request }) => rodar(request),
    },
  },
});

const LOCK_ID = "__auto_lock";
const AUTO_INTERVALO_MS = 5 * 60_000;

async function rodar(request: Request): Promise<Response> {
  const esperado = process.env.UAZAPI_WEBHOOK_TOKEN;
  const url = new URL(request.url);
  const recebido = url.searchParams.get("token") ?? request.headers.get("x-uaz-token") ?? "";
  // Modo "rede de segurança": chamado pelo cron a cada poucos minutos, sem
  // token, mas com janela fixa (últimas 12h) e trava de 5 min contra abuso.
  const auto = url.searchParams.get("auto") === "1";
  if (!auto && (!esperado || recebido !== esperado)) return new Response("Invalid token", { status: 401 });

  const limiteChats = auto ? 200 : Math.min(Number(url.searchParams.get("chats") ?? 100) || 100, 500);
  const limiteMsgs = auto ? 60 : Math.min(Number(url.searchParams.get("mensagens") ?? 40) || 40, 200);
  // Filtros opcionais: um número específico (?phone=55...) e/ou só mensagens
  // a partir de um instante (?desde=ISO ou epoch em ms).
  const filtroPhone = auto ? "" : (url.searchParams.get("phone") ?? "").replace(/\D/g, "");
  const desdeRaw = url.searchParams.get("desde");
  const desdeMs = auto
    ? Date.now() - 12 * 3600_000
    : desdeRaw
      ? Number(desdeRaw) || Date.parse(desdeRaw) || 0
      : 0;

  const { uazListChats, uazListMessages } = await import("@/lib/whatsapp/uaz-channel.server");
  const { ingestUazMessage } = await import("@/lib/whatsapp/uaz-ingest.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (auto) {
    const { data: lock } = await supabaseAdmin
      .from("wa_history_sync")
      .select("last_synced_at")
      .eq("chat_id", LOCK_ID)
      .maybeSingle();
    const ultimo = lock?.last_synced_at ? new Date(lock.last_synced_at as string).getTime() : 0;
    if (Date.now() - ultimo < AUTO_INTERVALO_MS) return Response.json({ pulado: true });
    await supabaseAdmin
      .from("wa_history_sync")
      .upsert(
        { chat_id: LOCK_ID, wa_phone: LOCK_ID, imported: 0, last_synced_at: new Date().toISOString() },
        { onConflict: "chat_id" },
      );
  }


  const todos = await uazListChats(limiteChats);
  const chats = filtroPhone
    ? todos.filter((c) => (c.phone ?? c.chatid).replace(/\D/g, "").includes(filtroPhone))
    : todos;
  let importadas = 0;
  let corrigidas = 0;

  for (const chat of chats) {

    try {
      const mensagens = await uazListMessages(chat.chatid, limiteMsgs, chat.phone);
      let count = 0;
      for (const m of mensagens
        .filter((m) => !desdeMs || m.timestampMs >= desdeMs)
        .sort((a, b) => a.timestampMs - b.timestampMs)) {
        const r = await ingestUazMessage({ ...m, senderName: m.senderName ?? chat.name }, { historico: true });
        if (r === "salva") count += 1;
        // Conserta o horário de mensagens já importadas antes (entraram com a
        // hora do import e bagunçavam a ordem da conversa).
        if (r === "duplicada") {
          const real = new Date(m.timestampMs).toISOString();
          const { data: atual } = await supabaseAdmin
            .from("wa_messages")
            .select("id, created_at")
            .eq("wa_message_id", m.id)
            .maybeSingle();
          if (atual && Math.abs(new Date(atual.created_at as string).getTime() - m.timestampMs) > 60_000) {
            await supabaseAdmin.from("wa_messages").update({ created_at: real }).eq("id", atual.id as string);
            corrigidas += 1;
          }
        }
      }

      importadas += count;
      const phone = chat.phone ?? chat.chatid.split("@")[0];
      await supabaseAdmin.from("wa_history_sync").upsert(
        { chat_id: chat.chatid, wa_phone: phone, imported: count, last_synced_at: new Date().toISOString() },
        { onConflict: "chat_id" },
      );
    } catch (err) {
      console.error("[uaz-sync] conversa", chat.chatid, err instanceof Error ? err.message : err);
    }
  }

  return Response.json({ chats: chats.length, mensagens_importadas: importadas, horarios_corrigidos: corrigidas });
}
