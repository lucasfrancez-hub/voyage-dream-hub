/**
 * FRT / Infotravel — parsing puro (sem rede, sem credenciais).
 *
 * O portal é JSF/PrimeFaces: as respostas de pesquisa vêm como
 * <partial-response><update><![CDATA[ HTML ]]></update></partial-response>.
 *
 * Este módulo é 100% determinístico e testável.
 */

export type FrtHotel = {
  nome: string | null;
  estrelas: number | null;
  imagem: string | null;
  checkin: string | null;
  checkout: string | null;
  regime: string | null;
  quarto: string | null;
  localizacao: string | null;
};

export type FrtVoo = {
  companhia: string | null;
  codigoCompanhia: string | null;
  origem: string | null;
  destino: string | null;
  saida: string | null;
  chegada: string | null;
  duracao: string | null;
  paradas: number | null;
  conexao: string | null;
  trocaAeroporto: boolean;
  classe: string | null;
  bagagemIncluida: boolean | null;
  chegaDiaSeguinte: boolean;
};

export type FrtPreco = {
  moeda: string | null;
  porPessoa: number | null;
  total: number | null;
  taxas: number | null;
};

export type FrtResultado = {
  id: string;
  hotel: FrtHotel | null;
  voos: FrtVoo[];
  preco: FrtPreco;
};

export type FrtSearchInput = {
  origem: string;
  destino: string;
  ida: string; // YYYY-MM-DD
  volta?: string | null; // YYYY-MM-DD
  adultos?: number;
  criancas?: number;
  pais?: string;
  companhia?: string;
};

export type FrtSearchResponse = {
  success: boolean;
  source: "FRT";
  search: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    adults: number;
    children: number;
  };
  results: FrtResultado[];
  availableResults: number;
  searchedAt: string;
  error?: FrtErrorCode;
  message?: string;
};

export type FrtErrorCode =
  | "FRT_AUTH_FAILED"
  | "FRT_2FA_REQUIRED"
  | "FRT_STRUCTURE_CHANGED"
  | "FRT_SESSION_EXPIRED"
  | "FRT_TIMEOUT"
  | "FRT_NETWORK_ERROR"
  | "FRT_MISSING_CREDENTIALS";

export class FrtError extends Error {
  code: FrtErrorCode;
  detail?: string;
  constructor(code: FrtErrorCode, message?: string, detail?: string) {
    super(message ?? code);
    this.name = "FrtError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * Utilidades de HTML
 * ------------------------------------------------------------------ */

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)));
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai o javax.faces.ViewState de um HTML completo ou de um partial-response. */
export function extractViewState(body: string): string | null {
  const inPartial = body.match(
    /<update[^>]*id="[^"]*javax\.faces\.ViewState[^"]*"[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/update>/i,
  );
  if (inPartial?.[1]) return decodeEntities(inPartial[1].trim());

  const input = body.match(
    /<input[^>]+name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/i,
  );
  if (input?.[1]) return decodeEntities(input[1]);

  const inputRev = body.match(
    /<input[^>]+value="([^"]*)"[^>]*name="javax\.faces\.ViewState"/i,
  );
  if (inputRev?.[1]) return decodeEntities(inputRev[1]);

  return null;
}

/**
 * Detecta dinamicamente o name do botão de login (ex.: j_idt33), sem fixar ID.
 * Procura por submits dentro do formulário master.
 */
export function detectLoginButtonName(html: string): string | null {
  const candidates: Array<{ name: string; score: number }> = [];
  const re = /<(?:input|button)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] ?? "";
    const name = attrs.match(/\bname="([^"]+)"/i)?.[1];
    if (!name) continue;
    const type = attrs.match(/\btype="([^"]+)"/i)?.[1]?.toLowerCase() ?? "";
    const value = attrs.match(/\bvalue="([^"]*)"/i)?.[1] ?? "";
    const cls = attrs.match(/\bclass="([^"]*)"/i)?.[1] ?? "";
    const isSubmit = type === "submit" || /ui-button/i.test(cls);
    if (!isSubmit) continue;
    let score = 0;
    if (/entrar|acessar|login|sign/i.test(value)) score += 5;
    if (/j_idt\d+/i.test(name)) score += 2;
    if (/login|entrar|acessar/i.test(name)) score += 4;
    candidates.push({ name, score });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.name;
}

/** Verdadeiro quando o HTML é claramente a tela de login (sessão inválida). */
export function looksLikeLoginPage(body: string): boolean {
  return (
    /login-senha-input/i.test(body) ||
    /name="login-usuario-input"/i.test(body) ||
    /<partial-response[^>]*>\s*<redirect[^>]+url="[^"]*login\.xhtml/i.test(body)
  );
}

/** Verdadeiro quando o partial-response indica sessão expirada / ViewState inválido. */
export function looksLikeSessionExpired(body: string): boolean {
  return (
    /ViewExpiredException/i.test(body) ||
    /sess[aã]o\s+(expirad|encerrad)/i.test(body) ||
    looksLikeLoginPage(body)
  );
}

/** Extrai o HTML de dentro dos blocos <update> do partial-response. */
export function extractPartialUpdates(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /<update\s+id="([^"]+)"[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/update>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out[m[1]!] = m[2] ?? "";
  }
  if (Object.keys(out).length === 0) {
    const plain = /<update\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/update>/gi;
    while ((m = plain.exec(xml))) out[m[1]!] = m[2] ?? "";
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Normalização de valores
 * ------------------------------------------------------------------ */

export function parseMoneyBR(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const txt = decodeEntities(raw).replace(/\s/g, "");
  const m = txt.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const int = (m[1] ?? "").replace(/\./g, "");
  const dec = m[2] ?? "00";
  const v = Number(`${int}.${dec}`);
  return Number.isFinite(v) ? v : null;
}

export function parseMoeda(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.toUpperCase();
  if (/R\$|BRL/.test(t)) return "BRL";
  if (/US\$|USD/.test(t)) return "USD";
  if (/€|EUR/.test(t)) return "EUR";
  return null;
}

function firstMatch(html: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = html.match(re);
    if (m?.[1]) {
      const v = stripTags(m[1]);
      if (v) return v;
    }
  }
  return null;
}

function countStars(html: string): number | null {
  const explicit = html.match(/(\d)\s*estrela/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const icons = html.match(/fa-star(?![-a-z])/gi);
  if (icons?.length) return Math.min(5, icons.length);
  return null;
}

/* ------------------------------------------------------------------ *
 * Parse de resultados
 * ------------------------------------------------------------------ */

const HORA = /\b([0-2]?\d:[0-5]\d)\b/g;

/** Siglas de 3 letras que aparecem no HTML mas não são aeroportos. */
const NAO_IATA = new Set([
  "GOL",
  "TAM",
  "TAP",
  "IDA",
  "ADT",
  "CHD",
  "INF",
  "VOO",
  "CIA",
  "PDF",
  "IVA",
  "USD",
  "BRL",
  "EUR",
]);

export function parseVoosFromHtml(html: string): FrtVoo[] {
  const blocos = splitBlocks(html, [
    /class="[^"]*(?:voo|flight|aereo|trecho|itinerario)[^"]*"/i,
  ]);
  const alvo = blocos.length ? blocos : [html];
  const voos: FrtVoo[] = [];

  for (const b of alvo) {
    const texto = stripTags(b);
    if (!/\d{1,2}:\d{2}/.test(texto)) continue;

    const horas = [...texto.matchAll(HORA)].map((m) => m[1]!);
    const iata = [...texto.matchAll(/\b([A-Z]{3})\b/g)]
      .map((m) => m[1]!)
      .filter((c) => !NAO_IATA.has(c));
    const paradasTxt = texto.match(/(\d+)\s*(?:parada|conex)/i);
    const direto = /\bdireto\b|sem\s+escala|n[aã]o\s+para/i.test(texto);

    voos.push({
      companhia:
        firstMatch(b, [
          /alt="([^"]{2,60})"[^>]*class="[^"]*(?:cia|airline|companhia)/i,
          /class="[^"]*(?:cia|airline|companhia)[^"]*"[^>]*>([\s\S]{1,120}?)</i,
        ]) ?? null,
      codigoCompanhia:
        b.match(/\b([A-Z0-9]{2})\s?\d{2,4}\b/)?.[1] ??
        b.match(/(?:cia|airline)[^>]*>\s*([A-Z0-9]{2})\s*</i)?.[1] ??
        null,
      origem: iata[0] ?? null,
      destino: iata[1] ?? null,
      saida: horas[0] ?? null,
      chegada: horas[1] ?? null,
      duracao: texto.match(/\b(\d{1,2}h\s?\d{0,2}m?)\b/i)?.[1] ?? null,
      paradas: paradasTxt ? Number(paradasTxt[1]) : direto ? 0 : null,
      conexao: iata[2] ?? null,
      trocaAeroporto: /troca\s+de\s+aeroporto/i.test(texto),
      classe:
        texto.match(/\b(econ[oô]mica|executiva|primeira|premium[^,.;]*)\b/i)?.[1] ??
        null,
      bagagemIncluida: /bagagem/i.test(texto)
        ? !/sem\s+bagagem|n[aã]o\s+inclui\s+bagagem/i.test(texto)
        : null,
      chegaDiaSeguinte: /\+\s?1\b|dia\s+seguinte/i.test(texto),
    });
  }
  return voos;
}

export function parseHotelFromHtml(html: string): FrtHotel | null {
  const texto = stripTags(html);
  const nome = firstMatch(html, [
    /class="[^"]*(?:nomeHotel|hotel-nome|nome-hotel|titulo-hotel)[^"]*"[^>]*>([\s\S]{2,160}?)</i,
    /<h[2-4][^>]*>([\s\S]{2,160}?)<\/h[2-4]>/i,
  ]);
  const imagem =
    html.match(/<img[^>]+src="([^"]+)"[^>]*>/i)?.[1]?.replace(/&amp;/g, "&") ?? null;
  if (!nome && !/hotel|pousada|resort|flat|hospedagem/i.test(texto)) return null;

  return {
    nome,
    estrelas: countStars(html),
    imagem,
    checkin: texto.match(/check-?in[:\s]*([0-3]?\d\/[01]?\d\/\d{2,4})/i)?.[1] ?? null,
    checkout: texto.match(/check-?out[:\s]*([0-3]?\d\/[01]?\d\/\d{2,4})/i)?.[1] ?? null,
    regime:
      texto.match(
        /(caf[ée]\s+da\s+manh[ãa]|meia\s+pens[ãa]o|pens[ãa]o\s+completa|all\s+inclusive|sem\s+refei[çc][ãa]o)/i,
      )?.[1] ?? null,
    quarto:
      texto
        .match(
          /((?:apartamento|quarto|su[íi]te|standard|luxo|superior|duplo|triplo)[a-zà-úA-ZÀ-Ú ]{0,30})/i,
        )?.[1]
        ?.trim() ?? null,
    localizacao:
      firstMatch(html, [
        /class="[^"]*(?:endereco|localizacao|address|local)[^"]*"[^>]*>([\s\S]{2,160}?)</i,
      ]) ?? null,
  };
}

export function parsePrecoFromHtml(html: string): FrtPreco {
  const texto = stripTags(html);
  const moeda = parseMoeda(texto);
  const porPessoa = parseMoneyBR(
    texto.match(/(?:por\s+pessoa|p\/\s*pessoa)[^\d]{0,20}([\d.,]+)/i)?.[1] ??
      texto.match(/([\d.]+,\d{2})\s*(?:por\s+pessoa)/i)?.[1] ??
      null,
  );
  const total = parseMoneyBR(
    texto.match(/(?:total|valor\s+total)[^\d]{0,20}([\d.,]+)/i)?.[1] ?? null,
  );
  const taxas = parseMoneyBR(
    texto.match(/(?:taxas?|tx)[^\d]{0,20}([\d.,]+)/i)?.[1] ?? null,
  );
  const qualquer = parseMoneyBR(texto.match(/([\d.]+,\d{2})/)?.[1] ?? null);

  return {
    moeda,
    porPessoa: porPessoa ?? (total === null ? qualquer : null),
    total: total ?? (porPessoa === null ? qualquer : null),
    taxas,
  };
}

/** Divide o HTML em blocos de resultado usando marcadores de classe. */
function splitBlocks(html: string, markers: RegExp[]): string[] {
  for (const marker of markers) {
    const cls = marker.source
      .match(/\(\?:([^)]+)\)/)?.[1]
      ?.split("|")
      .filter(Boolean);
    if (!cls) continue;
    const re = new RegExp(
      `<(div|li|tr|article)[^>]*class="[^"]*(?:${cls.join("|")})[^"]*"[\\s\\S]*?(?=<\\1[^>]*class="[^"]*(?:${cls.join("|")})|$)`,
      "gi",
    );
    const found = html.match(re);
    if (found && found.length) return found;
  }
  return [];
}

const RESULT_MARKERS = [
  /class="[^"]*(?:resultado|pacote-item|item-pacote|card-pacote|linha-resultado|produto)[^"]*"/i,
];

/**
 * Converte o HTML do painel de resultados em objetos normalizados.
 * Lança FRT_STRUCTURE_CHANGED quando não encontra nenhuma estrutura conhecida.
 */
export function parseResultadosHtml(html: string): {
  results: FrtResultado[];
  availableResults: number;
} {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const disponiveis = Number(
    stripTags(clean).match(/(\d+)\s*(?:resultados?|pacotes?|op[çc][õo]es)/i)?.[1] ??
      0,
  );

  const blocos = splitBlocks(clean, RESULT_MARKERS);
  const alvo = blocos.length ? blocos : [];

  const results: FrtResultado[] = alvo.map((b, i) => ({
    id:
      b.match(/\bid="([^"]+)"/i)?.[1] ??
      `frt-${i + 1}`,
    hotel: parseHotelFromHtml(b),
    voos: parseVoosFromHtml(b),
    preco: parsePrecoFromHtml(b),
  }));

  const uteis = results.filter(
    (r) => r.hotel?.nome || r.voos.length || r.preco.total || r.preco.porPessoa,
  );

  return {
    results: uteis,
    availableResults: disponiveis || uteis.length,
  };
}

/** Nomes de campos esperados no motor de pacotes. */
export const FRT_FIELDS = {
  form: "frmMotorPacote",
  origem: "frmMotorPacote:j_idt3287",
  destino: "frmMotorPacote:j_idt3300",
  ida: "frmMotorPacote:dtPartidaPacote_input",
  volta: "frmMotorPacote:dtRetornoPacote_input",
  pais: "frmMotorPacote:idNmPaisPacote_input",
  companhia: "frmMotorPacote:idCiaAereaPesquisa_input",
  botao: "frmMotorPacote:btnMotorPacotePesquisa",
} as const;

/**
 * Confere se os campos esperados existem no HTML da tela de venda e tenta
 * redescobrir origem/destino quando o ID j_idt mudou.
 */
export function resolveSearchFields(html: string): {
  fields: Record<keyof typeof FRT_FIELDS, string>;
  missing: string[];
  changed: string[];
} {
  const has = (name: string) =>
    new RegExp(`name="${name.replace(/[:$]/g, "\\$&")}"`, "i").test(html) ||
    new RegExp(`id="${name.replace(/[:$]/g, "\\$&")}"`, "i").test(html);

  const fields = { ...FRT_FIELDS } as Record<keyof typeof FRT_FIELDS, string>;
  const missing: string[] = [];
  const changed: string[] = [];

  // origem/destino: se o ID mudou, procurar autocompletes do frmMotorPacote na ordem
  if (!has(FRT_FIELDS.origem) || !has(FRT_FIELDS.destino)) {
    const autos = [
      ...html.matchAll(/name="(frmMotorPacote:j_idt\d+(?:_input)?)"/gi),
    ].map((m) => m[1]!);
    const uniq = [...new Set(autos)];
    if (uniq.length >= 2) {
      if (!has(FRT_FIELDS.origem)) {
        fields.origem = uniq[0]!;
        changed.push(`origem: ${FRT_FIELDS.origem} -> ${uniq[0]}`);
      }
      if (!has(FRT_FIELDS.destino)) {
        fields.destino = uniq[1]!;
        changed.push(`destino: ${FRT_FIELDS.destino} -> ${uniq[1]}`);
      }
    } else {
      if (!has(FRT_FIELDS.origem)) missing.push(FRT_FIELDS.origem);
      if (!has(FRT_FIELDS.destino)) missing.push(FRT_FIELDS.destino);
    }
  }

  for (const key of ["ida", "volta", "botao"] as const) {
    if (!has(FRT_FIELDS[key])) missing.push(FRT_FIELDS[key]);
  }

  return { fields, missing, changed };
}

/** dd/MM/yyyy a partir de yyyy-MM-dd. */
export function toBrDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Remove valores sensíveis (cookies, senha, tokens) de qualquer texto de log. */
export function maskSensitive(text: string): string {
  return text
    .replace(/(JSESSIONID=)[^;\s]+/gi, "$1***")
    .replace(/(login-senha-input=)[^&\s]+/gi, "$1***")
    .replace(/(password["'=:\s]+)[^&"'\s]+/gi, "$1***")
    .replace(/(Cookie:\s*)[^\n]+/gi, "$1***");
}
