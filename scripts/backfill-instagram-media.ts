/**
 * Recupera áudios, fotos e vídeos do Instagram que ficaram no inbox do chat
 * apenas como rótulo ("[Áudio]", "[Foto]", "[Vídeo]"), baixando o arquivo do
 * link original da Meta enquanto ele ainda é válido.
 *
 * Uso: bun run scripts/backfill-instagram-media.ts [limite]
 */

const LIMITE = Number(process.argv[2] ?? 250);
const ROTULOS = ["[Áudio]", "[Foto]", "[Vídeo]", "[mídia do Instagram]"];

const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const { storeInboundMedia, transcribeAudio, extFromMime } = await import("../src/lib/whatsapp/media.server");

const { data: msgs } = await supabaseAdmin
  .from("wa_messages")
  .select("id,conversation_id,wa_message_id,message_type,content")
  .in("content", ROTULOS)
  .not("wa_message_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(LIMITE);

let ok = 0;
let falhou = 0;

for (const m of msgs ?? []) {
  try {
    const { data: ig } = await supabaseAdmin
      .from("instagram_messages")
      .select("attachment_url,attachment_type,text")
      .eq("ig_message_id", String(m.wa_message_id))
      .maybeSingle();

    const kind = ig?.attachment_type;
    if (!ig?.attachment_url || (kind !== "audio" && kind !== "image" && kind !== "video")) {
      falhou++;
      continue;
    }

    const resp = await fetch(ig.attachment_url);
    const blob = resp.ok ? await resp.blob() : null;
    if (!blob || blob.size === 0) {
      falhou++;
      continue;
    }

    const mime =
      kind === "audio" ? "audio/mp4" : blob.type || (kind === "video" ? "video/mp4" : "image/jpeg");
    const stored = await storeInboundMedia({
      conversationId: String(m.conversation_id),
      blob,
      mimeType: mime,
      filename: `ig-${kind}-${m.wa_message_id}.${extFromMime(mime)}`,
    });
    if (!stored) {
      falhou++;
      continue;
    }

    let texto =
      kind === "audio" ? "🎤 [áudio recebido]" : kind === "video" ? "🎬 [vídeo recebido]" : "🖼️ [imagem recebida]";
    let transcricao: string | null = null;
    if (kind === "audio") {
      transcricao = await transcribeAudio(blob, mime);
      if (transcricao) texto = `🎤 [áudio transcrito] ${transcricao}`;
    }

    await supabaseAdmin
      .from("wa_messages")
      .update({
        content: `[[media:${kind}|${stored.url}|${stored.filename}]]\n${texto}`,
        message_type: kind,
        ...(transcricao ? { transcricao } : {}),
      })
      .eq("id", m.id);
    ok++;
  } catch (err) {
    console.error("falha em", m.wa_message_id, (err as Error).message);
    falhou++;
  }
}

console.log(JSON.stringify({ total: msgs?.length ?? 0, recuperadas: ok, falharam: falhou }));
