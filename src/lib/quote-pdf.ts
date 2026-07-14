// Orcamento PDF (client-side) — visual alinhado ao voucher Via Air.
import {
  PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage,
} from "pdf-lib";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import { formatBRL } from "@/lib/format";
import type { PublicQuote, PublicQuoteItem, QuoteConfig } from "@/lib/quote.functions";

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 34;
const CW = A4.w - MARGIN * 2;

const C_WHITE = rgb(1, 1, 1);
const C_TEXT = rgb(0.09, 0.11, 0.15);
const C_MUTED = rgb(0.42, 0.45, 0.5);
const C_BORDER = rgb(0.86, 0.88, 0.92);
const C_ALT = rgb(0.97, 0.97, 0.98);
const C_NAVY = rgb(19 / 255, 33 / 255, 68 / 255);
const C_NAVY_SOFT = rgb(230 / 255, 234 / 255, 245 / 255);
const C_ORANGE = rgb(241 / 255, 140 / 255, 51 / 255);
const C_EMERALD = rgb(16 / 255, 122 / 255, 87 / 255);
const C_EMERALD_SOFT = rgb(224 / 255, 245 / 255, 235 / 255);
const C_SKY = rgb(2 / 255, 132 / 255, 199 / 255);
const C_VIOLET = rgb(109 / 255, 40 / 255, 217 / 255);
const C_AMBER_SOFT = rgb(254 / 255, 243 / 255, 199 / 255);
const C_AMBER_TEXT = rgb(146 / 255, 64 / 255, 14 / 255);

function fmtDateBR(iso?: string | null) {
  if (!iso) return "";
  const [d] = iso.split("T");
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : d;
}
function fmtTime(iso?: string | null) {
  if (!iso || !iso.includes("T")) return "";
  return (iso.split("T")[1] ?? "").slice(0, 5);
}

function sanitize(s: string) {
  // pdf-lib StandardFonts = WinAnsi. Remove chars fora do intervalo (emojis etc).
  return s.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u017F]/g, "");
}

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([A4.w, A4.h]);
  ctx.y = A4.h - MARGIN;
}
function ensure(ctx: Ctx, h: number) {
  if (ctx.y - h < MARGIN + 40) newPage(ctx);
}
function drawText(ctx: Ctx, text: string, x: number, y: number, opts: {
  size?: number; bold?: boolean; color?: ReturnType<typeof rgb>;
} = {}) {
  const { size = 10, bold = false, color = C_TEXT } = opts;
  ctx.page.drawText(sanitize(text), { x, y, size, font: bold ? ctx.bold : ctx.font, color });
}
function textWidth(ctx: Ctx, s: string, size = 10, bold = false) {
  return (bold ? ctx.bold : ctx.font).widthOfTextAtSize(sanitize(s), size);
}
function wrap(ctx: Ctx, text: string, maxW: number, size = 10, bold = false): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (textWidth(ctx, cand, size, bold) <= maxW) cur = cand;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>, opts: { border?: ReturnType<typeof rgb>; borderWidth?: number } = {}) {
  ctx.page.drawRectangle({
    x, y, width: w, height: h, color,
    borderColor: opts.border, borderWidth: opts.borderWidth ?? (opts.border ? 0.6 : 0),
  });
}

// ---------- Sections ----------

async function drawHeader(ctx: Ctx, q: PublicQuote, logo: PDFImage | null) {
  const H = 90;
  rect(ctx, 0, A4.h - H, A4.w, H, C_NAVY);
  if (logo) {
    const scale = 60 / logo.height;
    const w = logo.width * scale;
    ctx.page.drawImage(logo, { x: MARGIN, y: A4.h - H + (H - 60) / 2, width: w, height: 60 });
  }
  drawText(ctx, "ORCAMENTO", A4.w - MARGIN - textWidth(ctx, "ORCAMENTO", 20, true), A4.h - 40, { size: 20, bold: true, color: C_ORANGE });
  const nRight = `No ${q.orderNumber}`;
  drawText(ctx, nRight, A4.w - MARGIN - textWidth(ctx, nRight, 11, false), A4.h - 58, { size: 11, color: C_WHITE });
  const dateStr = fmtDateBR(q.createdAt);
  drawText(ctx, dateStr, A4.w - MARGIN - textWidth(ctx, dateStr, 9, false), A4.h - 72, { size: 9, color: C_NAVY_SOFT });
  ctx.y = A4.h - H - 18;
}

function drawGreeting(ctx: Ctx, q: PublicQuote) {
  const title = `Ola ${q.customerFirstName}, seu orcamento esta pronto`;
  drawText(ctx, title, MARGIN, ctx.y - 14, { size: 16, bold: true });
  ctx.y -= 20;
  const parts: string[] = [];
  if (q.destination) parts.push(q.destination);
  const pax = q.travelers.adults + q.travelers.children;
  if (pax > 0) parts.push(`${q.travelers.adults} adulto${q.travelers.adults !== 1 ? "s" : ""}${q.travelers.children > 0 ? `, ${q.travelers.children} crianca${q.travelers.children !== 1 ? "s" : ""}` : ""}`);
  if (parts.length) {
    drawText(ctx, parts.join("  |  "), MARGIN, ctx.y - 12, { size: 10, color: C_MUTED });
    ctx.y -= 16;
  }
  if (q.config.valid_until) {
    const s = `Valido ate ${fmtDateBR(q.config.valid_until)}`;
    const w = textWidth(ctx, s, 9, true) + 12;
    rect(ctx, MARGIN, ctx.y - 14, w, 16, C_AMBER_SOFT, { border: rgb(252/255, 211/255, 77/255) });
    drawText(ctx, s, MARGIN + 6, ctx.y - 11, { size: 9, bold: true, color: C_AMBER_TEXT });
    ctx.y -= 20;
  }
  ctx.y -= 6;
}

function sectionTitle(ctx: Ctx, text: string) {
  ensure(ctx, 26);
  drawText(ctx, text.toUpperCase(), MARGIN, ctx.y - 12, { size: 11, bold: true, color: C_NAVY });
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 16 }, end: { x: MARGIN + CW, y: ctx.y - 16 },
    thickness: 0.8, color: C_BORDER,
  });
  ctx.y -= 22;
}

function drawHotelCard(ctx: Ctx, it: PublicQuoteItem) {
  const nameLines = wrap(ctx, it.hotel_name || it.title, CW - 20, 12, true);
  const hasNotes = !!it.notes;
  const notesLines = hasNotes ? wrap(ctx, it.notes!, CW - 20, 9) : [];
  const meta: string[] = [];
  if (it.meal_plan) meta.push(`Regime: ${it.meal_plan}`);
  if (it.check_in) meta.push(`Check-in ${fmtDateBR(it.check_in)}`);
  if (it.check_out) meta.push(`Check-out ${fmtDateBR(it.check_out)}`);
  if (it.nights) meta.push(`${it.nights} noite${it.nights > 1 ? "s" : ""}`);
  if (it.hotel_stars) meta.push(`${it.hotel_stars} estrelas`);
  const metaLines = meta.length ? wrap(ctx, meta.join("  •  "), CW - 20, 9) : [];
  const h = 30 + nameLines.length * 14 + metaLines.length * 12 + (hasNotes ? 6 + notesLines.length * 11 : 0) + 10;
  ensure(ctx, h);
  rect(ctx, MARGIN, ctx.y - h, CW, h, C_WHITE, { border: C_BORDER });
  rect(ctx, MARGIN, ctx.y - 22, CW, 22, C_EMERALD);
  drawText(ctx, "HOSPEDAGEM", MARGIN + 10, ctx.y - 15, { size: 10, bold: true, color: C_WHITE });
  let ty = ctx.y - 22 - 16;
  for (const ln of nameLines) { drawText(ctx, ln, MARGIN + 10, ty, { size: 12, bold: true }); ty -= 14; }
  for (const ln of metaLines) { drawText(ctx, ln, MARGIN + 10, ty, { size: 9, color: C_MUTED }); ty -= 12; }
  if (hasNotes) {
    ty -= 4;
    for (const ln of notesLines) { drawText(ctx, ln, MARGIN + 10, ty, { size: 9, color: C_TEXT }); ty -= 11; }
  }
  ctx.y -= h + 8;
}

function drawFlightCard(ctx: Ctx, it: PublicQuoteItem) {
  const isReturn = it.direction === "return";
  const h = 92 + (it.notes ? 14 : 0);
  ensure(ctx, h);
  rect(ctx, MARGIN, ctx.y - h, CW, h, C_WHITE, { border: C_BORDER });
  const barColor = isReturn ? C_SKY : C_ORANGE;
  rect(ctx, MARGIN, ctx.y - 22, CW, 22, barColor);
  const headTxt = `${isReturn ? "VOLTA" : "IDA"}${it.airline ? " - " + it.airline : ""}${it.flight_number ? " " + it.flight_number : ""}`;
  drawText(ctx, headTxt, MARGIN + 10, ctx.y - 15, { size: 10, bold: true, color: C_WHITE });

  // From
  const boxY = ctx.y - 22 - 60;
  const colW = (CW - 20) / 3;
  const drawEnd = (x: number, iata: string, city: string, when: string) => {
    drawText(ctx, iata || "-", x, boxY + 40, { size: 22, bold: true });
    if (city) drawText(ctx, city, x, boxY + 26, { size: 9, color: C_MUTED });
    if (when) drawText(ctx, when, x, boxY + 12, { size: 10, bold: true });
  };
  drawEnd(MARGIN + 10, it.from_iata ?? "", it.from_city ?? "", `${fmtTime(it.departure_at)}  ${fmtDateBR(it.departure_at)}`);
  const midX = MARGIN + 10 + colW;
  ctx.page.drawLine({
    start: { x: midX + 6, y: boxY + 46 }, end: { x: midX + colW - 6, y: boxY + 46 },
    thickness: 0.8, color: C_BORDER,
  });
  drawText(ctx, "->", midX + colW / 2 - 6, boxY + 42, { size: 12, bold: true, color: C_ORANGE });
  const rightX = MARGIN + 10 + colW * 2;
  drawEnd(rightX, it.to_iata ?? "", it.to_city ?? "", `${fmtTime(it.arrival_at)}  ${fmtDateBR(it.arrival_at)}`);

  if (it.notes) {
    drawText(ctx, sanitize(it.notes).slice(0, 200), MARGIN + 10, ctx.y - h + 6, { size: 8, color: C_MUTED });
  }
  ctx.y -= h + 8;
}

function drawServiceCard(ctx: Ctx, it: PublicQuoteItem) {
  const titleLines = wrap(ctx, it.title, CW - 20, 11, true);
  const notesLines = it.notes ? wrap(ctx, it.notes, CW - 20, 9) : [];
  const dt: string[] = [];
  if (it.date_from) dt.push(`De ${fmtDateBR(it.date_from)}`);
  if (it.date_to) dt.push(`ate ${fmtDateBR(it.date_to)}`);
  const dtLine = dt.join(" ");
  const h = 30 + titleLines.length * 13 + (dtLine ? 12 : 0) + (notesLines.length ? 6 + notesLines.length * 11 : 0) + 8;
  ensure(ctx, h);
  rect(ctx, MARGIN, ctx.y - h, CW, h, C_WHITE, { border: C_BORDER });
  rect(ctx, MARGIN, ctx.y - 22, CW, 22, C_VIOLET);
  drawText(ctx, (it.category || "SERVICO").toUpperCase(), MARGIN + 10, ctx.y - 15, { size: 10, bold: true, color: C_WHITE });
  let ty = ctx.y - 22 - 14;
  for (const ln of titleLines) { drawText(ctx, ln, MARGIN + 10, ty, { size: 11, bold: true }); ty -= 13; }
  if (dtLine) { drawText(ctx, dtLine, MARGIN + 10, ty, { size: 9, color: C_MUTED }); ty -= 12; }
  if (notesLines.length) {
    ty -= 4;
    for (const ln of notesLines) { drawText(ctx, ln, MARGIN + 10, ty, { size: 9 }); ty -= 11; }
  }
  ctx.y -= h + 8;
}

function drawSummary(ctx: Ctx, q: PublicQuote) {
  const items = q.items;
  const counts = {
    hoteis: items.filter((i) => i.kind === "hotel").length,
    aereos: items.filter((i) => i.kind === "flight").length,
    servicos: items.filter((i) => i.kind === "other").length,
    pax: q.travelers.adults + q.travelers.children,
  };
  ensure(ctx, 60);
  const H = 54;
  rect(ctx, MARGIN, ctx.y - H, CW, H, C_WHITE, { border: C_BORDER });
  const cellW = CW / 4;
  const cells = [
    ["Passageiros", String(counts.pax)],
    ["Hoteis", String(counts.hoteis)],
    ["Aereos", String(counts.aereos)],
    ["Servicos", String(counts.servicos)],
  ];
  cells.forEach(([lbl, val], i) => {
    const cx = MARGIN + i * cellW + 12;
    drawText(ctx, lbl.toUpperCase(), cx, ctx.y - 18, { size: 8, bold: true, color: C_MUTED });
    drawText(ctx, val, cx, ctx.y - 38, { size: 18, bold: true, color: C_NAVY });
  });
  ctx.y -= H + 8;
}

function drawTotal(ctx: Ctx, q: PublicQuote) {
  ensure(ctx, 70);
  const H = 60;
  rect(ctx, MARGIN, ctx.y - H, CW, H, C_NAVY);
  drawText(ctx, "TOTAL DO ORCAMENTO", MARGIN + 16, ctx.y - 22, { size: 10, bold: true, color: C_NAVY_SOFT });
  const total = formatBRL(q.totalPrice);
  drawText(ctx, total, MARGIN + 16, ctx.y - 46, { size: 22, bold: true, color: C_WHITE });
  const note = "Sujeito a alteracoes conforme disponibilidade.";
  const nw = textWidth(ctx, note, 8);
  drawText(ctx, note, MARGIN + CW - nw - 16, ctx.y - 48, { size: 8, color: C_NAVY_SOFT });
  ctx.y -= H + 8;
}

function computeInstallments(total: number, cfg: QuoteConfig) {
  const rows: { label: string; each: number; total: number; hi?: boolean }[] = [];
  if (cfg.pix.enabled) {
    const disc = total * (cfg.pix.discount_pct / 100);
    rows.push({ label: `Pix - ${cfg.pix.discount_pct}% de desconto`, each: total - disc, total: total - disc, hi: true });
  }
  if (cfg.card.enabled) {
    for (let n = 1; n <= cfg.card.max_installments; n++) {
      const withInt = cfg.card.interest_from != null && n >= cfg.card.interest_from;
      rows.push({
        label: n === 1 ? "Cartao a vista" : `${n}x ${withInt ? "com juros" : "sem juros"}`,
        each: total / n, total,
      });
    }
  }
  if (cfg.boleto.enabled) {
    for (let n = 1; n <= cfg.boleto.max_installments; n++) {
      rows.push({ label: n === 1 ? "Boleto a vista" : `Boleto em ${n}x`, each: total / n, total });
    }
  }
  return rows;
}

function drawPayments(ctx: Ctx, q: PublicQuote) {
  const rows = computeInstallments(q.totalPrice, q.config);
  if (!rows.length) return;
  sectionTitle(ctx, "Simulacao de pagamento");
  const rowH = 20;
  const headH = 22;
  const totalH = headH + rows.length * rowH;
  ensure(ctx, totalH + 10);
  const cols = { label: MARGIN + 12, each: MARGIN + CW - 200, total: MARGIN + CW - 12 };
  rect(ctx, MARGIN, ctx.y - headH, CW, headH, C_NAVY_SOFT, { border: C_BORDER });
  drawText(ctx, "MODALIDADE", cols.label, ctx.y - 14, { size: 8, bold: true, color: C_NAVY });
  drawText(ctx, "PARCELA", cols.each, ctx.y - 14, { size: 8, bold: true, color: C_NAVY });
  const tW = textWidth(ctx, "TOTAL", 8, true);
  drawText(ctx, "TOTAL", cols.total - tW, ctx.y - 14, { size: 8, bold: true, color: C_NAVY });
  let ry = ctx.y - headH;
  rows.forEach((r, i) => {
    if (ry - rowH < MARGIN + 40) { newPage(ctx); ry = ctx.y; }
    const bg = r.hi ? C_EMERALD_SOFT : (i % 2 === 0 ? C_ALT : C_WHITE);
    rect(ctx, MARGIN, ry - rowH, CW, rowH, bg, { border: C_BORDER });
    drawText(ctx, r.label, cols.label, ry - 13, { size: 9, bold: !!r.hi, color: r.hi ? C_EMERALD : C_TEXT });
    drawText(ctx, formatBRL(r.each), cols.each, ry - 13, { size: 9 });
    const tv = formatBRL(r.total);
    const tvW = textWidth(ctx, tv, 9);
    drawText(ctx, tv, cols.total - tvW, ry - 13, { size: 9, bold: true });
    ry -= rowH;
  });
  ctx.y = ry - 10;
}

function drawCards(ctx: Ctx) {
  ensure(ctx, 34);
  const brands = ["Visa", "Mastercard", "Amex", "Elo", "Hipercard", "Diners"];
  drawText(ctx, "Cartoes aceitos:", MARGIN, ctx.y - 12, { size: 9, bold: true, color: C_MUTED });
  let x = MARGIN + textWidth(ctx, "Cartoes aceitos:", 9, true) + 10;
  for (const b of brands) {
    const w = textWidth(ctx, b, 9, true) + 12;
    rect(ctx, x, ctx.y - 16, w, 16, C_WHITE, { border: C_BORDER });
    drawText(ctx, b, x + 6, ctx.y - 12, { size: 9, bold: true, color: C_NAVY });
    x += w + 6;
  }
  ctx.y -= 24;
}

function drawFooter(ctx: Ctx, q: PublicQuote) {
  ensure(ctx, 50);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 4 }, end: { x: MARGIN + CW, y: ctx.y - 4 },
    thickness: 0.6, color: C_BORDER,
  });
  drawText(ctx, q.agency.name, MARGIN, ctx.y - 18, { size: 10, bold: true, color: C_NAVY });
  drawText(ctx, `${q.agency.email}  |  ${q.agency.phone}`, MARGIN, ctx.y - 32, { size: 9, color: C_MUTED });
  const foot = "*Reservas ainda nao efetivadas - sujeitas a disponibilidade.";
  drawText(ctx, foot, MARGIN, ctx.y - 46, { size: 8, color: C_MUTED });
  ctx.y -= 52;
}

// ---------- Entry ----------

export async function buildQuotePdf(q: PublicQuote): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.w, A4.h]);
  const ctx: Ctx = { pdf, page, y: A4.h - MARGIN, font, bold };

  let logo: PDFImage | null = null;
  try {
    const res = await fetch(viaAirLogoAsset.url);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      logo = await pdf.embedPng(bytes);
    }
  } catch { /* ignora */ }

  await drawHeader(ctx, q, logo);
  drawGreeting(ctx, q);

  // Ordem: Hospedagem, Voos (ida->volta), Servicos
  const hotels = q.items.filter((i) => i.kind === "hotel");
  const outbound = q.items.filter((i) => i.kind === "flight" && i.direction !== "return");
  const returns = q.items.filter((i) => i.kind === "flight" && i.direction === "return");
  const services = q.items.filter((i) => i.kind !== "hotel" && i.kind !== "flight");

  if (hotels.length) {
    sectionTitle(ctx, "Hospedagem");
    hotels.forEach((h) => drawHotelCard(ctx, h));
  }
  if (outbound.length || returns.length) {
    sectionTitle(ctx, "Voos");
    outbound.forEach((f) => drawFlightCard(ctx, f));
    returns.forEach((f) => drawFlightCard(ctx, f));
  }
  if (services.length) {
    sectionTitle(ctx, "Servicos");
    services.forEach((s) => drawServiceCard(ctx, s));
  }

  sectionTitle(ctx, "Resumo");
  drawSummary(ctx, q);
  drawTotal(ctx, q);

  drawPayments(ctx, q);
  drawCards(ctx);

  if (q.config.notes) {
    sectionTitle(ctx, "Observacoes");
    const lines = wrap(ctx, q.config.notes, CW, 9);
    for (const ln of lines) {
      ensure(ctx, 12);
      drawText(ctx, ln, MARGIN, ctx.y - 10, { size: 9, color: C_TEXT });
      ctx.y -= 12;
    }
    ctx.y -= 6;
  }

  drawFooter(ctx, q);

  return await pdf.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
