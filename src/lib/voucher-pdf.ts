// Voucher elegante minimalista — Via Air
// Gera um PDF único com todos os itens do pedido (aéreo, hotel, serviços).
// Bilíngue (pt-BR / en). Roda no navegador via pdf-lib.
//
// Para hotéis, embute mapa estático do Google Maps + QR code que abre a rota
// no celular. O mapa é buscado por server function; o QR é gerado localmente.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import type { OrderDetail, OrderItem, OrderPassenger } from "./orders.functions";
import { getHotelMap, type HotelMapData } from "./voucher-map.functions";

// ---------- Layout ----------
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 40;
const CONTENT_W = A4.w - MARGIN * 2;

// Paleta baseada nos tokens da agência
const COLOR_TEXT = rgb(0.10, 0.11, 0.13);
const COLOR_MUTED = rgb(0.42, 0.45, 0.50);
const COLOR_BORDER = rgb(0.86, 0.88, 0.90);
const COLOR_SUBTLE_BG = rgb(0.97, 0.97, 0.98);
const COLOR_BRAND_ORANGE = rgb(241 / 255, 160 / 255, 74 / 255);
const COLOR_BRAND_BLUE = rgb(25 / 255, 111 / 255, 153 / 255);
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
    title: "VOUCHER DE VIAGEM",
    subtitle: "Travel Voucher",
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
    footerTagline: "Boa viagem! · Have a great trip!",
    footerLegal:
      "Documento emitido pela VIA AIR. Apresente na acomodação/embarque. Confira todos os dados; em caso de divergência, contate a agência.",
    contact: "Central de atendimento",
    page: "Página",
    of: "de",
    stars: "estrelas",
  },
  en: {
    title: "TRAVEL VOUCHER",
    subtitle: "Voucher de Viagem",
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
    reservation: "Reservation code",
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
    footerTagline: "Have a great trip! · Boa viagem!",
    footerLegal:
      "Document issued by VIA AIR. Present at check-in / boarding. Please review all details and contact the agency for any discrepancies.",
    contact: "Support",
    page: "Page",
    of: "of",
    stars: "stars",
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

const drawText = (
  ctx: Ctx,
  s: string,
  x: number,
  opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; y?: number },
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

const newPage = (ctx: Ctx) => {
  ctx.page = ctx.pdf.addPage([A4.w, A4.h]);
  ctx.pages.push(ctx.page);
  ctx.y = A4.h - MARGIN;
  drawContinuationHeader(ctx);
};

const ensureSpace = (ctx: Ctx, needed: number) => {
  if (ctx.y - needed < MARGIN + 60) newPage(ctx);
};

// ---------- Header / Footer ----------
const drawMainHeader = (ctx: Ctx) => {
  const t = T(ctx);
  const bandH = 96;
  const topY = A4.h;
  // Faixa de topo com gradiente simulado por 2 retângulos
  ctx.page.drawRectangle({
    x: 0, y: topY - bandH, width: A4.w, height: bandH,
    color: rgb(0.99, 0.99, 1),
  });
  // Barra lateral colorida
  ctx.page.drawRectangle({
    x: 0, y: topY - bandH, width: 5, height: bandH,
    color: COLOR_BRAND_ORANGE,
  });
  // Título grande
  drawText(ctx, t.title, MARGIN, { y: topY - 42, size: 22, bold: true, color: COLOR_BRAND_BLUE });
  drawText(ctx, t.subtitle, MARGIN, { y: topY - 58, size: 9, color: COLOR_MUTED });

  // Bloco direito: número do pedido
  const label = t.orderLabel.toUpperCase();
  const orderNo = `#${ctx.order.orderNumber}`;
  const rightX = A4.w - MARGIN;
  const labelW = measure(ctx.fontBold, label, 8);
  const orderW = measure(ctx.fontBold, orderNo, 18);
  drawText(ctx, label, rightX - labelW, { y: topY - 30, size: 8, bold: true, color: COLOR_MUTED });
  drawText(ctx, orderNo, rightX - orderW, { y: topY - 52, size: 18, bold: true, color: COLOR_BRAND_ORANGE });

  const issuedLabel = `${t.issuedAt} ${fmtDateShort(new Date().toISOString(), ctx.lang)}`;
  const issuedW = measure(ctx.font, issuedLabel, 8);
  drawText(ctx, issuedLabel, rightX - issuedW, { y: topY - 66, size: 8, color: COLOR_MUTED });

  // Logo (canto direito, acima do número)
  if (ctx.logo) {
    const maxW = 80;
    const ratio = ctx.logo.width / ctx.logo.height;
    const w = maxW;
    const h = w / ratio;
    ctx.page.drawImage(ctx.logo, {
      x: A4.w - MARGIN - w,
      y: topY - 14 - h,
      width: w,
      height: h,
      opacity: 0.0, // não usar aqui — logo aparece só no rodapé, mantém topo limpo
    });
  }

  // Linha divisória inferior do cabeçalho
  ctx.page.drawRectangle({
    x: MARGIN, y: topY - bandH - 1, width: CONTENT_W, height: 1,
    color: COLOR_BORDER,
  });

  ctx.y = topY - bandH - 20;
};

const drawContinuationHeader = (ctx: Ctx) => {
  const t = T(ctx);
  const topY = A4.h - 20;
  drawText(ctx, `${t.title} · #${ctx.order.orderNumber}`, MARGIN, {
    y: topY, size: 9, bold: true, color: COLOR_BRAND_BLUE,
  });
  ctx.page.drawRectangle({
    x: MARGIN, y: topY - 8, width: CONTENT_W, height: 0.6,
    color: COLOR_BORDER,
  });
  ctx.y = topY - 24;
};

const drawFooter = (ctx: Ctx, pageIndex: number, pageCount: number) => {
  const t = T(ctx);
  const y = MARGIN - 4;
  // Faixa fina laranja
  ctx.page.drawRectangle({
    x: MARGIN, y: y + 32, width: CONTENT_W, height: 0.8,
    color: COLOR_BRAND_ORANGE,
  });
  // Logo pequena à esquerda
  if (ctx.logo) {
    const h = 22;
    const w = h * (ctx.logo.width / ctx.logo.height);
    ctx.page.drawImage(ctx.logo, { x: MARGIN, y: y + 4, width: w, height: h });
  }
  // Tagline central
  const tagline = t.footerTagline;
  const tagW = measure(ctx.fontBold, tagline, 8);
  ctx.page.drawText(sanitize(tagline), {
    x: (A4.w - tagW) / 2, y: y + 18, size: 8, font: ctx.fontBold, color: COLOR_BRAND_BLUE,
  });

  // Company + paginação à direita
  const rightX = A4.w - MARGIN;
  const companyLine = `${COMPANY.short} · CNPJ ${COMPANY.cnpj}`;
  const contactLine = `${COMPANY.phone} · ${COMPANY.email}`;
  const cw1 = measure(ctx.font, companyLine, 7);
  const cw2 = measure(ctx.font, contactLine, 7);
  ctx.page.drawText(sanitize(companyLine), {
    x: rightX - cw1, y: y + 20, size: 7, font: ctx.font, color: COLOR_MUTED,
  });
  ctx.page.drawText(sanitize(contactLine), {
    x: rightX - cw2, y: y + 10, size: 7, font: ctx.font, color: COLOR_MUTED,
  });
  const pageStr = `${t.page} ${pageIndex + 1} ${t.of} ${pageCount}`;
  const pw = measure(ctx.font, pageStr, 7);
  ctx.page.drawText(sanitize(pageStr), {
    x: rightX - pw, y: y + 0, size: 7, font: ctx.font, color: COLOR_MUTED,
  });
};

// ---------- Passenger block ----------
const drawPassengersBlock = (ctx: Ctx, passengers: OrderPassenger[]) => {
  if (!passengers.length) return;
  const t = T(ctx);
  const label = passengers.length > 1 ? t.passengers : t.passenger;
  ensureSpace(ctx, 40);

  drawText(ctx, label.toUpperCase(), MARGIN, { size: 8, bold: true, color: COLOR_BRAND_ORANGE });
  ctx.y -= 12;

  // Card fundo sutil
  const cardTop = ctx.y + 4;
  const lineH = 13;
  const rows = passengers.length;
  const cardH = rows * lineH + 12;
  ctx.page.drawRectangle({
    x: MARGIN, y: cardTop - cardH, width: CONTENT_W, height: cardH,
    color: COLOR_SUBTLE_BG, borderColor: COLOR_BORDER, borderWidth: 0.5,
  });

  passengers.forEach((p, i) => {
    const yy = cardTop - 8 - (i + 1) * lineH + 4;
    const name = p.full_name || "-";
    const doc = p.doc_type === "passport"
      ? (p.passport_number ? `PPT ${p.passport_number}` : "")
      : (p.cpf ? `CPF ${p.cpf}` : (p.document ?? ""));
    drawText(ctx, name, MARGIN + 10, { y: yy, size: 10, bold: true });
    if (doc) {
      const dw = measure(ctx.font, doc, 9);
      drawText(ctx, doc, MARGIN + CONTENT_W - 10 - dw, { y: yy, size: 9, color: COLOR_MUTED });
    }
  });

  ctx.y = cardTop - cardH - 18;
};

// ---------- Item card helpers ----------
const drawItemHeader = (ctx: Ctx, kindLabel: string, title: string, accent: ReturnType<typeof rgb>) => {
  // Tag colorida do tipo
  const tagW = measure(ctx.fontBold, kindLabel.toUpperCase(), 7) + 12;
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y - 2, width: tagW, height: 14,
    color: accent,
  });
  drawText(ctx, kindLabel.toUpperCase(), MARGIN + 6, {
    y: ctx.y + 2, size: 7, bold: true, color: rgb(1, 1, 1),
  });
  // Título ao lado
  const titleX = MARGIN + tagW + 8;
  drawText(ctx, title, titleX, { y: ctx.y + 2, size: 12, bold: true, color: COLOR_TEXT });
  ctx.y -= 22;
};

// Linha rótulo/valor em 2 colunas
const drawKV = (
  ctx: Ctx,
  pairs: Array<{ label: string; value: string }>,
  cols = 2,
) => {
  const colW = CONTENT_W / cols;
  const lineH = 24;
  for (let i = 0; i < pairs.length; i += cols) {
    ensureSpace(ctx, lineH);
    for (let c = 0; c < cols; c++) {
      const p = pairs[i + c];
      if (!p) continue;
      const x = MARGIN + c * colW;
      drawText(ctx, p.label.toUpperCase(), x, {
        y: ctx.y, size: 7, bold: true, color: COLOR_MUTED,
      });
      const lines = wrap(ctx.font, 9.5, p.value || "-", colW - 14);
      let yy = ctx.y - 11;
      for (const ln of lines.slice(0, 2)) {
        ctx.page.drawText(sanitize(ln), { x, y: yy, size: 9.5, font: ctx.font, color: COLOR_TEXT });
        yy -= 11;
      }
    }
    ctx.y -= lineH;
  }
};

// Desenha estrelas (aceita meia estrela via valor fracionário)
const drawStars = (ctx: Ctx, x: number, y: number, value: number, size = 10) => {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const total = 5;
  const gap = 2;
  const filled = "★";
  const empty = "☆";
  for (let i = 0; i < total; i++) {
    // "★" e "☆" não estão em WinAnsi. Usar losango preenchido/vazio como fallback estilizado.
    const isFull = i < full;
    const isHalf = !isFull && i === full && half;
    const glyph = isFull || isHalf ? "\u2666" : "\u25C7"; // ♦ e ◇ (não WinAnsi)
    void filled; void empty; void glyph;
    // Como esses glyphs não estão no WinAnsi, desenhamos primitivas geométricas.
    const cx = x + i * (size + gap) + size / 2;
    const cy = y + size / 2;
    // Estrela simulada: retângulo preenchido para "cheia", contornado para "vazia"
    const r = size / 2;
    if (isFull) {
      ctx.page.drawCircle({ x: cx, y: cy, size: r, color: COLOR_STAR });
    } else if (isHalf) {
      ctx.page.drawCircle({ x: cx, y: cy, size: r, color: COLOR_STAR, opacity: 0.5 });
      ctx.page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_STAR, borderWidth: 0.8 });
    } else {
      ctx.page.drawCircle({ x: cx, y: cy, size: r, borderColor: COLOR_STAR, borderWidth: 0.8 });
    }
  }
};

// ---------- Item renderers ----------
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
  const locator = item.supplier_locator ?? "";

  ensureSpace(ctx, 240);

  // Cabeçalho do item + estrelas ao lado do nome
  drawItemHeader(ctx, t.hotel, hotelName, COLOR_BRAND_BLUE);
  if (stars > 0) {
    const titleW = measure(ctx.fontBold, hotelName, 12);
    const tagW = measure(ctx.fontBold, t.hotel.toUpperCase(), 7) + 12;
    const starsX = MARGIN + tagW + 8 + titleW + 10;
    drawStars(ctx, starsX, ctx.y + 24, stars, 9);
  }

  // KVs
  drawKV(ctx, [
    { label: t.checkin, value: fmtDateShort(checkin, ctx.lang) },
    { label: t.checkout, value: fmtDateShort(checkout, ctx.lang) },
    { label: t.nights, value: nights || (checkin && checkout ? String(diffDays(checkin, checkout)) : "-") },
    { label: t.reservation, value: locator || "-" },
    { label: t.room, value: room || "-" },
    { label: t.board, value: board || "-" },
    { label: t.guests, value: guests || "-" },
    { label: t.address, value: address || "-" },
  ]);

  // Mapa + QR
  if (mapData && (mapData.mapPngBase64 || mapData.mapsUrl)) {
    ensureSpace(ctx, 200);
    const boxTop = ctx.y;
    const boxH = 180;
    const mapW = 350;
    const mapH = boxH;
    const qrSize = 110;

    // Mapa
    if (mapData.mapPngBase64) {
      try {
        const bytes = base64ToBytes(mapData.mapPngBase64);
        const img = await ctx.pdf.embedPng(bytes);
        // fit into mapW x mapH mantendo aspecto
        const ratio = img.width / img.height;
        let w = mapW;
        let h = w / ratio;
        if (h > mapH) { h = mapH; w = h * ratio; }
        ctx.page.drawImage(img, {
          x: MARGIN, y: boxTop - h, width: w, height: h,
        });
        // moldura sutil
        ctx.page.drawRectangle({
          x: MARGIN, y: boxTop - h, width: w, height: h,
          borderColor: COLOR_BORDER, borderWidth: 0.5,
        });
      } catch (e) {
        console.error("embed map failed", e);
      }
    } else {
      // placeholder
      ctx.page.drawRectangle({
        x: MARGIN, y: boxTop - mapH, width: mapW, height: mapH,
        color: COLOR_SUBTLE_BG, borderColor: COLOR_BORDER, borderWidth: 0.5,
      });
    }

    // QR à direita
    const qrX = MARGIN + mapW + 20;
    if (mapData.mapsUrl) {
      try {
        const qrDataUrl = await QRCode.toDataURL(mapData.mapsUrl, {
          margin: 1, width: 300, color: { dark: "#196F99", light: "#FFFFFF" },
        });
        const qrBase64 = qrDataUrl.split(",")[1];
        const qrBytes = base64ToBytes(qrBase64);
        const qrImg = await ctx.pdf.embedPng(qrBytes);
        const qy = boxTop - 8 - qrSize;
        ctx.page.drawImage(qrImg, { x: qrX, y: qy, width: qrSize, height: qrSize });
        drawText(ctx, t.scanForMap, qrX, {
          y: qy - 10, size: 7, color: COLOR_MUTED,
        });
        // Link textual curto
        const link = t.openMap;
        drawText(ctx, link, qrX, {
          y: qy - 22, size: 7, bold: true, color: COLOR_BRAND_BLUE,
        });
      } catch (e) {
        console.error("qr failed", e);
      }
    }

    ctx.y = boxTop - boxH - 14;
  }

  // Separador
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y, width: CONTENT_W, height: 0.6, color: COLOR_BORDER,
  });
  ctx.y -= 14;
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

  ensureSpace(ctx, 90);
  const title = [airline, flightNo].filter(Boolean).join(" · ") || item.title || "-";
  drawItemHeader(ctx, t.flight, title, COLOR_BRAND_ORANGE);
  drawKV(ctx, [
    { label: t.from, value: from || "-" },
    { label: t.to, value: to || "-" },
    { label: t.departure, value: fmtDateTime(dep, ctx.lang) },
    { label: t.arrival, value: fmtDateTime(arr, ctx.lang) },
    { label: t.airline, value: airline || "-" },
    { label: t.reservation, value: locator || "-" },
  ]);
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y, width: CONTENT_W, height: 0.6, color: COLOR_BORDER,
  });
  ctx.y -= 14;
};

const renderOtherItem = (ctx: Ctx, item: OrderItem) => {
  const t = T(ctx);
  const d = (item.details ?? {}) as Record<string, unknown>;
  const description = String(d.description ?? d.details ?? "").trim();
  const dateFrom = String(d.date_from ?? d.start_date ?? "").trim();
  const dateTo = String(d.date_to ?? d.end_date ?? "").trim();
  const locator = item.supplier_locator ?? "";

  ensureSpace(ctx, 70);
  drawItemHeader(ctx, t.service, item.title || "-", rgb(0.45, 0.5, 0.55));
  const pairs: Array<{ label: string; value: string }> = [];
  if (dateFrom) pairs.push({ label: t.checkin, value: fmtDateShort(dateFrom, ctx.lang) });
  if (dateTo) pairs.push({ label: t.checkout, value: fmtDateShort(dateTo, ctx.lang) });
  if (locator) pairs.push({ label: t.reservation, value: locator });
  if (pairs.length) drawKV(ctx, pairs);
  if (description) {
    const lines = wrap(ctx.font, 9.5, description, CONTENT_W);
    for (const ln of lines) {
      ensureSpace(ctx, 12);
      drawText(ctx, ln, MARGIN, { size: 9.5 });
      ctx.y -= 12;
    }
    ctx.y -= 4;
  }
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y, width: CONTENT_W, height: 0.6, color: COLOR_BORDER,
  });
  ctx.y -= 14;
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
  const logo = await fetchLogo(pdf);

  const firstPage = pdf.addPage([A4.w, A4.h]);
  const ctx: Ctx = {
    pdf, page: firstPage, y: A4.h - MARGIN,
    font, fontBold, lang,
    order: detail.order, logo, pages: [firstPage],
  };

  drawMainHeader(ctx);

  // Contratante / pagador
  const t = T(ctx);
  const payerName = detail.order.payerFullName || detail.order.fullName;
  if (payerName) {
    drawText(ctx, t.passenger.toUpperCase() + " · " + payerName, MARGIN, {
      size: 10, bold: true, color: COLOR_TEXT,
    });
    ctx.y -= 16;
  }

  // Passageiros
  drawPassengersBlock(ctx, detail.passengers);

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

  // Aviso legal + tagline final
  ensureSpace(ctx, 40);
  const legalLines = wrap(ctx.font, 7.5, T(ctx).footerLegal, CONTENT_W);
  for (const ln of legalLines) {
    ensureSpace(ctx, 10);
    drawText(ctx, ln, MARGIN, { size: 7.5, color: COLOR_MUTED });
    ctx.y -= 10;
  }

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
