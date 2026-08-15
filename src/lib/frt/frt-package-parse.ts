/**
 * PARSER ESTRUTURAL DOS PACOTES DA FRT.
 *
 * O parser antigo (`parseResultadosHtml`) varria o pnlResultado inteiro com
 * regex global: qualquer IATA, qualquer hora e qualquer <img> viravam parte de
 * um único "resultado", produzindo hotéis com logo de companhia, voos fantasmas
 * (companhia null, horários null) e `preços: 0`.
 *
 * Aqui a leitura é HIERÁRQUICA: primeiro achamos os containers reais de
 * pacote/hotel; dentro de cada container extraímos hotel, aéreo e preço — nada
 * é lido fora do container ao qual pertence.
 */
import { parse, type HTMLElement } from "node-html-parser";

export type FrtSegmento = {
  companhia: string | null;
  codigoCompanhia: string | null;
  numeroVoo: string | null;
  origem: string | null;
  destino: string | null;
  saida: string | null;
  chegada: string | null;
  duracao: string | null;
};

export type FrtTrecho = {
  companhia: string | null;
  codigoCompanhia: string | null;
  logo: string | null;
  origem: string | null;
  destino: string | null;
  saida: string | null;
  chegada: string | null;
  duracao: string | null;
  paradas: number;
  conexoes: string[];
  segmentos: FrtSegmento[];
  classe: string | null;
  bagagem: string | null;
  trocaAeroporto: boolean;
  chegaDiaSeguinte: boolean;
};

export type FrtHotelPacote = {
  nome: string | null;
  estrelas: number | null;
  imagem: string | null;
  checkin: string | null;
  checkout: string | null;
  regime: string | null;
  quarto: string | null;
  localizacao: string | null;
};

export type FrtPrecoPacote = {
  moeda: string;
  porPessoa: number | null;
  porPessoaFormatado: string | null;
  total: number | null;
  totalFormatado: string | null;
};

export type FrtPacote = {
  id: string;
  hotel: FrtHotelPacote;
  aereo: { ida: FrtTrecho | null; volta: FrtTrecho | null };
  preco: FrtPrecoPacote;
};

export type FrtPacotesDiagnostico = {
  containers: number;
  comHotel: number;
  comPreco: number;
  comAereo: number;
  descartados: number;
  estrategia: string;
};

/* ------------------------------------------------------------------ *
 * Utilidades                                                          *
 * ------------------------------------------------------------------ */

const NAO_IATA = new Set([
  "GOL", "TAM", "TAP", "IDA", "ADT", "CHD", "INF", "VOO", "CIA", "PDF",
  "IVA", "USD", "BRL", "EUR", "SIM", "NAO", "APT", "TOT", "SUL", "PAX",
]);

export function texto(el: HTMLElement | null | undefined): string {
  if (!el) return "";
  return el.structuredText.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function linha(el: HTMLElement | null | undefined): string {
  return texto(el).replace(/\s*\n\s*/g, " ").trim();
}

/** Converte "1.724,35" / "BRL 1.724,35" em 1724.35. */
export function moedaParaNumero(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  const m = bruto.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (m) return Number(`${m[1]!.replace(/\./g, "")}.${m[2]}`);
  const simples = bruto.match(/(\d+(?:\.\d+)?)/);
  return simples ? Number(simples[1]) : null;
}

function detectarMoeda(txt: string): string {
  if (/R\$/.test(txt)) return "BRL";
  const m = txt.match(/\b(BRL|USD|EUR|ARS|CLP)\b/);
  return m?.[1] ?? "BRL";
}

function classeContem(el: HTMLElement, re: RegExp): boolean {
  return re.test(el.getAttribute("class") ?? "") || re.test(el.getAttribute("id") ?? "");
}

/** Procura, dentro do container, o primeiro elemento cuja classe/id casa. */
export function acharPorClasse(root: HTMLElement, re: RegExp): HTMLElement | null {
  const todos = root.querySelectorAll("*");
  for (const el of todos) if (classeContem(el, re)) return el;
  return null;
}

export function acharTodosPorClasse(root: HTMLElement, re: RegExp): HTMLElement[] {
  return root.querySelectorAll("*").filter((el) => classeContem(el, re));
}

const RE_PRECO_PESSOA = /price[_-]?per[_-]?person|preco[_-]?por[_-]?pessoa|valor[_-]?pessoa/i;
const RE_PRECO_TOTAL = /price[_-]?total|total[_-]?container|preco[_-]?total|valor[_-]?total/i;
const RE_HOTEL = /hotel|hospedagem|accommodation|lodging|pousada/i;
const RE_VOO = /flight|voo|aereo|air[_-]?segment|itiner/i;
const RE_IMG_LOGO = /logo|airline|cia|companhia|carrier/i;

/* ------------------------------------------------------------------ *
 * Preço                                                               *
 * ------------------------------------------------------------------ */

function extrairPreco(container: HTMLElement): FrtPrecoPacote {
  const txtTudo = texto(container);
  const moeda = detectarMoeda(txtTudo);

  const elPessoa = acharPorClasse(container, RE_PRECO_PESSOA);
  const elTotal = acharPorClasse(container, RE_PRECO_TOTAL);

  let porPessoaFmt = elPessoa ? (linha(elPessoa).match(/(?:R\$|BRL|USD|EUR)?\s?[\d.]+,\d{2}/) ?? [null])[0] : null;
  let totalFmt = elTotal ? (linha(elTotal).match(/(?:R\$|BRL|USD|EUR)?\s?[\d.]+,\d{2}/) ?? [null])[0] : null;

  // Fallback textual — ainda DENTRO do container, nunca no HTML inteiro.
  if (!porPessoaFmt) {
    porPessoaFmt =
      txtTudo.match(/por\s+pessoa[^\d]{0,20}((?:R\$|BRL|USD|EUR)?\s?[\d.]+,\d{2})/i)?.[1] ??
      txtTudo.match(/((?:R\$|BRL|USD|EUR)?\s?[\d.]+,\d{2})\s*(?:por\s+pessoa|\/\s*pessoa)/i)?.[1] ??
      null;
  }
  if (!totalFmt) {
    totalFmt =
      txtTudo.match(/(?:valor\s+)?total[^\d]{0,20}((?:R\$|BRL|USD|EUR)?\s?[\d.]+,\d{2})/i)?.[1] ?? null;
  }

  const norm = (s: string | null) => (s ? s.replace(/\s+/g, " ").replace(/^BRL/i, "R$").trim() : null);

  return {
    moeda,
    porPessoa: moedaParaNumero(porPessoaFmt),
    porPessoaFormatado: norm(porPessoaFmt),
    total: moedaParaNumero(totalFmt),
    totalFormatado: norm(totalFmt),
  };
}

/* ------------------------------------------------------------------ *
 * Hotel                                                               *
 * ------------------------------------------------------------------ */

function contarEstrelas(el: HTMLElement): number | null {
  const txt = texto(el);
  const explicito = txt.match(/(\d)\s*estrela/i);
  if (explicito?.[1]) return Number(explicito[1]);
  const icones = el
    .querySelectorAll("i, span")
    .filter((n) => /fa-star(?![-a-z])|icon-star|star-full/i.test(n.getAttribute("class") ?? ""));
  return icones.length ? Math.min(5, icones.length) : null;
}

function imagemDoHotel(bloco: HTMLElement): string | null {
  for (const img of bloco.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? img.getAttribute("data-src") ?? "";
    const alt = img.getAttribute("alt") ?? "";
    const cls = img.getAttribute("class") ?? "";
    if (!src) continue;
    // Nunca usar logo de companhia como foto do hotel.
    if (RE_IMG_LOGO.test(src) || RE_IMG_LOGO.test(alt) || RE_IMG_LOGO.test(cls)) continue;
    if (/\.svg($|\?)/i.test(src) && /logo/i.test(src)) continue;
    return src.replace(/&amp;/g, "&");
  }
  return null;
}

const RE_REGIME =
  /(caf[ée]\s+da\s+manh[ãa]|meia\s+pens[ãa]o|pens[ãa]o\s+completa|all\s+inclusive|todo\s+incluso|room\s+only|bed\s+(?:and|&)\s+breakfast|breakfast|sem\s+refei[çc][ãa]o)/i;

function extrairHotel(container: HTMLElement): FrtHotelPacote {
  const bloco = acharPorClasse(container, RE_HOTEL) ?? container;
  const txt = texto(bloco);

  const tituloEl =
    bloco.querySelector("h1, h2, h3, h4, h5") ??
    acharPorClasse(bloco, /hotel[_-]?name|nome[_-]?hotel|title|titulo/i);
  let nome = tituloEl ? linha(tituloEl) : null;
  if (!nome) {
    nome =
      txt.match(/\b((?:Hotel|Pousada|Resort|Flat|Apart|Inn|Hostel)\s+[A-Za-zÀ-ú' ]{2,60})/)?.[1]?.trim() ??
      null;
  }
  if (nome && nome.length > 90) nome = nome.slice(0, 90).trim();

  const datas = [...txt.matchAll(/([0-3]?\d\/[01]?\d\/\d{2,4})/g)].map((m) => m[1]!);

  return {
    nome,
    estrelas: contarEstrelas(bloco),
    imagem: imagemDoHotel(bloco),
    checkin: txt.match(/check-?in[:\s]*([0-3]?\d\/[01]?\d\/\d{2,4})/i)?.[1] ?? datas[0] ?? null,
    checkout: txt.match(/check-?out[:\s]*([0-3]?\d\/[01]?\d\/\d{2,4})/i)?.[1] ?? datas[1] ?? null,
    regime: txt.match(RE_REGIME)?.[1]?.trim() ?? null,
    quarto:
      txt
        .match(
          /((?:apartamento|quarto|su[íi]te|standard|luxo|superior|duplo|triplo|single|double|twin)[a-zà-úA-ZÀ-Ú ]{0,30})/i,
        )?.[1]
        ?.trim() ?? null,
    localizacao:
      linha(acharPorClasse(bloco, /endereco|address|localizacao|location|cidade/i)) || null,
  };
}

/* ------------------------------------------------------------------ *
 * Aéreo                                                               *
 * ------------------------------------------------------------------ */

function iatasDoBloco(el: HTMLElement): string[] {
  const txt = texto(el);
  return [...txt.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]!).filter((c) => !NAO_IATA.has(c));
}

function horasDoBloco(el: HTMLElement): string[] {
  return [...texto(el).matchAll(/\b([0-2]?\d:[0-5]\d)\b/g)].map((m) => m[1]!);
}

function montarSegmentos(bloco: HTMLElement): FrtSegmento[] {
  const nós = acharTodosPorClasse(bloco, /segment|trecho|leg|voo[_-]?item/i).filter(
    (n) => /\d{1,2}:\d{2}/.test(texto(n)),
  );
  const alvos = nós.length ? nós : [];
  return alvos.map((n) => {
    const iata = iatasDoBloco(n);
    const horas = horasDoBloco(n);
    const txt = texto(n);
    return {
      companhia: linha(acharPorClasse(n, /airline|cia|companhia|carrier/i)) || null,
      codigoCompanhia: txt.match(/\b([A-Z0-9]{2})\s?\d{2,4}\b/)?.[1] ?? null,
      numeroVoo: txt.match(/\b[A-Z0-9]{2}\s?(\d{2,4})\b/)?.[1] ?? null,
      origem: iata[0] ?? null,
      destino: iata[1] ?? null,
      saida: horas[0] ?? null,
      chegada: horas[1] ?? null,
      duracao: txt.match(/\b(\d{1,2}\s?h\s?\d{0,2}\s?m?)\b/i)?.[1] ?? null,
    };
  });
}

export function extrairTrecho(bloco: HTMLElement): FrtTrecho | null {
  const txt = texto(bloco);
  if (!/\d{1,2}:\d{2}/.test(txt)) return null;

  const segmentos = montarSegmentos(bloco);
  const iata = iatasDoBloco(bloco);
  const horas = horasDoBloco(bloco);

  const logoImg = bloco
    .querySelectorAll("img")
    .find((i) => RE_IMG_LOGO.test(`${i.getAttribute("src") ?? ""} ${i.getAttribute("alt") ?? ""} ${i.getAttribute("class") ?? ""}`));

  const paradasTxt = txt.match(/(\d+)\s*(?:parada|conex)/i);
  const direto = /\bdireto\b|sem\s+escala|non[-\s]?stop/i.test(txt);
  const paradas = paradasTxt
    ? Number(paradasTxt[1])
    : direto
      ? 0
      : segmentos.length
        ? Math.max(0, segmentos.length - 1)
        : 0;

  const origem = segmentos[0]?.origem ?? iata[0] ?? null;
  const destino = segmentos.length
    ? (segmentos[segmentos.length - 1]!.destino ?? iata[iata.length - 1] ?? null)
    : (iata[iata.length - 1] ?? null);

  const conexoes = segmentos.length
    ? segmentos.slice(0, -1).map((s) => s.destino).filter((c): c is string => !!c)
    : iata.slice(1, -1);

  const companhia =
    linha(acharPorClasse(bloco, /airline[_-]?name|cia[_-]?nome|companhia|carrier/i)) ||
    logoImg?.getAttribute("alt") ||
    segmentos[0]?.companhia ||
    null;

  return {
    companhia,
    codigoCompanhia: segmentos[0]?.codigoCompanhia ?? txt.match(/\b([A-Z0-9]{2})\s?\d{2,4}\b/)?.[1] ?? null,
    logo: logoImg?.getAttribute("src")?.replace(/&amp;/g, "&") ?? null,
    origem,
    destino,
    saida: segmentos[0]?.saida ?? horas[0] ?? null,
    chegada: segmentos.length
      ? (segmentos[segmentos.length - 1]!.chegada ?? horas[horas.length - 1] ?? null)
      : (horas[horas.length - 1] ?? null),
    duracao: txt.match(/\b(\d{1,2}\s?h\s?\d{0,2}\s?m?)\b/i)?.[1] ?? null,
    paradas,
    conexoes,
    segmentos,
    classe: txt.match(/\b(econ[oô]mica|executiva|primeira|premium[a-zà-ú ]{0,12})\b/i)?.[1] ?? null,
    bagagem: /bagagem|baggage|mala/i.test(txt)
      ? (txt.match(/(sem\s+bagagem|bagagem[^.;|]{0,40})/i)?.[1]?.trim() ?? null)
      : null,
    trocaAeroporto: /troca\s+de\s+aeroporto|change\s+of\s+airport/i.test(txt),
    chegaDiaSeguinte: /\+\s?1\b|dia\s+seguinte|next\s+day/i.test(txt),
  };
}

/** Agrupa os blocos aéreos do container em IDA e VOLTA. */
export function extrairAereo(container: HTMLElement): { ida: FrtTrecho | null; volta: FrtTrecho | null } {
  const blocos = acharTodosPorClasse(container, RE_VOO).filter((b) => /\d{1,2}:\d{2}/.test(texto(b)));
  // Mantém só os blocos "de fora" — um bloco dentro de outro é segmento, não voo.
  const externos = blocos.filter((b) => !blocos.some((o) => o !== b && o.querySelectorAll("*").includes(b)));

  const marcado = (b: HTMLElement, re: RegExp) =>
    re.test(b.getAttribute("class") ?? "") || re.test(b.getAttribute("id") ?? "") || re.test(texto(b));

  const idaBloco = externos.find((b) => marcado(b, /\bida\b|outbound|departure|partida/i)) ?? externos[0] ?? null;
  const voltaBloco =
    externos.find((b) => b !== idaBloco && marcado(b, /\bvolta\b|inbound|return|retorno|regresso/i)) ??
    externos.find((b) => b !== idaBloco) ??
    null;

  return {
    ida: idaBloco ? extrairTrecho(idaBloco) : null,
    volta: voltaBloco ? extrairTrecho(voltaBloco) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Containers de pacote                                                *
 * ------------------------------------------------------------------ */

/**
 * Um container de pacote é o menor elemento que contém, ao mesmo tempo, o
 * preço por pessoa (ou total) e um bloco de hotel/nome de hospedagem.
 */
function acharContainers(root: HTMLElement): { containers: HTMLElement[]; estrategia: string } {
  const porClasse = root
    .querySelectorAll("*")
    .filter((el) => classeContem(el, /package|pacote|combination|result[_-]?item|item[_-]?resultado|card[_-]?pacote|hotel[_-]?result/i));
  const folhas = porClasse.filter((el) => !porClasse.some((o) => o !== el && o.querySelectorAll("*").includes(el)));
  const comConteudo = folhas.filter((el) => /\d{1,2}\/\d{1,2}\/\d{2,4}|,\d{2}/.test(texto(el)));
  if (comConteudo.length) return { containers: comConteudo, estrategia: "classe-pacote" };

  // Fallback: sobe a partir de cada preço por pessoa até um ancestral que
  // também tenha hotel — cada preço vira exatamente um pacote.
  const precos = acharTodosPorClasse(root, RE_PRECO_PESSOA).length
    ? acharTodosPorClasse(root, RE_PRECO_PESSOA)
    : root.querySelectorAll("*").filter((el) => /por\s+pessoa/i.test(el.rawText));
  const containers: HTMLElement[] = [];
  for (const p of precos) {
    let atual: HTMLElement | null = p;
    let escolhido: HTMLElement | null = null;
    for (let i = 0; i < 8 && atual; i++) {
      const t = texto(atual);
      if (RE_HOTEL.test(t) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) {
        escolhido = atual;
        if (acharPorClasse(atual, RE_HOTEL)) break;
      }
      atual = atual.parentNode as HTMLElement | null;
    }
    if (escolhido && !containers.includes(escolhido)) containers.push(escolhido);
  }
  return { containers, estrategia: containers.length ? "ancestral-do-preco" : "nenhuma" };
}

/**
 * Converte o pnlResultado da FRT em pacotes normalizados.
 * Nunca inventa registro: pacote sem hotel E sem preço é descartado.
 */
export function parsePacotesFrt(html: string): {
  pacotes: FrtPacote[];
  diagnostico: FrtPacotesDiagnostico;
} {
  const limpo = html.replace(/<!--[\s\S]*?-->/g, "");
  const root = parse(limpo, { comment: false, blockTextElements: { script: false, style: false } });
  const { containers, estrategia } = acharContainers(root);

  const pacotes: FrtPacote[] = [];
  let descartados = 0;
  containers.forEach((c, i) => {
    const hotel = extrairHotel(c);
    const preco = extrairPreco(c);
    const aereo = extrairAereo(c);
    const util = Boolean(hotel.nome || preco.porPessoa || preco.total);
    if (!util) {
      descartados++;
      return;
    }
    pacotes.push({
      id: c.getAttribute("id") || `frt-pacote-${i + 1}`,
      hotel,
      preco,
      aereo,
    });
  });

  return {
    pacotes,
    diagnostico: {
      containers: containers.length,
      comHotel: pacotes.filter((p) => p.hotel.nome).length,
      comPreco: pacotes.filter((p) => p.preco.porPessoa || p.preco.total).length,
      comAereo: pacotes.filter((p) => p.aereo.ida || p.aereo.volta).length,
      descartados,
      estrategia,
    },
  };
}
