// Voucher elegante estilo Cativa — Via Air
// Gera um PDF único com todos os itens do pedido (aéreo, hotel, serviços).
// Bilíngue (pt-BR / en). Roda no navegador via pdf-lib.
//
// Design: pílulas azuis para seções, "VOUCHER" tipográfico grande,
// logo Via Air no topo esquerdo (sem logo de operador), rodapé em faixa azul.
// Para hotéis, embute mapa estático do Google Maps + QR pra abrir no celular.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import type { OrderDetail, OrderItem, OrderPassenger } from "./orders.functions";
import { getHotelMap, type HotelMapData } from "./voucher-map.functions";

// ---------- Layout ----------
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 40;
const CONTENT_W = A4.w - MARGIN * 2;

// Paleta estilo Cativa (azul marinho profundo) + laranja da Via Air como acento
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_TEXT = rgb(0.10, 0.11, 0.13);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);
const COLOR_BORDER = rgb(0.88, 0.90, 0.93);
const COLOR_ROW_ALT = rgb(0.965, 0.968, 0.975);
const COLOR_PILL_BG = rgb(0.94, 0.95, 0.97);
const COLOR_BRAND_ORANGE = rgb(241 / 255, 160 / 255, 74 / 255);
const COLOR_BRAND_BLUE = rgb(11 / 255, 40 / 255, 106 / 255); // deep navy
const COLOR_BRAND_BLUE_SOFT = rgb(37 / 255, 79 / 255, 158 / 255);
const COLOR_EMERGENCY = rgb(210 / 255, 45 / 255, 55 / 255);
const COLOR_STAR = rgb(0.98, 0.72, 0.10);

const COMPANY = {
  name: "VIA AIR AGÊNCIA E REPRESENTAÇÕES LTDA",
  short: "VIA AIR",
  cnpj: "56.339.877/0001-66",
  address: "Rua Takeshi Mitsuyasu, 355 - Jardim Panorama",
  cityLine: "Paranavaí - PR - CEP 87707-120",
  phone: "(44) 3045-8729 · (44) 3062-9998",
  email: "comercial@voeair.com",
};

// ---------- i18n ----------
export type VoucherLang = "pt" | "en";

const L = {
  pt: {
    title: "VOUCHER",
    idLabel: "ID",
    orderLabel: "Pedido",
    issuedAt: "Emitido em",
    passenger: "Passageiro",
    passengers: "Passageiros",
    documentLabel: "Documento",
    hotel: "Hospedagem",
    flight: "Aéreo",
    service: "Serviço",
    hotelName: "Hotel",
    address: "Endereço",
    checkin: "Check-in",
    checkout: "Check-out",
    nights: "Noites",
    room: "Quarto",
    board: "Regime",
    guests: "Hóspedes",
    reservation: "Localizador",
    airline: "Cia. aérea",
    flightNo: "Voo",
    departure: "Partida",
    arrival: "Chegada",
    from: "Origem",
    to: "Destino",
    description: "Descrição",
    supplier: "Fornecedor",
    openMap: "Abrir no Google Maps",
    scanForMap: "Escaneie para abrir no celular",
    generalInfo: "Informações gerais",
    generalInfoText:
      "HOTEL: O horário de check-in pode ser após às 15h e o check-out até às 10h. Confirme com o estabelecimento na chegada. Voos: apresente-se 3h antes em voos internacionais e 2h antes em voos domésticos.",
    emergency: "Emergências",
    emergencyText:
      "Em caso de emergência durante a viagem, entre em contato imediatamente com a Central de Atendimento Via Air.",
    contactSection: "Contato",
    page: "Página",
    of: "de",
  },
  en: {
    title: "VOUCHER",
    idLabel: "ID",
    orderLabel: "Order",
    issuedAt: "Issued on",
    passenger: "Guest",
    passengers: "Guests",
    documentLabel: "Document",
    hotel: "Accommodation",
    flight: "Flight",
    service: "Service",
    hotelName: "Hotel",
    address: "Address",
    checkin: "Check-in",
    checkout: "Check-out",
    nights: "Nights",
    room: "Room",
    board: "Meal plan",
    guests: "Guests",
    reservation: "Reservation",
    airline: "Airline",
    flightNo: "Flight",
    departure: "Departure",
    arrival: "Arrival",
    from: "From",
    to: "To",
    description: "Description",
    supplier: "Supplier",
    openMap: "Open in Google Maps",
    scanForMap: "Scan to open on your phone",
    generalInfo: "General information",
    generalInfoText:
      "HOTEL: Check-in usually after 3pm, check-out by 10am — please confirm on arrival. Flights: arrive 3h early for international and 2h early for domestic flights.",
    emergency: "Emergencies",
    emergencyText:
      "In case of emergency during your trip, contact Via Air support immediately.",
    contactSection: "Contact",
    page: "Page",
    of: "of",
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

const fmtDateShort = (s: string | null | undefined, lang: VoucherLang): string => {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [_, y, mo, d] = m;
    return lang === "pt" ? `${d}/${mo}/${y}` : `${y}-${mo}-${d}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return lang === "pt" ? `${dd}/${mm}/${yy}` : `${yy}-${mm}-${dd}`;
};

const fmtDateTime = (s: string | null | undefined, lang: VoucherLang): string => {
  if (!s) return "";
  const str = String(s);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (m) {
    const [_, y, mo, d, hh, mi] = m;
    const date = lang === "pt" ? `${d}/${mo}/${y}` : `${y}-${mo}-${d}`;
    return `${date} · ${hh}:${mi}`;
  }
  return fmtDateShort(s, lang);
};

// ---------- Drawing primitives ----------
type Color = ReturnType<typeof rgb>;
type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  fontDisplay: PDFFont;
  lang: VoucherLang;
  order: OrderDetail["order"];
  logo?: PDFImage;
  pages: PDFPage[];
};


const T = (ctx: Ctx) => L[ctx.lang];

const drawText = (
  ctx: Ctx,
  s: string,
  x: number,
  opts?: { size?: number; bold?: boolean; color?: Color; y?: number },
) => {
  const size = opts?.size ?? 9;
  const font = opts?.bold ? ctx.fontBold : ctx.font;
  ctx.page.drawText(sanitize(s), {
    x,
    y: opts?.y ?? ctx.y,
    size,
    font,
    color: opts?.color ?? COLOR_TEXT,
  });
};

const measure = (font: PDFFont, s: string, size: number): number =>
  font.widthOfTextAtSize(sanitize(s), size);

const wrap = (font: PDFFont, size: number, s: string, maxWidth: number): string[] => {
  const clean = sanitize(s);
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tentative = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(tentative, size) <= maxWidth) {
      cur = tentative;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

// Rounded rectangle (pill). Draws left + right half-circles + center rect.
const drawRoundedRect = (
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  color: Color,
  radius?: number,
) => {
  const r = Math.min(radius ?? h / 2, h / 2, w / 2);
  // side circles
  page.drawCircle({ x: x + r, y: y + h / 2, size: r, color });
  page.drawCircle({ x: x + w - r, y: y + h / 2, size: r, color });
  // center rectangle
  page.drawRectangle({ x: x + r, y, width: w - 2 * r, height: h, color });
};

const newPage = (ctx: Ctx) => {
  ctx.page = ctx.pdf.addPage([A4.w, A4.h]);
  ctx.pages.push(ctx.page);
  ctx.y = A4.h - MARGIN;
  drawContinuationHeader(ctx);
};

const ensureSpace = (ctx: Ctx, needed: number) => {
  if (ctx.y - needed < MARGIN + 70) newPage(ctx);
};

// ---------- Header / Footer ----------
const drawMainHeader = (ctx: Ctx) => {
  const t = T(ctx);
  const topY = A4.h;

  // Logo Via Air (topo esquerdo)
  if (ctx.logo) {
    const h = 34;
    const w = h * (ctx.logo.width / ctx.logo.height);
    ctx.page.drawImage(ctx.logo, {
      x: MARGIN, y: topY - MARGIN - h + 6, width: w, height: h,
    });
  }

  // Linha divisória azul grossa abaixo do logo
  const lineY = topY - MARGIN - 46;
  ctx.page.drawRectangle({
    x: MARGIN, y: lineY, width: CONTENT_W, height: 2, color: COLOR_BRAND_BLUE,
  });

  // Pílula laranja pequena com o ID logo abaixo da linha
  const idText = `${t.idLabel.toUpperCase()}: ${ctx.order.orderNumber}`;
  const idSize = 10;
  const idTextW = measure(ctx.fontBold, idText, idSize);
  const idPillW = idTextW + 24;
  const idPillH = 20;
  const idPillY = lineY - 8 - idPillH;
  drawRoundedRect(ctx.page, MARGIN, idPillY, idPillW, idPillH, COLOR_BRAND_ORANGE, 10);
  ctx.page.drawText(sanitize(idText), {
    x: MARGIN + 12, y: idPillY + 6, size: idSize, font: ctx.fontBold, color: COLOR_WHITE,
  });

  // Título grande "VOUCHER" em Helvetica bold, azul
  const titleSize = 38;
  const titleY = idPillY - titleSize - 4;
  ctx.page.drawText(sanitize(t.title), {
    x: MARGIN, y: titleY, size: titleSize, font: ctx.fontDisplay, color: COLOR_BRAND_BLUE,
  });

  ctx.y = titleY - 24;
};


const drawContinuationHeader = (ctx: Ctx) => {
  const t = T(ctx);
  const topY = A4.h - MARGIN;
  // Logo pequena
  if (ctx.logo) {
    const h = 22;
    const w = h * (ctx.logo.width / ctx.logo.height);
    ctx.page.drawImage(ctx.logo, { x: MARGIN, y: topY - h, width: w, height: h });
  }
  // ID à direita
  const label = `${t.idLabel}: ${ctx.order.orderNumber}`;
  const lw = measure(ctx.fontBold, label, 9);
  ctx.page.drawText(sanitize(label), {
    x: A4.w - MARGIN - lw, y: topY - 14, size: 9, font: ctx.fontBold, color: COLOR_BRAND_BLUE,
  });
  // Linha azul
  ctx.page.drawRectangle({
    x: MARGIN, y: topY - 30, width: CONTENT_W, height: 1.5, color: COLOR_BRAND_BLUE,
  });
  ctx.y = topY - 44;
};

const drawFooter = (ctx: Ctx, pageIndex: number, pageCount: number) => {
  const barH = 48;
  // Faixa azul cheia
  ctx.page.drawRectangle({
    x: 0, y: 0, width: A4.w, height: barH, color: COLOR_BRAND_BLUE,
  });
  // Faixa fina laranja acima
  ctx.page.drawRectangle({
    x: 0, y: barH, width: A4.w, height: 3, color: COLOR_BRAND_ORANGE,
  });

  const emailText = COMPANY.email;
  const addrText = `${COMPANY.address} · ${COMPANY.cityLine}`;
  const phoneText = COMPANY.phone;

  const emailW = measure(ctx.fontBold, emailText, 11);
  ctx.page.drawText(sanitize(emailText), {
    x: (A4.w - emailW) / 2, y: barH - 18, size: 11, font: ctx.fontBold, color: COLOR_WHITE,
  });
  const addrW = measure(ctx.font, addrText, 8);
  ctx.page.drawText(sanitize(addrText), {
    x: (A4.w - addrW) / 2, y: barH - 30, size: 8, font: ctx.font, color: COLOR_WHITE,
  });
  const phoneW = measure(ctx.font, phoneText, 8);
  ctx.page.drawText(sanitize(phoneText), {
    x: (A4.w - phoneW) / 2, y: barH - 40, size: 8, font: ctx.font, color: COLOR_WHITE,
  });

  // Paginação canto direito, acima da barra
  const t = T(ctx);
  const pg = `${t.page} ${pageIndex + 1} ${t.of} ${pageCount}`;
  const pw = measure(ctx.font, pg, 8);
  ctx.page.drawText(sanitize(pg), {
    x: A4.w - MARGIN - pw, y: barH + 8, size: 8, font: ctx.font, color: COLOR_MUTED,
  });
};

// ---------- Icons (vector) ----------
type IconKind = "bed" | "plane" | "service" | "info" | "emergency" | "user" | "policy" | "calendar" | "moon" | "users";

const drawIcon = (page: PDFPage, kind: IconKind, x: number, y: number, size: number, color: Color) => {
  // (x, y) = bottom-left of icon box, size = width=height
  const s = size;
  switch (kind) {
    case "bed": {
      // travesseiro + colchão
      page.drawRectangle({ x, y: y + s * 0.1, width: s, height: s * 0.28, color });
      page.drawRectangle({ x, y: y + s * 0.38, width: s * 0.42, height: s * 0.28, color });
      page.drawLine({ start: { x, y: y + s * 0.1 }, end: { x, y: y + s * 0.8 }, thickness: s * 0.08, color });
      break;
    }
    case "plane": {
      // avião estilizado (triângulos)
      const cx = x + s / 2, cy = y + s / 2;
      page.drawLine({ start: { x: x + s * 0.05, y: cy }, end: { x: x + s * 0.95, y: cy }, thickness: s * 0.14, color });
      page.drawLine({ start: { x: cx, y: y + s * 0.15 }, end: { x: cx + s * 0.15, y: cy }, thickness: s * 0.12, color });
      page.drawLine({ start: { x: cx, y: y + s * 0.85 }, end: { x: cx + s * 0.15, y: cy }, thickness: s * 0.12, color });
      break;
    }
    case "service": {
      // estrela/serviço (círculo com asterisco)
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.42, borderColor: color, borderWidth: s * 0.1 });
      page.drawLine({ start: { x: x + s * 0.3, y: y + s / 2 }, end: { x: x + s * 0.7, y: y + s / 2 }, thickness: s * 0.1, color });
      page.drawLine({ start: { x: x + s / 2, y: y + s * 0.3 }, end: { x: x + s / 2, y: y + s * 0.7 }, thickness: s * 0.1, color });
      break;
    }
    case "info": {
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.45, borderColor: color, borderWidth: s * 0.1 });
      page.drawCircle({ x: x + s / 2, y: y + s * 0.72, size: s * 0.06, color });
      page.drawLine({ start: { x: x + s / 2, y: y + s * 0.25 }, end: { x: x + s / 2, y: y + s * 0.6 }, thickness: s * 0.12, color });
      break;
    }
    case "emergency": {
      // triângulo de alerta
      page.drawLine({ start: { x, y: y + s * 0.1 }, end: { x: x + s, y: y + s * 0.1 }, thickness: s * 0.1, color });
      page.drawLine({ start: { x, y: y + s * 0.1 }, end: { x: x + s / 2, y: y + s * 0.95 }, thickness: s * 0.1, color });
      page.drawLine({ start: { x: x + s, y: y + s * 0.1 }, end: { x: x + s / 2, y: y + s * 0.95 }, thickness: s * 0.1, color });
      page.drawLine({ start: { x: x + s / 2, y: y + s * 0.35 }, end: { x: x + s / 2, y: y + s * 0.65 }, thickness: s * 0.12, color });
      page.drawCircle({ x: x + s / 2, y: y + s * 0.25, size: s * 0.06, color });
      break;
    }
    case "user": {
      page.drawCircle({ x: x + s / 2, y: y + s * 0.72, size: s * 0.2, color });
      page.drawRectangle({ x: x + s * 0.15, y, width: s * 0.7, height: s * 0.4, color });
      break;
    }
    case "users": {
      page.drawCircle({ x: x + s * 0.35, y: y + s * 0.72, size: s * 0.18, color });
      page.drawCircle({ x: x + s * 0.7, y: y + s * 0.72, size: s * 0.18, color });
      page.drawRectangle({ x: x + s * 0.05, y, width: s * 0.9, height: s * 0.38, color });
      break;
    }
    case "policy": {
      // documento
      page.drawRectangle({ x: x + s * 0.1, y, width: s * 0.8, height: s * 0.95, borderColor: color, borderWidth: s * 0.08 });
      page.drawLine({ start: { x: x + s * 0.25, y: y + s * 0.7 }, end: { x: x + s * 0.75, y: y + s * 0.7 }, thickness: s * 0.06, color });
      page.drawLine({ start: { x: x + s * 0.25, y: y + s * 0.5 }, end: { x: x + s * 0.75, y: y + s * 0.5 }, thickness: s * 0.06, color });
      page.drawLine({ start: { x: x + s * 0.25, y: y + s * 0.3 }, end: { x: x + s * 0.55, y: y + s * 0.3 }, thickness: s * 0.06, color });
      break;
    }
    case "calendar": {
      page.drawRectangle({ x, y, width: s, height: s * 0.85, borderColor: color, borderWidth: s * 0.08 });
      page.drawRectangle({ x, y: y + s * 0.7, width: s, height: s * 0.15, color });
      page.drawLine({ start: { x: x + s * 0.25, y: y + s * 0.95 }, end: { x: x + s * 0.25, y: y + s * 0.75 }, thickness: s * 0.08, color });
      page.drawLine({ start: { x: x + s * 0.75, y: y + s * 0.95 }, end: { x: x + s * 0.75, y: y + s * 0.75 }, thickness: s * 0.08, color });
      break;
    }
    case "moon": {
      page.drawCircle({ x: x + s / 2, y: y + s / 2, size: s * 0.45, color });
      page.drawCircle({ x: x + s * 0.65, y: y + s * 0.6, size: s * 0.4, color: COLOR_WHITE });
      break;
    }
  }
};

// ---------- Section pill (Cativa style) ----------
// Desenha uma pílula azul cheia com título e, opcionalmente, uma pílula
// clara à direita com um valor (ex.: "Localizador: XYZ").
const drawSectionPill = (
  ctx: Ctx,
  title: string,
  opts?: { color?: Color; rightPill?: string; icon?: IconKind },
) => {
  ensureSpace(ctx, 40);
  const bg = opts?.color ?? COLOR_BRAND_ORANGE;
  const h = 28;
  const pad = 16;
  const size = 13;
  const iconSize = opts?.icon ? 13 : 0;
  const iconGap = opts?.icon ? 8 : 0;
  const textW = measure(ctx.fontBold, title, size);
  const w = textW + pad * 2 + iconSize + iconGap;
  const y = ctx.y - h;
  drawRoundedRect(ctx.page, MARGIN, y, w, h, bg, 14);
  if (opts?.icon) {
    drawIcon(ctx.page, opts.icon, MARGIN + pad, y + (h - iconSize) / 2, iconSize, COLOR_WHITE);
  }
  ctx.page.drawText(sanitize(title), {
    x: MARGIN + pad + iconSize + iconGap, y: y + 9, size, font: ctx.fontBold, color: COLOR_WHITE,
  });

  if (opts?.rightPill) {
    const rp = opts.rightPill;
    const rSize = 9;
    const rW = measure(ctx.fontBold, rp, rSize) + 22;
    const rH = 20;
    const rX = MARGIN + CONTENT_W - rW;
    const rY = y + (h - rH) / 2;
    drawRoundedRect(ctx.page, rX, rY, rW, rH, COLOR_PILL_BG, 10);
    ctx.page.drawText(sanitize(rp), {
      x: rX + 11, y: rY + 6, size: rSize, font: ctx.fontBold, color: COLOR_BRAND_BLUE,
    });
  }

  ctx.y = y - 16;
};


// Título forte de "campo" dentro de uma seção
const drawFieldTitle = (ctx: Ctx, s: string, size = 15) => {
  ensureSpace(ctx, size + 6);
  ctx.page.drawText(sanitize(s), {
    x: MARGIN, y: ctx.y - size + 2, size, font: ctx.fontBold, color: COLOR_BRAND_BLUE,
  });
  ctx.y -= size + 4;
};

// Linha "Rótulo: valor" (rótulo em bold pequeno azul)
const drawInlineKV = (ctx: Ctx, label: string, value: string, x = MARGIN, opts?: { size?: number }) => {
  const size = opts?.size ?? 10;
  const lab = `${label}: `;
  drawText(ctx, lab, x, { size, bold: true, color: COLOR_BRAND_BLUE });
  const w = measure(ctx.fontBold, lab, size);
  drawText(ctx, value || "-", x + w, { size, color: COLOR_TEXT });
};

// Tabela horizontal simples estilo Cativa: header cinza claro, rows alternadas
const drawSimpleTable = (
  ctx: Ctx,
  headers: string[],
  rows: string[][],
) => {
  if (rows.length === 0) return;
  const cols = headers.length;
  const colW = CONTENT_W / cols;
  const headerH = 22;
  const rowH = 22;
  ensureSpace(ctx, headerH + rowH * rows.length + 10);

  // Header
  const hY = ctx.y - headerH;
  ctx.page.drawRectangle({
    x: MARGIN, y: hY, width: CONTENT_W, height: headerH, color: COLOR_PILL_BG,
  });
  headers.forEach((h, i) => {
    const tx = MARGIN + i * colW + 10;
    drawText(ctx, h, tx, { y: hY + 7, size: 9, bold: true, color: COLOR_BRAND_BLUE });
  });
  ctx.y = hY;

  // Rows
  rows.forEach((r, ri) => {
    ensureSpace(ctx, rowH);
    const rY = ctx.y - rowH;
    if (ri % 2 === 1) {
      ctx.page.drawRectangle({
        x: MARGIN, y: rY, width: CONTENT_W, height: rowH, color: COLOR_ROW_ALT,
      });
    }
    r.forEach((cell, i) => {
      const tx = MARGIN + i * colW + 10;
      const lines = wrap(ctx.font, 9, cell || "-", colW - 20);
      drawText(ctx, lines[0] ?? "-", tx, { y: rY + 7, size: 9, color: COLOR_TEXT });
    });
    ctx.y = rY;
  });

  ctx.y -= 16;
};

// Desenha estrelas com fallback em círculos preenchidos/vazios (WinAnsi safe)
const drawStars = (page: PDFPage, x: number, y: number, value: number, size = 10) => {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const total = 5;
  const gap = 3;
  for (let i = 0; i < total; i++) {
    const isFull = i < full;
    const isHalf = !isFull && i === full && half;
    const cx = x + i * (size + gap) + size / 2;
    const cy = y + size / 2;
    const r = size / 2;
    if (isFull) {
      page.drawCircle({ x: cx, y: cy, size: r, color: COLOR_STAR });
    } else if (isHalf) {
      page.drawCircle({ x: cx, y: cy, size: r, color: COLOR_STAR, opacity: 0.5 });
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_STAR, borderWidth: 0.8 });
    } else {
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_STAR, borderWidth: 0.8 });
    }
  }
};

// Pin de mapa desenhado com vetores (gota + círculo interno)
const drawMapPin = (page: PDFPage, x: number, y: number, size = 12) => {
  const r = size / 2;
  const cx = x + r;
  const cyHead = y + size - r;
  // "gota": círculo (cabeça) + triângulo (ponta) apontando pra baixo
  page.drawCircle({ x: cx, y: cyHead, size: r, color: COLOR_BRAND_ORANGE });
  const tipY = y - r * 0.6;
  page.drawLine({ start: { x: cx - r * 0.75, y: cyHead - r * 0.55 }, end: { x: cx, y: tipY }, thickness: 1.2, color: COLOR_BRAND_ORANGE });
  page.drawLine({ start: { x: cx + r * 0.75, y: cyHead - r * 0.55 }, end: { x: cx, y: tipY }, thickness: 1.2, color: COLOR_BRAND_ORANGE });
  page.drawLine({ start: { x: cx - r * 0.75, y: cyHead - r * 0.55 }, end: { x: cx + r * 0.75, y: cyHead - r * 0.55 }, thickness: 1.2, color: COLOR_BRAND_ORANGE });
  // furo branco no centro
  page.drawCircle({ x: cx, y: cyHead + 0.5, size: r * 0.38, color: COLOR_WHITE });
};

// ---------- Item renderers ----------
const fetchImageBytes = async (url: string): Promise<Uint8Array | null> => {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
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

const renderHotelItem = async (
  ctx: Ctx,
  item: OrderItem,
  mapData: HotelMapData | null,
) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const hotelName = String(d.hotel_name ?? item.title ?? "").trim() || "-";
  const stars = (() => {
    const n = Number(d.hotel_stars);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const address = String(d.address ?? "").trim();
  const checkin = String(d.check_in ?? d.checkin ?? "").trim();
  const checkout = String(d.check_out ?? d.checkout ?? "").trim();
  const nights = String(d.nights ?? "").trim();
  const room = String(d.room ?? "").trim();
  const board = String(d.board ?? "").trim();
  const guests = String(d.guests ?? "").trim();
  const description = String(d.description ?? "").trim();
  const policies = String(d.policies ?? "").trim();
  const locator = item.supplier_locator ?? "";
  const taUrl = String(d.tripadvisor_url ?? "").trim();
  let photos: string[] = [];
  try {
    if (typeof d.tripadvisor_photos_json === "string" && d.tripadvisor_photos_json) {
      const parsed = JSON.parse(d.tripadvisor_photos_json as string);
      if (Array.isArray(parsed)) photos = parsed.filter((u) => typeof u === "string").slice(0, 4);
    } else if (Array.isArray(d.tripadvisor_photos)) {
      photos = (d.tripadvisor_photos as unknown[]).filter((u): u is string => typeof u === "string").slice(0, 4);
    }
  } catch { photos = []; }

  ensureSpace(ctx, 260);

  drawSectionPill(ctx, t.hotel, {
    icon: "bed",
    rightPill: locator ? `${t.reservation}: ${locator}` : undefined,
  });

  // Nome do hotel grande + estrelas ao lado (fonte display)
  const titleSize = 18;
  ensureSpace(ctx, titleSize + 8);
  const qrMiniSize = 44;
  // Título e estrelas com espaço reservado à direita pro mini QR
  const nameMaxW = CONTENT_W - qrMiniSize - 12;
  const nameLines = wrap(ctx.fontDisplay, titleSize, hotelName, nameMaxW);
  const shownName = nameLines[0] ?? hotelName;
  ctx.page.drawText(sanitize(shownName), {
    x: MARGIN, y: ctx.y - titleSize + 2, size: titleSize, font: ctx.fontDisplay, color: COLOR_BRAND_BLUE,
  });
  if (stars > 0) {
    const titleW = measure(ctx.fontDisplay, shownName, titleSize);
    drawStars(ctx.page, MARGIN + titleW + 12, ctx.y - titleSize + 5, stars, 10);
  }
  // Mini QR ao lado direito, alinhado com o título
  if (mapData?.mapsUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(mapData.mapsUrl, {
        margin: 1, width: 200, color: { dark: "#0B286A", light: "#FFFFFF" },
      });
      const qrBase64 = qrDataUrl.split(",")[1];
      const qrBytes = base64ToBytes(qrBase64);
      const qrImg = await ctx.pdf.embedPng(qrBytes);
      const qx = MARGIN + CONTENT_W - qrMiniSize;
      const qy = ctx.y - qrMiniSize + 4;
      ctx.page.drawImage(qrImg, { x: qx, y: qy, width: qrMiniSize, height: qrMiniSize });
    } catch (e) { console.error("mini qr failed", e); }
  }
  ctx.y -= titleSize + 10;

  // Endereço com pin de mapa
  if (address) {
    const pinSize = 11;
    const pinGap = 6;
    const addrX = MARGIN + pinSize + pinGap;
    const addrW = CONTENT_W - pinSize - pinGap;
    const addrLines = wrap(ctx.font, 9.5, address, addrW);
    drawMapPin(ctx.page, MARGIN, ctx.y - 4, pinSize);
    for (let i = 0; i < Math.min(addrLines.length, 2); i++) {
      drawText(ctx, addrLines[i], addrX, { size: 9.5, color: COLOR_MUTED });
      ctx.y -= 13;
    }
    ctx.y -= 6;
  }

  // Linha de dados essenciais em 4 blocos "Rótulo: valor" com ícones
  ensureSpace(ctx, 40);
  const colW = CONTENT_W / 4;
  const rowY = ctx.y - 14;
  const cells: Array<{ label: string; value: string; icon: IconKind }> = [
    { label: t.checkin, value: fmtDateShort(checkin, ctx.lang) || "-", icon: "calendar" },
    { label: t.checkout, value: fmtDateShort(checkout, ctx.lang) || "-", icon: "calendar" },
    { label: t.nights, value: nights || (checkin && checkout ? String(diffDays(checkin, checkout)) : "-"), icon: "moon" },
    { label: t.guests, value: guests || "-", icon: "users" },
  ];
  cells.forEach((c, i) => {
    const x = MARGIN + i * colW;
    drawIcon(ctx.page, c.icon, x, rowY - 1, 9, COLOR_BRAND_BLUE_SOFT);
    drawText(ctx, c.label.toUpperCase(), x + 14, { y: rowY, size: 7.5, bold: true, color: COLOR_BRAND_BLUE_SOFT });
    drawText(ctx, c.value, x, { y: rowY - 14, size: 10.5, bold: true, color: COLOR_TEXT });
  });
  ctx.y = rowY - 30;

  // Quarto / Regime como linhas inline
  if (room || board) {
    if (room) { drawInlineKV(ctx, t.room, room); ctx.y -= 14; }
    if (board) { drawInlineKV(ctx, t.board, board); ctx.y -= 14; }
    ctx.y -= 4;
  }

  // Mapa (largura cheia, sem QR ao lado — QR já foi renderizado ao lado do nome)
  if (mapData && mapData.mapPngBase64) {
    ensureSpace(ctx, 200);
    const boxTop = ctx.y;
    const boxH = 180;
    try {
      const bytes = base64ToBytes(mapData.mapPngBase64);
      const img = await ctx.pdf.embedPng(bytes);
      const ratio = img.width / img.height;
      let w = CONTENT_W;
      let h = w / ratio;
      if (h > boxH) { h = boxH; w = h * ratio; }
      const x = MARGIN + (CONTENT_W - w) / 2;
      ctx.page.drawImage(img, { x, y: boxTop - h, width: w, height: h });
      ctx.page.drawRectangle({
        x, y: boxTop - h, width: w, height: h,
        borderColor: COLOR_BORDER, borderWidth: 0.5,
      });
      ctx.y = boxTop - h - 14;
    } catch (e) {
      console.error("embed map failed", e);
    }
  }

  // Galeria de fotos do TripAdvisor
  if (photos.length > 0) {
    ensureSpace(ctx, 120);
    const gap = 8;
    const tW = (CONTENT_W - gap * (photos.length - 1)) / photos.length;
    const tH = 84;
    const rowTop = ctx.y;
    let anyEmbedded = false;
    for (let i = 0; i < photos.length; i++) {
      const img = await embedRemotePhoto(ctx.pdf, photos[i]);
      if (!img) continue;
      anyEmbedded = true;
      const x = MARGIN + i * (tW + gap);
      const y = rowTop - tH;
      // fit cover (cropping via scale — pdf-lib não corta, então usa fit)
      const ratio = img.width / img.height;
      let w = tW, h = w / ratio;
      if (h < tH) { h = tH; w = h * ratio; }
      const dx = x + (tW - Math.min(w, tW)) / 2;
      ctx.page.drawRectangle({ x, y, width: tW, height: tH, color: COLOR_ROW_ALT });
      ctx.page.drawImage(img, { x: dx, y, width: Math.min(w, tW), height: tH });
      ctx.page.drawRectangle({ x, y, width: tW, height: tH, borderColor: COLOR_BORDER, borderWidth: 0.5 });
    }
    if (anyEmbedded) {
      ctx.y = rowTop - tH - 10;
    }
  }

  // Descrição do hotel
  if (description) {
    ensureSpace(ctx, 40);
    drawText(ctx, ctx.lang === "pt" ? "SOBRE O HOTEL" : "ABOUT THE HOTEL", MARGIN, {
      size: 8, bold: true, color: COLOR_BRAND_BLUE_SOFT,
    });
    ctx.y -= 12;
    const lines = wrap(ctx.font, 9.5, description, CONTENT_W);
    const maxLines = 6;
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      ensureSpace(ctx, 12);
      drawText(ctx, lines[i], MARGIN, { size: 9.5, color: COLOR_TEXT });
      ctx.y -= 12;
    }
    if (taUrl) {
      drawText(ctx, ctx.lang === "pt" ? "Fonte: TripAdvisor" : "Source: TripAdvisor", MARGIN, {
        size: 7.5, color: COLOR_MUTED,
      });
      ctx.y -= 12;
    }
    ctx.y -= 4;
  }

  // Políticas do hotel
  if (policies) {
    ensureSpace(ctx, 50);
    drawSectionPill(ctx, ctx.lang === "pt" ? "Políticas do hotel" : "Hotel policies", {
      icon: "policy",
    });
    const lines = wrap(ctx.font, 9.5, policies, CONTENT_W - 10);
    for (const ln of lines) {
      ensureSpace(ctx, 12);
      drawText(ctx, `• ${ln}`, MARGIN, { size: 9.5, color: COLOR_TEXT });
      ctx.y -= 13;
    }
    ctx.y -= 6;
  }

  ctx.y -= 6;
};


const renderFlightItem = (ctx: Ctx, item: OrderItem) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const airline = String(d.airline ?? "").trim();
  const flightNo = String(d.flight_number ?? "").trim();
  const dep = String(d.depart_at ?? d.departure ?? "").trim();
  const arr = String(d.arrive_at ?? d.arrival ?? "").trim();
  const from = String(d.origin ?? d.from ?? "").trim();
  const to = String(d.destination ?? d.to ?? "").trim();
  const locator = item.supplier_locator ?? "";

  ensureSpace(ctx, 140);
  drawSectionPill(ctx, t.flight, {
    icon: "plane",
    rightPill: locator ? `${t.reservation}: ${locator}` : undefined,
  });

  const title = [airline, flightNo].filter(Boolean).join(" · ") || item.title || "-";
  drawFieldTitle(ctx, title, 14);

  // 4 colunas: Origem / Destino / Partida / Chegada
  const colW = CONTENT_W / 4;
  const rowY = ctx.y - 14;
  const cells: Array<{ label: string; value: string }> = [
    { label: t.from, value: from || "-" },
    { label: t.to, value: to || "-" },
    { label: t.departure, value: fmtDateTime(dep, ctx.lang) || "-" },
    { label: t.arrival, value: fmtDateTime(arr, ctx.lang) || "-" },
  ];
  cells.forEach((c, i) => {
    const x = MARGIN + i * colW;
    drawText(ctx, c.label.toUpperCase(), x, { y: rowY, size: 7.5, bold: true, color: COLOR_BRAND_BLUE_SOFT });
    const lines = wrap(ctx.font, 9.5, c.value, colW - 8);
    drawText(ctx, lines[0] ?? "-", x, { y: rowY - 12, size: 9.5, bold: true, color: COLOR_TEXT });
    if (lines[1]) drawText(ctx, lines[1], x, { y: rowY - 22, size: 8.5, color: COLOR_MUTED });
  });
  ctx.y = rowY - 30;
};

const renderOtherItem = (ctx: Ctx, item: OrderItem) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const description = String(d.description ?? d.details ?? "").trim();
  const dateFrom = String(d.date_from ?? d.start_date ?? "").trim();
  const dateTo = String(d.date_to ?? d.end_date ?? "").trim();
  const locator = item.supplier_locator ?? "";

  ensureSpace(ctx, 90);
  drawSectionPill(ctx, t.service, {
    icon: "service",
    rightPill: locator ? `${t.reservation}: ${locator}` : undefined,
  });

  drawFieldTitle(ctx, item.title || "-", 14);

  if (dateFrom || dateTo) {
    if (dateFrom) { drawInlineKV(ctx, t.checkin, fmtDateShort(dateFrom, ctx.lang)); ctx.y -= 14; }
    if (dateTo) { drawInlineKV(ctx, t.checkout, fmtDateShort(dateTo, ctx.lang)); ctx.y -= 14; }
  }
  if (description) {
    const lines = wrap(ctx.font, 9.5, description, CONTENT_W);
    for (const ln of lines) {
      ensureSpace(ctx, 12);
      drawText(ctx, ln, MARGIN, { size: 9.5 });
      ctx.y -= 12;
    }
    ctx.y -= 4;
  }
  ctx.y -= 6;
};

// ---------- Passageiros ----------
const drawPassengersBlock = (ctx: Ctx, passengers: OrderPassenger[]) => {
  if (!passengers.length) return;
  const t = T(ctx);
  const label = passengers.length > 1 ? t.passengers : t.passenger;
  drawSectionPill(ctx, label, { icon: passengers.length > 1 ? "users" : "user" });

  // Tabela: Nome · Documento · Tipo
  const typeLabel = ctx.lang === "pt" ? "Tipo" : "Type";
  const headers: string[] = [t.passengers, t.documentLabel, typeLabel];

  const rows = passengers.map((p) => {
    const name = p.full_name || "-";
    const doc = p.doc_type === "passport"
      ? (p.passport_number ? `PPT ${p.passport_number}` : "-")
      : (p.cpf ? `CPF ${p.cpf}` : (p.document ?? "-"));
    const type = (p.passenger_type ?? "").toUpperCase() === "CHD"
      ? (ctx.lang === "pt" ? "Criança" : "Child")
      : (p.passenger_type ?? "").toUpperCase() === "INF"
      ? (ctx.lang === "pt" ? "Infantil" : "Infant")
      : (ctx.lang === "pt" ? "Adulto" : "Adult");
    return [name, doc, type];
  });

  drawSimpleTable(ctx, headers, rows);
};

// ---------- Informações & Emergências ----------
const drawInfoBlock = (ctx: Ctx) => {
  const t = T(ctx);
  drawSectionPill(ctx, t.generalInfo, { icon: "info" });
  const lines = wrap(ctx.font, 9, t.generalInfoText, CONTENT_W - 10);
  for (const ln of lines) {
    ensureSpace(ctx, 12);
    drawText(ctx, `• ${ln}`, MARGIN, { size: 9, color: COLOR_TEXT });
    ctx.y -= 12;
  }
  ctx.y -= 6;
};

const drawEmergencyBlock = (ctx: Ctx) => {
  const t = T(ctx);
  drawSectionPill(ctx, t.emergency, { color: COLOR_EMERGENCY, icon: "emergency" });
  const boxH = 46;
  ensureSpace(ctx, boxH + 6);
  const y = ctx.y - boxH;
  ctx.page.drawRectangle({
    x: MARGIN, y, width: CONTENT_W, height: boxH,
    color: COLOR_ROW_ALT, borderColor: COLOR_BORDER, borderWidth: 0.5,
  });
  const lines = wrap(ctx.font, 9, t.emergencyText, CONTENT_W - 24);
  let yy = y + boxH - 14;
  for (const ln of lines) {
    ctx.page.drawText(sanitize(ln), { x: MARGIN + 12, y: yy, size: 9, font: ctx.font, color: COLOR_TEXT });
    yy -= 12;
  }
  const contactLine = `${COMPANY.phone} · ${COMPANY.email}`;
  ctx.page.drawText(sanitize(contactLine), {
    x: MARGIN + 12, y: y + 8, size: 9, font: ctx.fontBold, color: COLOR_EMERGENCY,
  });
  ctx.y = y - 12;
};

// ---------- Utils ----------
const diffDays = (a: string, b: string): number => {
  const da = new Date(a + "T00:00");
  const db = new Date(b + "T00:00");
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000));
};

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

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

// ---------- Public API ----------
export async function generateVoucher(
  detail: OrderDetail,
  lang: VoucherLang = "pt",
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontDisplay = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await fetchLogo(pdf);

  const firstPage = pdf.addPage([A4.w, A4.h]);
  const ctx: Ctx = {
    pdf, page: firstPage, y: A4.h - MARGIN,
    font, fontBold, fontDisplay, lang,
    order: detail.order, logo, pages: [firstPage],
  };

  drawMainHeader(ctx);


  // Buscar mapas para hotéis (paralelo)
  const hotelItems = detail.items.filter(i => i.kind === "hotel");
  const mapByItem = new Map<string, HotelMapData | null>();
  await Promise.all(hotelItems.map(async (it) => {
    const d = (it.details ?? {}) as Record<string, unknown>;
    const address = String(d.address ?? "").trim();
    const hotelName = String(d.hotel_name ?? it.title ?? "").trim();
    if (!address && !hotelName) { mapByItem.set(it.id, null); return; }
    try {
      const res = await getHotelMap({ data: { address: address || hotelName, hotelName } });
      mapByItem.set(it.id, res);
    } catch (e) {
      console.error("hotel map error", e);
      mapByItem.set(it.id, null);
    }
  }));

  // Ordena itens (por sort_order já vem ordenado do backend)
  for (const item of detail.items) {
    if (item.kind === "hotel") {
      await renderHotelItem(ctx, item, mapByItem.get(item.id) ?? null);
    } else if (item.kind === "flight") {
      renderFlightItem(ctx, item);
    } else {
      renderOtherItem(ctx, item);
    }
  }

  // Passageiros (depois dos itens, como referência consolidada)
  drawPassengersBlock(ctx, detail.passengers);

  // Informações gerais + Emergências
  drawInfoBlock(ctx);
  drawEmergencyBlock(ctx);

  // Rodapé em todas as páginas
  const total = ctx.pages.length;
  ctx.pages.forEach((pg, i) => {
    ctx.page = pg;
    drawFooter(ctx, i, total);
  });

  const bytes = await pdf.save();
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: "application/pdf" });
}
