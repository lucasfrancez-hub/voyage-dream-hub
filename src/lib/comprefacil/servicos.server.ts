/**
 * Serviços adicionais do motor de pacotes (transfers, passeios, proteção...).
 *
 * Fonte real: catálogo já sincronizado da operadora (`comprefacil_servicos`,
 * filtrado pela cidade do destino pesquisado) + tarifas oficiais lidas em
 * `/api/offlineservicotarifa/{id}` (faixas etárias ADT/CHD por período).
 */
import { chamarCompreFacil } from "./auth.server";

export type ServicoDisponivel = {
  id: string;
  externoId: number;
  titulo: string;
  categoria: string;
  descricao: string | null;
  fornecedor: string | null;
  politica: string | null;
  informacoes: string[];
  recomendado: boolean;
  /** acréscimo total já multiplicado pelos passageiros; null = sob consulta */
  valor: number | null;
  moeda: "BRL";
};

type FaixaEtaria = {
  Tipo?: string;
  IdadeMinima?: number;
  IdadeMaxima?: number;
  QuantidadeMinima?: number;
  QuantidadeMaxima?: number;
  Valor?: number;
};

type Tarifa = {
  Ativo?: boolean;
  De?: string;
  Ate?: string;
  ValidadeDe?: string;
  ValidadeAte?: string;
  TarifaFaixasEtarias?: FaixaEtaria[];
};

const semHtml = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/<li[^>]*>/gi, " • ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
};

const dia = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : null);

function tarifaVigente(tarifas: Tarifa[], data: string): Tarifa | null {
  const validas = tarifas.filter((t) => {
    if (t?.Ativo === false) return false;
    const de = dia(t?.De ?? t?.ValidadeDe);
    const ate = dia(t?.Ate ?? t?.ValidadeAte);
    if (de && data < de) return false;
    if (ate && data > ate) return false;
    return true;
  });
  return validas[0] ?? null;
}

/** Aplica a tabela de faixas etárias sobre a ocupação pesquisada. */
function calcularValor(t: Tarifa, adultos: number, idades: number[]): number | null {
  const faixas = t?.TarifaFaixasEtarias ?? [];
  if (!faixas.length) return null;

  const adt = faixas.filter((f) => (f.Tipo ?? "ADT").toUpperCase() === "ADT");
  const chd = faixas.filter((f) => (f.Tipo ?? "").toUpperCase() === "CHD");

  const porQuantidade =
    adt.find(
      (f) =>
        adultos >= (f.QuantidadeMinima ?? 1) &&
        adultos <= (f.QuantidadeMaxima ?? 99),
    ) ?? adt[0];
  if (!porQuantidade && !chd.length) return null;

  let total = (porQuantidade?.Valor ?? 0) * adultos;
  for (const idade of idades) {
    const faixa =
      chd.find((f) => idade >= (f.IdadeMinima ?? 0) && idade <= (f.IdadeMaxima ?? 17)) ?? chd[0];
    total += faixa?.Valor ?? 0;
  }
  return Number(total.toFixed(2));
}

async function tarifasDoServico(externoId: number): Promise<Tarifa[]> {
  try {
    const r = await chamarCompreFacil(`/api/offlineservicotarifa/${externoId}`);
    return ((r.dados as any)?.Items ?? []) as Tarifa[];
  } catch {
    return [];
  }
}

export async function buscarServicosDestinoCF(p: {
  cidadeId: number;
  data: string;
  adultos: number;
  idades?: number[];
  limite?: number;
}): Promise<ServicoDisponivel[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limite = Math.min(60, Math.max(1, p.limite ?? 40));

  const { data: linhas, error } = await supabaseAdmin
    .from("comprefacil_servicos")
    .select(
      "externo_id, titulo, descricao, tipo, fornecedor, politica_cancelamento, destaque, combo, dias_semana",
    )
    .eq("ativo", true)
    .eq("fornecedor_cidade_id", p.cidadeId)
    .order("destaque", { ascending: false })
    .order("titulo")
    .limit(limite);
  if (error) throw new Error(error.message);

  const itens = ((linhas as any[]) ?? []).filter((s) => Number(s?.externo_id) > 0);
  const idades = p.idades ?? [];

  // Tarifas em lotes pequenos para não estourar a operadora.
  const resultados: ServicoDisponivel[] = [];
  const lote = 6;
  for (let i = 0; i < itens.length; i += lote) {
    const parte = await Promise.all(
      itens.slice(i, i + lote).map(async (s) => {
        const tarifas = await tarifasDoServico(Number(s.externo_id));
        const vigente = tarifaVigente(tarifas, p.data);
        const valor = vigente ? calcularValor(vigente, p.adultos, idades) : null;
        const informacoes = [
          s.combo ? "Combo de serviços" : null,
          s.dias_semana ? `Dias: ${s.dias_semana}` : null,
          s.fornecedor ? `Operado por ${s.fornecedor}` : null,
        ].filter(Boolean) as string[];
        return {
          id: `cfs-${s.externo_id}`,
          externoId: Number(s.externo_id),
          titulo: String(s.titulo ?? "Serviço"),
          categoria: String(s.tipo ?? "Serviços"),
          descricao: semHtml(s.descricao),
          fornecedor: s.fornecedor ?? null,
          politica: semHtml(s.politica_cancelamento),
          informacoes,
          recomendado: s.destaque === true,
          valor,
          moeda: "BRL" as const,
        };
      }),
    );
    resultados.push(...parte);
  }

  // Com tarifa vigente primeiro; dentro disso, recomendados e menor preço.
  return resultados.sort(
    (a, b) =>
      Number(b.valor != null) - Number(a.valor != null) ||
      Number(b.recomendado) - Number(a.recomendado) ||
      (a.valor ?? 0) - (b.valor ?? 0),
  );
}
