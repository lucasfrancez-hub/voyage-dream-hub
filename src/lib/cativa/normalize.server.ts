import { createHash } from "node:crypto";
import type { CativaFonte, CativaHotel, CativaIngresso, CativaPacoteNormalizado } from "./types";
import type { CativaLinha } from "./sheets.server";

function acheChave(row: CativaLinha, ...partes: string[]): string | null {
  for (const p of partes) {
    if (row[p] != null) return row[p]!;
  }
  const chaves = Object.keys(row);
  for (const p of partes) {
    const k = chaves.find((c) => c.includes(p));
    if (k) return row[k]!;
  }
  return null;
}

/** "R$ 1.159,00" -> 1159 */
export function moedaBR(v: string | null | undefined): number | null {
  if (!v) return null;
  const limpo = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) / 100 : null;
}

/** "01/10/2026" -> "2026-10-01" */
export function dataBR(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "01/10/2026 a 07/10/2026" -> { inicio, fim } */
export function periodoBR(v: string | null | undefined): { inicio: string | null; fim: string | null } {
  if (!v) return { inicio: null, fim: null };
  const datas = v.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
  return { inicio: dataBR(datas[0] ?? null), fim: dataBR(datas[1] ?? null) };
}

export function normalizarTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/** "Rio de Janeiro (GIG)" -> { cidade, iata } */
export function localidade(v: string | null): { cidade: string | null; iata: string | null } {
  if (!v) return { cidade: null, iata: null };
  const m = v.match(/^(.*?)\s*\(([A-Z]{3})\)\s*$/);
  if (m) return { cidade: m[1]!.trim(), iata: m[2]! };
  return { cidade: v.trim(), iata: null };
}

export function tokenInfotravel(link: string | null): string | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    return u.searchParams.get("token");
  } catch {
    const m = link.match(/token=([^&]+)/);
    return m ? decodeURIComponent(m[1]!) : null;
  }
}

function hoteisDaLinha(row: CativaLinha): CativaHotel[] {
  const out: CativaHotel[] = [];
  for (let i = 1; i <= 6; i++) {
    const nome = acheChave(row, `hotel ${i} nome`);
    if (!nome) continue;
    out.push({
      nome,
      valor: moedaBR(acheChave(row, `hotel ${i} valor`)),
      taxas: moedaBR(acheChave(row, `hotel ${i} taxas`)),
      crianca: acheChave(row, `hotel ${i} crianca`),
      regime: acheChave(row, `hotel ${i} regime`),
      promocao: acheChave(row, `hotel ${i} promocao`),
    });
  }
  // planilha de eventos: hotel único
  if (!out.length) {
    const nome = row["hotel"];
    if (nome) {
      out.push({
        nome,
        valor: null,
        taxas: moedaBR(row["taxas"] ?? null),
        crianca: null,
        regime: row["regime"] ?? null,
        promocao: null,
      });
    }
  }
  return out;
}

function ingressosDaLinha(row: CativaLinha): CativaIngresso[] {
  const out: CativaIngresso[] = [];
  for (let i = 1; i <= 6; i++) {
    const cat = acheChave(row, `ingresso ${i} categoria`);
    if (!cat) continue;
    out.push({ categoria: cat, valor: moedaBR(acheChave(row, `ingresso ${i} valor`)) });
  }
  return out;
}

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 40);
}

export function normalizarLinha(fonte: CativaFonte, row: CativaLinha): CativaPacoteNormalizado | null {
  const nome = acheChave(row, "nome do pacote", "nome");
  if (!nome) return null;

  const periodo = periodoBR(acheChave(row, "data da viagem"));
  const link = acheChave(row, "link do orcamento");
  const token = tokenInfotravel(link);
  const origem = localidade(acheChave(row, "origem"));
  const destino = acheChave(row, "destino");
  const hoteis = hoteisDaLinha(row);
  const ingressos = ingressosDaLinha(row);
  const incluso = (acheChave(row, "incluso") ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);

  const noitesTxt = acheChave(row, "noites");
  const noites = noitesTxt ? Number(noitesTxt.replace(/\D+/g, "")) || null : null;

  const aereoPor = moedaBR(acheChave(row, "aereo por"));
  const circuito = moedaBR(acheChave(row, "valor por pessoa (circuito)"));
  const taxas = moedaBR(acheChave(row, "taxas (circuito)")) ?? moedaBR(row["taxas"] ?? null) ?? hoteis[0]?.taxas ?? null;

  const base: Omit<CativaPacoteNormalizado, "fingerprint" | "content_hash"> = {
    fonte,
    categoria: acheChave(row, "categoria"),
    nome,
    nome_normalizado: normalizarTexto(nome),
    origem_iata: origem.iata,
    origem_cidade: origem.cidade,
    destino: destino ?? null,
    data_viagem: periodo.inicio,
    data_fim: periodo.fim,
    data_viagem_texto: acheChave(row, "data da viagem"),
    outras_datas: (acheChave(row, "outras datas") ?? "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
    noites,
    token_infotravel: token,
    link_orcamento: link,
    aereo_de: moedaBR(acheChave(row, "aereo de")),
    aereo_por: aereoPor ?? circuito,
    taxas,
    // O valor exibido pela fonte JÁ é com taxas — somar `taxas` de novo
    // inflava o total. Total = aéreo (com taxas) + hospedagem.
    valor_total: (aereoPor ?? circuito ?? 0) + (hoteis[0]?.valor ?? 0) || null,
    hoteis,
    ingressos,
    incluso,
    observacao: acheChave(row, "observacao"),
    cotado_em: acheChave(row, "cotacao em"),
    extras: {
      companhia: acheChave(row, "companhia aerea") ?? "",
      regime_circuito: acheChave(row, "regime (circuito)") ?? "",
      roteiro_circuito: acheChave(row, "roteiro / hoteis (circuito)") ?? "",
      roteiro_dia_a_dia: acheChave(row, "roteiro day by day") ?? "",
      feriado: acheChave(row, "feriado") ?? "",
    },
    source_row_key: acheChave(row, "id"),
  };

  // Identidade estável do pacote: NÃO inclui preço.
  const fingerprint = sha(
    [
      base.fonte,
      normalizarTexto(base.categoria ?? ""),
      base.nome_normalizado,
      base.origem_iata ?? normalizarTexto(base.origem_cidade ?? ""),
      normalizarTexto(base.destino ?? ""),
      base.data_viagem ?? base.data_viagem_texto ?? "",
      base.token_infotravel ?? "",
    ].join("|"),
  );

  // Hash somente dos dados comerciais: muda => atualiza + histórico.
  const content_hash = sha(
    JSON.stringify({
      aereo_de: base.aereo_de,
      aereo_por: base.aereo_por,
      taxas: base.taxas,
      valor_total: base.valor_total,
      data_viagem: base.data_viagem,
      data_fim: base.data_fim,
      outras_datas: base.outras_datas,
      noites: base.noites,
      hoteis: base.hoteis,
      ingressos: base.ingressos,
      incluso: base.incluso,
      observacao: base.observacao,
      link_orcamento: base.link_orcamento,
      categoria: base.categoria,
      destino: base.destino,
    }),
  );

  return { ...base, fingerprint, content_hash };
}
