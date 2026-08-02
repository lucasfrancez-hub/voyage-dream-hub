/**
 * Validações obrigatórias ANTES de qualquer pesquisa de passagem aérea.
 *
 * Regra de ouro da auditoria: a IA nunca decide sozinha se os dados estão
 * completos ou coerentes — quem decide é o servidor. Toda pesquisa passa
 * por aqui e, faltando ou estando inválido qualquer campo, a tool devolve
 * uma instrução de pergunta em vez de pesquisar.
 *
 * Puro (sem I/O), então serve para a Central, para testes e para auditoria.
 */

export type TipoTrecho = "somente_ida" | "ida_e_volta";

export type FlightSearchDraft = {
  origem?: string | null;
  destino?: string | null;
  data_ida?: string | null;
  data_volta?: string | null;
  tipo_trecho?: TipoTrecho | null;
  adultos?: number | null;
  criancas?: number | null;
  bebes?: number | null;
  /** Horários opcionais (HH:MM). Só usados para validar ida e volta no MESMO dia. */
  hora_ida?: string | null;
  hora_volta?: string | null;
  /** Confirmações explícitas de que o dado veio do cliente (nunca presumido). */
  data_informada_pelo_cliente?: boolean;
  pax_informado_pelo_cliente?: boolean;
};

export type ValidationFailure = {
  ok: false;
  faltam_dados?: true;
  dados_invalidos?: true;
  campos: string[];
  instrucao: string;
};

export type ValidationSuccess = { ok: true };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje (America/Sao_Paulo) em AAAA-MM-DD — comparável como string. */
export function hojeSaoPaulo(now: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(now);
}

/** Normaliza cidade/IATA para comparar origem x destino sem acento nem ruído. */
export function normalizeLocal(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(aeroporto|internacional|de|do|da|dos|das)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Data existe de verdade no calendário (rejeita 31/02, 2026-13-01 etc.). */
export function dataValida(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function falta(campos: string[], instrucao: string): ValidationFailure {
  return { ok: false, faltam_dados: true, campos, instrucao };
}

function invalido(campos: string[], instrucao: string): ValidationFailure {
  return { ok: false, dados_invalidos: true, campos, instrucao };
}

/**
 * Valida o rascunho da pesquisa. Ordem de coleta oficial:
 * origem → destino → tipo de trecho → data(s) → passageiros.
 */
export function validateFlightSearch(
  d: FlightSearchDraft,
  now: Date = new Date(),
): ValidationFailure | ValidationSuccess {
  const hoje = hojeSaoPaulo(now);

  // 1. origem
  if (!d.origem || d.origem.trim().length < 2) {
    return falta(["origem"], "NÃO pesquise. Pergunte de qual cidade o cliente quer sair.");
  }
  // 2. destino
  if (!d.destino || d.destino.trim().length < 2) {
    return falta(["destino"], "NÃO pesquise. Pergunte para qual cidade o cliente quer ir.");
  }
  // 2b. origem ≠ destino
  if (normalizeLocal(d.origem) === normalizeLocal(d.destino)) {
    return invalido(
      ["origem", "destino"],
      "NÃO pesquise. Origem e destino são a mesma cidade. Confirme com naturalidade qual é a cidade de saída e qual é a de chegada.",
    );
  }

  // 3. tipo de trecho — campo explícito, nunca deduzido
  if (d.tipo_trecho !== "somente_ida" && d.tipo_trecho !== "ida_e_volta") {
    return falta(
      ["tipo_trecho"],
      "NÃO pesquise. Pergunte, em uma frase curta, se a viagem é somente ida ou ida e volta.",
    );
  }

  // 4. datas
  if (!d.data_informada_pelo_cliente) {
    return falta(
      ["data_ida"],
      "NÃO pesquise. O cliente ainda não informou a data. Pergunte qual é a data da ida. Nunca sugira nem assuma uma data.",
    );
  }
  if (!d.data_ida || !dataValida(d.data_ida)) {
    return invalido(
      ["data_ida"],
      "NÃO pesquise. A data de ida não é uma data válida. Confirme com o cliente o dia, o mês e o ano da ida.",
    );
  }
  if (d.data_ida < hoje) {
    return invalido(
      ["data_ida"],
      "NÃO pesquise. A data de ida já passou. Confirme com naturalidade a data correta (e o ano) da viagem.",
    );
  }
  if (d.tipo_trecho === "ida_e_volta") {
    if (!d.data_volta) {
      return falta(
        ["data_volta"],
        "NÃO pesquise. A viagem é ida e volta e falta a data da volta. Pergunte a data do retorno.",
      );
    }
    if (!dataValida(d.data_volta)) {
      return invalido(
        ["data_volta"],
        "NÃO pesquise. A data de volta não é válida. Confirme o dia, o mês e o ano do retorno.",
      );
    }
    if (d.data_volta < d.data_ida) {
      return invalido(
        ["data_volta"],
        "NÃO pesquise. A data de volta é anterior à de ida. Confirme com o cliente as duas datas.",
      );
    }
  }

  // 5. passageiros
  if (!d.pax_informado_pelo_cliente) {
    return falta(
      ["adultos"],
      "NÃO pesquise. Pergunte quantas pessoas vão viajar. Nunca assuma a quantidade.",
    );
  }
  const ad = Number(d.adultos ?? 0);
  if (!Number.isInteger(ad) || ad < 1 || ad > 9) {
    return invalido(
      ["adultos"],
      "NÃO pesquise. A quantidade de adultos precisa ser de 1 a 9. Confirme quantos passageiros vão viajar.",
    );
  }
  const cr = Number(d.criancas ?? 0);
  const bb = Number(d.bebes ?? 0);
  if (cr < 0 || bb < 0 || ad + cr + bb > 9) {
    return invalido(
      ["adultos", "criancas", "bebes"],
      "NÃO pesquise. O total de passageiros passa de 9. Confirme os números com o cliente (grupos maiores vão para o time Comercial).",
    );
  }
  if (bb > ad) {
    return invalido(
      ["bebes"],
      "NÃO pesquise. Há mais bebês de colo do que adultos. Confirme a composição dos passageiros.",
    );
  }

  return { ok: true };
}
