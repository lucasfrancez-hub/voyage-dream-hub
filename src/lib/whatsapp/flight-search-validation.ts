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
  /**
   * true SOMENTE quando a cidade de embarque foi dita pelo próprio cliente
   * (ou já registrada nesta conversa por ele). Cadastro, cidade da empresa,
   * conversa antiga, hub mais próximo ou qualquer padrão = false.
   */
  origem_informada_pelo_cliente?: boolean;
  /**
   * Origem recuperada do histórico da conversa. É apenas SUGESTÃO: nunca
   * libera a pesquisa, só muda a pergunta para uma confirmação natural.
   */
  origem_sugerida_pelo_historico?: string | null;
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

  // 1. origem — nunca presumida (cadastro, empresa, hub próximo, conversa antiga,
  // origem de pacote pronto). Só passa com confirmação explícita === true.
  if (d.origem_informada_pelo_cliente !== true) {
    return falta(
      ["origem"],
      "NÃO pesquise. A cidade de embarque NÃO foi informada pelo cliente. Pergunte: \"De qual cidade você vai embarcar?\". Nunca use o cadastro, a cidade da empresa, o aeroporto mais próximo, a origem de um pacote pronto nem qualquer cidade padrão.",
    );
  }
  if (!d.origem || d.origem.trim().length < 2) {
    return falta(
      ["origem"],
      "NÃO pesquise. Pergunte de qual cidade o cliente vai embarcar. Nunca presuma a cidade.",
    );
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
    // Volta no MESMO dia da ida é válida (ex.: ida 07:00, volta 20:00).
    // Só bloqueia quando o retorno é ANTERIOR à ida.
    if (d.data_volta < d.data_ida) {
      return invalido(
        ["data_volta"],
        "NÃO pesquise. A data de volta é anterior à de ida. Confirme com o cliente as duas datas.",
      );
    }
    // Mesmo dia: se os horários vierem informados, o retorno precisa sair
    // depois da ida (com folga mínima para a ida chegar ao destino).
    if (d.data_volta === d.data_ida && d.hora_ida && d.hora_volta) {
      const min = (h: string) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (hh > 23 || mm > 59) return null;
        return hh * 60 + mm;
      };
      const ida = min(d.hora_ida);
      const volta = min(d.hora_volta);
      if (ida !== null && volta !== null && volta <= ida) {
        return invalido(
          ["hora_volta"],
          "NÃO pesquise. A ida e a volta são no mesmo dia e o horário do retorno é igual ou anterior ao da ida. Confirme os horários com o cliente.",
        );
      }
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

/* ─────────────────────────────────────────────────────────────
   Combinação real de ida e volta (bate-volta e virada de dia)
   ───────────────────────────────────────────────────────────── */

/**
 * Converte o carimbo do motor ("2026-08-10 07:35", já no horário LOCAL de cada
 * aeroporto) em minutos comparáveis. Retorna null quando o formato não bate.
 */
export function stampToMinutes(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s ?? "").trim());
  if (!m) return null;
  return (
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 60000
  );
}

/** Folga mínima entre pousar da ida e decolar da volta (conexão em solo). */
export const FOLGA_MIN_MINUTOS = 60;

/**
 * A combinação ida + volta é possível?
 *
 * Compara a CHEGADA FINAL da ida (com conexões e virada de dia já embutidas no
 * carimbo do motor) com a PARTIDA INICIAL da volta. Nunca compara saída x saída.
 * Quando a volta parte de um aeroporto diferente do de chegada da ida, exige
 * uma folga maior para o deslocamento em solo.
 */
export function combinacaoIdaVoltaValida(
  ida: { chegada?: string | null; destino?: string | null } | null | undefined,
  volta: { partida?: string | null; origem?: string | null } | null | undefined,
): boolean {
  if (!ida || !volta) return true; // somente ida: nada a combinar
  const chegada = stampToMinutes(ida.chegada);
  const partida = stampToMinutes(volta.partida);
  if (chegada === null || partida === null) return true; // sem dado, não descarta
  const mudaAeroporto =
    !!ida.destino && !!volta.origem && ida.destino.toUpperCase() !== volta.origem.toUpperCase();
  const folga = mudaAeroporto ? FOLGA_MIN_MINUTOS * 3 : FOLGA_MIN_MINUTOS;
  return partida - chegada >= folga;
}

