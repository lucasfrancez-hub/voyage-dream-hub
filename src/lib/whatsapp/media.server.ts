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
