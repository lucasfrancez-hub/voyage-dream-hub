/**
 * Tradução de textos do TripAdvisor para português do Brasil.
 * SERVER-ONLY — usa o Lovable AI Gateway. Em qualquer falha devolve o original.
 */

export async function translateToPt(texts: string[]): Promise<string[]> {
  const clean = texts.map((t) => (t || "").trim());
  if (clean.every((t) => !t)) return clean;
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return clean;
  try {
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const numbered = clean
      .map((value, index) => (value ? `[${index}] ${value.replace(/\s+/g, " ")}` : null))
      .filter(Boolean)
      .join("\n---\n");
    if (!numbered) return clean;

    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash-lite"),
      system:
        "Você é um tradutor. Traduza integralmente cada trecho para português do Brasil, preservando tom e conteúdo. Responda APENAS no mesmo formato: cada item começa com `[N]` (mesmo índice recebido) e itens separados por uma linha `---`. Não omita itens nem adicione comentários.",
      prompt: numbered,
    });

    const out = [...clean];
    const markers = [...text.matchAll(/(?:^|\n)\s*\[(\d+)\]\s*/g)];
    for (let i = 0; i < markers.length; i += 1) {
      const marker = markers[i];
      const idx = Number(marker[1]);
      const start = (marker.index ?? 0) + marker[0].length;
      const end = markers[i + 1]?.index ?? text.length;
      const val = text.slice(start, end).replace(/\n\s*-{2,}\s*$/g, "").trim();
      if (Number.isFinite(idx) && idx >= 0 && idx < out.length && val) out[idx] = val;
    }
    return out;
  } catch (err) {
    console.warn("[public-quote] translateToPt falhou:", (err as Error).message);
    return clean;
  }
}
