import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(8000),
  target: z.enum(["en", "pt"]).default("en"),
});

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }): Promise<{ text: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente no servidor");

    const targetLabel = data.target === "en" ? "English" : "Portuguese (pt-BR)";
    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator for travel documents. " +
            "Translate the user's text faithfully, preserving line breaks, punctuation, " +
            "numbers, times and proper nouns. Do NOT add explanations or quotes. " +
            "If the text is already in the target language, return it unchanged.",
        },
        {
          role: "user",
          content: `Translate the following text to ${targetLabel}:\n\n${data.text}`,
        },
      ],
      temperature: 0.2,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na tradução (${res.status}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const out = (json.choices?.[0]?.message?.content ?? "").trim();
    return { text: out || data.text };
  });
