/**
 * Recupera o arquivo real (áudio, foto, vídeo, documento) das mensagens do
 * WhatsApp que ficaram salvas só como rótulo ("[Áudio]", "[Foto]"…) antes de o
 * download pela UazAPI ser corrigido.
 *
 * Uso: bun run scripts/backfill-uaz-media.ts [limite]
 */

const LIMITE = Number(process.argv[2] ?? 250);
const ROTULOS = ["[Áudio]", "[Foto]", "[Vídeo]", "[Documento]", "[Figurinha]"];

const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const { uazResolveMedia, uazDownloadMedia } = await import("../src/lib/whatsapp/uaz-channel.server");
const { storeInboundMedia, transcribeAudio, extFromMime } = await import("../src/lib/whatsapp/media.server");

const { data: msgs } = await supabaseAdmin
  .from("wa_messages")
  .select("id,conversation_id,wa_message_id,message_type,content")
  .in("message_type", ["audio", "image", "video", "document"])
  .in("content", ROTULOS)
  .not("wa_message_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(LIMITE);

let ok = 0;
let falhou = 0;

for (const m of msgs ?? []) {
  const tipo = String(m.message_type);
  try {
    const resolvida = await uazResolveMedia(String(m.wa_message_id));
    const media = resolvida?.url ? await uazDownloadMedia(resolvida.url) : null;
    if (!media) {
      falhou++;
      continue;
    }
    const mime = resolvida?.mimeType ?? media.mimeType ?? "application/octet-stream";
    const stored = await storeInboundMedia({
      conversationId: String(m.conversation_id),
      blob: media.blob,
      mimeType: mime,
      filename: `${tipo}-${m.wa_message_id}.${extFromMime(mime)}`,
    });
    if (!stored) {
      falhou++;
      continue;
    }

    let texto = String(m.content);
    let transcricao: string | null = null;
    if (tipo === "audio") {
      transcricao = await transcribeAudio(media.blob, mime);
      texto = transcricao ? `🎤 [áudio transcrito] ${transcricao}` : "🎤 [áudio recebido]";
    }

    await supabaseAdmin
      .from("wa_messages")
      .update({
        content: `[[media:${tipo}|${stored.url}|${stored.filename}]]\n${texto}`,
        ...(transcricao ? { transcricao } : {}),
      })
      .eq("id", m.id);
    ok++;
  } catch (err) {
    console.error("falha em", m.wa_message_id, err);
    falhou++;
  }
}

console.log(JSON.stringify({ total: msgs?.length ?? 0, recuperadas: ok, falharam: falhou }));
