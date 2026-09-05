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

async function rodar(request: Request): Promise<Response> {
  const esperado = process.env.UAZAPI_WEBHOOK_TOKEN;
  const url = new URL(request.url);
  const recebido = url.searchParams.get("token") ?? request.headers.get("x-uaz-token") ?? "";
  if (!esperado || recebido !== esperado) return new Response("Invalid token", { status: 401 });

  const limiteChats = Math.min(Number(url.searchParams.get("chats") ?? 100) || 100, 500);
  const limiteMsgs = Math.min(Number(url.searchParams.get("mensagens") ?? 40) || 40, 200);
  // Filtros opcionais: um número específico (?phone=55...) e/ou só mensagens
  // a partir de um instante (?desde=ISO ou epoch em ms).
  const filtroPhone = (url.searchParams.get("phone") ?? "").replace(/\D/g, "");
  const desdeRaw = url.searchParams.get("desde");
  const desdeMs = desdeRaw ? (Number(desdeRaw) || Date.parse(desdeRaw) || 0) : 0;

  const { uazListChats, uazListMessages } = await import("@/lib/whatsapp/uaz-channel.server");
  const { ingestUazMessage } = await import("@/lib/whatsapp/uaz-ingest.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const todos = await uazListChats(limiteChats);
  const chats = filtroPhone
    ? todos.filter((c) => (c.phone ?? c.chatid).replace(/\D/g, "").includes(filtroPhone))
    : todos;
  let importadas = 0;

  for (const chat of chats) {

    try {
      const mensagens = await uazListMessages(chat.chatid, limiteMsgs, chat.phone);
      let count = 0;
      for (const m of mensagens.sort((a, b) => a.timestampMs - b.timestampMs)) {
        const r = await ingestUazMessage({ ...m, senderName: m.senderName ?? chat.name }, { historico: true });
        if (r === "salva") count += 1;
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

  return Response.json({ chats: chats.length, mensagens_importadas: importadas });
}
