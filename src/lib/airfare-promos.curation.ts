/**
 * CURADORIA COMERCIAL — camada entre o radar (Melhores Destinos) e a
 * validação no motor VIA AIR.
 *
 * O radar descobre tudo; aqui decidimos o que MERECE virar promoção VIA AIR:
 * exclusões nacionais, apelo turístico, diversidade de destinos e distribuição
 * regional no internacional (com redistribuição de vagas).
 *
 * Módulo puro (sem I/O) — todos os parâmetros vêm de `airfare-promos.config`.
 */
import {
  INTERNATIONAL_REGION_QUOTAS,
  NATIONAL_CATEGORY_QUOTAS,
  NATIONAL_FLEX_MAX_RATIO,
  NATIONAL_FLEX_SLOTS,
  NATIONAL_QUALITY_MAX_RATIO,
  nationalCategoryOfDestination,
  MAX_PER_DESTINATION,
  NATIONAL_LEISURE_DESTINATIONS,
  NORTHEAST_DESTINATIONS,
  REGION_BASELINE_PRICE,
  REPEAT_MIN_PRICE_GAP_PERCENT,
  SPECIAL_OPPORTUNITY_MAX_RATIO,
  SPECIAL_OPPORTUNITY_SLOTS,
  hasRegionQuota,
  isDestinationAllowedNacional,
  regionOfDestination,
  type PromoRegion,
} from "@/lib/airfare-promos.config";

export type CurationInput = {
  signature: string;
  scope: "nacional" | "internacional";
  origin_iata: string;
  destination_iata: string;
  destination_city?: string | null;
  departure_date: string;
  return_date?: string | null;
  reference_price: number | null;
};

export type CurationDecision<T extends CurationInput = CurationInput> = {
  candidate: T;
  region: PromoRegion;
  /** quanto menor, melhor a oportunidade (preço ÷ padrão do mercado) */
  ratio: number;
  score: number;
  status: "selecionada" | "excluida" | "nao_selecionada";
  reason: string;
};

export type CurationResult<T extends CurationInput = CurationInput> = {
  selected: T[];
  decisions: Array<CurationDecision<T>>;
  eligible: number;
  /** quantas elegíveis realmente entraram no ranking (deve ser = eligible) */
  ranked?: number;
  excluded: number;
};

/** Origens regionais onde praia/Nordeste tem peso comercial extra. */
const REGIONAL_ORIGINS = new Set(["MGF", "LDB", "CAC", "IGU", "CWB"]);

function baseline(region: PromoRegion, scope: "nacional" | "internacional", fallback: number): number {
  const base = REGION_BASELINE_PRICE[region] ?? REGION_BASELINE_PRICE[scope === "nacional" ? "nacional" : "outros"];
  return base || fallback || 1;
}

/** Mês da partida (usado para justificar repetição de destino). */
function monthOf(date: string) {
  return date.slice(0, 7);
}

/**
 * Uma segunda oportunidade do mesmo destino só entra com justificativa
 * comercial: período bem diferente ou diferença relevante de preço.
 */
export function repeatIsJustified(a: CurationInput, b: CurationInput): boolean {
  if (monthOf(a.departure_date) !== monthOf(b.departure_date)) return true;
  const pa = a.reference_price ?? 0;
  const pb = b.reference_price ?? 0;
  if (!pa || !pb) return false;
  const gap = (Math.abs(pa - pb) / Math.max(pa, pb)) * 100;
  return gap >= REPEAT_MIN_PRICE_GAP_PERCENT;
}

/**
 * Seleciona até `limit` oportunidades de UMA origem.
 * Nunca corta a lista antes dos filtros: percorre todas as candidatas
 * elegíveis até completar as vagas.
 */
export function curateOrigin<T extends CurationInput>(
  origin: string,
  candidates: T[],
  limit: number,
): CurationResult<T> {
  const decisions: CurationDecision<T>[] = [];
  const elegiveis: Array<CurationDecision<T>> = [];
  const isRegional = REGIONAL_ORIGINS.has(origin.toUpperCase());

  const precos = candidates.map((c) => c.reference_price ?? 0).filter((p) => p > 0);
  const mediana = precos.length
    ? precos.slice().sort((a, b) => a - b)[Math.floor(precos.length / 2)]!
    : 0;

  for (const c of candidates) {
    const dest = c.destination_iata.toUpperCase();
    const region = regionOfDestination(dest, c.scope);

    if (c.scope === "nacional" && !isDestinationAllowedNacional(dest)) {
      decisions.push({
        candidate: c, region, ratio: 1, score: 0,
        status: "excluida",
        reason: "destino_excluido_curadoria_nacional",
      });
      continue;
    }

    const preco = c.reference_price ?? 0;
    const base = baseline(region, c.scope, mediana);
    // sem preço de referência: tratado como oportunidade mediana
    const ratio = preco > 0 ? preco / base : 1;

    // score: quanto menor, melhor. Bônus para lazer/Nordeste no nacional.
    let score = ratio;
    if (c.scope === "nacional") {
      if (NATIONAL_LEISURE_DESTINATIONS.has(dest)) score *= 0.85;
      if (isRegional && NORTHEAST_DESTINATIONS.has(dest)) score *= 0.92;
    }

    elegiveis.push({
      candidate: c, region, ratio, score,
      status: "nao_selecionada",
      reason: "fora_das_vagas",
    });
  }

  elegiveis.sort((a, b) => a.score - b.score || a.candidate.departure_date.localeCompare(b.candidate.departure_date));

  const selecionadas: Array<CurationDecision<T>> = [];
  const porDestino = new Map<string, CurationDecision<T>[]>();

  const cabeNoDestino = (d: CurationDecision<T>) => {
    const jaEscolhidas = porDestino.get(d.candidate.destination_iata) ?? [];
    if (jaEscolhidas.length >= MAX_PER_DESTINATION) return false;
    if (jaEscolhidas.length && !jaEscolhidas.every((x) => repeatIsJustified(x.candidate, d.candidate))) {
      return false;
    }
    return true;
  };

  const aceitar = (d: CurationDecision<T>, motivo: string) => {
    d.status = "selecionada";
    d.reason = motivo;
    selecionadas.push(d);
    const lista = porDestino.get(d.candidate.destination_iata) ?? [];
    lista.push(d);
    porDestino.set(d.candidate.destination_iata, lista);
  };

  const scope = candidates[0]?.scope ?? "nacional";

  if (scope === "internacional") {
    // 1ª passada: composição por região (Europa 3 • EUA/Canadá 2 •
    // América do Sul 2 • Caribe/México 1). Cotas são TETO, não meta.
    const usadasPorRegiao = new Map<PromoRegion, number>();
    for (const d of elegiveis) {
      if (selecionadas.length >= limit) break;
      const cota = INTERNATIONAL_REGION_QUOTAS[d.region];
      if (!cota) continue;
      const usadas = usadasPorRegiao.get(d.region) ?? 0;
      if (usadas >= cota) continue;
      if (!cabeNoDestino(d)) continue;
      usadasPorRegiao.set(d.region, usadas + 1);
      aceitar(d, `cota_regional_${d.region}`);
    }

    // 2ª passada: até 2 vagas FLEXÍVEIS internacionais — qualquer região
    // (inclusive reforçar uma categoria já cheia), mas só com tarifa
    // realmente excepcional. Sobrando vaga sem excepcionalidade, fica vazia.
    let flex = 0;
    for (const d of elegiveis) {
      if (selecionadas.length >= limit || flex >= SPECIAL_OPPORTUNITY_SLOTS) break;
      if (d.status === "selecionada") continue;
      if (d.ratio > SPECIAL_OPPORTUNITY_MAX_RATIO) {
        d.reason = `sem_excepcionalidade_${d.region}`;
        continue;
      }
      if (!cabeNoDestino(d)) continue;
      flex++;
      aceitar(d, `flexivel_internacional_${d.region}`);
    }
  } else {
    // NACIONAL: composição por categoria de destino
    // (até 4 Nordeste/lazer • até 2 Rio • até 1 Norte/Centro-Oeste)
    // + até 3 flexíveis. Nada entra fora do teto de qualidade.
    const usadasPorCategoria = new Map<string, number>();

    for (const d of elegiveis) {
      if (selecionadas.length >= limit) break;
      if (d.ratio > NATIONAL_QUALITY_MAX_RATIO) {
        d.reason = "fora_do_teto_de_qualidade";
        continue;
      }
      const cat = nationalCategoryOfDestination(d.candidate.destination_iata);
      if (cat === "outros") continue;
      const cota = NATIONAL_CATEGORY_QUOTAS[cat];
      const usadas = usadasPorCategoria.get(cat) ?? 0;
      if (usadas >= cota) continue;
      // diversidade: um destino por categoria antes de repetir
      if (porDestino.has(d.candidate.destination_iata)) continue;
      if (!cabeNoDestino(d)) continue;
      usadasPorCategoria.set(cat, usadas + 1);
      aceitar(d, `composicao_${cat}`);
    }

    // Vagas flexíveis: qualquer destino turístico nacional com oportunidade
    // realmente forte (não serve para completar cota com rota fraca).
    let flex = 0;
    for (const d of elegiveis) {
      if (selecionadas.length >= limit || flex >= NATIONAL_FLEX_SLOTS) break;
      if (d.status === "selecionada") continue;
      if (d.ratio > NATIONAL_FLEX_MAX_RATIO) {
        d.reason = "flexivel_sem_excepcionalidade";
        continue;
      }
      if (!cabeNoDestino(d)) continue;
      flex++;
      aceitar(d, "flexivel_nacional");
    }
  }

  // ÚLTIMA PASSADA — completar até o LIMITE da origem.
  // As cotas acima são preferência de composição, não teto do universo:
  // se ainda há vaga (limite) e sobra oportunidade dentro do teto de
  // qualidade, ela entra. Assim 69 elegíveis nunca viram "só 7 analisadas".
  const tetoFinal = scope === "nacional" ? NATIONAL_QUALITY_MAX_RATIO : 1;
  for (const d of elegiveis) {
    if (selecionadas.length >= limit) break;
    if (d.status === "selecionada") continue;
    if (d.ratio > tetoFinal) continue;
    if (!cabeNoDestino(d)) continue;
    aceitar(d, `completar_vagas_${d.region}`);
  }

  decisions.push(...elegiveis);

  return {
    selected: selecionadas.map((d) => d.candidate),
    decisions,
    eligible: elegiveis.length,
    ranked: elegiveis.length,
    excluded: decisions.filter((d) => d.status === "excluida").length,
  };
}
