import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHookDirective } from "@/lib/packages/curate-hook.server";


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
    passeios: z.array(z.string()).nullable().optional(),
    tickets: z
      .object({ enabled: z.boolean().optional(), parks: z.array(z.string()).nullable().optional() })
      .partial()
      .optional(),
    birthday: z
      .object({ enabled: z.boolean().optional(), condicao: z.string().nullable().optional() })
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
  supplier_name: z.string().nullable().optional(),
  flexible_dates: z.boolean().nullable().optional(),
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

    // Sempre o domínio público — nunca o host de preview/lovableproject,
    // senão o link vai errado pro cliente no broadcast.
    void data.baseUrl;
    const baseUrl = "https://pedidos.viaair.tur.br";

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
      const period = p.flexible_dates
        ? "Datas flexíveis"
        : p.going_date
          ? `${fmtDate(p.going_date)}${p.return_date ? " a " + fmtDate(p.return_date) : ""}`
          : "";
      const stars = p.hotel_stars ? "★".repeat(Math.min(5, Math.max(1, p.hotel_stars))) : "";
      const d = daysUntil(p.going_date);
      const boleto_ate_data_viagem = d !== null && d >= 60;
      const is_captive = /cativ/i.test(String(p.supplier_name ?? ""));

      const svc = p.services ?? {};
      const services_lines: string[] = [];
      const fmtCob = (raw: string) => {
        const s = String(raw).trim().replace(/[^\d.,-]/g, "");
        let n: number;
        if (s.includes(",")) {
          // pt-BR: "." é milhar, "," é decimal
          n = Number(s.replace(/\./g, "").replace(",", "."));
        } else if (/^\d+\.\d{1,2}$/.test(s)) {
          // en: "80000.00" → ponto como decimal
          n = Number(s);
        } else {
          // sem decimal explícito: "80000" ou "80.000" (milhar)
          n = Number(s.replace(/\./g, ""));
        }
        if (!isFinite(n) || n === 0) return raw;
        return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
      };
      if (svc.seguro?.enabled) {
        const cob = svc.seguro.cobertura?.toString().trim();
        const moeda = svc.seguro.moeda || "USD";
        services_lines.push(
          cob
            ? `🛡️ Seguro Viagem ${moeda} ${fmtCob(cob)} por pessoa`
            : `🛡️ Seguro Viagem`,
        );
      }
      if (svc.cancelamento?.enabled) {
        const cob = svc.cancelamento.cobertura?.toString().trim();
        const moeda = svc.cancelamento.moeda || "BRL";
        services_lines.push(
          cob
            ? `🧾 Cobertura para cancelamento involuntário ${moeda} ${fmtCob(cob)} por pessoa`
            : `🧾 Cobertura para cancelamento involuntário`,
        );
      }
      if (svc.transfer?.enabled) {
        services_lines.push(`🚐 Transfer aeroporto ↔ hotel (${sentidoLabel(svc.transfer.sentido)})`);
      }

      const passeiosList = (() => {
        const list: string[] = [];
        const seen = new Set<string>();
        const isCityTour = (s: string) => /^city\s*tour\b/i.test(s.trim());
        const push = (s: string) => {
          const t = s.trim().replace(/\s+/g, " ");
          if (!t) return;
          const k = t.toLowerCase();
          if (seen.has(k)) return;
          // Dedup por "family": todo City Tour conta como o mesmo passeio.
          // Mantém a primeira variação (preferencialmente a detalhada, já que
          // svc.city_tour é empurrado antes de svc.passeios).
          if (isCityTour(t) && [...seen].some((x) => x.startsWith("city tour"))) return;
          seen.add(k);
          list.push(t);
        };
        if (svc.city_tour?.enabled) {
          const det = svc.city_tour.detalhe?.trim();
          push(det ? `City Tour — ${det}` : `City Tour`);
        }
        for (const p of svc.passeios ?? []) push(String(p ?? ""));
        return list;
      })();

      for (const p of passeiosList) services_lines.push(`🗺️ ${p}`);

      if (svc.tickets?.enabled) {
        const parks = (svc.tickets.parks ?? [])
          .map((p) => String(p ?? "").trim())
          .filter(Boolean);
        for (const park of parks) {
          services_lines.push(`🎟️ Ingresso ${park}`);
        }
      }

      if (svc.birthday?.enabled) {
        const cond = (svc.birthday.condicao ?? "").trim();
        services_lines.push(
          `🎂 Ingresso GRÁTIS para aniversariantes${cond ? ` (${cond})` : ""}`,
        );
      }






      return {
        title: p.title,
        destination: p.destination,
        origin: p.origin || "",
        period,
        flexible_dates: !!p.flexible_dates,
        nights: p.nights ?? undefined,
        hotel: p.hotel_name ? `${p.hotel_name} ${stars}`.trim() : "",
        meal_plan: p.meal_plan || "",
        price_per_person: fmtBRL(Number(p.price_per_person)),
        total_price: fmtBRL(total),
        occupancy: occ,
        url: `${baseUrl}/w/${p.slug}`,
        days_until_departure: d,
        boleto_ate_data_viagem,
        is_captive,
        services_lines,

      };
    });


    const channel = data.channel;
    const hookDirective = buildHookDirective(
      `${data.packageId ?? ""}${items[0]?.destination ?? ""}${Date.now()}`,
    );

    const system =
      channel === "whatsapp"
        ? `Você é copywriter da VIA AIR gerando UMA mensagem PRONTA pra WhatsApp que o consultor vai colar e enviar.
NUNCA cumprimente, NUNCA se apresente ("Olá, aqui é a Camila…" está PROIBIDO). Vá direto ao pacote.

FORMATO OBRIGATÓRIO (copie exatamente, incluindo asteriscos do WhatsApp para negrito):

*DESTINO EM CAIXA ALTA* {1-2 emojis do país/vibe}
_{Gancho de UMA linha, CRIATIVO E ORIGINAL, 100% conectado ao destino específico "{destino}" e ao clima/vibe do tema "${data.groupTitle}".
${hookDirective}
Regras do gancho: 1 linha só, no máximo 14 palavras, sem clichê genérico ("preço redondo", "oportunidade imperdível", "não perca"), sem emoji dentro do gancho, sem repetir o nome do destino se ele já apareceu no título acima. Se houver mais de um pacote, cada um precisa de um gancho com estrutura DIFERENTE do anterior. SEMPRE envolva a frase inteira em underscores para itálico no WhatsApp: _frase_.}_


✈️ Saindo de {origem}
🗓️ {SE "flexible_dates" for true, escreva EXATAMENTE "Datas flexíveis" seguido de " ({N noites})" quando houver noites — NUNCA escreva datas. SE for false, escreva {DD/MM a DD/MM} ({N noites})}
🏨 {Hotel} {estrelas em ★} — {regime, ex.: Café da Manhã / All Inclusive}

{SE "services_lines" tiver 1+ item, adicione uma linha em branco e depois UMA LINHA por item de "services_lines", EXATAMENTE como está (o emoji já vem no início). Sem título, sem "SERVIÇOS INCLUSOS", sem asteriscos, sem alterar o texto. Depois outra linha em branco antes das formas de pagamento.}
{SE "services_lines" estiver vazio, NÃO inclua nada.}




*FORMAS DE PAGAMENTO:*
🤑 *PIX:* {valor total com 5% off já aplicado} PARA {N} ADULTO(S) _(5% de desconto já aplicado)_
{SE "is_captive" for true, incluir AS DUAS linhas abaixo (Visa/Master 15x + demais bandeiras 10x):}
💳 *Cartão Visa/Master:* 15x de {total / 15}
💳 *Demais bandeiras:* 10x de {total / 10}
{SE "is_captive" for false, incluir SOMENTE esta linha única (cartão 10x):}
💳 *Cartão de crédito:* 10x de {total / 10}
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
- Mês em CAIXA ALTA (JANEIRO, FEVEREIRO…). Data no formato "15 a 22/SETEMBRO". Se "flexible_dates" for true, NUNCA cite datas nem mês: use apenas "Datas flexíveis" (com o número de noites, se houver).
- Valor do PIX = total x 0,95 (5% off). Cartão: se "is_captive" for true, mostrar DUAS linhas — Visa/Master em 15x (total/15) e demais bandeiras em 10x (total/10). Se "is_captive" for false, mostrar UMA linha só "Cartão de crédito: 10x de {total/10}".
- A linha "Boleto parcelado até a data da viagem" só aparece quando "boleto_ate_data_viagem" do item for true (antecedência mínima de 60 dias). Nunca inclua se for false.
- Se houver mais de 1 pacote, gere um bloco por pacote separado por uma linha em branco, e repita a assinatura "✨ Para mais informações…" só UMA vez no fim.`

        : `Você é copywriter da VIA AIR. Escreva UMA legenda pronta para post do Instagram apresentando um bloco de pacotes selecionados para o tema "${data.groupTitle}".
Regras:
- Português do Brasil, tom inspirador mas objetivo.
- Comece com uma frase de gancho curta (1 linha, com 1 emoji).
${hookDirective}

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
        model: "google/gemini-2.5-flash-lite",
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
