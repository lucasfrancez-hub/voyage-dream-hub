import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

export const generatePackageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ brief: z.string().min(2).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const system = `Você é copywriter da agência de viagens VIA AIR. Escreva um RESUMO CURTO e envolvente para um pacote turístico, em português do Brasil.
Regras:
- 2 a 3 frases, no máximo 350 caracteres.
- Tom aspiracional, elegante, sem exageros nem clichês ("paraíso", "imperdível", "único").
- Sem emojis, sem hashtags, sem markdown, sem aspas.
- Fale do destino, atmosfera, experiências marcantes. Não invente preços, datas, hotel ou companhia aérea.
- Responda APENAS com o texto final do resumo.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.brief },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Falha IA (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as any;
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("IA não retornou texto");
    return { text };
  });

export const searchCoverImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ query: z.string().min(2).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", data.query);
    url.searchParams.set("page_size", "24");
    url.searchParams.set("aspect_ratio", "wide");
    url.searchParams.set("size", "large");
    url.searchParams.set("license_type", "commercial");
    url.searchParams.set("mature", "false");

    const resp = await fetch(url.toString(), {
      headers: { "User-Agent": "VIA-AIR/1.0 (packages cover picker)" },
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Openverse ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as any;
    const results = Array.isArray(json?.results) ? json.results : [];
    const images = results
      .map((r: any) => ({
        thumb: (r?.thumbnail as string) || (r?.url as string) || "",
        url: (r?.url as string) || "",
        title: (r?.title as string) || "",
        source: (r?.source as string) || "",
        author: (r?.creator as string) || "",
      }))
      .filter((x: any) => x.url);
    return { images };
  });
