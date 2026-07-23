import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão");
}

const ServicesSchema = z
  .object({
    seguro: z
      .object({ enabled: z.boolean().optional(), cobertura: z.string().nullable().optional(), moeda: z.string().nullable().optional() })
      .partial()
      .optional(),
    cancelamento: z
      .object({ enabled: z.boolean().optional(), cobertura: z.string().nullable().optional(), moeda: z.string().nullable().optional() })
      .partial()
      .optional(),
    transfer: z
      .object({ enabled: z.boolean().optional(), sentido: z.enum(["in", "out", "in_out"]).nullable().optional() })
      .partial()
      .optional(),
    city_tour: z
      .object({ enabled: z.boolean().optional(), detalhe: z.string().nullable().optional() })
      .partial()
      .optional(),
    outros: z.array(z.string()).optional(),
  })
  .partial()
  .nullable()
  .optional();

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
  services: ServicesSchema,
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
        packageId: z.string().uuid().optional(),
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

    const daysUntil = (s?: string | null) => {
      if (!s) return null;
      const t = new Date(String(s) + "T12:00:00").getTime();
      if (isNaN(t)) return null;
      return Math.round((t - Date.now()) / 86400000);
    };

    const sentidoLabel = (s?: string | null) =>
      s === "in" ? "somente chegada" : s === "out" ? "somente saída" : "ida e volta (chegada e saída)";

    const items = data.packages.map((p) => {
      const occ = p.base_occupancy ?? 2;
      const total = Number(p.price_per_person) * occ;
      const period = p.going_date
        ? `${fmtDate(p.going_date)}${p.return_date ? " a " + fmtDate(p.return_date) : ""}`
        : "";
      const stars = p.hotel_stars ? "★".repeat(Math.min(5, Math.max(1, p.hotel_stars))) : "";
      const d = daysUntil(p.going_date);
      const boleto_ate_data_viagem = d !== null && d >= 60;

      const svc = p.services ?? {};
      const services_emojis: string[] = [];
      if (svc.seguro?.enabled) services_emojis.push("🛡️");
      if (svc.cancelamento?.enabled) services_emojis.push("🧾");
      if (svc.transfer?.enabled) services_emojis.push("🚐");
      if (svc.city_tour?.enabled) services_emojis.push("🗺️");
      const outrosCount = (svc.outros ?? []).filter((e) => (e || "").trim()).length;
      for (let i = 0; i < outrosCount; i++) services_emojis.push("✨");
      const services_emoji_line = services_emojis.join(" ");


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
        url: `${baseUrl}/w/${p.slug}`,
        days_until_departure: d,
        boleto_ate_data_viagem,
        services_lines,
      };
    });


    const channel = data.channel;
    const system =
      channel === "whatsapp"
        ? `Você é copywriter da VIA AIR gerando UMA mensagem PRONTA pra WhatsApp que o consultor vai colar e enviar.
NUNCA cumprimente, NUNCA se apresente ("Olá, aqui é a Camila…" está PROIBIDO). Vá direto ao pacote.

FORMATO OBRIGATÓRIO (copie exatamente, incluindo asteriscos do WhatsApp para negrito):

*DESTINO EM CAIXA ALTA* {1-2 emojis do país/vibe}
_{Gancho de UMA linha, CRIATIVO E ORIGINAL, 100% conectado ao destino específico "{destino}" e ao clima/vibe do tema "${data.groupTitle}". VARIE MUITO a abertura — NÃO comece sempre com "Já imaginou". Alterne livremente entre estas famílias (escolha aleatoriamente uma diferente a cada pacote, e nunca repita a mesma abertura no mesmo lote):
 • Pergunta sensorial ("Sente o cheiro do mar chegando?", "Que tal acordar com vista pra montanha?")
 • Provocação/curiosidade ("Poucos sabem, mas ${"{destino}"} em NOVEMBRO fica quase deserto…", "Existe um jeito de conhecer ${"{destino}"} gastando menos do que você imagina.")
 • Cena viva ("Pé na areia branca, drink na mão, sem pressa nenhuma.", "Manhã fria, café quentinho, vista das serras pela janela.")
 • Fato/dado do destino ("${"{destino}"} tem 90km de praias — e a gente escolheu a melhor pra você.")
 • Convite direto e curto ("Bora fugir da rotina em ${"{destino}"}?", "Tá na hora de tirar esse ${"{destino}"} da lista.")
 • Contagem/urgência sutil ("Faltam poucos meses pra ${"{tema}"} — e os melhores hotéis já estão sumindo.")
Regras do gancho: 1 linha só, no máximo 14 palavras, sem clichê genérico ("preço redondo", "oportunidade imperdível", "não perca"), sem emoji dentro do gancho, sem repetir o nome do destino se ele já apareceu no título acima. SEMPRE envolva a frase inteira em underscores para itálico no WhatsApp: _frase_.}_

✈️ Saindo de {origem}
🗓️ {DD a DD/MÊS EM CAIXA ALTA} ({N noites})
🏨 {Hotel} {estrelas em ★} — {regime, ex.: Café da Manhã / All Inclusive}

{SE E SOMENTE SE o item tiver "services_lines" com pelo menos 1 item, adicione um bloco em branco antes e depois com o título:}
*SERVIÇOS INCLUSOS:*
{Uma linha por item de "services_lines", cada linha começando com o emoji apropriado:
 • 🛡️ para "Seguro viagem …"
 • 🧾 para "Cobertura de cancelamento …"
 • 🚐 para "Transfer …"
 • 🗺️ para "City tour …"
 • ✨ para qualquer outro item de "outros" que não caia nas categorias acima.
NÃO invente serviços — use SÓ o texto exato de services_lines, adicionando apenas o emoji na frente.}
{SE "services_lines" estiver vazio, NÃO inclua esse bloco.}

*FORMAS DE PAGAMENTO:*
🤑 *PIX:* {valor total com 5% off já aplicado} PARA {N} ADULTO(S) _(5% de desconto já aplicado)_
💳 *Cartão de crédito:* 10x de {valor por parcela do total cheio}
📄 *Boleto bancário:* até 10x mediante aprovação
{SE E SOMENTE SE o item tiver "boleto_ate_data_viagem": true, adicione esta linha extra logo abaixo:}
📄 *Boleto parcelado:* até a data da viagem (sem análise de crédito)
{SE "boleto_ate_data_viagem" for false, NÃO inclua a linha acima.}
*sem juros em qualquer forma de pagamento*

✨ Para mais informações me chame aqui 📲 4499826-1137
{link do pacote}

REGRAS FIRMES:
- Sem saudação, sem "Olá", sem "Aqui é a Camila", sem despedida.
- Bold do WhatsApp é *entre asteriscos* — use nos labels PIX/Cartão/Boleto e no título do destino.
- Sem markdown de heading (#), sem hashtags.
- Nunca invente dados; use SÓ os fornecidos.
- Mês em CAIXA ALTA (JANEIRO, FEVEREIRO…). Data no formato "15 a 22/SETEMBRO".
- Valor do PIX = total x 0,95 (5% off). Cartão = total / 10.
- A linha "Boleto parcelado até a data da viagem" só aparece quando "boleto_ate_data_viagem" do item for true (antecedência mínima de 60 dias). Nunca inclua se for false.
- Se houver mais de 1 pacote, gere um bloco por pacote separado por uma linha em branco, e repita a assinatura "✨ Para mais informações…" só UMA vez no fim.`

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
        model: "google/gemini-3.1-flash-lite",
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

    if (data.packageId) {
      await context.supabase.from("package_ai_copy").upsert({
        package_id: data.packageId,
        channel: data.channel,
        text,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    }

    return { text };
  });

export const listPackageCopies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("package_ai_copy")
      .select("package_id, channel, text, updated_at");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Array<{ package_id: string; channel: "whatsapp" | "instagram"; text: string; updated_at: string }> };
  });

export const deletePackageCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ packageId: z.string().uuid(), channel: z.enum(["whatsapp", "instagram"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("package_ai_copy")
      .delete()
      .eq("package_id", data.packageId)
      .eq("channel", data.channel);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
