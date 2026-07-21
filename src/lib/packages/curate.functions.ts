import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

const PackageBrief = z.object({
  title: z.string(),
  destination: z.string(),
  origin: z.string().nullable().optional(),
  going_date: z.string().nullable().optional(),
  return_date: z.string().nullable().optional(),
  nights: z.number().nullable().optional(),
  price_per_person: z.number(),
  base_occupancy: z.number().nullable().optional(),
  hotel_name: z.string().nullable().optional(),
  hotel_stars: z.number().nullable().optional(),
  meal_plan: z.string().nullable().optional(),
  slug: z.string(),
});

export const generateCurationCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        channel: z.enum(["whatsapp", "instagram"]),
        groupTitle: z.string().min(1).max(120),
        groupReason: z.string().max(240).optional(),
        packages: z.array(PackageBrief).min(1).max(8),
        baseUrl: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const baseUrl = data.baseUrl?.replace(/\/$/, "") || "https://pedidos.viaair.tur.br";
    const fmtBRL = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtDate = (s?: string | null) => {
      if (!s) return "";
      const d = new Date(String(s) + "T12:00:00");
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    };

    const items = data.packages.map((p) => {
      const occ = p.base_occupancy ?? 2;
      const total = Number(p.price_per_person) * occ;
      const period = p.going_date
        ? `${fmtDate(p.going_date)}${p.return_date ? " a " + fmtDate(p.return_date) : ""}`
        : "";
      const stars = p.hotel_stars ? "★".repeat(Math.min(5, Math.max(1, p.hotel_stars))) : "";
      return {
        title: p.title,
        destination: p.destination,
        origin: p.origin || "",
        period,
        nights: p.nights ?? undefined,
        hotel: p.hotel_name ? `${p.hotel_name} ${stars}`.trim() : "",
        meal_plan: p.meal_plan || "",
        price_per_person: fmtBRL(Number(p.price_per_person)),
        total_price: fmtBRL(total),
        occupancy: occ,
        url: `${baseUrl}/pacotes/${p.slug}`,
      };
    });

    const channel = data.channel;
    const system =
      channel === "whatsapp"
        ? `Você é a Camila, consultora de viagens da VIA AIR. Escreva UMA mensagem pronta para enviar no WhatsApp apresentando um bloco de pacotes selecionados para o tema "${data.groupTitle}".
Regras:
- Português do Brasil, tom simpático e direto, sem exageros.
- Comece com uma saudação curta e o gancho do tema (1 linha).
- Para cada pacote, um bloco com 3-5 linhas contendo: título+destino, período e noites, hotel + regime, valor por pessoa (a partir de) e valor total para ${"{occupancy}"} pessoas, e o link.
- Separe os pacotes com uma linha em branco.
- Use emojis com moderação (✈️ 🏨 📅 💰 🔗) — no máximo um por linha.
- Ao final, uma linha convidando a responder pra confirmar.
- Sem markdown, sem asteriscos, sem hashtags. Pode usar caracteres unicode simples.
- NUNCA invente informação. Use SÓ os dados fornecidos.`
        : `Você é copywriter da VIA AIR. Escreva UMA legenda pronta para post do Instagram apresentando um bloco de pacotes selecionados para o tema "${data.groupTitle}".
Regras:
- Português do Brasil, tom inspirador mas objetivo.
- Comece com uma frase de gancho curta (1 linha, com 1 emoji).
- Para cada pacote, um bloco compacto (3 linhas): destino + período, hotel + regime, valor por pessoa e total para ${"{occupancy}"} pessoas.
- Separe os pacotes com linha em branco.
- Ao final: 1 linha de CTA ("Chama no direct" ou "Link na bio") e 5 a 8 hashtags relevantes (destinos, viagem, viaair).
- Sem markdown, sem asteriscos.
- NUNCA invente informação. Use SÓ os dados fornecidos.`;

    const userMsg =
      `Tema: ${data.groupTitle}\n` +
      (data.groupReason ? `Motivo da curadoria: ${data.groupReason}\n` : "") +
      `Pacotes (JSON):\n${JSON.stringify(items, null, 2)}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        temperature: 0.85,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      if (resp.status === 429) throw new Error("Limite de uso da IA. Tente em instantes.");
      if (resp.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`Falha IA (${resp.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await resp.json()) as any;
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("IA não retornou texto");
    return { text };
  });
