/**
 * Transcrição/leitura de vídeo (reels) de uma publicação do Instagram.
 *
 * Antes de responder qualquer comentário de vídeo, a IA precisa ASSISTIR o
 * reel: o que foi falado, o que aparece na tela e qual é a oferta. Sem isso a
 * resposta sai genérica.
 *
 * Falha nunca derruba o fluxo — devolve null e a resposta segue só com a legenda.
 * SERVER-ONLY.
 */

const MAX_BYTES = 18 * 1024 * 1024;
const MODEL = "google/gemini-2.5-flash";
const cache = new Map<string, string | null>();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function pedirAoModelo(bloco: Record<string, unknown>, key: string): Promise<string | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Assista este vídeo do Instagram e devolva em português: (1) TRANSCRIÇÃO do que é falado; " +
                "(2) o que aparece na tela (destinos, preços, datas, condições); (3) qual é a oferta/assunto em 1 frase. " +
                "Seja objetivo, sem enfeite.",
            },
            bloco,
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

/** Baixa o reel e devolve a transcrição + descrição visual. */
export async function transcreverVideoDaPublicacao(params: {
  mediaId: string;
  mediaUrl: string | null;
  mediaType: string | null;
}): Promise<string | null> {
  const ehVideo = (params.mediaType ?? "").toUpperCase().includes("VIDEO") ||
    (params.mediaType ?? "").toUpperCase().includes("REEL");
  if (!ehVideo || !params.mediaUrl) return null;
  if (cache.has(params.mediaId)) return cache.get(params.mediaId) ?? null;

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;

  try {
    const arquivo = await fetch(params.mediaUrl);
    if (!arquivo.ok) throw new Error(`download ${arquivo.status}`);
    const buf = await arquivo.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error(`vídeo grande demais (${buf.byteLength})`);
    const dataUrl = `data:video/mp4;base64,${toBase64(buf)}`;

    let texto: string | null = null;
    try {
      texto = await pedirAoModelo(
        { type: "file", file: { filename: "reel.mp4", file_data: dataUrl } },
        key,
      );
    } catch {
      // Alguns provedores esperam o bloco de vídeo por URL.
      texto = await pedirAoModelo({ type: "video_url", video_url: { url: params.mediaUrl } }, key);
    }

    cache.set(params.mediaId, texto);
    return texto;
  } catch (e) {
    console.error("[ig-video] transcrição falhou:", (e as Error).message);
    cache.set(params.mediaId, null);
    return null;
  }
}
