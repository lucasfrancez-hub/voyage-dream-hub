/**
 * Download e transcrição de mídia do WhatsApp (áudio, imagem, etc).
 * SERVER-ONLY.
 */

const GRAPH_VERSION = "v21.0";

/** Baixa uma mídia da Meta a partir do media_id do webhook. */
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ blob: Blob; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    console.error("[wa/media] WHATSAPP_ACCESS_TOKEN ausente");
    return null;
  }

  // 1) Obter URL temporária da mídia
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    console.error("[wa/media] meta lookup falhou:", metaRes.status, await metaRes.text().catch(() => ""));
    return null;
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  // 2) Baixar bytes (também precisa do token)
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!binRes.ok) {
    console.error("[wa/media] download falhou:", binRes.status);
    return null;
  }
  const blob = await binRes.blob();
  return { blob, mimeType: meta.mime_type ?? blob.type ?? "application/octet-stream" };
}

/**
 * Transcreve um áudio via Lovable AI Gateway (openai/gpt-4o-transcribe).
 * WhatsApp geralmente manda OGG/Opus; o modelo aceita ogg.
 */
export async function transcribeAudio(blob: Blob, mimeType: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("[wa/media] LOVABLE_API_KEY ausente");
    return null;
  }

  // Nome com extensão certa pra Meta/OpenAI reconhecerem o container.
  const extMap: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
  };
  const baseType = mimeType.split(";")[0].trim().toLowerCase();
  const ext = extMap[baseType] ?? "ogg";

  const form = new FormData();
  form.append("model", "openai/gpt-4o-transcribe");
  form.append("file", blob, `audio.${ext}`);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error("[wa/media] transcrição falhou:", res.status, raw.slice(0, 300));
      return null;
    }
    const data = JSON.parse(raw) as { text?: string };
    return data.text?.trim() ?? null;
  } catch (err) {
    console.error("[wa/media] exception transcrição:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Salva uma mídia recebida do cliente no bucket privado `chat-media`
 * e devolve uma URL assinada de longa duração pra renderizar no painel.
 */
export async function storeInboundMedia(params: {
  conversationId: string;
  blob: Blob;
  mimeType: string;
  filename: string;
}): Promise<{ url: string; filename: string } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName = params.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "arquivo";
    const path = `${params.conversationId}/in-${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await params.blob.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(path, bytes, { contentType: params.mimeType, upsert: false });
    if (upErr) {
      console.error("[wa/media] upload inbound falhou:", upErr.message);
      return null;
    }
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("chat-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr || !signed?.signedUrl) {
      console.error("[wa/media] signed url inbound falhou:", sErr?.message);
      return null;
    }
    return { url: signed.signedUrl, filename: safeName };
  } catch (err) {
    console.error("[wa/media] exception storeInboundMedia:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Extensão de arquivo a partir do mime-type. */
export function extFromMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/amr": "amr", "audio/wav": "wav", "audio/webm": "webm",
    "application/pdf": "pdf",
  };
  return map[base] ?? (base.split("/")[1] ?? "bin").replace(/[^a-z0-9]/g, "");
}
