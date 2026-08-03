/**
 * NORMALIZAÇÃO CIDADE × AEROPORTO.
 *
 * Camada pura (sem I/O) que responde três perguntas:
 *  1. O cliente citou uma CIDADE (São Paulo) ou um AEROPORTO específico (Congonhas)?
 *  2. Quais aeroportos pertencem a essa cidade?
 *  3. O que deve ser efetivamente pesquisado no motor?
 *
 * Regra de negócio:
 *  - Pedido específico ("Congonhas", "CGH", "Guarulhos") => pesquisa SÓ aquele aeroporto.
 *  - Pedido de cidade ("São Paulo", "SAO") => pesquisa a CIDADE (todos os aeroportos).
 */

export type CidadeAeroportos = {
  /** Código de cidade usado pelo motor (multi-aeroporto). */
  cidade_codigo: string;
  cidade: string;
  termos: string[];
  aeroportos: Array<{ iata: string; nome: string; termos: string[] }>;
};

export const CIDADES: CidadeAeroportos[] = [
  {
    cidade_codigo: "SAO",
    cidade: "São Paulo",
    termos: ["sao paulo", "s paulo", "sampa", "sp capital", "sao"],
    aeroportos: [
      { iata: "GRU", nome: "Guarulhos", termos: ["guarulhos", "gru", "cumbica"] },
      { iata: "CGH", nome: "Congonhas", termos: ["congonhas", "cgh"] },
      { iata: "VCP", nome: "Viracopos (Campinas)", termos: ["viracopos", "vcp", "campinas"] },
    ],
  },
  {
    cidade_codigo: "RIO",
    cidade: "Rio de Janeiro",
    termos: ["rio de janeiro", "rio", "rj"],
    aeroportos: [
      { iata: "GIG", nome: "Galeão", termos: ["galeao", "gig", "tom jobim"] },
      { iata: "SDU", nome: "Santos Dumont", termos: ["santos dumont", "santos-dumont", "sdu"] },
    ],
  },
  {
    cidade_codigo: "BHZ",
    cidade: "Belo Horizonte",
    termos: ["belo horizonte", "bh", "bhz"],
    aeroportos: [
      { iata: "CNF", nome: "Confins", termos: ["confins", "cnf", "tancredo neves"] },
      { iata: "PLU", nome: "Pampulha", termos: ["pampulha", "plu"] },
    ],
  },
  {
    cidade_codigo: "LON",
    cidade: "Londres",
    termos: ["londres", "london", "lon"],
    aeroportos: [
      { iata: "LHR", nome: "Heathrow", termos: ["heathrow", "lhr"] },
      { iata: "LGW", nome: "Gatwick", termos: ["gatwick", "lgw"] },
      { iata: "STN", nome: "Stansted", termos: ["stansted", "stn"] },
      { iata: "LTN", nome: "Luton", termos: ["luton", "ltn"] },
      { iata: "LCY", nome: "London City", termos: ["london city", "lcy"] },
    ],
  },
  {
    cidade_codigo: "PAR",
    cidade: "Paris",
    termos: ["paris", "par"],
    aeroportos: [
      { iata: "CDG", nome: "Charles de Gaulle", termos: ["charles de gaulle", "de gaulle", "cdg", "roissy"] },
      { iata: "ORY", nome: "Orly", termos: ["orly", "ory"] },
    ],
  },
  {
    cidade_codigo: "NYC",
    cidade: "Nova York",
    termos: ["nova york", "nova iorque", "new york", "nyc"],
    aeroportos: [
      { iata: "JFK", nome: "John F. Kennedy", termos: ["jfk", "kennedy"] },
      { iata: "EWR", nome: "Newark", termos: ["newark", "ewr"] },
      { iata: "LGA", nome: "LaGuardia", termos: ["laguardia", "la guardia", "lga"] },
    ],
  },
  {
    cidade_codigo: "BUE",
    cidade: "Buenos Aires",
    termos: ["buenos aires", "bue"],
    aeroportos: [
      { iata: "EZE", nome: "Ezeiza", termos: ["ezeiza", "eze"] },
      { iata: "AEP", nome: "Aeroparque", termos: ["aeroparque", "jorge newbery", "aep"] },
    ],
  },
  {
    cidade_codigo: "MIL",
    cidade: "Milão",
    termos: ["milao", "milan", "mil"],
    aeroportos: [
      { iata: "MXP", nome: "Malpensa", termos: ["malpensa", "mxp"] },
      { iata: "LIN", nome: "Linate", termos: ["linate", "lin"] },
    ],
  },
  {
    cidade_codigo: "WAS",
    cidade: "Washington",
    termos: ["washington", "was"],
    aeroportos: [
      { iata: "IAD", nome: "Dulles", termos: ["dulles", "iad"] },
      { iata: "DCA", nome: "Reagan National", termos: ["reagan", "dca"] },
    ],
  },
];

const semAcento = (s: string): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const contem = (texto: string, termo: string): boolean =>
  new RegExp(`(?<![a-z0-9])${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(
    texto,
  );

export type LocalInterpretado = {
  /** "aeroporto" = pesquisa travada num IATA; "cidade" = pesquisa multi-aeroporto. */
  tipo: "aeroporto" | "cidade";
  /** O que deve ir para o motor. */
  codigo_pesquisa: string;
  /** Aeroporto específico, quando o cliente travou um. */
  aeroporto_iata: string | null;
  aeroporto_nome: string | null;
  cidade: string | null;
  /** Aeroportos que a pesquisa cobre. */
  aeroportos: string[];
  /** true quando o código de pesquisa representa uma cidade multi-aeroporto. */
  is_cidade: boolean;
};

/**
 * Interpreta o que o cliente falou como origem/destino.
 * Aeroporto específico tem PRIORIDADE sobre a cidade.
 */
export function interpretarLocal(texto: string): LocalInterpretado | null {
  const t = semAcento(texto);
  if (!t) return null;

  // 1) Aeroporto específico ganha sempre.
  for (const c of CIDADES) {
    for (const ap of c.aeroportos) {
      if (ap.termos.some((termo) => contem(t, termo))) {
        return {
          tipo: "aeroporto",
          codigo_pesquisa: ap.iata,
          aeroporto_iata: ap.iata,
          aeroporto_nome: ap.nome,
          cidade: c.cidade,
          aeroportos: [ap.iata],
          is_cidade: false,
        };
      }
    }
  }

  // 2) Cidade multi-aeroporto.
  for (const c of CIDADES) {
    if (c.termos.some((termo) => contem(t, termo)) || t === semAcento(c.cidade_codigo)) {
      return {
        tipo: "cidade",
        codigo_pesquisa: c.cidade_codigo,
        aeroporto_iata: null,
        aeroporto_nome: null,
        cidade: c.cidade,
        aeroportos: c.aeroportos.map((a) => a.iata),
        is_cidade: true,
      };
    }
  }

  return null;
}

/** Cidade à qual um IATA pertence ("CGH" -> São Paulo). */
export function cidadeDoAeroporto(iata: string): CidadeAeroportos | null {
  const up = String(iata ?? "").trim().toUpperCase();
  return CIDADES.find((c) => c.aeroportos.some((a) => a.iata === up)) ?? null;
}

/** Todos os aeroportos de uma cidade ("SAO" | "São Paulo" -> ["GRU","CGH","VCP"]). */
export function aeroportosDaCidade(cidadeOuCodigo: string): string[] {
  const t = semAcento(cidadeOuCodigo);
  const c =
    CIDADES.find((x) => semAcento(x.cidade_codigo) === t) ??
    CIDADES.find((x) => semAcento(x.cidade) === t || x.termos.some((termo) => contem(t, termo)));
  return c ? c.aeroportos.map((a) => a.iata) : [];
}

/** true quando o código é de cidade multi-aeroporto (SAO, RIO, LON...). */
export function isCodigoDeCidade(codigo: string): boolean {
  const up = String(codigo ?? "").trim().toUpperCase();
  return CIDADES.some((c) => c.cidade_codigo === up);
}

/** Nome amigável de um IATA de aeroporto conhecido. */
export function nomeDoAeroporto(iata: string): string | null {
  const up = String(iata ?? "").trim().toUpperCase();
  for (const c of CIDADES) {
    const ap = c.aeroportos.find((a) => a.iata === up);
    if (ap) return ap.nome;
  }
  return null;
}

/**
 * Um retorno do motor atende o pedido do cliente?
 * Aeroporto travado: só o próprio IATA. Cidade: qualquer aeroporto dela.
 */
export function atendePedido(pedido: LocalInterpretado | null, iataRetornado: string): boolean {
  if (!pedido) return true;
  const up = String(iataRetornado ?? "").trim().toUpperCase();
  if (pedido.tipo === "aeroporto") return up === pedido.aeroporto_iata;
  return pedido.aeroportos.includes(up) || up === pedido.codigo_pesquisa;
}
