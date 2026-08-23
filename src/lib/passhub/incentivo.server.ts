/**
 * Incentivo da consolidadora (PassHub). SERVER-ONLY.
 *
 * O portal da PassHub soma DUAS comissões: a RAV que a agência define na busca
 * e o incentivo do nível de recompensas — que existe mesmo com RAV 0%. Esse
 * percentual não vem na busca nem na tarifação: ele é da conta e sai em
 * `/api/v1/dashboard/recompensas` (nivel_atual.pct_nacional / pct_internacional).
 *
 * Fórmula usada pelo portal: incentivo = tarifa base (sem taxas) x pct / 100.
 */
import { passhubToken } from "./client.server";

const GERENCIA_BASE = "https://emissor-gerencia.passhub.com.br";
const TTL_MS = 10 * 60_000;
/** Nível Essencial (1%) — piso do programa quando a consulta falha. */
const PCT_PADRAO = 1;

export type PassHubNivel = {
  ordem: number;
  nome: string;
  pctNacional: number;
  pctInternacional: number;
};

let cache: { nivel: PassHubNivel; expiraEm: number } | null = null;
let inflight: Promise<PassHubNivel> | null = null;

const num = (v: unknown, fb: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fb;
};

async function buscarNivel(): Promise<PassHubNivel> {
  const token = await passhubToken();
  const res = await fetch(`${GERENCIA_BASE}/api/v1/dashboard/recompensas`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`recompensas ${res.status}`);
  const json = (await res.json()) as { data?: { nivel_atual?: Record<string, unknown> } };
  const n = json.data?.nivel_atual ?? {};
  return {
    ordem: num(n["ordem"], 1),
    nome: typeof n["nome"] === "string" ? n["nome"] : "Essencial",
    pctNacional: num(n["pct_nacional"], PCT_PADRAO),
    pctInternacional: num(n["pct_internacional"], PCT_PADRAO),
  };
}

/** Nível atual da agência na PassHub (com cache de 10 min). */
export async function passhubNivel(): Promise<PassHubNivel> {
  if (cache && Date.now() < cache.expiraEm) return cache.nivel;
  if (inflight) return inflight;
  inflight = buscarNivel()
    .then((nivel) => {
      cache = { nivel, expiraEm: Date.now() + TTL_MS };
      return nivel;
    })
    .catch((e: unknown) => {
      console.error("[passhub] nível de incentivo indisponível:", e);
      return {
        ordem: 1,
        nome: "Essencial",
        pctNacional: PCT_PADRAO,
        pctInternacional: PCT_PADRAO,
      } satisfies PassHubNivel;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Percentual de incentivo aplicável (usa o menor quando o roteiro é misto). */
export async function passhubIncentivoPct(internacional = false): Promise<number> {
  const nivel = await passhubNivel();
  return internacional ? nivel.pctInternacional : nivel.pctNacional;
}

/** Incentivo em R$ sobre a tarifa base (sem taxas). */
export function calcularIncentivo(tarifaBase: number, pct: number): number {
  if (!(tarifaBase > 0) || !(pct > 0)) return 0;
  return Math.round(tarifaBase * (pct / 100) * 100) / 100;
}
