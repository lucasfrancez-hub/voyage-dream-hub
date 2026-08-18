/**
 * Resume com IA as descrições enormes dos serviços adicionais da Infotravel
 * (transfers, passeios, ingressos, seguro/Protec) num formato curto e bonito
 * para o cliente. Resultado fica em cache (md_response_cache) pelo hash do texto.
 */

export type ServicoResumido = {
  tipo: string;
  nome: string;
  resumo: string;
  destaques: string[];
  observacoes: string[];
};

const MODELO = "google/gemini-2.5-flash";

function limparHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Entrada = { tipo: string; nome: string; descricao: string };

function coletar(detalhes: any): Entrada[] {
  const lista = (v: any): any[] => (Array.isArray(v) ? v : []);
  const grupos: Array<[string, any[]]> = [
    ["Transfer", lista(detalhes?.transfers)],
    ["Passeio", lista(detalhes?.activities)],
    ["Ingresso", lista(detalhes?.tickets)],
    ["Seguro / proteção", lista(detalhes?.insurance)],
    ["Serviço", lista(detalhes?.services)],
  ];
  const out: Entrada[] = [];
  for (const [tipo, itens] of grupos) {
    for (const i of itens) {
      const nome = limparHtml(i?.name).slice(0, 200);
      const descricao = limparHtml(i?.description).slice(0, 12000);
      if (!nome && !descricao) continue;
      out.push({ tipo, nome: nome || tipo, descricao });
    }
  }
  return out;
}

async function chamarIA(entradas: Entrada[]): Promise<ServicoResumido[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const prompt = entradas
    .map(
      (e, i) =>
        `#${i + 1} [${e.tipo}] ${e.nome}\n${e.descricao || "(sem descrição)"}`,
    )
    .join("\n\n---\n\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Você resume serviços turísticos para o cliente final de uma agência brasileira, em pt-BR. " +
            "Transforme textos longos de operadora em um resumo curto, claro e vendedor, sem inventar nada. " +
            "Nunca use a palavra 'assessoria'. Não cite nomes de operadoras nem telefones. " +
            "Regras por item: 'resumo' = 1 a 2 frases (máx. 240 caracteres) explicando o que é; " +
            "'destaques' = até 5 bullets curtos (máx. 90 caracteres cada) com o que está incluso/o que a pessoa vai fazer; " +
            "'observacoes' = até 4 bullets curtos com regras realmente importantes (o que não inclui, restrições, prazos). " +
            "Responda SOMENTE com JSON válido no formato " +
            '{"itens":[{"indice":1,"nome":"","resumo":"","destaques":[],"observacoes":[]}]}',
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos da IA esgotados.");
    throw new Error(`Falha ao resumir serviços (${res.status}): ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const bruto = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(bruto);
  } catch {
    const m = bruto.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  }

  const itens = Array.isArray(parsed?.itens) ? parsed.itens : [];
  return entradas.map((e, i) => {
    const achado = itens.find((x: any) => Number(x?.indice) === i + 1) ?? itens[i] ?? {};
    const arr = (v: any, max: number) =>
      (Array.isArray(v) ? v : [])
        .map((x: any) => String(x ?? "").trim())
        .filter(Boolean)
        .slice(0, max);
    return {
      tipo: e.tipo,
      nome: String(achado?.nome || e.nome).trim(),
      resumo: String(achado?.resumo || "").trim(),
      destaques: arr(achado?.destaques, 5),
      observacoes: arr(achado?.observacoes, 4),
    };
  });
}

/** Resume os serviços de uma opção de voo/pacote, com cache por hash do conteúdo. */
export async function resumirServicos(detalhes: any): Promise<ServicoResumido[]> {
  const entradas = coletar(detalhes);
  if (!entradas.length) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const chave = `cativa-servicos:${await sha256(JSON.stringify(entradas))}`;

  const { data: cache } = await supabaseAdmin
    .from("md_response_cache")
    .select("payload")
    .eq("url_hash", chave)
    .maybeSingle();
  const guardado = (cache as any)?.payload?.itens;
  if (Array.isArray(guardado) && guardado.length) return guardado as ServicoResumido[];

  const itens = await chamarIA(entradas);
  await supabaseAdmin
    .from("md_response_cache")
    .upsert({ url_hash: chave, url: "cativa-servicos", payload: { itens }, fetched_at: new Date().toISOString() } as any);
  return itens;
}

/** Resume várias opções em paralelo controlado, tolerando falhas. */
export async function resumirServicosEmLote(detalhesList: any[], concorrencia = 3): Promise<(ServicoResumido[] | null)[]> {
  const out: (ServicoResumido[] | null)[] = new Array(detalhesList.length).fill(null);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= detalhesList.length) return;
      try {
        out[i] = await resumirServicos(detalhesList[i]);
      } catch {
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, detalhesList.length) }, worker));
  return out;
}
