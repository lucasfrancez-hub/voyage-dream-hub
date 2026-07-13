// Voucher Via Air — modelo "ChatGPT" (2026-07)
// PDF único com layout fiel ao modelo aprovado:
// - Cabeçalho: título da viagem grande + contato + logo Via Air
// - Cartão VOUCHER ID em azul marinho
// - PASSAGEIRO (tabela: passageiro, documento, data de nascimento)
// - AÉREO (IDA/VOLTA em cartões, IATA→plane→IATA, conexões, QR clicável p/ cia)
// - HOSPEDAGEM (foto, dados, QR clicável do mapa)
// - INFORMAÇÕES GERAIS + EMERGÊNCIAS
// - Rodapé: mensagem "Leve este voucher…"
//
// QRs são anotações /Link (URI), então clicáveis no PDF em tela.

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFPage,
  PDFFont,
  PDFImage,
  PDFString,
  PDFName,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";

import QRCode from "qrcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import type { OrderDetail, OrderItem, OrderPassenger } from "./orders.functions";
import { type HotelMapData } from "./voucher-map.functions";
import { translateText } from "./translate.functions";

// --- Traduções auxiliares para o voucher em inglês ---
const translateGuestsPtToEn = (input: string): string => {
  if (!input) return input;
  let out = input;
  out = out.replace(/\badultos?\b/gi, (m: string) => (m.toLowerCase() === "adulto" ? "adult" : "adults"));
  out = out.replace(/\bcrian[çc]as?\b/gi, (m: string) => (m.toLowerCase().endsWith("s") ? "children" : "child"));
  out = out.replace(/\bbeb[êe]s?\b/gi, (m: string) => (m.toLowerCase().endsWith("s") ? "infants" : "infant"));
  out = out.replace(/\bh[óo]spedes?\b/gi, (m: string) => (m.toLowerCase().endsWith("s") ? "guests" : "guest"));
  return out;
};


const translateNotesToEnglish = async (text: string): Promise<string> => {
  try {
    const r = await translateText({ data: { text, target: "en" } });
    return (r?.text ?? "").trim() || text;
  } catch (e) {
    console.warn("translateNotesToEnglish failed", e);
    return text;
  }
};


// ---------- Layout ----------
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 34;
const CONTENT_W = A4.w - MARGIN * 2;

// Paleta (baseada no modelo do ChatGPT)
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_TEXT = rgb(0.09, 0.11, 0.15);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);
const COLOR_BORDER = rgb(0.86, 0.88, 0.92);
const COLOR_ROW_ALT = rgb(0.97, 0.97, 0.98);
const COLOR_NAVY = rgb(19 / 255, 33 / 255, 68 / 255);       // #132144 - azul marinho
const COLOR_NAVY_SOFT = rgb(230 / 255, 234 / 255, 245 / 255);
const COLOR_ORANGE = rgb(241 / 255, 140 / 255, 51 / 255);   // acento laranja
const COLOR_RED = rgb(217 / 255, 42 / 255, 42 / 255);
const COLOR_RED_SOFT = rgb(253 / 255, 235 / 255, 235 / 255);

const COMPANY = {
  email: "comercial@voeair.com",
  phone: "(44) 99951-4838",
  address: "Rua Takeshi Mitsuyasu, 355 - Jardim Panorama",
  cityLine: "Paranavaí - PR - CEP 87707-120",
};

// ---------- i18n ----------
export type VoucherLang = "pt" | "en";

const L = {
  pt: {
    voucherId: "VOUCHER ID",
    passageiro: "PASSAGEIRO",
    tipo: "TIPO",
    documento: "DOCUMENTO",
    dataNasc: "NASCIMENTO",
    bilhetePax: "BILHETE",
    aereo: "AEREO",
    ida: "IDA",
    volta: "VOLTA",
    localizador: "Localizador",
    bilhete: "Bilhete",
    verifiqueCia: "Clique ou escaneie para\nverificar na companhia aerea",
    bagInclusa: "Bagagem inclusa",
    bagBolsa: "Bolsa/mochila",
    bagMao: "Bagagem de mao",
    bagDesp: "Bagagem despachada",
    conexao: "Conexao em",
    hospedagem: "HOSPEDAGEM",
    checkin: "CHECK-IN",
    checkout: "CHECK-OUT",
    noites: "NOITES",
    hospedes: "HOSPEDES",
    locHotel: "Clique ou escaneie para\nver a localizacao do hotel",
    infoGerais: "INFORMACOES GERAIS",
    infoHotel: "HOTEL:",
    infoHotelText: "O horario de check-in pode ser apos as 15h e o check-out ate as 10h. Confirme com o estabelecimento na chegada.",
    infoVoos: "VOOS:",
    infoVoosText: "apresente-se 3h antes em voos internacionais e 2h antes em voos domesticos.",
    emerg: "EMERGENCIAS",
    emergText: "Em caso de emergencia durante a viagem, entre em contato imediatamente com a Central de Atendimento Via Air.",
    footerLeve: "Leve este voucher",
    footerLeveText: "com voce durante toda a viagem.",
    footerObr: "Agradecemos por escolher a Via Air. Boa viagem!",
    politicaHotel: "POLITICA DO HOTEL",
    adulto: "Adulto",
    crianca: "Crianca",
    infantil: "Infantil",
    servicos: "SERVICOS",
    saida: "SAIDA",
    chegada: "CHEGADA",
    categoria: "Categoria",
  },
  en: {
    voucherId: "VOUCHER ID",
    passageiro: "GUEST",
    tipo: "TYPE",
    documento: "DOCUMENT",
    dataNasc: "DATE OF BIRTH",
    bilhetePax: "TICKET",
    aereo: "FLIGHT",
    ida: "OUTBOUND",
    volta: "RETURN",
    localizador: "Booking code",
    bilhete: "Ticket",
    verifiqueCia: "Tap or scan to check\non the airline website",
    bagInclusa: "Baggage included",
    bagBolsa: "Personal item",
    bagMao: "Carry-on",
    bagDesp: "Checked bag",
    conexao: "Layover in",
    hospedagem: "ACCOMMODATION",
    checkin: "CHECK-IN",
    checkout: "CHECK-OUT",
    noites: "NIGHTS",
    hospedes: "GUESTS",
    locHotel: "Tap or scan to see\nthe hotel location",
    infoGerais: "GENERAL INFORMATION",
    infoHotel: "HOTEL:",
    infoHotelText: "Check-in after 3pm and check-out by 10am. Please confirm on arrival.",
    infoVoos: "FLIGHTS:",
    infoVoosText: "arrive 3h early for international and 2h early for domestic flights.",
    emerg: "EMERGENCIES",
    emergText: "In case of emergency during your trip, contact Via Air support immediately.",
    footerLeve: "Keep this voucher",
    footerLeveText: "with you throughout your trip.",
    footerObr: "Thank you for choosing Via Air. Safe travels!",
    politicaHotel: "HOTEL POLICY",
    adulto: "Adult",
    crianca: "Child",
    infantil: "Infant",
    servicos: "SERVICES",
    saida: "DEPARTURE",
    chegada: "ARRIVAL",
    categoria: "Category",
  },
} as const;

// ---------- Helpers ----------
const sanitize = (s: string | null | undefined): string => {
  if (s == null) return "";
  return String(s)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2192\u27A1\u2794]/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2194/g, "<->")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")
    .replace(/[^\x00-\xFF]/g, "");
};

const fmtDateBR = (s: string | null | undefined): string => {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const fmtTime = (s: string | null | undefined): string => {
  if (!s) return "";
  const m = String(s).match(/[T\s](\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return "";
};

const diffDays = (a: string, b: string): number => {
  const da = new Date(a + "T00:00");
  const db = new Date(b + "T00:00");
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000));
};

// ---------- Ctx / drawing ----------
type Color = ReturnType<typeof rgb>;
type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  lang: VoucherLang;
  order: OrderDetail["order"];
  logo?: PDFImage;
  pages: PDFPage[];
};

const T = (ctx: Ctx) => L[ctx.lang];

const measure = (font: PDFFont, s: string, size: number): number =>
  font.widthOfTextAtSize(sanitize(s), size);

const drawText = (
  ctx: Ctx,
  s: string,
  x: number,
  opts?: { size?: number; bold?: boolean; color?: Color; y?: number },
) => {
  const size = opts?.size ?? 9;
  ctx.page.drawText(sanitize(s), {
    x,
    y: opts?.y ?? ctx.y,
    size,
    font: opts?.bold ? ctx.fontBold : ctx.font,
    color: opts?.color ?? COLOR_TEXT,
  });
};

const wrap = (font: PDFFont, size: number, s: string, maxWidth: number): string[] => {
  const clean = sanitize(s);
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tentative = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(tentative, size) <= maxWidth) cur = tentative;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

// Rounded rectangle drawn as center rect + 4 corner circles + edge fill.
// Simplified: half-circles left/right (pill) or full 4 corners (radius).
const drawRoundedRect = (
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  color: Color,
  radius?: number,
) => {
  const r = Math.min(radius ?? h / 2, h / 2, w / 2);
  page.drawRectangle({ x: x + r, y, width: w - 2 * r, height: h, color });
  page.drawRectangle({ x, y: y + r, width: w, height: h - 2 * r, color });
  page.drawCircle({ x: x + r, y: y + r, size: r, color });
  page.drawCircle({ x: x + w - r, y: y + r, size: r, color });
  page.drawCircle({ x: x + r, y: y + h - r, size: r, color });
  page.drawCircle({ x: x + w - r, y: y + h - r, size: r, color });
};

// Outlined rounded rectangle (border only).
const drawRoundedBorder = (
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  color: Color,
  _radius = 8,
  thickness = 0.6,
) => {
  // Borda simples retangular (sem "bolinhas" de canto).
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: color, borderWidth: thickness,
  });
};

const addLinkAnnotation = (
  ctx: Ctx,
  x: number, y: number, w: number, h: number,
  url: string,
) => {
  if (!url) return;
  try {
    const uriAction = ctx.pdf.context.obj({
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    });
    const annot = ctx.pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: uriAction,
    });
    const ref = ctx.pdf.context.register(annot);
    const annots = ctx.page.node.lookup(PDFName.of("Annots"));
    if (annots && "push" in (annots as unknown as { push?: unknown })) {
      (annots as unknown as { push: (r: unknown) => void }).push(ref);
    } else {
      ctx.page.node.set(PDFName.of("Annots"), ctx.pdf.context.obj([ref]));
    }
  } catch (e) {
    console.error("addLinkAnnotation failed", e);
  }
};

const newPage = (ctx: Ctx) => {
  ctx.page = ctx.pdf.addPage([A4.w, A4.h]);
  ctx.pages.push(ctx.page);
  ctx.y = A4.h - MARGIN;
};

const ensureSpace = (ctx: Ctx, needed: number) => {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
};

// ---------- Icons (vector) ----------
type IconKind =
  | "envelope" | "phone" | "pin" | "ticket" | "user" | "plane" | "bed"
  | "calendar" | "moon" | "users" | "info" | "building" | "planeSmall"
  | "phoneRed" | "envelopeRed" | "clock"
  | "bagPersonal" | "bagCarry" | "bagChecked" | "check" | "cross";

const drawIcon = (page: PDFPage, kind: IconKind, x: number, y: number, size: number, color: Color) => {
  const s = size;
  switch (kind) {
    case "envelope": {
      page.drawRectangle({ x, y: y + s * 0.15, width: s, height: s * 0.7, borderColor: color, borderWidth: s * 0.08, color: COLOR_WHITE });
      page.drawLine({ start: { x, y: y + s * 0.85 }, end: { x: x + s / 2, y: y + s * 0.5 }, thickness: s * 0.08, color });
      page.drawLine({ start: { x: x + s, y: y + s * 0.85 }, end: { x: x + s / 2, y: y + s * 0.5 }, thickness: s * 0.08, color });
      break;
    }
    case "phone": {
      page.drawRectangle({ x: x + s * 0.25, y: y + s * 0.1, width: s * 0.5, height: s * 0.8, borderColor: color, borderWidth: s * 0.08, color: COLOR_WHITE });
      page.drawCircle({ x: x + s / 2, y: y + s * 0.2, size: s * 0.06, color });
      break;
    }
    case "pin": {
      page.drawCircle({ x: x + s / 2, y: y + s * 0.65, size: s * 0.28, color });
      page.drawCircle({ x: x + s / 2, y: y + s * 0.68, size: s * 0.1, color: COLOR_WHITE });
      page.drawLine({ start: { x: x + s / 2 - s * 0.2, y: y + s * 0.5 }, end: { x: x + s / 2, y: y + s * 0.05 }, thickness: s * 0.06, color });
      page.drawLine({ start: { x: x + s / 2 + s * 0.2, y: y + s * 0.5 }, end: { x: x + s / 2, y: y + s * 0.05 }, thickness: s * 0.06, color });
      break;
    }
    case "ticket": {
      // Bilhete horizontal, cheio, com recortes semicirculares nas laterais
      // e tracejado vertical no meio (estilo boarding pass)
      const bodyY = y + s * 0.22;
      const bodyH = s * 0.56;
      const r = s * 0.06;
      // corpo com cantos arredondados
      page.drawRectangle({ x: x + r, y: bodyY, width: s - 2 * r, height: bodyH, color });
      page.drawRectangle({ x, y: bodyY + r, width: s, height: bodyH - 2 * r, color });
      page.drawCircle({ x: x + r, y: bodyY + r, size: r, color });
      page.drawCircle({ x: x + s - r, y: bodyY + r, size: r, color });
      page.drawCircle({ x: x + r, y: bodyY + bodyH - r, size: r, color });
      page.drawCircle({ x: x + s - r, y: bodyY + bodyH - r, size: r, color });
      // recortes brancos nas laterais (meio)
      page.drawCircle({ x, y: bodyY + bodyH / 2, size: s * 0.11, color: COLOR_WHITE });
      page.drawCircle({ x: x + s, y: bodyY + bodyH / 2, size: s * 0.11, color: COLOR_WHITE });
      // perfuração central (3 tracinhos brancos verticais)
      const perfX = x + s * 0.62;
      const perfW = s * 0.04;
      const perfH = s * 0.09;
      const gap = s * 0.055;
      for (let i = -1; i <= 1; i++) {
        page.drawRectangle({
          x: perfX,
          y: bodyY + bodyH / 2 - perfH / 2 + i * (perfH + gap),
          width: perfW,
          height: perfH,
          color: COLOR_WHITE,
        });
      }
      break;
    }
    case "user": {
      page.drawCircle({ x: x + s / 2, y: y + s * 0.72, size: s * 0.2, color });
      page.drawCircle({ x: x + s / 2, y: y + s * 0.2, size: s * 0.35, color });
      page.drawRectangle({ x, y, width: s, height: s * 0.2, color: COLOR_WHITE });
      break;
    }
    case "users": {
      page.drawCircle({ x: x + s * 0.35, y: y + s * 0.75, size: s * 0.17, color });
      page.drawCircle({ x: x + s * 0.7, y: y + s * 0.75, size: s * 0.17, color });
      page.drawCircle({ x: x + s * 0.5, y: y + s * 0.3, size: s * 0.35, color });
      page.drawRectangle({ x, y, width: s, height: s * 0.15, color: COLOR_WHITE });
      break;
    }
    case "plane": {
      // Avião estilizado
      const cx = x + s / 2, cy = y + s / 2;
      page.drawLine({ start: { x: x + s * 0.1, y: cy }, end: { x: x + s * 0.9, y: cy }, thickness: s * 0.14, color });
      page.drawLine({ start: { x: cx - s * 0.05, y: y + s * 0.2 }, end: { x: cx + s * 0.1, y: cy }, thickness: s * 0.1, color });
      page.drawLine({ start: { x: cx - s * 0.05, y: y + s * 0.8 }, end: { x: cx + s * 0.1, y: cy }, thickness: s * 0.1, color });
      break;
    }
    case "planeSmall": {
      // Compacto para linhas
      const cx = x + s / 2, cy = y + s / 2;
      page.drawLine({ start: { x: x, y: cy }, end: { x: x + s, y: cy }, thickness: s * 0.18, color });
      page.drawLine({ start: { x: cx, y: y + s * 0.25 }, end: { x: cx + s * 0.15, y: cy }, thickness: s * 0.12, color });
      page.drawLine({ start: { x: cx, y: y + s * 0.75 }, end: { x: cx + s * 0.15, y: cy }, thickness: s * 0.12, color });
      break;
    }
    case "bed": {
      // Cama: cabeceira + colchão + travesseiro
      page.drawRectangle({ x, y: y + s * 0.15, width: s, height: s * 0.25, color });
      page.drawRectangle({ x, y: y + s * 0.4, width: s * 0.35, height: s * 0.25, color });
      page.drawLine({ start: { x, y: y + s * 0.15 }, end: { x, y: y + s * 0.85 }, thickness: s * 0.1, color });
      break;
    }
    case "building": {
      page.drawRectangle({ x: x + s * 0.15, y, width: s * 0.7, height: s * 0.95, borderColor: color, borderWidth: s * 0.08 });
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          page.drawRectangle({ x: x + s * 0.28 + c * s * 0.28, y: y + s * 0.15 + r * s * 0.25, width: s * 0.15, height: s * 0.12, color });
        }
      }
      break;
    }
    case "calendar": {
      // Corpo do calendário
      page.drawRectangle({ x, y, width: s, height: s * 0.8, borderColor: color, borderWidth: s * 0.08, color: COLOR_WHITE });
      // Faixa superior colorida
      page.drawRectangle({ x, y: y + s * 0.65, width: s, height: s * 0.15, color });
      // Argolinhas no topo
      page.drawLine({ start: { x: x + s * 0.28, y: y + s * 0.78 }, end: { x: x + s * 0.28, y: y + s * 0.95 }, thickness: s * 0.09, color });
      page.drawLine({ start: { x: x + s * 0.72, y: y + s * 0.78 }, end: { x: x + s * 0.72, y: y + s * 0.95 }, thickness: s * 0.09, color });
      break;
    }
    case "moon": {
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.45, color });
      page.drawCircle({ x: x + s * 0.65, y: y + s * 0.6, size: s * 0.4, color: COLOR_WHITE });
      break;
    }
    case "info": {
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.45, color });
      page.drawCircle({ x: x + s / 2, y: y + s * 0.72, size: s * 0.06, color: COLOR_WHITE });
      page.drawLine({ start: { x: x + s / 2, y: y + s * 0.28 }, end: { x: x + s / 2, y: y + s * 0.6 }, thickness: s * 0.12, color: COLOR_WHITE });
      break;
    }
    case "clock": {
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.48, color });
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.48 - s * 0.1, color: COLOR_WHITE });
      // ponteiro vertical (12h → centro)
      page.drawLine({ start: { x: x + s / 2, y: y + s / 2 }, end: { x: x + s / 2, y: y + s * 0.78 }, thickness: s * 0.09, color });
      // ponteiro horizontal (centro → 3h)
      page.drawLine({ start: { x: x + s / 2, y: y + s / 2 }, end: { x: x + s * 0.72, y: y + s / 2 }, thickness: s * 0.09, color });
      break;
    }
    case "phoneRed": {
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.45, color: COLOR_RED });
      page.drawRectangle({ x: x + s * 0.32, y: y + s * 0.25, width: s * 0.36, height: s * 0.5, color: COLOR_WHITE });
      break;
    }
    case "envelopeRed": {
      page.drawRectangle({ x: x + s * 0.1, y: y + s * 0.25, width: s * 0.8, height: s * 0.5, color: COLOR_RED });
      page.drawLine({ start: { x: x + s * 0.1, y: y + s * 0.75 }, end: { x: x + s / 2, y: y + s * 0.5 }, thickness: s * 0.08, color: COLOR_WHITE });
      page.drawLine({ start: { x: x + s * 0.9, y: y + s * 0.75 }, end: { x: x + s / 2, y: y + s * 0.5 }, thickness: s * 0.08, color: COLOR_WHITE });
      break;
    }
    case "bagPersonal": {
      // Bolsa/mochila: retângulo com alça em U
      page.drawRectangle({ x: x + s * 0.15, y, width: s * 0.7, height: s * 0.7, color });
      page.drawLine({ start: { x: x + s * 0.3, y: y + s * 0.7 }, end: { x: x + s * 0.3, y: y + s * 0.9 }, thickness: s * 0.08, color });
      page.drawLine({ start: { x: x + s * 0.7, y: y + s * 0.7 }, end: { x: x + s * 0.7, y: y + s * 0.9 }, thickness: s * 0.08, color });
      page.drawLine({ start: { x: x + s * 0.3, y: y + s * 0.9 }, end: { x: x + s * 0.7, y: y + s * 0.9 }, thickness: s * 0.08, color });
      break;
    }
    case "bagCarry": {
      // Bagagem de mão: maleta com alça
      page.drawRectangle({ x, y, width: s, height: s * 0.65, color });
      page.drawRectangle({ x: x + s * 0.35, y: y + s * 0.65, width: s * 0.3, height: s * 0.1, color });
      page.drawLine({ start: { x: x + s * 0.4, y: y + s * 0.75 }, end: { x: x + s * 0.4, y: y + s * 0.95 }, thickness: s * 0.06, color });
      page.drawLine({ start: { x: x + s * 0.6, y: y + s * 0.75 }, end: { x: x + s * 0.6, y: y + s * 0.95 }, thickness: s * 0.06, color });
      break;
    }
    case "bagChecked": {
      // Bagagem despachada: mala grande com haste
      page.drawRectangle({ x, y, width: s, height: s * 0.75, color });
      page.drawRectangle({ x: x + s * 0.35, y: y + s * 0.75, width: s * 0.3, height: s * 0.15, color });
      page.drawLine({ start: { x: x, y: y + s * 0.4 }, end: { x: x + s, y: y + s * 0.4 }, thickness: s * 0.04, color: COLOR_WHITE });
      break;
    }
    case "check": {
      page.drawLine({ start: { x: x + s * 0.15, y: y + s * 0.5 }, end: { x: x + s * 0.42, y: y + s * 0.22 }, thickness: s * 0.14, color });
      page.drawLine({ start: { x: x + s * 0.42, y: y + s * 0.22 }, end: { x: x + s * 0.9, y: y + s * 0.75 }, thickness: s * 0.14, color });
      break;
    }
    case "cross": {
      page.drawLine({ start: { x: x + s * 0.15, y: y + s * 0.15 }, end: { x: x + s * 0.85, y: y + s * 0.85 }, thickness: s * 0.12, color });
      page.drawLine({ start: { x: x + s * 0.85, y: y + s * 0.15 }, end: { x: x + s * 0.15, y: y + s * 0.85 }, thickness: s * 0.12, color });
      break;
    }
  }
};

// ---------- QR helper ----------
const embedQR = async (
  ctx: Ctx,
  url: string,
  darkHex = "#132144",
): Promise<PDFImage | null> => {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 1, width: 240, color: { dark: darkHex, light: "#FFFFFF" },
    });
    const bytes = base64ToBytes(dataUrl.split(",")[1]);
    return await ctx.pdf.embedPng(bytes);
  } catch (e) {
    console.error("QR embed failed", e);
    return null;
  }
};

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// ---------- Header ----------
const drawHeader = (ctx: Ctx) => {
  const order = ctx.order;
  const top = A4.h - MARGIN;

  // Título da viagem
  const tripTitle = String(order.tripTitle ?? "").trim().toUpperCase()
    || (ctx.lang === "pt" ? "PACOTE DE VIAGEM" : "TRAVEL PACKAGE");

  // Logo box dimensions (posicionada depois, após computar o bloco de contatos)
  const logoBoxW = 180;
  const logoBoxH = 54;
  const logoX = A4.w - MARGIN - logoBoxW;

  // Título à esquerda com barrinha laranja (alinhados)
  const titleSize = 13;
  const titleBaseline = top - titleSize;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: titleBaseline - 1,
    width: 3.5,
    height: titleSize + 1,
    color: COLOR_ORANGE,
  });
  const titleMaxW = logoX - MARGIN - 40;
  const titleLines = wrap(ctx.fontBold, titleSize, tripTitle, titleMaxW);
  let ty = titleBaseline;
  for (const ln of titleLines.slice(0, 2)) {
    ctx.page.drawText(sanitize(ln), {
      x: MARGIN + 12, y: ty, size: titleSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
    ty -= titleSize + 3;
  }

  // Contatos (email, phone, address)
  let cy = ty - 12;
  const iconSize = 11;
  const contactX = MARGIN + 4;
  const textX = contactX + iconSize + 8;

  drawIcon(ctx.page, "envelope", contactX, cy - 2, iconSize, COLOR_NAVY);
  ctx.page.drawText(sanitize(COMPANY.email), {
    x: textX, y: cy, size: 10, font: ctx.font, color: COLOR_TEXT,
  });
  cy -= 16;

  drawIcon(ctx.page, "phone", contactX, cy - 2, iconSize, COLOR_NAVY);
  ctx.page.drawText(sanitize(COMPANY.phone), {
    x: textX, y: cy, size: 10, font: ctx.font, color: COLOR_TEXT,
  });
  cy -= 16;

  drawIcon(ctx.page, "pin", contactX, cy - 2, iconSize, COLOR_NAVY);
  ctx.page.drawText(sanitize(COMPANY.address), {
    x: textX, y: cy, size: 9.5, font: ctx.font, color: COLOR_TEXT,
  });
  cy -= 12;
  ctx.page.drawText(sanitize(COMPANY.cityLine), {
    x: textX, y: cy, size: 9.5, font: ctx.font, color: COLOR_TEXT,
  });
  cy -= 10;

  // Bottom do header = topo do card do Voucher ID
  const headerBottomY = cy - 16;

  // Logo Via Air centralizada verticalmente entre o topo da página e o topo do Voucher ID
  const centerY = (A4.h + headerBottomY) / 2;
  const logoY = centerY - logoBoxH / 2;
  if (ctx.logo) {
    const ratio = ctx.logo.width / ctx.logo.height;
    let h = logoBoxH;
    let w = h * ratio;
    if (w > logoBoxW) { w = logoBoxW; h = w / ratio; }
    ctx.page.drawImage(ctx.logo, {
      x: logoX + (logoBoxW - w),
      y: logoY + (logoBoxH - h) / 2,
      width: w, height: h,
    });
  }

  // Divider vertical entre os dados e a logo
  const dividerX = logoX - 18;
  ctx.page.drawLine({
    start: { x: dividerX, y: top - 6 },
    end: { x: dividerX, y: cy + 4 },
    thickness: 0.8,
    color: COLOR_BORDER,
  });

  ctx.y = headerBottomY;
};



// ---------- Voucher ID card ----------
const drawVoucherIdCard = (ctx: Ctx) => {
  const t = T(ctx);
  const h = 24;
  ensureSpace(ctx, h + 10);
  const y = ctx.y - h;
  const labelSize = 9.5;
  const label = `${t.voucherId}: `;
  const number = String(ctx.order.orderNumber);
  const iconPad = 10;
  const iconW = 10;
  const gapIconText = 8;
  const rightPad = 14;
  const labelW = measure(ctx.fontBold, label, labelSize);
  const numberW = measure(ctx.fontBold, number, labelSize);
  const w = iconPad + iconW + gapIconText + labelW + numberW + rightPad;
  drawRoundedRect(ctx.page, MARGIN, y, w, h, COLOR_NAVY, 5);
  drawIcon(ctx.page, "ticket", MARGIN + iconPad, y + (h - iconW) / 2, iconW, COLOR_ORANGE);
  const textX = MARGIN + iconPad + iconW + gapIconText;
  ctx.page.drawText(sanitize(label), {
    x: textX, y: y + 8, size: labelSize, font: ctx.fontBold, color: COLOR_ORANGE,
  });
  ctx.page.drawText(sanitize(number), {
    x: textX + labelW, y: y + 8, size: labelSize, font: ctx.fontBold, color: COLOR_WHITE,
  });
  ctx.y = y - 10;
};

// ---------- Card wrapper (bordered rounded) ----------
const openSectionCard = (ctx: Ctx, needed: number): { top: number; x: number; w: number } => {
  ensureSpace(ctx, needed);
  const top = ctx.y;
  return { top, x: MARGIN, w: CONTENT_W };
};

const closeSectionCard = (
  ctx: Ctx,
  top: number,
  bottomYUsed: number,
) => {
  const h = top - bottomYUsed + 6;
  drawRoundedBorder(ctx.page, MARGIN, top - h, CONTENT_W, h, COLOR_BORDER, 10, 0.7);
  ctx.y = top - h - 10;
};

// Título de seção dentro do card, com ícone circular azul
const drawSectionHeader = (
  ctx: Ctx,
  y: number,
  icon: IconKind,
  title: string,
  rightText?: string,
) => {
  // Empurra o círculo do ícone totalmente para dentro do card (não pode estourar borda)
  const cy = y - 22;
  const circleR = 11;
  const circleCX = MARGIN + 14 + circleR; // margem interna de 14 até borda esquerda do círculo
  const circleCY = cy + 8;
  ctx.page.drawCircle({ x: circleCX, y: circleCY, size: circleR, color: COLOR_NAVY });
  drawIcon(ctx.page, icon, circleCX - circleR * 0.55, circleCY - circleR * 0.55, circleR * 1.1, COLOR_WHITE);
  // Título
  ctx.page.drawText(sanitize(title), {
    x: circleCX + circleR + 10, y: cy + 4, size: 11.5, font: ctx.fontBold, color: COLOR_NAVY,
  });
  if (rightText) {
    const size = 9;
    const tw = measure(ctx.fontBold, rightText, size);
    ctx.page.drawText(sanitize(rightText), {
      x: MARGIN + CONTENT_W - 16 - tw, y: cy + 6, size, font: ctx.fontBold, color: COLOR_NAVY,
    });
  }
  return cy - 4;
};

// ---------- Passageiros ----------
const formatTicketNumber = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

const passengerTypeLabel = (t: ReturnType<typeof T>, kind: string): string => {

  const k = (kind ?? "").toUpperCase();
  if (k === "CHD") return t.crianca;
  if (k === "INF") return t.infantil;
  return t.adulto;
};

const drawPassengersSection = (ctx: Ctx, passengers: OrderPassenger[]) => {
  if (!passengers.length) return;
  const t = T(ctx);
  const rowH = 16;
  const headerH = 26;
  const colHeaderH = 18;
  const cardH = headerH + colHeaderH + rowH * passengers.length + 16;
  const { top } = openSectionCard(ctx, cardH + 20);
  const headerBottom = drawSectionHeader(ctx, top, "user", t.passageiro);

  const innerX = MARGIN + 20;
  const innerW = CONTENT_W - 40;

  // Só mostra a coluna Bilhete se pelo menos um passageiro tem número de bilhete
  const showTicket = passengers.some((p) => ((p.ticket_number ?? "").trim().length > 0));

  const weights = showTicket ? [2.2, 0.9, 1.6, 1.1, 1.3] : [2.4, 1.0, 1.8, 1.2];
  const units = weights.reduce((a, b) => a + b, 0);
  const colWs = weights.map((u) => (innerW * u) / units);
  const colXs: number[] = [];
  {
    let acc = 0;
    for (const w of colWs) { colXs.push(innerX + acc); acc += w; }
  }
  let cy = headerBottom - 8;

  ctx.page.drawLine({
    start: { x: MARGIN + 12, y: cy + 4 },
    end: { x: MARGIN + CONTENT_W - 12, y: cy + 4 },
    thickness: 0.5, color: COLOR_BORDER,
  });
  cy -= 6;

  const headers = showTicket
    ? [t.passageiro, t.tipo, t.documento, t.dataNasc, t.bilhetePax]
    : [t.passageiro, t.tipo, t.documento, t.dataNasc];
  headers.forEach((h, i) => {
    ctx.page.drawText(sanitize(h), {
      x: colXs[i], y: cy, size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
    });
  });
  cy -= 12;

  passengers.forEach((p) => {
    const name = (p.full_name ?? "").toUpperCase();
    const doc = p.doc_type === "passport"
      ? (p.passport_number ? `PPT ${p.passport_number}` : "-")
      : (p.cpf ? `CPF ${p.cpf}` : (p.document ?? "-"));
    const tipo = passengerTypeLabel(t, p.passenger_type ?? "ADT");
    const dob = p.birth_date ? fmtDateBR(p.birth_date) : "-";
    const rawTicket = (p.ticket_number ?? "").trim();
    const ticketFmt = formatTicketNumber(rawTicket);
    const cells = showTicket
      ? [name || "-", tipo, doc, dob, ticketFmt || "-"]
      : [name || "-", tipo, doc, dob];

    cells.forEach((v, i) => {
      ctx.page.drawText(sanitize(v), {
        x: colXs[i], y: cy, size: 8.5, font: ctx.fontBold,
        color: showTicket && i === 4 && v !== "-" ? COLOR_ORANGE : COLOR_TEXT,
      });
    });
    cy -= rowH;
  });

  closeSectionCard(ctx, top, cy + 6);
};

// ---------- Aéreo ----------
const airlineCheckinURL = (item: OrderItem): string => {
  const d = (item.details ?? {}) as Record<string, unknown>;
  const url = String(d.airline_checkin_url ?? "").trim();
  if (url) return url;
  const airline = String(d.airline ?? "").trim();
  const flight = String(d.flight_number ?? "").trim();
  const q = encodeURIComponent(`${airline} ${flight} check-in`.trim());
  return `https://www.google.com/search?q=${q}`;
};

const computeDuration = (dep: string, arr: string): string => {
  if (!dep || !arr) return "";
  const ms = new Date(arr).getTime() - new Date(dep).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
};

const drawDashedVLine = (
  page: PDFPage,
  x: number, y1: number, y2: number,
  color: Color,
) => {
  const step = 4;
  for (let yy = Math.min(y1, y2); yy < Math.max(y1, y2); yy += step) {
    page.drawLine({
      start: { x, y: yy }, end: { x, y: yy + step * 0.5 },
      thickness: 0.6, color,
    });
  }
};

// Aviãozinho estilizado (silhueta de jato) — sempre apontando para a direita.
const drawNicePlane = (
  page: PDFPage,
  cx: number, cy: number, w: number,
  color: Color,
  flip = false,
) => {
  // Silhueta cheia estilo Font-Awesome, apontando para a direita.
  // Bounding box aproximado: 576 x 512 (viewBox FA). Nariz à direita.
  const path =
    "M 482 336 C 512 336 542 306 542 276 C 542 246 512 216 482 216 L 384 216 L 250 40 C 240 24 220 16 200 16 L 168 16 C 158 16 152 24 156 34 L 216 216 L 96 216 L 56 168 C 48 158 36 152 24 156 L 8 160 C 0 162 -2 170 2 178 L 48 276 L 2 374 C -2 382 0 390 8 392 L 24 396 C 36 400 48 394 56 384 L 96 336 L 216 336 L 156 518 C 152 528 158 536 168 536 L 200 536 C 220 528 240 528 250 512 L 384 336 Z";
  const nativeW = 576;
  const nativeH = 552;
  const scale = w / nativeW;
  if (flip) {
    // Espelha apenas no eixo X, mantendo o eixo Y intacto (mirror sobre x=cx).
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(-1, 0, 0, 1, 2 * cx, 0),
    );
    page.drawSvgPath(path, {
      x: cx - (nativeW / 2) * scale,
      y: cy + (nativeH / 2) * scale,
      scale,
      color,
    });
    page.pushOperators(popGraphicsState());
  } else {
    page.drawSvgPath(path, {
      x: cx - (nativeW / 2) * scale,
      y: cy + (nativeH / 2) * scale,
      scale,
      color,
    });
  }
};



const drawFlightLegBlock = (
  ctx: Ctx,
  y: number,
  labelText: string,
  labelColor: Color,
  segments: OrderItem[],
  locator: string,
  ticket: string,
  qr?: { img: PDFImage | null; url: string },
  airlineLogos?: Map<number, PDFImage | null>,
  isReturn = false,

): number => {
  const outerX = MARGIN + 14;
  const outerW = CONTENT_W - 28;
  // Reserva sempre a coluna do QR — para IDA e VOLTA ficarem alinhadas
  const qrColW = 84;
  const segColW = outerW - qrColW;

  const chipW = 66;
  const chipH = 18;
  const chipY = y - chipH;
  drawRoundedRect(ctx.page, outerX, chipY, chipW, chipH, labelColor, 4);
  const lblW = measure(ctx.fontBold, labelText, 10);
  ctx.page.drawText(sanitize(labelText), {
    x: outerX + (chipW - lblW) / 2, y: chipY + 5, size: 10, font: ctx.fontBold, color: COLOR_WHITE,
  });

  const t = T(ctx);
  if (locator) {
    // Chip do localizador da companhia (mesmo estilo do chip da hospedagem)
    const locChipSize = 9;
    const locChipText = `${t.localizador}: ${locator}`;
    const locChipTw = measure(ctx.fontBold, locChipText, locChipSize);
    const locChipW = locChipTw + 24;
    const locChipH = 20;
    const locChipX = outerX + chipW + 10;
    const locChipY = chipY + (chipH - locChipH) / 2;
    drawRoundedRect(ctx.page, locChipX, locChipY, locChipW, locChipH, COLOR_NAVY_SOFT, 6);
    ctx.page.drawText(sanitize(locChipText), {
      x: locChipX + 12, y: locChipY + 6, size: locChipSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
  }
  void ticket;


  let cy = chipY - 22;
  

  // --- Card único cinza contendo TODOS os trechos + faixas de conexão ---
  const pillH = 16;
  const segContentH = 68;

  const conBandH = 28;
  const padTop = pillH / 2 + 6;
  const padBot = 10;
  const cardH =
    padTop
    + segments.length * segContentH
    + Math.max(0, segments.length - 1) * conBandH
    + padBot;
  const cardX = outerX;
  const cardW = segColW;
  const cardTopY = cy;
  const cardBotY = cardTopY - cardH;
  drawRoundedRect(ctx.page, cardX, cardBotY, cardW, cardH, COLOR_ROW_ALT, 10);

  // Coluna reservada à esquerda para a logo da companhia (uma por trecho)
  const logoColW = 56;
  const segInsetX = logoColW;




  segments.forEach((seg, i) => {
    const d = (seg.details ?? {}) as Record<string, unknown>;
    const fromIata = String(d.from_iata ?? d.origin ?? "").trim() || "-";
    const toIata = String(d.to_iata ?? d.destination ?? "").trim() || "-";
    const fromCity = String(d.from_city ?? "").trim();
    const toCity = String(d.to_city ?? "").trim();
    const dep = String(d.depart_at ?? "").trim();
    const arr = String(d.arrive_at ?? "").trim();
    const airline = String(d.airline ?? "").trim();
    const flightNo = String(d.flight_number ?? "").trim();
    const cabin = String(d.cabin_class ?? d.cabin ?? "").trim();

    // Região do conteúdo deste trecho (dentro do card único, à direita da coluna do logo)
    const segTopY = cardTopY - padTop - i * (segContentH + conBandH);
    const segBotY = segTopY - segContentH;
    const segX = cardX + segInsetX;
    const segW = cardW - segInsetX;

    // Logo da companhia deste trecho (uma por voo), centralizada verticalmente na área do trecho
    const segLogo = airlineLogos?.get(i) ?? null;
    if (segLogo) {
      const maxLogoW = logoColW - 12;
      const maxLogoH = Math.min(34, segContentH - 8);
      const ratio = segLogo.width / segLogo.height;
      let lh = maxLogoH;
      let lw = lh * ratio;
      if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ratio; }
      const lx = cardX + (logoColW - lw) / 2;
      const ly = segBotY + (segContentH - lh) / 2;
      ctx.page.drawImage(segLogo, { x: lx, y: ly, width: lw, height: lh });
    }


    // Pill "Cia · Voo · Cabine" (sem logo dentro)
    const pillParts = [airline, flightNo, cabin].filter(Boolean);
    const pillText = pillParts.join(" · ");
    const pillSize = 8;
    const pillTw = measure(ctx.fontBold, pillText, pillSize);
    const pillW = pillTw + 18;
    const pillX = segX + (segW - pillW) / 2;
    // Trecho 0: pill straddles a borda superior do card
    // Trechos seguintes: pill centralizada dentro do bloco do trecho, acima das cidades
    const pillCenterY = i === 0 ? cardTopY : segTopY - 2;
    const pillY = pillCenterY - pillH / 2;
    drawRoundedRect(ctx.page, pillX, pillY, pillW, pillH, COLOR_NAVY, 8);
    ctx.page.drawText(sanitize(pillText), {
      x: pillX + 9, y: pillY + 4, size: pillSize, font: ctx.fontBold, color: COLOR_WHITE,
    });

    // IATA + tracejado + avião
    const iataSize = 16;
    const leftX = segX + 12;
    const rightX = segX + segW - 12 - measure(ctx.fontBold, toIata, iataSize);
    // Empurra as IATAs pra baixo do pill quando o pill fica dentro do bloco
    const iataY = segBotY + segContentH - (i === 0 ? 28 : 30);
    ctx.page.drawText(sanitize(fromIata), {
      x: leftX, y: iataY, size: iataSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
    ctx.page.drawText(sanitize(toIata), {
      x: rightX, y: iataY, size: iataSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
    const midY = iataY + iataSize / 2 - 3;
    const leftEdge = leftX + measure(ctx.fontBold, fromIata, iataSize) + 12;
    const rightEdge = rightX - 12;
    const totalDashW = rightEdge - leftEdge;
    const dashCount = Math.max(6, Math.floor(totalDashW / 6));
    const dashSpacing = totalDashW / dashCount;
    for (let dI = 0; dI < dashCount; dI++) {
      const dx = leftEdge + dI * dashSpacing;
      ctx.page.drawLine({
        start: { x: dx, y: midY }, end: { x: dx + dashSpacing * 0.5, y: midY },
        thickness: 0.6, color: COLOR_MUTED,
      });
    }
    // Aviãozinho estilizado no meio (silhueta cheia, apontando pra direita)
    const planeCX = (leftEdge + rightEdge) / 2;
    // "Corta" o tracejado atrás do avião com um retângulo cinza
    ctx.page.drawRectangle({
      x: planeCX - 14, y: midY - 6, width: 28, height: 12, color: COLOR_ROW_ALT,
    });
    drawNicePlane(ctx.page, planeCX, midY, 22, COLOR_NAVY, isReturn);
    if (segments.length === 1) {
      const dLbl = ctx.lang === "en" ? "Direct" : "Direto";
      const dSize = 7;
      const dw = measure(ctx.fontBold, dLbl, dSize);
      ctx.page.drawText(sanitize(dLbl), {
        x: planeCX - dw / 2, y: midY - 22, size: dSize, font: ctx.fontBold, color: COLOR_NAVY,
      });
    }

    // Cidades + horários
    const bottomY = segBotY + 6;
    if (fromCity) {
      ctx.page.drawText(sanitize(fromCity), {
        x: leftX, y: bottomY + 17, size: 7.5, font: ctx.font, color: COLOR_MUTED,
      });
    }
    if (toCity) {
      const cityW = measure(ctx.font, toCity, 7.5);
      ctx.page.drawText(sanitize(toCity), {
        x: segX + segW - 12 - cityW, y: bottomY + 17, size: 7.5, font: ctx.font, color: COLOR_MUTED,
      });
    }
    const depTxt = dep ? `${fmtDateBR(dep)}  ${fmtTime(dep)}` : "";
    const arrTxt = arr ? `${fmtDateBR(arr)}  ${fmtTime(arr)}` : "";
    if (depTxt) {
      ctx.page.drawText(sanitize(depTxt), {
        x: leftX, y: bottomY, size: 8, font: ctx.fontBold, color: COLOR_TEXT,
      });
    }
    if (arrTxt) {
      const w = measure(ctx.fontBold, arrTxt, 8);
      ctx.page.drawText(sanitize(arrTxt), {
        x: segX + segW - 12 - w, y: bottomY, size: 8, font: ctx.fontBold, color: COLOR_TEXT,
      });
    }

    // Faixa de conexão entre este trecho e o próximo (dentro do mesmo card)
    if (i < segments.length - 1) {
      const nextD = (segments[i + 1].details ?? {}) as Record<string, unknown>;
      const nextDep = String(nextD.depart_at ?? "").trim();
      const layoverText = computeDuration(arr, nextDep);
      const conText = ctx.lang === "en"
        ? `Layover${layoverText ? " " + layoverText : ""}`
        : `Conexão${layoverText ? " " + layoverText : ""}`;

      // Faixa entre segBotY (bottom deste trecho) e (segBotY - conBandH)
      const bandTopY = segBotY;
      const bandBotY = segBotY - conBandH;
      const dividerY = bandTopY - 4;

      // Linha divisória horizontal
      ctx.page.drawLine({
        start: { x: segX + 6, y: dividerY },
        end: { x: segX + segW - 6, y: dividerY },
        thickness: 0.6, color: COLOR_BORDER,
      });

      // Círculo azul com relógio + texto à direita, centralizados no divisor
      const cSize = 8;
      const circleR = 9;
      const gap = 8;
      const textW = measure(ctx.fontBold, conText, cSize);
      const groupW = circleR * 2 + gap + textW;
      const groupX = segX + (segW - groupW) / 2;
      const circleCX = groupX + circleR;
      // Círculo com fundo branco para "cortar" a linha
      ctx.page.drawCircle({ x: circleCX, y: dividerY, size: circleR + 2, color: COLOR_ROW_ALT });
      ctx.page.drawCircle({ x: circleCX, y: dividerY, size: circleR, color: COLOR_NAVY });
      // Reloginho: aro branco + ponteiros brancos sobre o círculo azul
      ctx.page.drawCircle({ x: circleCX, y: dividerY, size: circleR * 0.62, color: COLOR_WHITE });
      ctx.page.drawCircle({ x: circleCX, y: dividerY, size: circleR * 0.5, color: COLOR_NAVY });
      // ponteiro vertical (12h)
      ctx.page.drawLine({
        start: { x: circleCX, y: dividerY },
        end: { x: circleCX, y: dividerY + circleR * 0.42 },
        thickness: 0.9, color: COLOR_WHITE,
      });
      // ponteiro horizontal (3h)
      ctx.page.drawLine({
        start: { x: circleCX, y: dividerY },
        end: { x: circleCX + circleR * 0.34, y: dividerY },
        thickness: 0.9, color: COLOR_WHITE,
      });


      // Fundo cinza atrás do texto pra "quebrar" a linha divisória
      const textPadX = 4;
      const textBoxY = dividerY - 5;
      ctx.page.drawRectangle({
        x: circleCX + circleR + gap - textPadX,
        y: textBoxY,
        width: textW + textPadX * 2,
        height: 10,
        color: COLOR_ROW_ALT,
      });
      ctx.page.drawText(sanitize(conText), {
        x: circleCX + circleR + gap, y: dividerY - 3, size: cSize, font: ctx.fontBold, color: COLOR_NAVY,
      });

      void bandBotY;
    }
  });


  // Atualiza cy para depois do card
  cy = cardBotY - 6;



  // QR + divisor tracejado vertical + legenda embaixo (estilo original)
  if (qr) {
    // Coluna do QR (à direita do card dos trechos)
    const qrColX = outerX + segColW;
    const qrColW2 = qrColW;
    const qrSize = 60;
    const qrX = qrColX + 12 + (qrColW2 - 12 - qrSize) / 2;
    const qrY = cardTopY - qrSize - 4;
    // Divisor tracejado vertical: desenhado na seção AEREO (envolvendo IDA + VOLTA)
    const dividerX = qrColX + 6;

    if (qr.img) {
      ctx.page.drawImage(qr.img, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      addLinkAnnotation(ctx, qrX, qrY, qrSize, qrSize, qr.url);
    }
    // Legenda embaixo do QR, centralizada na coluna do QR (à direita do divisor)
    const textColX = dividerX + 6;
    const textColW = outerX + outerW - textColX;
    const lines = T(ctx).verifiqueCia.split("\n");
    let ly = qrY - 8;
    for (const ln of lines) {
      const lw = measure(ctx.font, ln, 6);
      ctx.page.drawText(sanitize(ln), {
        x: textColX + (textColW - lw) / 2, y: ly, size: 6, font: ctx.font, color: COLOR_MUTED,
      });
      ly -= 7;
    }
  }


  return cy;
};

const drawBaggageRow = (
  ctx: Ctx,
  y: number,
  bags: { personal: boolean; carry: boolean; checked: boolean },
): number => {
  const t = T(ctx);
  const outerX = MARGIN + 14;
  const outerW = CONTENT_W - 28;
  const rowY = y - 22;
  // "Bagagem inclusa:" label
  const lbl = `${t.bagInclusa}:`;
  ctx.page.drawText(sanitize(lbl), {
    x: outerX, y: rowY, size: 9.5, font: ctx.fontBold, color: COLOR_NAVY,
  });
  const lblW = measure(ctx.fontBold, lbl, 9.5);

  const items: Array<{ label: string; icon: IconKind; active: boolean }> = [
    { label: t.bagBolsa, icon: "bagPersonal", active: bags.personal },
    { label: t.bagMao, icon: "bagCarry", active: bags.carry },
    { label: t.bagDesp, icon: "bagChecked", active: bags.checked },
  ];
  let x = outerX + lblW + 14;
  items.forEach((it) => {
    const color = it.active ? COLOR_NAVY : COLOR_MUTED;
    drawIcon(ctx.page, it.icon, x, rowY - 2, 12, color);
    ctx.page.drawText(sanitize(it.label), {
      x: x + 16, y: rowY, size: 9, font: ctx.font, color,
    });
    // check/cross ao lado
    drawIcon(
      ctx.page,
      it.active ? "check" : "cross",
      x + 16 + measure(ctx.font, it.label, 9) + 4,
      rowY - 2, 10,
      it.active ? rgb(0.13, 0.6, 0.29) : COLOR_MUTED,
    );
    x += 16 + measure(ctx.font, it.label, 9) + 34;
    if (x > outerX + outerW - 100) {
      // não deve estourar; segue reto
    }
  });
  return rowY - 10;
};

const aggregateBaggage = (items: OrderItem[]) =>
  items.reduce(
    (acc, it) => {
      const dd = (it.details ?? {}) as Record<string, unknown>;
      return {
        personal: acc.personal || !!dd.personal_item,
        carry: acc.carry || !!dd.carry_on,
        checked: acc.checked || !!dd.checked_bag,
      };
    },
    { personal: false, carry: false, checked: false },
  );

const drawAereoSection = async (
  ctx: Ctx,
  outbound: OrderItem[],
  returning: OrderItem[],
) => {
  if (outbound.length === 0 && returning.length === 0) return;
  const t = T(ctx);

  // ordenar por depart_at
  const sortByDep = (arr: OrderItem[]) =>
    [...arr].sort((a, b) => {
      const da = Date.parse(String(((a.details ?? {}) as Record<string, unknown>).depart_at ?? "")) || 0;
      const db = Date.parse(String(((b.details ?? {}) as Record<string, unknown>).depart_at ?? "")) || 0;
      if (da !== db) return da - db;
      return a.sort_order - b.sort_order;
    });
  const ob = sortByDep(outbound);
  const rt = sortByDep(returning);

  const obPrimary = ob[0];
  const rtPrimary = rt[0];
  const obLocator = ob.map((i) => i.supplier_locator).find(Boolean) ?? "";
  const rtLocator = rt.map((i) => i.supplier_locator).find(Boolean) ?? "";
  const obTicket = ob
    .map((i) => String(((i.details ?? {}) as Record<string, unknown>).ticket_number ?? "").trim())
    .find((v) => !!v) ?? "";
  const rtTicket = rt
    .map((i) => String(((i.details ?? {}) as Record<string, unknown>).ticket_number ?? "").trim())
    .find((v) => !!v) ?? "";
  const qrUrl = obPrimary ? airlineCheckinURL(obPrimary) : (rtPrimary ? airlineCheckinURL(rtPrimary) : "");
  const qrImg = qrUrl ? await embedQR(ctx, qrUrl) : null;

  const loadLogos = async (segs: OrderItem[]): Promise<Map<number, PDFImage | null>> => {
    const map = new Map<number, PDFImage | null>();
    for (let i = 0; i < segs.length; i++) {
      const d = (segs[i].details ?? {}) as Record<string, unknown>;
      const url = String(d.airline_logo_url ?? "").trim();
      map.set(i, url ? await embedRemotePhoto(ctx.pdf, url) : null);
    }
    return map;
  };
  const obLogos = await loadLogos(ob);
  const rtLogos = await loadLogos(rt);

  const bags = aggregateBaggage([...ob, ...rt]);

  const estLegHeight = (n: number) => n > 0 ? (120 + (n - 1) * 90) : 0;
  const estIda = ob.length ? (40 + estLegHeight(ob.length) + 20) : 0;
  const estVolta = rt.length ? (40 + estLegHeight(rt.length) + 40) : 0;
  const estCombined = 40 + estLegHeight(ob.length) + estLegHeight(rt.length) + 40;
  const available = ctx.y - (MARGIN + 40);

  // Se IDA+VOLTA não cabe nesta página, mas IDA cabe sozinha, quebra em dois
  // cards (IDA aqui, VOLTA na próxima página) pra não deixar uma página em branco.
  const shouldSplit =
    ob.length > 0 && rt.length > 0 && estCombined > available && estIda <= available;

  if (shouldSplit) {
    await drawAereoLegCard(
      ctx, ob, t.ida, { img: qrImg, url: qrUrl }, obLogos, false, null,
    );
    newPage(ctx);
    await drawAereoLegCard(
      ctx, rt, t.volta, undefined, rtLogos, true, bags,
    );
    return;
  }

  // Fluxo combinado (IDA + VOLTA num único card)
  const { top } = openSectionCard(ctx, estCombined + 40);
  const headerBottom = drawSectionHeader(ctx, top, "plane", t.aereo);

  let cy = headerBottom - 8;

  const dividerOuterX = MARGIN + 14;
  const dividerOuterW = CONTENT_W - 28;
  const dividerQrColW = 84;
  const dividerSegColW = dividerOuterW - dividerQrColW;
  const dividerX = dividerOuterX + dividerSegColW + 6;
  let flightsTopY: number | null = null;
  let flightsBotY: number | null = null;

  if (ob.length > 0) {
    flightsTopY = cy;
    cy = drawFlightLegBlock(
      ctx, cy, t.ida, COLOR_ORANGE, ob, obLocator, obTicket,
      { img: qrImg, url: qrUrl }, obLogos,
    );
    flightsBotY = cy + 6;
    cy -= 8;
  }
  if (rt.length > 0) {
    if (flightsTopY === null) flightsTopY = cy;
    cy = drawFlightLegBlock(
      ctx, cy, t.volta, COLOR_ORANGE, rt, rtLocator, rtTicket,
      undefined, rtLogos, true,
    );
    flightsBotY = cy + 6;
    cy -= 4;
  }

  if (flightsTopY !== null && flightsBotY !== null && qrImg) {
    drawDashedVLine(ctx.page, dividerX, flightsBotY + 4, flightsTopY - 4, COLOR_BORDER);
  }

  cy = drawBaggageRow(ctx, cy, bags);

  closeSectionCard(ctx, top, cy);
};

// Renderiza um único bloco (IDA ou VOLTA) dentro do seu próprio card AEREO.
// Usado quando IDA+VOLTA não caberia numa única página.
const drawAereoLegCard = async (
  ctx: Ctx,
  legs: OrderItem[],
  labelText: string,
  qr: { img: PDFImage | null; url: string } | undefined,
  logos: Map<number, PDFImage | null>,
  isReturn: boolean,
  bags: { personal: boolean; carry: boolean; checked: boolean } | null,
) => {
  const t = T(ctx);
  const est = 40 + (120 + (legs.length - 1) * 90) + (bags ? 40 : 20);
  const { top } = openSectionCard(ctx, est);
  const headerBottom = drawSectionHeader(ctx, top, "plane", t.aereo);
  const locator = legs.map((i) => i.supplier_locator).find(Boolean) ?? "";
  const ticket = legs
    .map((i) => String(((i.details ?? {}) as Record<string, unknown>).ticket_number ?? "").trim())
    .find((v) => !!v) ?? "";
  let cy = headerBottom - 8;
  const flightsTopY = cy;
  cy = drawFlightLegBlock(
    ctx, cy, labelText, COLOR_ORANGE, legs, locator, ticket, qr, logos, isReturn,
  );
  const flightsBotY = cy + 6;
  cy -= 8;
  if (qr?.img) {
    const dividerOuterX = MARGIN + 14;
    const dividerOuterW = CONTENT_W - 28;
    const dividerQrColW = 84;
    const dividerSegColW = dividerOuterW - dividerQrColW;
    const dividerX = dividerOuterX + dividerSegColW + 6;
    drawDashedVLine(ctx.page, dividerX, flightsBotY + 4, flightsTopY - 4, COLOR_BORDER);
  }
  if (bags) cy = drawBaggageRow(ctx, cy, bags);
  closeSectionCard(ctx, top, cy);
};


// ---------- Hospedagem ----------
const fetchImageBytes = async (
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> => {
  // 1) tenta direto (rápido, se o servidor liberar CORS)
  try {
    const r = await fetch(url);
    if (r.ok) {
      const contentType = (r.headers.get("content-type") ?? "").toLowerCase();
      return { bytes: new Uint8Array(await r.arrayBuffer()), contentType };
    }
  } catch {
    /* CORS ou outra falha — tenta via proxy no servidor */
  }
  // 2) fallback: proxy no servidor (evita CORS)
  try {
    const { fetchProxiedImage } = await import("./image-proxy.functions");
    const res = await fetchProxiedImage({ data: { url } });
    if (!res.ok) {
      console.warn("fetchImageBytes: proxy failed", url, res);
      return null;
    }
    const binary = atob(res.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, contentType: (res.contentType ?? "").toLowerCase() };
  } catch (e) {
    console.warn("fetchImageBytes: failed", url, e);
    return null;
  }
};

const embedRemotePhoto = async (pdf: PDFDocument, url: string): Promise<PDFImage | null> => {
  const res = await fetchImageBytes(url);
  if (!res) return null;
  const { bytes, contentType } = res;
  const isPngUrl = /\.png(\?|$)/i.test(url) || contentType.includes("png");
  const isSvg = contentType.includes("svg") || /\.svg(\?|$)/i.test(url);
  if (isSvg) {
    console.warn("embedRemotePhoto: SVG images not supported by pdf-lib", url);
    return null;
  }
  try {
    return isPngUrl ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    try { return await pdf.embedPng(bytes); } catch {
      try { return await pdf.embedJpg(bytes); } catch (e) {
        console.warn("embedRemotePhoto: could not embed", url, e);
        return null;
      }
    }
  }
};

const drawHotelSection = async (
  ctx: Ctx,
  item: OrderItem,
  mapData: HotelMapData | null,
  guestsFallback: string,
) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const hotelName = String(d.hotel_name ?? item.title ?? "").trim() || "-";
  const address = String(d.address ?? "").trim();
  const checkin = String(d.check_in ?? d.checkin ?? "").trim();
  const checkout = String(d.check_out ?? d.checkout ?? "").trim();
  const nights = String(d.nights ?? (checkin && checkout ? String(diffDays(checkin, checkout)) : "")).trim();
  const rawGuests = String(d.guests ?? "").trim();
  const rawGuestsResolved = rawGuests && rawGuests !== "null" && rawGuests !== "undefined"
    ? rawGuests
    : (guestsFallback || "-");
  const guests = ctx.lang === "en" ? translateGuestsPtToEn(rawGuestsResolved) : rawGuestsResolved;
  const locator = item.supplier_locator ?? "";
  const rawNotes = String(d.notes ?? "").trim();
  const notes = rawNotes ? (ctx.lang === "en" ? await translateNotesToEnglish(rawNotes) : rawNotes) : "";


  // Uma única foto (a primeira do TripAdvisor, se houver)
  let photoUrl = "";
  try {
    if (typeof d.tripadvisor_photos_json === "string" && d.tripadvisor_photos_json) {
      const parsed = JSON.parse(d.tripadvisor_photos_json as string);
      if (Array.isArray(parsed) && typeof parsed[0] === "string") photoUrl = parsed[0];
    } else if (Array.isArray(d.tripadvisor_photos) && typeof (d.tripadvisor_photos as unknown[])[0] === "string") {
      photoUrl = String((d.tripadvisor_photos as unknown[])[0]);
    }
  } catch { /* ignore */ }

  const innerX = MARGIN + 16;
  const innerW = CONTENT_W - 32;
  const qrSize = 68;
  const photoW = 130;
  const photoH = 92;
  const gapPhoto = 14;
  const photo = photoUrl ? await embedRemotePhoto(ctx.pdf, photoUrl) : null;
  const midX = innerX + (photo ? photoW + gapPhoto : 0);
  const midW = innerW - (photo ? photoW + gapPhoto : 0) - qrSize - 24;

  // Pre-compute notes wrapping to size the card
  const notesLines = notes ? wrap(ctx.font, 9, notes, innerW - 28) : [];
  const notesBlockH = notes ? 22 + notesLines.length * 13 + 14 + 10 : 0;
  const notesGap = notes ? 16 : 0;


  const topBlockH = Math.max(photo ? photoH + 8 : 0, qrSize + 30, 110);
  const cardH = topBlockH + notesBlockH + notesGap + 24;


  const { top } = openSectionCard(ctx, cardH + 20);
  const headerBottom = drawSectionHeader(ctx, top, "bed", t.hospedagem);

  // Chip localizador
  if (locator) {
    const chipText = `${t.localizador}: ${locator}`;
    const chipSize = 9;
    const chipTw = measure(ctx.fontBold, chipText, chipSize);
    const chipW = chipTw + 24;
    const chipH = 20;
    const chipX = MARGIN + CONTENT_W - 24 - chipW;
    const chipY = top - 22;
    drawRoundedRect(ctx.page, chipX, chipY, chipW, chipH, COLOR_NAVY_SOFT, 6);
    ctx.page.drawText(sanitize(chipText), {
      x: chipX + 12, y: chipY + 6, size: chipSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
  }


  let cy = headerBottom - 16;

  // Foto (esquerda), alinhada ao topo do bloco
  if (photo) {
    const pY = cy - photoH;
    const ratio = photo.width / photo.height;
    let w = photoW, h = w / ratio;
    if (h < photoH) { h = photoH; w = h * ratio; }
    ctx.page.drawRectangle({ x: innerX, y: pY, width: photoW, height: photoH, color: COLOR_ROW_ALT });
    ctx.page.drawImage(photo, {
      x: innerX + (photoW - Math.min(w, photoW)) / 2,
      y: pY, width: Math.min(w, photoW), height: photoH,
    });
    drawRoundedBorder(ctx.page, innerX, pY, photoW, photoH, COLOR_BORDER, 6, 0.5);
  }

  // Nome
  const nameSize = 14;
  ctx.page.drawText(sanitize(hotelName), {
    x: midX, y: cy - nameSize + 2, size: nameSize, font: ctx.fontBold, color: COLOR_NAVY,
  });
  let my = cy - nameSize - 4;

  // Endereço
  if (address) {
    const lines = wrap(ctx.font, 9, address, midW);
    for (const ln of lines.slice(0, 2)) {
      ctx.page.drawText(sanitize(ln), {
        x: midX, y: my - 9, size: 9, font: ctx.font, color: COLOR_TEXT,
      });
      my -= 12;
    }
  }

  // Info row (abaixo do nome/endereço no meio)
  const infoY = my - 34;

  const cols = 4;
  const colW = midW / cols;
  const cells: Array<{ label: string; value: string; icon: IconKind }> = [
    { label: t.checkin, value: checkin ? fmtDateBR(checkin) : "-", icon: "calendar" },
    { label: t.checkout, value: checkout ? fmtDateBR(checkout) : "-", icon: "calendar" },
    { label: t.noites, value: nights || "-", icon: "moon" },
    { label: t.hospedes, value: guests, icon: "users" },
  ];
  cells.forEach((c, i) => {
    const x = midX + i * colW;
    drawIcon(ctx.page, c.icon, x, infoY + 14, 10, COLOR_NAVY);
    ctx.page.drawText(sanitize(c.label), {
      x: x + 14, y: infoY + 16, size: 7, font: ctx.fontBold, color: COLOR_MUTED,
    });
    // Para hóspedes: quebra em linhas por vírgula (adultos primeiro, crianças/bebês embaixo)
    if (c.icon === "users" && c.value.includes(",")) {
      const parts = c.value.split(",").map((s) => s.trim()).filter(Boolean);
      parts.forEach((p, idx) => {
        ctx.page.drawText(sanitize(p), {
          x, y: infoY - idx * 11, size: 9, font: ctx.fontBold, color: COLOR_TEXT,
        });
      });
    } else {
      ctx.page.drawText(sanitize(c.value), {
        x, y: infoY, size: 10, font: ctx.fontBold, color: COLOR_TEXT,
      });
    }
  });

  // QR (direita)
  const qrTopY = headerBottom - 16;
  const qrX = innerX + innerW - qrSize - 10;
  const qrY = qrTopY - qrSize;
  if (mapData?.mapsUrl) {
    const qr = await embedQR(ctx, mapData.mapsUrl);
    if (qr) {
      ctx.page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      addLinkAnnotation(ctx, qrX, qrY, qrSize, qrSize, mapData.mapsUrl);
    }
    const lines = t.locHotel.split("\n");
    let ly = qrY - 10;
    for (const ln of lines) {
      const lw = measure(ctx.font, ln, 7);
      ctx.page.drawText(sanitize(ln), {
        x: qrX + (qrSize - lw) / 2, y: ly, size: 7, font: ctx.font, color: COLOR_MUTED,
      });
      ly -= 9;
    }
  }

  cy = Math.min(infoY - 18, qrY - 26) - notesGap;

  // Política do hotel (notes)
  if (notes) {
    const boxTop = cy;
    const padX = 14;
    const padTop = 22;
    const padBot = 14;
    const boxH = padTop + notesLines.length * 13 + padBot;
    const boxY = boxTop - boxH;
    drawRoundedRect(ctx.page, innerX, boxY, innerW, boxH, COLOR_NAVY_SOFT, 6);
    drawIcon(ctx.page, "info", innerX + padX, boxTop - 16, 10, COLOR_NAVY);
    ctx.page.drawText(sanitize(t.politicaHotel), {
      x: innerX + padX + 14, y: boxTop - 14, size: 8, font: ctx.fontBold, color: COLOR_NAVY,
    });
    let ny = boxTop - padTop - 9;
    for (const ln of notesLines) {
      ctx.page.drawText(sanitize(ln), {
        x: innerX + padX, y: ny, size: 9, font: ctx.font, color: COLOR_TEXT,
      });
      ny -= 13;
    }
    cy = boxY - 6;
  }


  closeSectionCard(ctx, top, cy);
};

// ---------- Info & Emergency (2 col) ----------
const drawInfoAndEmergency = (ctx: Ctx) => {
  const t = T(ctx);
  const boxH = 130;
  ensureSpace(ctx, boxH + 20);
  const top = ctx.y;
  const gap = 12;
  const colW = (CONTENT_W - gap) / 2;

  // ----- Informações gerais (esquerda)
  const leftX = MARGIN;
  drawRoundedBorder(ctx.page, leftX, top - boxH, colW, boxH, COLOR_BORDER, 10, 0.7);
  drawSectionHeader(ctx, top, "info", t.infoGerais);

  let ly = top - 46;
  // Hotel line
  drawIcon(ctx.page, "building", leftX + 22, ly - 2, 12, COLOR_NAVY);
  ctx.page.drawText(sanitize(t.infoHotel), {
    x: leftX + 42, y: ly, size: 9.5, font: ctx.fontBold, color: COLOR_TEXT,
  });
  const hotelLines = wrap(ctx.font, 9, t.infoHotelText, colW - 60);
  ctx.page.drawText(sanitize(hotelLines[0] ?? ""), {
    x: leftX + 42, y: ly - 12, size: 9, font: ctx.font, color: COLOR_TEXT,
  });
  ctx.page.drawText(sanitize(hotelLines[1] ?? ""), {
    x: leftX + 42, y: ly - 24, size: 9, font: ctx.font, color: COLOR_TEXT,
  });
  ly -= 46;

  drawIcon(ctx.page, "planeSmall", leftX + 22, ly - 2, 12, COLOR_NAVY);
  ctx.page.drawText(sanitize(t.infoVoos), {
    x: leftX + 42, y: ly, size: 9.5, font: ctx.fontBold, color: COLOR_TEXT,
  });
  const voosLines = wrap(ctx.font, 9, t.infoVoosText, colW - 60);
  ctx.page.drawText(sanitize(voosLines[0] ?? ""), {
    x: leftX + 42, y: ly - 12, size: 9, font: ctx.font, color: COLOR_TEXT,
  });
  ctx.page.drawText(sanitize(voosLines[1] ?? ""), {
    x: leftX + 42, y: ly - 24, size: 9, font: ctx.font, color: COLOR_TEXT,
  });

  // ----- Emergências (direita)
  const rightX = MARGIN + colW + gap;
  drawRoundedBorder(ctx.page, rightX, top - boxH, colW, boxH, COLOR_BORDER, 10, 0.7);

  // Cabeçalho vermelho (círculo totalmente dentro do card)
  const cy = top - 22;
  const eCircleR = 11;
  const eCircleCX = rightX + 14 + eCircleR;
  const eCircleCY = cy + 8;
  ctx.page.drawCircle({ x: eCircleCX, y: eCircleCY, size: eCircleR, color: COLOR_RED });
  drawIcon(ctx.page, "phone", eCircleCX - eCircleR * 0.55, eCircleCY - eCircleR * 0.55, eCircleR * 1.1, COLOR_WHITE);
  ctx.page.drawText(sanitize(t.emerg), {
    x: eCircleCX + eCircleR + 10, y: cy + 4, size: 11.5, font: ctx.fontBold, color: COLOR_RED,
  });

  const eLines = wrap(ctx.font, 9, t.emergText, colW - 30);
  let ey = top - 46;
  for (const ln of eLines.slice(0, 3)) {
    ctx.page.drawText(sanitize(ln), {
      x: rightX + 16, y: ey, size: 9, font: ctx.font, color: COLOR_TEXT,
    });
    ey -= 12;
  }

  // Box vermelho suave com contatos
  const cBoxY = top - boxH + 8;
  const cBoxH = 40;
  drawRoundedRect(ctx.page, rightX + 12, cBoxY, colW - 24, cBoxH, COLOR_RED_SOFT, 6);
  // phone row
  drawIcon(ctx.page, "phoneRed", rightX + 22, cBoxY + 22, 10, COLOR_RED);
  ctx.page.drawText(sanitize(COMPANY.phone), {
    x: rightX + 40, y: cBoxY + 24, size: 11, font: ctx.fontBold, color: COLOR_RED,
  });
  // email row
  drawIcon(ctx.page, "envelopeRed", rightX + 22, cBoxY + 6, 10, COLOR_RED);
  ctx.page.drawText(sanitize(COMPANY.email), {
    x: rightX + 40, y: cBoxY + 8, size: 11, font: ctx.fontBold, color: COLOR_RED,
  });

  ctx.y = top - boxH - 12;
};

// ---------- Footer strip ----------
const drawFooterStrip = (ctx: Ctx) => {
  const t = T(ctx);
  ensureSpace(ctx, 36);
  const h = 26;
  const y = ctx.y - h;
  drawRoundedRect(ctx.page, MARGIN, y, CONTENT_W, h, COLOR_NAVY_SOFT, 6);
  drawIcon(ctx.page, "ticket", MARGIN + 12, y + (h - 12) / 2, 12, COLOR_ORANGE);
  const textY = y + (h - 10) / 2 + 1;
  const boldW = measure(ctx.fontBold, t.footerLeve, 9.5);
  ctx.page.drawText(sanitize(t.footerLeve), {
    x: MARGIN + 32, y: textY, size: 9.5, font: ctx.fontBold, color: COLOR_NAVY,
  });
  const rest = ` ${t.footerLeveText} ${t.footerObr}`;
  ctx.page.drawText(sanitize(rest), {
    x: MARGIN + 32 + boldW, y: textY, size: 9.5, font: ctx.font, color: COLOR_TEXT,
  });
  ctx.y = y - 8;
};

// ---------- Serviços (transfer, ingressos, trem, etc.) ----------
const drawServiceSection = (ctx: Ctx, item: OrderItem) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const title = String(item.title ?? "").trim() || "-";
  const category = String(d.category ?? "").trim();
  const supplier = String(d.supplier_name ?? "").trim();
  const locator = item.supplier_locator ?? "";
  const dateFrom = String(d.date_from ?? "").trim();
  const timeFrom = String(d.time_from ?? "").trim();
  const dateTo = String(d.date_to ?? "").trim();
  const timeTo = String(d.time_to ?? "").trim();
  const notes = String(d.notes ?? "").trim();

  const dep = [dateFrom ? fmtDateBR(dateFrom) : "", timeFrom].filter(Boolean).join(" ");
  const arr = [dateTo ? fmtDateBR(dateTo) : "", timeTo].filter(Boolean).join(" ");

  const innerX = MARGIN + 16;
  const innerW = CONTENT_W - 32;

  const notesLines = notes ? wrap(ctx.font, 9, notes, innerW - 8) : [];
  const notesBlockH = notes ? 14 + notesLines.length * 12 + 6 : 0;

  const cardH = 44 + 18 + (category ? 14 : 0) + (supplier ? 12 : 0) + 30 + notesBlockH + 16;

  const { top } = openSectionCard(ctx, cardH + 20);
  const headerBottom = drawSectionHeader(ctx, top, "ticket", t.servicos);

  // Chip localizador (direita)
  if (locator) {
    const chipText = `${t.localizador}: ${locator}`;
    const chipSize = 9;
    const chipTw = measure(ctx.fontBold, chipText, chipSize);
    const chipW = chipTw + 24;
    const chipH = 20;
    const chipX = MARGIN + CONTENT_W - 24 - chipW;
    const chipY = top - 22;
    drawRoundedRect(ctx.page, chipX, chipY, chipW, chipH, COLOR_NAVY_SOFT, 6);
    ctx.page.drawText(sanitize(chipText), {
      x: chipX + 12, y: chipY + 6, size: chipSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
  }

  let cy = headerBottom - 16;

  // Título
  ctx.page.drawText(sanitize(title), {
    x: innerX, y: cy - 12, size: 12, font: ctx.fontBold, color: COLOR_NAVY,
  });
  cy -= 20;

  if (category) {
    ctx.page.drawText(sanitize(`${t.categoria}: ${category}`), {
      x: innerX, y: cy - 10, size: 9, font: ctx.font, color: COLOR_TEXT,
    });
    cy -= 14;
  }

  // Datas
  if (dep || arr) {
    const colW = innerW / 2;
    const cells: Array<{ label: string; value: string }> = [
      { label: t.saida, value: dep || "-" },
      { label: t.chegada, value: arr || "-" },
    ];
    cells.forEach((c, i) => {
      const x = innerX + i * colW;
      drawIcon(ctx.page, "calendar", x, cy - 4, 10, COLOR_NAVY);
      ctx.page.drawText(sanitize(c.label), {
        x: x + 14, y: cy - 2, size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
      });
      ctx.page.drawText(sanitize(c.value), {
        x, y: cy - 18, size: 10.5, font: ctx.fontBold, color: COLOR_TEXT,
      });
    });
    cy -= 30;
  }

  if (notes) {
    cy -= 4;
    for (const ln of notesLines) {
      ctx.page.drawText(sanitize(ln), {
        x: innerX, y: cy - 9, size: 9, font: ctx.font, color: COLOR_TEXT,
      });
      cy -= 12;
    }
    cy -= 4;
  }

  closeSectionCard(ctx, top, cy);
};

// ---------- Public API ----------
const fetchLogo = async (pdf: PDFDocument): Promise<PDFImage | undefined> => {
  try {
    const r = await fetch(viaAirLogoAsset.url);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    return await pdf.embedPng(bytes);
  } catch {
    return undefined;
  }
};

export async function generateVoucher(
  detail: OrderDetail,
  lang: VoucherLang = "pt",
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await fetchLogo(pdf);

  const firstPage = pdf.addPage([A4.w, A4.h]);
  const ctx: Ctx = {
    pdf, page: firstPage, y: A4.h - MARGIN,
    font, fontBold, lang,
    order: detail.order, logo,
    pages: [firstPage],
  };

  drawHeader(ctx);
  drawVoucherIdCard(ctx);
  drawPassengersSection(ctx, detail.passengers);

  // Split flights
  const outbound: OrderItem[] = [];
  const returning: OrderItem[] = [];
  const hotels: OrderItem[] = [];
  const others: OrderItem[] = [];
  for (const item of detail.items) {
    if (item.status === "cancelled") continue;
    if (item.kind === "flight") {
      const dir = String(((item.details ?? {}) as Record<string, unknown>).direction ?? "outbound");
      if (dir === "return") returning.push(item);
      else outbound.push(item);
    } else if (item.kind === "hotel") {
      hotels.push(item);
    } else {
      others.push(item);
    }
  }

  await drawAereoSection(ctx, outbound, returning);

  // Monta string de hóspedes a partir dos passageiros (ex.: "2 adultos, 1 criança, 1 bebê")
  const adt = detail.passengers.filter((p) => (p.passenger_type ?? "ADT") === "ADT").length;
  const chd = detail.passengers.filter((p) => p.passenger_type === "CHD").length;
  const inf = detail.passengers.filter((p) => p.passenger_type === "INF").length;
  const parts: string[] = [];
  const pluralize = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;
  const isEn = ctx.lang === "en";
  if (adt > 0) parts.push(pluralize(adt, isEn ? "adult" : "adulto", isEn ? "adults" : "adultos"));
  if (chd > 0) parts.push(pluralize(chd, isEn ? "child" : "criança", isEn ? "children" : "crianças"));
  if (inf > 0) parts.push(pluralize(inf, isEn ? "infant" : "bebê", isEn ? "infants" : "bebês"));
  const guestsFallbackStr = parts.join(", ");

  // Hotéis (com mapas)
  for (const h of hotels) {
    const d = (h.details ?? {}) as Record<string, unknown>;
    const address = String(d.address ?? "").trim();
    const hotelName = String(d.hotel_name ?? h.title ?? "").trim();
    let mapData: HotelMapData | null = null;
    if (address || hotelName) {
      const query = [hotelName, address].filter(Boolean).join(", ");
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      mapData = {
        address,
        formattedAddress: null,
        lat: null,
        lng: null,
        mapPngBase64: null,
        mapsUrl,
      };
    }
    await drawHotelSection(ctx, h, mapData, guestsFallbackStr);
  }

  // Serviços (transfers, ingressos, transporte terrestre, etc.)
  for (const s of others) {
    drawServiceSection(ctx, s);
  }

  drawInfoAndEmergency(ctx);
  drawFooterStrip(ctx);

  const bytes = await pdf.save();
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: "application/pdf" });
}
