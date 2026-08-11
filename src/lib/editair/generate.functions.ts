import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Geração de mídia por IA para o EditAir.
 *
 * O resultado NUNCA é um vídeo final: é um ARQUIVO que entra na Biblioteca do
 * projeto como qualquer outra mídia e vira um clipe editável na timeline.
 */

const chave = () => {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY ausente no servidor");
  return k;
};

const erro = async (res: Response, oque: string) => {
  const txt = await res.text();
  if (res.status === 429) return new Error("Limite de uso da IA atingido. Tente em instantes.");
  if (res.status === 402) return new Error("Créditos da IA esgotados.");
  return new Error(`${oque} (${res.status}): ${txt.slice(0, 240)}`);
};

/* ------------------------------- imagem ------------------------------- */

export const gerarImagemEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ prompt: z.string().min(3).max(1200), formato: z.string().max(20).default("vertical") }).parse(input),
  )
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": chave(),
        "X-Lovable-AIG-SDK": "custom-fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: `Cena cinematográfica para vídeo ${data.formato}, alta qualidade, sem texto na imagem: ${data.prompt}`,
          },
        ],
      }),
    });
    if (!res.ok) throw await erro(res, "Falha ao gerar a imagem");
    const json = (await res.json()) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("A IA não devolveu imagem.");
    return { dataUrl: url };
  });

/* -------------------------------- vídeo -------------------------------- */

export const criarVideoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(1200),
        segundos: z.enum(["4", "6", "8"]).default("8"),
        vertical: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave()}` },
      body: JSON.stringify({
        model: "google/veo-3.1-lite",
        prompt: data.prompt,
        seconds: data.segundos,
        size: data.vertical ? "720x1280" : "1280x720",
      }),
    });
    if (!res.ok) throw await erro(res, "Falha ao iniciar a geração de vídeo");
    const job = (await res.json()) as { id?: string };
    if (!job.id) throw new Error("A IA não devolveu o job de vídeo.");
    return { id: job.id };
  });

export const statusVideoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(3).max(120) }).parse(input))
  .handler(async ({ data }): Promise<{ status: string; progresso: number; erro?: string; dataUrl?: string }> => {
    const key = chave();
    const res = await fetch(`https://ai.gateway.lovable.dev/v1/videos/${data.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw await erro(res, "Falha ao consultar o vídeo");
    const job = (await res.json()) as {
      status?: string;
      progress?: number;
      error?: { message?: string };
    };
    if (job.status !== "completed") {
      return {
        status: job.status ?? "in_progress",
        progresso: job.progress ?? 0,
        erro: job.error?.message,
      };
    }
    const bin = await fetch(`https://ai.gateway.lovable.dev/v1/videos/${data.id}/content`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!bin.ok) throw await erro(bin, "Falha ao baixar o vídeo gerado");
    const buf = new Uint8Array(await bin.arrayBuffer());
    let b = "";
    for (let i = 0; i < buf.length; i += 8192) b += String.fromCharCode(...buf.subarray(i, i + 8192));
    return { status: "completed", progresso: 100, dataUrl: `data:video/mp4;base64,${btoa(b)}` };
  });
