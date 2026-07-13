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
} from "pdf-lib";
import QRCode from "qrcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import type { OrderDetail, OrderItem, OrderPassenger } from "./orders.functions";
import { getHotelMap, type HotelMapData } from "./voucher-map.functions";

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
    documento: "DOCUMENTO",
    dataNasc: "DATA DE NASCIMENTO",
    aereo: "AÉREO",
    ida: "IDA",
    volta: "VOLTA",
    localizador: "Localizador",
    bilhete: "Bilhete",
    verifiqueCia: "Verifique na\ncompanhia aérea",
    bagInclusa: "Bagagem inclusa",
    bagBolsa: "Bolsa/mochila",
    bagMao: "Bagagem de mão",
    bagDesp: "Bagagem despachada",
    conexao: "Conexão em",
    hospedagem: "HOSPEDAGEM",
    checkin: "CHECK-IN",
    checkout: "CHECK-OUT",
    noites: "NOITES",
    hospedes: "HÓSPEDES",
    locHotel: "Localização do hotel",
    infoGerais: "INFORMAÇÕES GERAIS",
    infoHotel: "HOTEL:",
    infoHotelText: "O horário de check-in pode ser após às 15h e o check-out até às 10h. Confirme com o estabelecimento na chegada.",
    infoVoos: "VOOS:",
    infoVoosText: "apresente-se 3h antes em voos internacionais e 2h antes em voos domésticos.",
    emerg: "EMERGÊNCIAS",
    emergText: "Em caso de emergência durante a viagem, entre em contato imediatamente com a Central de Atendimento Via Air.",
    footerLeve: "Leve este voucher",
    footerLeveText: "com você durante toda a viagem.",
    footerObr: "Agradecemos por escolher a Via Air.  Boa viagem!",
    adulto: "Adulto",
    crianca: "Criança",
    infantil: "Infantil",
  },
  en: {
    voucherId: "VOUCHER ID",
    passageiro: "GUEST",
    documento: "DOCUMENT",
    dataNasc: "DATE OF BIRTH",
    aereo: "FLIGHT",
    ida: "OUTBOUND",
    volta: "RETURN",
    localizador: "Booking code",
    bilhete: "Ticket",
    verifiqueCia: "Check on the\nairline website",
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
    locHotel: "Hotel location",
    infoGerais: "GENERAL INFORMATION",
    infoHotel: "HOTEL:",
    infoHotelText: "Check-in after 3pm and check-out by 10am. Please confirm on arrival.",
    infoVoos: "FLIGHTS:",
    infoVoosText: "arrive 3h early for international and 2h early for domestic flights.",
    emerg: "EMERGENCIES",
    emergText: "In case of emergency during your trip, contact Via Air support immediately.",
    footerLeve: "Keep this voucher",
    footerLeveText: "with you throughout your trip.",
    footerObr: "Thank you for choosing Via Air.  Safe travels!",
    adulto: "Adult",
    crianca: "Child",
    infantil: "Infant",
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
    .replace(/[^\x00-\xFF]/g, "?");
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
  radius = 8,
  thickness = 0.6,
) => {
  const r = Math.min(radius, h / 2, w / 2);
  // Lados
  page.drawLine({ start: { x: x + r, y }, end: { x: x + w - r, y }, thickness, color });
  page.drawLine({ start: { x: x + r, y: y + h }, end: { x: x + w - r, y: y + h }, thickness, color });
  page.drawLine({ start: { x, y: y + r }, end: { x, y: y + h - r }, thickness, color });
  page.drawLine({ start: { x: x + w, y: y + r }, end: { x: x + w, y: y + h - r }, thickness, color });
  // Cantos (arcos aproximados por círculos borda)
  page.drawCircle({ x: x + r, y: y + r, size: r, borderColor: color, borderWidth: thickness });
  page.drawCircle({ x: x + w - r, y: y + r, size: r, borderColor: color, borderWidth: thickness });
  page.drawCircle({ x: x + r, y: y + h - r, size: r, borderColor: color, borderWidth: thickness });
  page.drawCircle({ x: x + w - r, y: y + h - r, size: r, borderColor: color, borderWidth: thickness });
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
  | "phoneRed" | "envelopeRed"
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
      // Bilhete: retângulo com "recorte" nas laterais
      page.drawRectangle({ x, y: y + s * 0.2, width: s, height: s * 0.6, color });
      page.drawCircle({ x, y: y + s / 2, size: s * 0.1, color: COLOR_WHITE });
      page.drawCircle({ x: x + s, y: y + s / 2, size: s * 0.1, color: COLOR_WHITE });
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
      page.drawRectangle({ x, y, width: s, height: s * 0.85, borderColor: color, borderWidth: s * 0.08 });
      page.drawRectangle({ x, y: y + s * 0.7, width: s, height: s * 0.15, color });
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

  // Logo à direita (Via Air) — fixa
  const logoBoxW = 200;
  const logoBoxH = 60;
  const logoX = A4.w - MARGIN - logoBoxW;
  const logoY = top - logoBoxH;
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

  // Título à esquerda com barrinha laranja
  const titleY = top - 14;
  ctx.page.drawRectangle({ x: MARGIN, y: titleY - 2, width: 4, height: 18, color: COLOR_ORANGE });
  const titleSize = 18;
  const titleMaxW = logoX - MARGIN - 20;
  const titleLines = wrap(ctx.fontBold, titleSize, tripTitle, titleMaxW);
  let ty = titleY;
  for (const ln of titleLines.slice(0, 2)) {
    ctx.page.drawText(sanitize(ln), {
      x: MARGIN + 12, y: ty - titleSize + 4, size: titleSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
    ty -= titleSize + 2;
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

  ctx.y = Math.min(cy - 16, logoY - 16);
};

// ---------- Voucher ID card ----------
const drawVoucherIdCard = (ctx: Ctx) => {
  const t = T(ctx);
  const h = 36;
  ensureSpace(ctx, h + 10);
  const y = ctx.y - h;
  const w = 300;
  // Card azul com cantos superiores arredondados
  drawRoundedRect(ctx.page, MARGIN, y, w, h, COLOR_NAVY, 6);
  // Ícone bilhete
  drawIcon(ctx.page, "ticket", MARGIN + 14, y + (h - 14) / 2, 14, COLOR_WHITE);
  const label = `${t.voucherId}: ${ctx.order.orderNumber}`;
  ctx.page.drawText(sanitize(label), {
    x: MARGIN + 40, y: y + 12, size: 13, font: ctx.fontBold, color: COLOR_WHITE,
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
  const cy = y - 18;
  // Círculo azul
  ctx.page.drawCircle({ x: MARGIN + 22, y: cy + 8, size: 12, color: COLOR_NAVY });
  drawIcon(ctx.page, icon, MARGIN + 22 - 6, cy + 2, 12, COLOR_WHITE);
  // Título
  ctx.page.drawText(sanitize(title), {
    x: MARGIN + 44, y: cy + 4, size: 13, font: ctx.fontBold, color: COLOR_NAVY,
  });
  if (rightText) {
    const size = 10;
    const tw = measure(ctx.fontBold, rightText, size);
    ctx.page.drawText(sanitize(rightText), {
      x: MARGIN + CONTENT_W - 16 - tw, y: cy + 6, size, font: ctx.fontBold, color: COLOR_NAVY,
    });
  }
  return cy - 4;
};

// ---------- Passageiros ----------
const passengerTypeLabel = (t: ReturnType<typeof T>, kind: string): string => {
  const k = (kind ?? "").toUpperCase();
  if (k === "CHD") return t.crianca;
  if (k === "INF") return t.infantil;
  return t.adulto;
};

const drawPassengersSection = (ctx: Ctx, passengers: OrderPassenger[]) => {
  if (!passengers.length) return;
  const t = T(ctx);
  const rowH = 20;
  const headerH = 30;
  const colHeaderH = 20;
  const cardH = headerH + colHeaderH + rowH * passengers.length + 20;
  const { top } = openSectionCard(ctx, cardH + 20);
  const headerBottom = drawSectionHeader(ctx, top, "user", t.passageiro);

  // Colunas
  const innerX = MARGIN + 20;
  const innerW = CONTENT_W - 40;
  const colW = innerW / 3;
  let cy = headerBottom - 10;

  // Divisor
  ctx.page.drawLine({
    start: { x: MARGIN + 12, y: cy + 4 },
    end: { x: MARGIN + CONTENT_W - 12, y: cy + 4 },
    thickness: 0.5, color: COLOR_BORDER,
  });
  cy -= 8;

  // Cabeçalhos das colunas
  const headers = [t.passageiro, t.documento, t.dataNasc];
  headers.forEach((h, i) => {
    ctx.page.drawText(sanitize(h), {
      x: innerX + i * colW, y: cy, size: 8.5, font: ctx.fontBold, color: COLOR_MUTED,
    });
  });
  cy -= 14;

  passengers.forEach((p) => {
    const name = (p.full_name ?? "").toUpperCase();
    const doc = p.doc_type === "passport"
      ? (p.passport_number ? `PPT ${p.passport_number}` : "-")
      : (p.cpf ? `CPF ${p.cpf}` : (p.document ?? "-"));
    const dob = p.birth_date ? fmtDateBR(p.birth_date) : passengerTypeLabel(t, p.passenger_type ?? "ADT");
    const cells = [name || "-", doc, dob];
    cells.forEach((v, i) => {
      ctx.page.drawText(sanitize(v), {
        x: innerX + i * colW, y: cy, size: 10, font: ctx.fontBold, color: COLOR_TEXT,
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

const drawFlightLegBlock = (
  ctx: Ctx,
  y: number,
  labelText: string,
  labelColor: Color,
  segments: OrderItem[],
  locator: string,
  ticket: string,
  qrUrl: string,
  qrImg: PDFImage | null,
): number => {
  const outerX = MARGIN + 14;
  const outerW = CONTENT_W - 28;
  const qrSize = 92;
  const infoW = outerW - qrSize - 16;

  // Cabeçalho: chip + localizador + bilhete
  const chipW = 76;
  const chipH = 22;
  const chipY = y - chipH;
  drawRoundedRect(ctx.page, outerX, chipY, chipW, chipH, labelColor, 4);
  const lblW = measure(ctx.fontBold, labelText, 11);
  ctx.page.drawText(sanitize(labelText), {
    x: outerX + (chipW - lblW) / 2, y: chipY + 7, size: 11, font: ctx.fontBold, color: COLOR_WHITE,
  });

  // Localizador + Bilhete inline
  const t = T(ctx);
  const locStr = locator ? `${t.localizador}: ${locator}` : "";
  const tkStr = ticket ? `${t.bilhete}: ${ticket}` : "";
  const infoTextX = outerX + chipW + 14;
  if (locStr) {
    // rótulo em cinza, valor em bold escuro
    const lab = `${t.localizador}: `;
    const labW = measure(ctx.font, lab, 10);
    ctx.page.drawText(sanitize(lab), {
      x: infoTextX, y: chipY + 7, size: 10, font: ctx.font, color: COLOR_MUTED,
    });
    ctx.page.drawText(sanitize(locator), {
      x: infoTextX + labW, y: chipY + 7, size: 10, font: ctx.fontBold, color: COLOR_TEXT,
    });
  }
  if (tkStr) {
    const startX = infoTextX + (locStr ? measure(ctx.font, `${t.localizador}: `, 10) + measure(ctx.fontBold, locator, 10) + 20 : 0);
    const lab = `${t.bilhete}: `;
    const labW = measure(ctx.font, lab, 10);
    ctx.page.drawText(sanitize(lab), {
      x: startX, y: chipY + 7, size: 10, font: ctx.font, color: COLOR_MUTED,
    });
    ctx.page.drawText(sanitize(ticket), {
      x: startX + labW, y: chipY + 7, size: 10, font: ctx.fontBold, color: COLOR_TEXT,
    });
  }

  let cy = chipY - 12;

  // Segmentos (cada trecho)
  segments.forEach((seg, i) => {
    const d = (seg.details ?? {}) as Record<string, unknown>;
    const fromIata = String(d.from_iata ?? d.origin ?? "").trim() || "—";
    const toIata = String(d.to_iata ?? d.destination ?? "").trim() || "—";
    const fromCity = String(d.from_city ?? "").trim();
    const toCity = String(d.to_city ?? "").trim();
    const dep = String(d.depart_at ?? "").trim();
    const arr = String(d.arrive_at ?? "").trim();

    const segH = 78;
    const segX = outerX;
    const segW = infoW;
    const segY = cy - segH;
    // Fundo sutil
    drawRoundedRect(ctx.page, segX, segY, segW, segH, COLOR_ROW_ALT, 8);

    // IATA à esquerda, IATA à direita, avião no meio
    const iataSize = 22;
    const leftX = segX + 24;
    const rightX = segX + segW - 24 - measure(ctx.fontBold, toIata, iataSize);
    const iataY = segY + segH - 30;
    ctx.page.drawText(sanitize(fromIata), {
      x: leftX, y: iataY, size: iataSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
    ctx.page.drawText(sanitize(toIata), {
      x: rightX, y: iataY, size: iataSize, font: ctx.fontBold, color: COLOR_NAVY,
    });
    // Linha central + aviãozinho
    const midY = iataY + iataSize / 2 - 4;
    const leftEdge = leftX + measure(ctx.fontBold, fromIata, iataSize) + 12;
    const rightEdge = rightX - 12;
    // Linha pontilhada aproximada
    const dashCount = 20;
    const dashW = (rightEdge - leftEdge - 12) / dashCount;
    for (let dI = 0; dI < dashCount; dI++) {
      const dx = leftEdge + dI * dashW;
      ctx.page.drawLine({
        start: { x: dx, y: midY }, end: { x: dx + dashW * 0.5, y: midY },
        thickness: 0.7, color: COLOR_MUTED,
      });
    }
    const centerX = (leftEdge + rightEdge) / 2 - 6;
    drawIcon(ctx.page, "planeSmall", centerX, midY - 5, 12, COLOR_NAVY);

    // Cidades + datas embaixo
    const bottomY = segY + 16;
    if (fromCity) {
      ctx.page.drawText(sanitize(fromCity), {
        x: leftX, y: bottomY + 12, size: 8.5, font: ctx.font, color: COLOR_MUTED,
      });
    }
    if (toCity) {
      const cityW = measure(ctx.font, toCity, 8.5);
      ctx.page.drawText(sanitize(toCity), {
        x: segX + segW - 24 - cityW, y: bottomY + 12, size: 8.5, font: ctx.font, color: COLOR_MUTED,
      });
    }
    const depTxt = dep ? `${fmtDateBR(dep)} • ${fmtTime(dep)}` : "";
    const arrTxt = arr ? `${fmtDateBR(arr)} • ${fmtTime(arr)}` : "";
    if (depTxt) {
      ctx.page.drawText(sanitize(depTxt), {
        x: leftX, y: bottomY, size: 9, font: ctx.fontBold, color: COLOR_TEXT,
      });
    }
    if (arrTxt) {
      const w = measure(ctx.fontBold, arrTxt, 9);
      ctx.page.drawText(sanitize(arrTxt), {
        x: segX + segW - 24 - w, y: bottomY, size: 9, font: ctx.fontBold, color: COLOR_TEXT,
      });
    }

    cy = segY - 6;

    // Chip de conexão entre segmentos
    if (i < segments.length - 1) {
      const nextD = (segments[i + 1].details ?? {}) as Record<string, unknown>;
      const nextFromCity = String(nextD.from_city ?? nextD.from_iata ?? "").trim();
      const conText = `${t.conexao} ${nextFromCity || toCity || toIata}`;
      const cSize = 8.5;
      const cw = measure(ctx.fontBold, conText, cSize) + 20;
      const ch = 16;
      const cx = segX + (segW - cw) / 2;
      const ccy = cy - ch;
      drawRoundedRect(ctx.page, cx, ccy, cw, ch, COLOR_NAVY_SOFT, 8);
      ctx.page.drawText(sanitize(conText), {
        x: cx + 10, y: ccy + 4, size: cSize, font: ctx.fontBold, color: COLOR_NAVY,
      });
      cy = ccy - 6;
    }
  });

  // QR à direita, alinhado ao topo do primeiro segmento
  if (qrImg) {
    const qrX = outerX + infoW + 16;
    const qrY = chipY - 12 - 78 + (78 - qrSize) / 2;
    ctx.page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    addLinkAnnotation(ctx, qrX, qrY, qrSize, qrSize, qrUrl);
    // Label abaixo
    const lines = T(ctx).verifiqueCia.split("\n");
    let ly = qrY - 10;
    for (const ln of lines) {
      const lw = measure(ctx.font, ln, 8);
      ctx.page.drawText(sanitize(ln), {
        x: qrX + (qrSize - lw) / 2, y: ly, size: 8, font: ctx.font, color: COLOR_MUTED,
      });
      ly -= 10;
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

  // Estimativa de espaço
  const est = 40 + (ob.length ? 130 + (ob.length - 1) * 90 : 0) + (rt.length ? 130 + (rt.length - 1) * 90 : 0) + 40;
  const { top } = openSectionCard(ctx, est + 40);
  const headerBottom = drawSectionHeader(ctx, top, "plane", t.aereo);

  let cy = headerBottom - 8;

  // Preparar QR de cada perna
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
  const obUrl = obPrimary ? airlineCheckinURL(obPrimary) : "";
  const rtUrl = rtPrimary ? airlineCheckinURL(rtPrimary) : "";
  const obQr = obUrl ? await embedQR(ctx, obUrl) : null;
  const rtQr = rtUrl ? await embedQR(ctx, rtUrl) : null;

  if (ob.length > 0) {
    cy = drawFlightLegBlock(ctx, cy, t.ida, COLOR_NAVY, ob, obLocator, obTicket, obUrl, obQr);
    cy -= 4;
  }
  if (rt.length > 0) {
    cy = drawFlightLegBlock(ctx, cy, t.volta, COLOR_NAVY, rt, rtLocator, rtTicket, rtUrl, rtQr);
    cy -= 4;
  }

  // Bagagem (agregada dos dois lados)
  const bags = aggregateBaggage([...ob, ...rt]);
  cy = drawBaggageRow(ctx, cy, bags);

  closeSectionCard(ctx, top, cy);
};

// ---------- Hospedagem ----------
const fetchImageBytes = async (url: string): Promise<Uint8Array | null> => {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
};

const embedRemotePhoto = async (pdf: PDFDocument, url: string): Promise<PDFImage | null> => {
  const bytes = await fetchImageBytes(url);
  if (!bytes) return null;
  try {
    if (/\.png(\?|$)/i.test(url)) return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    try { return await pdf.embedPng(bytes); } catch { return null; }
  }
};

const drawHotelSection = async (
  ctx: Ctx,
  item: OrderItem,
  mapData: HotelMapData | null,
) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const hotelName = String(d.hotel_name ?? item.title ?? "").trim() || "-";
  const address = String(d.address ?? "").trim();
  const checkin = String(d.check_in ?? d.checkin ?? "").trim();
  const checkout = String(d.check_out ?? d.checkout ?? "").trim();
  const nights = String(d.nights ?? (checkin && checkout ? String(diffDays(checkin, checkout)) : "")).trim();
  const guests = String(d.guests ?? "-").trim();
  const locator = item.supplier_locator ?? "";
  let photoUrl = "";
  try {
    if (typeof d.tripadvisor_photos_json === "string" && d.tripadvisor_photos_json) {
      const parsed = JSON.parse(d.tripadvisor_photos_json as string);
      if (Array.isArray(parsed) && typeof parsed[0] === "string") photoUrl = parsed[0];
    } else if (Array.isArray(d.tripadvisor_photos) && typeof (d.tripadvisor_photos as unknown[])[0] === "string") {
      photoUrl = String((d.tripadvisor_photos as unknown[])[0]);
    }
  } catch { /* ignore */ }

  const cardH = 200;
  const { top } = openSectionCard(ctx, cardH + 20);
  const headerBottom = drawSectionHeader(
    ctx, top, "bed", t.hospedagem,
    locator ? `${t.localizador}: ${locator}` : undefined,
  );

  let cy = headerBottom - 6;

  const innerX = MARGIN + 14;
  const innerW = CONTENT_W - 28;
  const photoW = 130;
  const photoH = 90;
  const qrSize = 80;
  const midX = innerX + photoW + 14;
  const midW = innerW - photoW - 14 - qrSize - 16;

  // Foto (esquerda)
  const photo = photoUrl ? await embedRemotePhoto(ctx.pdf, photoUrl) : null;
  const photoY = cy - photoH;
  if (photo) {
    const ratio = photo.width / photo.height;
    let w = photoW, h = w / ratio;
    if (h < photoH) { h = photoH; w = h * ratio; }
    // clip-approx: draw within box and border
    ctx.page.drawRectangle({ x: innerX, y: photoY, width: photoW, height: photoH, color: COLOR_ROW_ALT });
    ctx.page.drawImage(photo, {
      x: innerX + (photoW - Math.min(w, photoW)) / 2,
      y: photoY, width: Math.min(w, photoW), height: photoH,
    });
    drawRoundedBorder(ctx.page, innerX, photoY, photoW, photoH, COLOR_BORDER, 4, 0.5);
  } else {
    drawRoundedRect(ctx.page, innerX, photoY, photoW, photoH, COLOR_ROW_ALT, 4);
    drawIcon(ctx.page, "building", innerX + photoW / 2 - 12, photoY + photoH / 2 - 12, 24, COLOR_MUTED);
  }

  // Nome + endereço (meio)
  const nameSize = 15;
  ctx.page.drawText(sanitize(hotelName), {
    x: midX, y: cy - nameSize + 2, size: nameSize, font: ctx.fontBold, color: COLOR_NAVY,
  });
  let my = cy - nameSize - 6;
  if (address) {
    const lines = wrap(ctx.font, 9.5, address, midW);
    for (const ln of lines.slice(0, 2)) {
      ctx.page.drawText(sanitize(ln), {
        x: midX, y: my, size: 9.5, font: ctx.font, color: COLOR_TEXT,
      });
      my -= 12;
    }
  }

  // Linha de dados: check-in, check-out, noites, hospedes
  const infoY = photoY + 12;
  const infoStartX = midX;
  const infoW = midW;
  const cols = 4;
  const colW = infoW / cols;
  const cells: Array<{ label: string; value: string; icon: IconKind }> = [
    { label: t.checkin, value: checkin ? fmtDateBR(checkin) : "-", icon: "calendar" },
    { label: t.checkout, value: checkout ? fmtDateBR(checkout) : "-", icon: "calendar" },
    { label: t.noites, value: nights || "-", icon: "moon" },
    { label: t.hospedes, value: guests || "-", icon: "users" },
  ];
  cells.forEach((c, i) => {
    const x = infoStartX + i * colW;
    drawIcon(ctx.page, c.icon, x, infoY + 12, 9, COLOR_NAVY);
    ctx.page.drawText(sanitize(c.label), {
      x: x + 12, y: infoY + 14, size: 7.5, font: ctx.fontBold, color: COLOR_MUTED,
    });
    ctx.page.drawText(sanitize(c.value), {
      x, y: infoY, size: 10, font: ctx.fontBold, color: COLOR_TEXT,
    });
  });

  // QR (direita) — link para maps
  const qrX = innerX + innerW - qrSize;
  const qrY = photoY + (photoH - qrSize) / 2;
  if (mapData?.mapsUrl) {
    const qr = await embedQR(ctx, mapData.mapsUrl);
    if (qr) {
      ctx.page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      addLinkAnnotation(ctx, qrX, qrY, qrSize, qrSize, mapData.mapsUrl);
    }
    const lbl = t.locHotel;
    const lw = measure(ctx.font, lbl, 8);
    ctx.page.drawText(sanitize(lbl), {
      x: qrX + (qrSize - lw) / 2, y: qrY - 12, size: 8, font: ctx.font, color: COLOR_MUTED,
    });
  }

  cy = photoY - 6;
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

  // Cabeçalho vermelho
  const cy = top - 18;
  ctx.page.drawCircle({ x: rightX + 22, y: cy + 8, size: 12, color: COLOR_RED });
  drawIcon(ctx.page, "phone", rightX + 22 - 5, cy + 2, 10, COLOR_WHITE);
  ctx.page.drawText(sanitize(t.emerg), {
    x: rightX + 44, y: cy + 4, size: 13, font: ctx.fontBold, color: COLOR_RED,
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
  ensureSpace(ctx, 40);
  const h = 30;
  const y = ctx.y - h;
  drawRoundedRect(ctx.page, MARGIN, y, CONTENT_W, h, COLOR_NAVY_SOFT, 6);
  drawIcon(ctx.page, "ticket", MARGIN + 14, y + 8, 14, COLOR_NAVY);
  ctx.page.drawText(sanitize(t.footerLeve), {
    x: MARGIN + 36, y: y + 11, size: 10.5, font: ctx.fontBold, color: COLOR_NAVY,
  });
  const boldW = measure(ctx.fontBold, t.footerLeve, 10.5);
  ctx.page.drawText(sanitize(" " + t.footerLeveText), {
    x: MARGIN + 36 + boldW, y: y + 11, size: 10.5, font: ctx.font, color: COLOR_TEXT,
  });
  // divisor
  ctx.page.drawLine({
    start: { x: MARGIN + CONTENT_W / 2, y: y + 6 },
    end: { x: MARGIN + CONTENT_W / 2, y: y + h - 6 },
    thickness: 0.5, color: COLOR_MUTED,
  });
  const rw = measure(ctx.font, t.footerObr, 10);
  ctx.page.drawText(sanitize(t.footerObr), {
    x: MARGIN + CONTENT_W - 14 - rw, y: y + 11, size: 10, font: ctx.font, color: COLOR_TEXT,
  });
  ctx.y = y - 8;
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

  // Hotéis (com mapas)
  for (const h of hotels) {
    const d = (h.details ?? {}) as Record<string, unknown>;
    const address = String(d.address ?? "").trim();
    const hotelName = String(d.hotel_name ?? h.title ?? "").trim();
    let mapData: HotelMapData | null = null;
    if (address || hotelName) {
      try {
        mapData = await getHotelMap({ data: { address: address || hotelName, hotelName } });
      } catch (e) {
        console.error("hotel map error", e);
      }
    }
    await drawHotelSection(ctx, h, mapData);
  }

  drawInfoAndEmergency(ctx);
  drawFooterStrip(ctx);

  const bytes = await pdf.save();
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: "application/pdf" });
}
