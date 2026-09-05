/**
 * Busca aérea PassHub (ida, ida e volta e multitrecho). SERVER-ONLY.
 *
 * Contrato observado no painel:
 *  - simples/ida-volta: POST {vooApi}/api/v1/search com iata_from/iata_to/dates
 *  - multitrecho:       POST {multiCityApi}/api/v1/search com routes[]
 */
import { passhubBases, passhubRequest } from "./client.server";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type PassHubTrecho = { origem: string; destino: string; data: string };

export type PassHubBuscaInput = {
  trechos: PassHubTrecho[];
  /** Data de volta quando for ida e volta (1 trecho + retorno). */
  dataVolta?: string | null;
  adultos: number;
  criancas?: number;
  bebes?: number;
  /** 1 = econômica (padrão do painel). */
  classe?: number;
  /** RAV aplicada pela agência, em %. */
  ravPercentual?: number;
  pagina?: number;
  porPagina?: number;
  provedores?: string[];
};

const up = (s: string) => s.trim().toUpperCase();

export async function passhubBuscarVoos(input: PassHubBuscaInput): Promise<Json> {
  const base = {
    adults: input.adultos,
    children: input.criancas ?? 0,
    babies: input.bebes ?? 0,
    class_service: input.classe ?? 1,
    rav_percentage: input.ravPercentual ?? 0,
    is_passabot: false,
    reajustar: true,
    page: input.pagina ?? 1,
    page_size: input.porPagina ?? 8,
    ...(input.provedores?.length ? { providers: input.provedores } : {}),
  };

  const multitrecho = input.trechos.length > 1;

  if (multitrecho) {
    return passhubRequest<Json>(`${passhubBases.multi}/api/v1/search`, {
      body: {
        ...base,
        // A API multitrecho usa origin/destination (o /api-voo usa iata_from/iata_to).
        routes: input.trechos.map((t) => ({
          origin: up(t.origem),
          destination: up(t.destino),
          date: t.data,
        })),
      },
      headers: { "X-Correlation-Id": crypto.randomUUID() },
      retentativas: 1,
    });
  }

  const t = input.trechos[0]!;
  return passhubRequest<Json>(`${passhubBases.voo}/api/v1/search`, {
    body: {
      ...base,
      iata_from: up(t.origem),
      iata_to: up(t.destino),
      dates: [{ date_outbound: t.data, date_inbound: input.dataVolta || undefined }],
    },
    retentativas: 1,
  });
}

/** Tarifação do voo escolhido (revalida preço/disponibilidade). */
export async function passhubTarifar(payload: unknown): Promise<Json> {
  return passhubRequest<Json>(`${passhubBases.nexus}/api/v1/tarifar`, { body: payload, retentativas: 2 });
}
