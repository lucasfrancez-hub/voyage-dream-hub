// Parser client-side (DOMParser) do HTML copiado do portal da operadora (Infotravel/FRT).
// Extrai título, imagem, descrição, inclusos e a matriz de modalidades × datas × preços.

export type ParsedTourPrice = {
  date: string; // YYYY-MM-DD
  modality: string;
  price_per_person: number;
};

export type ParsedTour = {
  title: string;
  image_url: string;
  gallery: string[];
  description: string;
  includes: string[];
  not_includes: string[];
  modalities: string[];
  times: string[];
  tax_per_person: number;
  dates: string[];
  prices: ParsedTourPrice[];
  rawText: string;
};

const MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

/** "qua, 29 jul 26" | "29/07/2026" -> "2026-07-29" */
export function parseTourDateLabel(label: string): string | null {
  const t = label.replace(/\s+/g, " ").trim().toLowerCase();
  const br = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const m = t.match(/(\d{1,2})\s+([a-zç]{3,})\.?\s+(\d{2,4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3)];
  if (!mon) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${mon}-${m[1].padStart(2, "0")}`;
}

function parseMoney(raw: string): number | null {
  const t = raw.replace(/[^\d.,]/g, "").trim();
  if (!t) return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanText(v: string) {
  return v.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Limpa o nome da modalidade: remove o título repetido e o sufixo "- Por pessoa". */
function cleanModality(raw: string, title: string) {
  let m = cleanText(raw);
  if (title && m.toLowerCase().startsWith(title.toLowerCase())) m = m.slice(title.length);
  m = m.replace(/^[\s\-–—]+/, "");
  m = m.replace(/\s*[-–—]\s*por pessoa\s*$/i, "");
  return m.trim() || cleanText(raw);
}

/** Título do serviço: layout antigo (.servico-titulo) ou novo (link grande do card). */
function findTitleEl(root: ParentNode): Element | null {
  return (
    root.querySelector(".servico-titulo") ??
    root.querySelector('a[class*="text-2xl"]') ??
    root.querySelector('[class*="titulo-servico"]')
  );
}

/** Divide um HTML com vários serviços do portal em blocos individuais. */
export function splitTourHtmlBlocks(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Cada serviço do portal é um `.product-main-content` (contém card, matriz de
  // preços, taxas e o seletor de horários). Pegamos só os blocos mais externos.
  const outer = (list: HTMLElement[]) =>
    list.filter((el, _i, arr) => !arr.some((o) => o !== el && o.contains(el)));

  const cards = outer([
    ...doc.querySelectorAll<HTMLElement>(".product-main-content, .servico-opcao-card"),
  ]).filter((el) => findTitleEl(el));
  return cards.length ? cards.map((el) => el.outerHTML) : [html];
}


/** Interpreta um HTML com vários passeios e devolve um ParsedTour por serviço. */
export function parseMultipleTourHtml(html: string): ParsedTour[] {
  return splitTourHtmlBlocks(html)
    .map((block) => {
      try {
        return parseTourHtml(block);
      } catch {
        return null;
      }
    })
    .filter((t): t is ParsedTour => !!t && !!t.title);
}

export function parseTourHtml(html: string): ParsedTour {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style").forEach((el) => el.remove());

  const title = cleanText(doc.querySelector(".servico-titulo")?.textContent ?? "");

  const BAD_IMG = /(logo|icon|sprite|placeholder|bandeira|flag|avatar|spacer|pixel)/i;
  const absolutize = (src: string) => {
    const s = (src || "").trim();
    if (!s || s.startsWith("data:")) return "";
    if (s.startsWith("//")) return `https:${s}`;
    if (/^https?:\/\//i.test(s)) return s;
    return "";
  };
  const gallery: string[] = [];
  for (const el of [...doc.querySelectorAll("img")]) {
    const src = absolutize(
      el.getAttribute("src") ||
        el.getAttribute("data-src") ||
        el.getAttribute("data-original") ||
        "",
    );
    if (!src || BAD_IMG.test(src)) continue;
    if (!gallery.includes(src)) gallery.push(src);
  }
  const preferred = absolutize(
    doc.querySelector("img.img-servico")?.getAttribute("src") ??
      (doc.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)?.content ??
      "",
  );
  const image_url = (preferred && !BAD_IMG.test(preferred) ? preferred : gallery[0]) ?? "";
  if (image_url && !gallery.includes(image_url)) gallery.unshift(image_url);


  const descNode =
    doc.querySelector('[class*="pnlServico-"]') ??
    doc.querySelector('[class*="pnl_Servico"]');
  const description = cleanText(descNode?.textContent ?? "");

  const parseList = (marker: RegExp) => {
    const m = description.match(marker);
    if (!m) return [];
    return (m[1] ?? "")
      .replace(/^\[|\]$/g, "")
      .split(/[;\n]|,(?![^()]*\))/)
      .map((s) => cleanText(s))
      .filter((s) => s.length > 1)
      .slice(0, 30);
  };
  const includes = parseList(/inclusos?\s*:\s*([^\n]*?)(?=n[ãa]o inclusos?\s*:|$)/i);
  const not_includes = parseList(/n[ãa]o inclusos?\s*:\s*([^\n]*)$/i);

  // Matriz modalidade × data
  const dates: string[] = [];
  const modalities: string[] = [];
  const prices: ParsedTourPrice[] = [];

  const table = [...doc.querySelectorAll("table")].find((t) =>
    /modalidade/i.test(t.querySelector("thead")?.textContent ?? ""),
  );

  if (table) {
    // Alguns portais colocam tabelas auxiliares dentro das células de preço.
    // Ler todos os `tbody tr` inclui essas linhas internas como modalidades e
    // desloca as colunas. Trabalhamos somente com as linhas filhas da matriz.
    const headerRows = [...table.querySelectorAll<HTMLElement>(":scope > thead > tr")];
    const headerRow = headerRows
      .map((row) => ({
        row,
        parsed: [...row.children].map((cell) => parseTourDateLabel(cell.textContent ?? "")),
      }))
      .sort(
        (a, b) => b.parsed.filter(Boolean).length - a.parsed.filter(Boolean).length,
      )[0];
    const datesByColumn = headerRow?.parsed ?? [];
    dates.push(...datesByColumn.filter((date): date is string => Boolean(date)));

    const bodyRows = [...table.querySelectorAll<HTMLElement>(":scope > tbody > tr")];
    for (const tr of bodyRows) {
      const cells = [...tr.children] as HTMLElement[];
      if (cells.length < 2) continue;
      const modality = cleanModality(cells[0].textContent ?? "", title);
      if (!modality) continue;
      let modalityHasPrice = false;
      cells.forEach((td, columnIndex) => {
        const date = datesByColumn[columnIndex];
        if (!date) return;
        const price = parseMoney(td.textContent ?? "");
        if (price == null) return;
        prices.push({ date, modality, price_per_person: price });
        modalityHasPrice = true;
      });
      if (modalityHasPrice && !modalities.includes(modality)) modalities.push(modality);
    }
  }

  // Horários disponíveis para o passeio (select do portal)
  const times: string[] = [];
  for (const opt of [
    ...doc.querySelectorAll<HTMLOptionElement>('select[id*="selectHorario"] option'),
  ]) {
    const v = cleanText(opt.getAttribute("value") ?? opt.textContent ?? "");
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const t = `${m[1].padStart(2, "0")}:${m[2]}`;
    if (!times.includes(t)) times.push(t);
  }
  times.sort();

  const rawText = cleanText(doc.body?.textContent || doc.documentElement?.textContent || "");

  // Taxas não são importadas do portal — ficam em branco para preenchimento manual.
  const tax_per_person = 0;

  // Ignora datas e modalidades sem nenhum valor ("-" / vazio no portal)
  const datesWithPrice = [...new Set(dates.filter((d) => d && prices.some((p) => p.date === d)))];
  const modalitiesWithPrice = modalities.filter((m) => prices.some((p) => p.modality === m));

  return {
    title,
    image_url,
    gallery: gallery.slice(0, 12),
    description,
    includes,
    not_includes,
    modalities: modalitiesWithPrice,
    times,
    tax_per_person,
    dates: datesWithPrice,
    prices,
    rawText,
  };
}
