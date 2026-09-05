/**
 * Recupera áudios/fotos/vídeos do Instagram que ficaram só como rótulo E cujo
 * registro em instagram_messages está sem attachment_url (o eco do webhook não
 * trouxe o link). Resolve a URL pela Graph API, baixa, guarda no bucket e
 * regrava a mensagem do inbox com o marcador [[media:…]].
 *
 * Uso: bun run scripts/backfill-instagram-media-sem-url.ts [limite]
 */

const LIMITE = Number(process.argv[2] ?? 50);
const ROTULOS = ["[Áudio]", "[Foto]", "[Vídeo]", "[mídia do Instagram]"];

const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const { storeInboundMedia, transcribeAudio, extFromMime } = await import("../src/lib/whatsapp/media.server");
const { fetchDmAttachmentUrl } = await import("../src/lib/instagram/api.server");

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
      .select("id,conversation_id,attachment_url,attachment_type,message_type")
      .eq("ig_message_id", String(m.wa_message_id))
      .maybeSingle();
    if (!ig || ig.attachment_url) {
      falhou++; // sem URL nova pra resolver aqui — o outro script cobre esse caso
      continue;
    }

    const kind = (ig.attachment_type ?? ig.message_type) as string | null;
    if (kind !== "audio" && kind !== "image" && kind !== "video") {
      falhou++;
      continue;
    }

    // Conta + thread pra consultar a Graph API.
    const { data: conv } = await supabaseAdmin
      .from("instagram_conversations")
      .select("ig_thread_id, account_id")
      .eq("id", ig.conversation_id)
      .maybeSingle();
    const { data: acc } = conv?.account_id
      ? await supabaseAdmin.from("instagram_accounts").select("access_token").eq("id", conv.account_id).maybeSingle()
      : { data: null };
    if (!acc?.access_token) {
      falhou++;
      continue;
    }

    const url = await fetchDmAttachmentUrl({
      messageId: String(m.wa_message_id),
      threadId: conv?.ig_thread_id ?? null,
      token: acc.access_token,
    });
    if (!url) {
      console.error("sem URL na Graph para", m.wa_message_id);
      falhou++;
      continue;
    }

    const resp = await fetch(url);
    const blob = resp.ok ? await resp.blob() : null;
    if (!blob || blob.size === 0) {
      falhou++;
      continue;
    }

    const mime = kind === "audio" ? "audio/mp4" : blob.type || (kind === "video" ? "video/mp4" : "image/jpeg");
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

    let texto = kind === "audio" ? "🎤 [áudio recebido]" : kind === "video" ? "🎬 [vídeo recebido]" : "🖼️ [imagem recebida]";
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

    await supabaseAdmin
      .from("instagram_messages")
      .update({ attachment_url: url, attachment_type: kind })
      .eq("id", ig.id);

    ok++;
  } catch (err) {
    console.error("falha em", m.wa_message_id, (err as Error).message);
    falhou++;
  }
}

console.log(JSON.stringify({ total: msgs?.length ?? 0, recuperadas: ok, falharam: falhou }));
