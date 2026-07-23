/**
 * Gerador de sugestões de disparo para broadcast.
 *
 * Estratégia (100% grátis):
 * 1. Lista origens distintas dos pacotes ativos (canonizadas).
 * 2. Pra cada origem, pede pra IA (Gemini via Lovable AI Gateway) rankear
 *    os destinos mais promissores entre os pacotes já cadastrados —
 *    considerando sazonalidade brasileira, preço e apelo.
 * 3. Recomenda canais (WhatsApp/Feed/Story) e melhor horário fixo por canal.
 * 4. Insere como `pending` na tabela `broadcast_suggestions` pra aprovação.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { canonOrigin, originKey } from "@/lib/packages/origin";

// Janelas fixas comprovadas por canal — evita depender de dado histórico.
const TIME_SLOTS: Record<string, { day: string; time: string }> = {
  whatsapp: { day: "Terça ou Quinta", time: "10:00" },
  whatsapp_pm: { day: "Terça ou Quinta", time: "19:00" },
  instagram_feed: { day: "Quarta ou Sexta", time: "12:00" },
  instagram_story: { day: "Segunda a Sexta", time: "08:00" },
  instagram_story_pm: { day: "Segunda a Sexta", time: "21:00" },
};

const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      package_id: z.string(),
      channel: z.enum(["whatsapp", "instagram_feed", "instagram_story"]),
      reasoning: z.string(),
      period: z.enum(["morning", "evening"]),
    }),
  ),
});

type PackageRow = {
  id: string;
  destination: string;
  origin: string | null;
  going_date: string | null;
  price_per_person: number;
  nights: number | null;
  hotel_name: string | null;
  supplier_name: string | null;
};

export async function generateBroadcastSuggestions(userId: string | null) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  // 1. Pacotes ativos
  const { data: pkgs, error } = await supabaseAdmin
    .from("packages")
    .select("id, destination, origin, going_date, price_per_person, nights, hotel_name, supplier_name")
    .eq("is_active", true)
    .order("going_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const packages = (pkgs ?? []) as PackageRow[];
  if (packages.length === 0) {
    return { created: 0, skipped: 0, message: "Nenhum pacote ativo cadastrado." };
  }

  // 2. Agrupa por origem canonizada
  const byOrigin = new Map<string, { label: string; items: PackageRow[] }>();
  for (const p of packages) {
    const label = canonOrigin(p.origin);
    if (!label) continue;
    const key = originKey(p.origin);
    if (!byOrigin.has(key)) byOrigin.set(key, { label, items: [] });
    byOrigin.get(key)!.items.push(p);
  }
  if (byOrigin.size === 0) {
    return { created: 0, skipped: 0, message: "Nenhum pacote com origem definida." };
  }

  // 3. Descarta pacotes que já têm sugestão pendente/aprovada nos últimos 14 dias
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("broadcast_suggestions")
    .select("package_id")
    .in("status", ["pending", "approved"])
    .gte("created_at", cutoff);
  const recentIds = new Set((recent ?? []).map((r) => r.package_id).filter(Boolean));

  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3.6-flash");

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  let created = 0;
  let skipped = 0;

  for (const { label, items } of byOrigin.values()) {
    const candidates = items.filter((p) => !recentIds.has(p.id));
    if (candidates.length === 0) {
      skipped += items.length;
      continue;
    }

    const catalog = candidates
      .map((p) => {
        const price = `R$ ${Number(p.price_per_person).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
        const date = p.going_date ? new Date(p.going_date).toLocaleDateString("pt-BR") : "sem data";
        return `- ${p.id} | ${p.destination} | ${p.nights ?? "?"} noites | saída ${date} | ${price}/pessoa`;
      })
      .join("\n");

    const prompt = `Você é analista de marketing da VIA AIR (agência de viagens brasileira).

Hoje é ${today}. Vou te passar pacotes de viagem saindo de ${label}. Escolha os 3-5 MAIS PROMISSORES para divulgar em broadcast esta semana, considerando:
- Sazonalidade brasileira (feriados, alta temporada, tendências)
- Preço competitivo
- Data de partida próxima (urgência gera conversão)
- Destinos que brasileiros mais buscam saindo dessa cidade

Para cada escolhido, indique:
- package_id: o UUID exato da lista
- channel: "whatsapp" (grupos e canal WhatsApp), "instagram_feed" (post no feed) OU "instagram_story" (story 24h)
- period: "morning" ou "evening" (melhor turno pra postar)
- reasoning: 1 frase curta em pt-BR explicando POR QUE esse pacote agora nesse canal

Pacotes disponíveis:
${catalog}

Retorne JSON com o array "suggestions".`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: SuggestionSchema }),
        prompt,
      });

      for (const s of output.suggestions) {
        const pkg = candidates.find((p) => p.id === s.package_id);
        if (!pkg) continue;

        const slotKey =
          s.channel === "whatsapp"
            ? s.period === "evening" ? "whatsapp_pm" : "whatsapp"
            : s.channel === "instagram_feed"
              ? "instagram_feed"
              : s.period === "evening" ? "instagram_story_pm" : "instagram_story";
        const slot = TIME_SLOTS[slotKey];

        const { error: insErr } = await supabaseAdmin.from("broadcast_suggestions").insert({
          origin: label,
          destination: pkg.destination,
          package_id: pkg.id,
          suggested_channels: [s.channel],
          suggested_time: slot.time,
          suggested_day: slot.day,
          reasoning: s.reasoning,
          created_by: userId,
        });
        if (!insErr) created++;
      }
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        console.warn(`[suggestions] IA falhou pra ${label}:`, err.message);
        continue;
      }
      throw err;
    }
  }

  return { created, skipped, message: `${created} sugestão(ões) geradas.` };
}
