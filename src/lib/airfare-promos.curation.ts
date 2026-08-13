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
    // 1ª passada: cotas preferenciais por região
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

    // 2ª passada: vagas especiais só para tarifas realmente excepcionais
    let especiais = 0;
    for (const d of elegiveis) {
      if (selecionadas.length >= limit || especiais >= SPECIAL_OPPORTUNITY_SLOTS) break;
      if (d.status === "selecionada") continue;
      if (hasRegionQuota(d.region)) continue;
      if (d.ratio > SPECIAL_OPPORTUNITY_MAX_RATIO) {
        d.reason = `sem_excepcionalidade_${d.region}`;
        continue;
      }
      if (!cabeNoDestino(d)) continue;
      especiais++;
      aceitar(d, `oportunidade_especial_${d.region}`);
    }

    // 3ª passada: REDISTRIBUIÇÃO — vagas que sobraram vão para as melhores
    // oportunidades restantes, sem respeitar cota (nunca deixar vaga vazia).
    for (const d of elegiveis) {
      if (selecionadas.length >= limit) break;
      if (d.status === "selecionada") continue;
      if (!hasRegionQuota(d.region) && d.ratio > SPECIAL_OPPORTUNITY_MAX_RATIO) continue;
      if (!cabeNoDestino(d)) continue;
      aceitar(d, "redistribuicao_de_vaga");
    }
  } else {
    // NACIONAL: diversidade de destinos primeiro
    for (const d of elegiveis) {
      if (selecionadas.length >= limit) break;
      if (porDestino.has(d.candidate.destination_iata)) continue;
      aceitar(d, "melhor_oportunidade_do_destino");
    }
    // completa com repetições justificadas
    for (const d of elegiveis) {
      if (selecionadas.length >= limit) break;
      if (d.status === "selecionada") continue;
      if (!cabeNoDestino(d)) continue;
      aceitar(d, "segunda_oportunidade_justificada");
    }
  }

  decisions.push(...elegiveis);

  return {
    selected: selecionadas.map((d) => d.candidate),
    decisions,
    eligible: elegiveis.length,
    excluded: decisions.filter((d) => d.status === "excluida").length,
  };
}
