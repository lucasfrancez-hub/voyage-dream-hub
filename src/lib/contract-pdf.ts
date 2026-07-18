// Gera Recibo + Contrato (PDF) espelhando o modelo VIA AIR.
// Roda no navegador via pdf-lib.
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import type {
  OrderDetail,
  OrderHeader,
  OrderItem,
  OrderItemFinancial,
  OrderPayment,
  OrderPassenger,
} from "./orders.functions";

// ---------- Constantes de layout ----------
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 40;
const CONTENT_W = A4.w - MARGIN * 2;
const COLOR_TEXT = rgb(0.08, 0.08, 0.08);
const COLOR_MUTED = rgb(0.35, 0.35, 0.35);
const COLOR_BORDER = rgb(0.75, 0.75, 0.75);
const COLOR_HEADER_BG = rgb(0.94, 0.94, 0.94);
const COLOR_BRAND = rgb(0.9, 0.35, 0.05);

// Dados fixos da empresa
const COMPANY = {
  name: "VIA AIR AGENCIA E REPRESENTACOES LTDA",
  cnpj: "56.339.877/0001-66",
  address: "Rua Takeshi Mitsuyasu, 355 - Jardim Panorama",
  cityLine: "Paranavaí - PR - CEP: 87707-120",
  phone: "(44) 99951-4838",
  email: "comercial@voeair.com",
  city: "Paranavaí",
};

// ---------- Helpers ----------
const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const toCents = (n: number) => Math.round((Number(n) || 0) * 100);
const fromCents = (n: number) => n / 100;

// Divide em centavos e entrega o eventual resto às primeiras linhas. Assim,
// a soma exibida por passageiro é sempre idêntica ao total da coluna.
const splitCents = (total: number, count: number): number[] => {
  const safeCount = Math.max(1, count);
  const cents = toCents(total);
  const base = Math.trunc(cents / safeCount);
  const remainder = cents - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) =>
    fromCents(base + (index < remainder ? 1 : 0)),
  );
};

// Sanitiza para WinAnsi (Helvetica) — remove chars fora do intervalo.
const sanitize = (s: string | null | undefined): string => {
  if (!s) return "";
  return s
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2192\u27A1\u2794]/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2194/g, "<->")
    .replace(/[^\x00-\xFF]/g, "?");
};

// Formata data/hora aceitando ISO ('YYYY-MM-DDTHH:mm') ou 'YYYY-MM-DD HH:mm'.
// Extrai a hora diretamente da string para evitar deslocamento de timezone.
const fmtDateTime = (s: string | null | undefined): string => {
  if (!s) return "";
  const str = String(s).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  const md = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (md) return `${md[3]}/${md[2]}/${md[1]}`;
  return fmtDate(str, true);
};

const fmtTime = (s: string | null | undefined): string => {
  if (!s) return "";
  const m = String(s).match(/[T\s](\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};

const fmtDate = (iso: string | null | undefined, withTime = false): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  if (!withTime) return `${dd}/${mm}/${yy}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} - ${hh}:${mi}`;
};

const fmtDateShort = (s: string | null | undefined): string => {
  if (!s) return "";
  // 'YYYY-MM-DD' → 'DD/MM/YYYY'
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return fmtDate(s);
};

const paymentMethodLabel = (m: string): string => {
  const map: Record<string, string> = {
    pix: "Pix",
    boleto: "Boleto",
    credit_card: "Cartão de Crédito",
    debit_card: "Cartão de Débito",
    financing: "Financiamento",
    transfer: "Transferência",
    cash: "Dinheiro",
    other: "Outro",
  };
  return map[m] ?? m;
};

// Valor por extenso (BRL). Simples e suficiente para recibo.
function numberToWords(n: number): string {
  const inteiro = Math.floor(Math.abs(n));
  const centavos = Math.round((Math.abs(n) - inteiro) * 100);

  const parte = (num: number): string => {
    if (num === 0) return "";
    if (num === 100) return "cem";
    const unid = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
    const dez10 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    const dez = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const cent = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
    const c = Math.floor(num / 100);
    const d = Math.floor((num % 100) / 10);
    const u = num % 10;
    const parts: string[] = [];
    if (c) parts.push(cent[c]);
    if (d === 1) {
      parts.push(dez10[u]);
    } else {
      if (d) parts.push(dez[d]);
      if (u) parts.push(unid[u]);
    }
    return parts.join(" e ");
  };

  const grupos = (num: number): string => {
    if (num === 0) return "zero";
    const milhoes = Math.floor(num / 1_000_000);
    const milhares = Math.floor((num % 1_000_000) / 1000);
    const resto = num % 1000;
    const out: string[] = [];
    if (milhoes) out.push(parte(milhoes) + (milhoes === 1 ? " milhão" : " milhões"));
    if (milhares) out.push((milhares === 1 ? "mil" : parte(milhares) + " mil"));
    if (resto) out.push(parte(resto));
    return out.join(" e ").trim();
  };

  const reais = grupos(inteiro);
  const cent = centavos > 0 ? ` e ${parte(centavos)} centavo${centavos > 1 ? "s" : ""}` : "";
  const reaisLabel = inteiro === 1 ? "real" : "reais";
  return `${reais} ${reaisLabel}${cent}`.toUpperCase();
}

// ---------- Motor de desenho ----------
type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  order: OrderHeader;
  // Cabeçalho usado ao criar páginas de continuação da seção atual.
  // Recibo usa um cabeçalho enxuto; Contrato usa drawContractHeader.
  pageHeader?: (c: Ctx) => void;
  logo?: PDFImage;
};

// Desenha a logo VIA AIR no canto superior direito da página.
const drawLogo = (ctx: Ctx) => {
  if (!ctx.logo) return;
  const maxW = 110;
  const maxH = 40;
  const ratio = ctx.logo.width / ctx.logo.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  ctx.page.drawImage(ctx.logo, {
    x: A4.w - MARGIN - w,
    y: A4.h - MARGIN - h + 4,
    width: w,
    height: h,
  });
};

const newPage = (ctx: Ctx) => {
  ctx.page = ctx.pdf.addPage([A4.w, A4.h]);
  ctx.y = A4.h - MARGIN;
};

const ensureSpace = (ctx: Ctx, needed: number, drawHeader?: (c: Ctx) => void) => {
  if (ctx.y - needed < MARGIN + 40) {
    drawFooter(ctx);
    newPage(ctx);
    const h = drawHeader ?? ctx.pageHeader;
    if (h) h(ctx);
  }
};

// Cabeçalho enxuto para continuação de páginas do RECIBO (sem venda/contratante).
const drawReceiptContinuationHeader = (ctx: Ctx) => {
  const topY = A4.h - MARGIN;
  ctx.page.drawRectangle({ x: 0, y: topY - 4, width: 6, height: 24, color: COLOR_BRAND });
  text(ctx, COMPANY.name, MARGIN, { y: topY - 2, size: 10, bold: true });
  text(ctx, `Recibo - Venda Nº ${ctx.order.orderNumber} (continuação)`, MARGIN, {
    y: topY - 14, size: 8, color: COLOR_MUTED,
  });
  ctx.page.drawLine({
    start: { x: MARGIN, y: topY - 24 }, end: { x: A4.w - MARGIN, y: topY - 24 },
    thickness: 0.5, color: COLOR_BORDER,
  });
  drawLogo(ctx);
  ctx.y = topY - 38;
};

const text = (
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

// Quebra texto em linhas cabendo em maxWidth
const wrap = (font: PDFFont, size: number, s: string, maxWidth: number): string[] => {
  const clean = sanitize(s);
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

const drawParagraph = (ctx: Ctx, s: string, size = 9, lineH = 12, indent = 0) => {
  const lines = wrap(ctx.font, size, s, CONTENT_W - indent);
  for (const line of lines) {
    ensureSpace(ctx, lineH);
    text(ctx, line, MARGIN + indent, { size });
    ctx.y -= lineH;
  }
};

// ---------- Cabeçalho VIA AIR (topo da pág. 1) ----------
const drawCompanyHeader = (ctx: Ctx) => {
  const bandH = 110;
  // Faixa lateral colorida
  ctx.page.drawRectangle({ x: 0, y: A4.h - bandH, width: 6, height: bandH, color: COLOR_BRAND });
  const topY = A4.h - MARGIN;
  const lh = 13;
  text(ctx, COMPANY.name, MARGIN, { y: topY - 4, size: 12, bold: true });
  text(ctx, `CNPJ: ${COMPANY.cnpj}`, MARGIN, { y: topY - 4 - lh * 1.4, size: 8, color: COLOR_MUTED });
  text(ctx, COMPANY.address, MARGIN, { y: topY - 4 - lh * 2.4, size: 8, color: COLOR_MUTED });
  text(ctx, COMPANY.cityLine, MARGIN, { y: topY - 4 - lh * 3.4, size: 8, color: COLOR_MUTED });
  text(ctx, `Telefone: ${COMPANY.phone}`, MARGIN, { y: topY - 4 - lh * 4.4, size: 8, color: COLOR_MUTED });
  text(ctx, `E-mail: ${COMPANY.email}`, MARGIN, { y: topY - 4 - lh * 5.4, size: 8, color: COLOR_MUTED });
  // separador leve
  ctx.page.drawLine({
    start: { x: MARGIN, y: A4.h - bandH - 8 },
    end: { x: A4.w - MARGIN, y: A4.h - bandH - 8 },
    thickness: 0.5, color: COLOR_BORDER,
  });
  drawLogo(ctx);
  ctx.y = A4.h - bandH - 24;
};


// ---------- Cabeçalho das páginas do CONTRATO ----------
const drawContractHeader = (ctx: Ctx) => {
  const topY = A4.h - MARGIN;
  text(ctx, `VENDA Nº: ${ctx.order.orderNumber}`, MARGIN, { y: topY, size: 10, bold: true });
  text(ctx, `CONTRATADA: ${COMPANY.name}`, MARGIN, { y: topY - 14, size: 9 });
  text(ctx, `CNPJ: ${COMPANY.cnpj}`, MARGIN, { y: topY - 26, size: 9 });
  const cName = ctx.order.payerFullName || ctx.order.fullName;
  const cCpf = ctx.order.payerCpf || ctx.order.cpf || "";
  text(ctx, `CONTRATANTE: ${cName}`, MARGIN, { y: topY - 44, size: 10, bold: true });
  text(ctx, `CPF/CNPJ: ${cCpf}`, MARGIN, { y: topY - 58, size: 9 });
  ctx.page.drawLine({
    start: { x: MARGIN, y: topY - 68 },
    end: { x: A4.w - MARGIN, y: topY - 68 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });
  drawLogo(ctx);
  ctx.y = topY - 82;
};

// ---------- Rodapé ----------
const drawFooter = (ctx: Ctx) => {
  const dt = fmtDate(new Date().toISOString(), true);
  text(ctx, `${COMPANY.city}, ${dt}`, MARGIN, { y: MARGIN - 5, size: 7, color: COLOR_MUTED });
  text(
    ctx,
    `Este documento faz parte da Venda nº ${ctx.order.orderNumber}.`,
    MARGIN,
    { y: MARGIN - 18, size: 7, color: COLOR_MUTED },
  );
};

// ---------- Tabela simples ----------
type Col = { header: string; width: number; align?: "left" | "right" | "center" };

const drawTableHeader = (ctx: Ctx, cols: Col[]) => {
  const h = 18;
  const bottom = ctx.y - h + 4;
  ctx.page.drawRectangle({
    x: MARGIN, y: bottom, width: CONTENT_W, height: h,
    color: COLOR_HEADER_BG,
    borderColor: COLOR_BORDER,
    borderWidth: 0.6,
  });
  let x = MARGIN;
  for (const c of cols) {
    const labelWidth = ctx.fontBold.widthOfTextAtSize(sanitize(c.header), 8.5);
    const tx = c.align === "right"
      ? x + c.width - 6 - labelWidth
      : c.align === "center"
        ? x + (c.width - labelWidth) / 2
        : x + 6;
    text(ctx, c.header, tx, { size: 8.5, bold: true, y: ctx.y - 7 });
    x += c.width;
    if (x < MARGIN + CONTENT_W - 0.1) {
      ctx.page.drawLine({
        start: { x, y: bottom }, end: { x, y: bottom + h },
        thickness: 0.4, color: COLOR_BORDER,
      });
    }
  }
  ctx.y = bottom;
};

const drawTableRow = (ctx: Ctx, cols: Col[], cells: string[]) => {
  const size = 8.5;
  const lineH = 12;
  // altura conforme a célula mais alta
  let maxLines = 1;
  const wrapped: string[][] = cols.map((c, i) => {
    const raw = (cells[i] ?? "").split("\n");
    const out: string[] = [];
    for (const seg of raw) out.push(...wrap(ctx.font, size, seg, c.width - 12));
    if (out.length > maxLines) maxLines = out.length;
    return out;
  });
  const rowH = maxLines * lineH + 8;
  ensureSpace(ctx, rowH + 4);
  const top = ctx.y;
  const bottom = top - rowH;
  ctx.page.drawRectangle({
    x: MARGIN, y: bottom, width: CONTENT_W, height: rowH,
    borderColor: COLOR_BORDER, borderWidth: 0.5,
  });
  let x = MARGIN;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const lines = wrapped[i];
    for (let li = 0; li < lines.length; li++) {
      const s = lines[li];
      let tx = x + 6;
      if (c.align === "right") {
        tx = x + c.width - 6 - ctx.font.widthOfTextAtSize(s, size);
      } else if (c.align === "center") {
        tx = x + (c.width - ctx.font.widthOfTextAtSize(s, size)) / 2;
      }
      // O y do pdf-lib é a linha de base do texto. O recuo de 12 pt mantém
      // letras e acentos inteiramente dentro da célula, sem tocar a borda.
      text(ctx, s, tx, { size, y: ctx.y - 12 - li * lineH });
    }
    x += c.width;
    if (i < cols.length - 1) {
      ctx.page.drawLine({
        start: { x, y: bottom }, end: { x, y: top },
        thickness: 0.35, color: COLOR_BORDER,
      });
    }
  }
  ctx.y = bottom;
};


const sectionTitle = (ctx: Ctx, s: string, reserve = 80) => {
  // Reserva espaço para o título + cabeçalho + pelo menos 1 linha; evita órfãos entre páginas.
  ensureSpace(ctx, reserve);
  ctx.y -= 14;
  text(ctx, s, MARGIN, { size: 11, bold: true });
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y }, end: { x: A4.w - MARGIN, y: ctx.y },
    thickness: 0.6, color: COLOR_TEXT,
  });
  ctx.y -= 14;
};



// ---------- Blocos do RECIBO ----------
const drawReciboBlock = (ctx: Ctx, d: OrderDetail) => {
  const o = d.order;
  const createdDate = fmtDate(o.createdAt);
  // título do recibo com respiro
  ctx.y -= 10;
  text(ctx, `RECIBO - VENDA ${o.orderNumber} - ${createdDate}`, MARGIN, { size: 14, bold: true });
  ctx.y -= 22;

  // Bloco pagante (sempre exibido com todos os campos)
  const payer = {
    name: o.payerFullName || o.fullName,
    address: o.payerAddress ?? "",
    number: o.payerNumber ?? "",
    district: o.payerDistrict ?? "",
    city: o.payerCity ?? "",
    state: o.payerState ?? "",
    zip: o.payerZip ?? "",
    cpf: o.payerCpf || o.cpf || "",
    email: o.payerEmail || o.email || "",
    phone: o.payerPhone || o.phone || "",
  };

  // caixa com fundo suave para destaque
  const boxTop = ctx.y + 4;
  const lineH = 13;
  const rows = 5;
  const boxH = rows * lineH + 12;
  ctx.page.drawRectangle({
    x: MARGIN - 4, y: boxTop - boxH, width: CONTENT_W + 8, height: boxH,
    color: rgb(0.97, 0.97, 0.98),
  });
  ctx.page.drawRectangle({
    x: MARGIN - 4, y: boxTop - boxH, width: 3, height: boxH, color: COLOR_BRAND,
  });

  const labelVal = (label: string, val: string, x: number, y: number) => {
    text(ctx, label, x, { size: 9, bold: true, y, color: COLOR_MUTED });
    const lw = ctx.fontBold.widthOfTextAtSize(sanitize(label), 9);
    text(ctx, " " + (val || "—"), x + lw, { size: 9.5, y });
  };

  ctx.y -= 4;
  // Linha 1: nome
  labelVal("Pagante:", payer.name, MARGIN, ctx.y); ctx.y -= lineH;
  // Linha 2: CPF + telefone + e-mail
  const halfW = CONTENT_W / 2;
  labelVal("CPF/CNPJ:", payer.cpf, MARGIN, ctx.y);
  labelVal("Telefone:", payer.phone, MARGIN + halfW, ctx.y);
  ctx.y -= lineH;
  labelVal("E-mail:", payer.email, MARGIN, ctx.y);
  ctx.y -= lineH;
  // Linha 3: endereço, número
  const addrLine = [payer.address, payer.number && `Nº ${payer.number}`].filter(Boolean).join(", ") || "—";
  labelVal("Endereço:", addrLine, MARGIN, ctx.y); ctx.y -= lineH;
  // Linha 4: bairro, cidade, UF, CEP
  const locLine = [
    payer.district && `Bairro: ${payer.district}`,
    payer.city && `Cidade: ${payer.city}`,
    payer.state && `UF: ${payer.state}`,
    payer.zip && `CEP: ${payer.zip}`,
  ].filter(Boolean).join("   ·   ") || "—";
  labelVal("Local:", locLine, MARGIN, ctx.y); ctx.y -= lineH;
  ctx.y -= 12;

  // Usa a mesma fonte consolidada das tabelas abaixo. Assim, o valor por
  // passageiro, o resumo financeiro e o texto legal nunca divergem entre si.
  const total = receiptAmounts(d).total;
  const legal =
    `A ${COMPANY.name}, declara que os serviços turísticos relacionados neste documento, ` +
    `adquiridos e quitados conforme formas de pagamento abaixo, pelo Sr.(a) ${payer.name} ` +
    `totalizam a importância de ${brl(total)} (${numberToWords(total)}) que, considerada a ` +
    `posse transitória de tais valores e retenção de valor pelos serviços de intermediação, ` +
    `serão devidamente repassados por esta agência de viagens a cada um dos fornecedores contratados.`;
  drawParagraph(ctx, legal, 9.5, 13);
  ctx.y -= 8;
};




type FlightRow = {
  airlineCode: string;
  airlineName: string;
  flightNum: string;
  fromIata: string;
  fromCity: string;
  toIata: string;
  toCity: string;
  depart: string | null;
  arrive: string | null;
};

const collectFlightRows = (item: OrderItem): FlightRow[] => {
  const det = (item.details ?? {}) as Record<string, unknown>;
  const airlineName = (det.airline as string) ?? "";
  const airlineCode =
    (det.airline_code as string) ??
    airlineName.slice(0, 2).toUpperCase();

  const rawSegs = Array.isArray(det.segments) ? (det.segments as Array<Record<string, unknown>>) : [];
  if (rawSegs.length > 0) {
    return rawSegs.map((s) => ({
      airlineName: (s.airline as string) ?? airlineName,
      airlineCode:
        (s.airline_code as string) ??
        ((s.airline as string) ?? airlineName).slice(0, 2).toUpperCase(),
      flightNum: (s.flight_number as string) ?? "",
      fromIata: (s.from_iata as string) ?? "",
      fromCity: (s.from_city as string) ?? "",
      toIata: (s.to_iata as string) ?? "",
      toCity: (s.to_city as string) ?? "",
      depart: (s.depart_at as string) ?? (s.departure_at as string) ?? null,
      arrive: (s.arrive_at as string) ?? (s.arrival_at as string) ?? null,
    }));
  }
  return [{
    airlineName,
    airlineCode,
    flightNum: (det.flight_number as string) ?? "",
    fromIata: (det.from_iata as string) ?? "",
    fromCity: (det.from_city as string) ?? "",
    toIata: (det.to_iata as string) ?? "",
    toCity: (det.to_city as string) ?? "",
    depart: (det.depart_at as string) ?? (det.departure_at as string) ?? null,
    arrive: (det.arrive_at as string) ?? (det.arrival_at as string) ?? null,
  }];
};

type ReceiptAmounts = {
  fare: number;
  taxes: number;
  discount: number;
  total: number;
};

const receiptAmounts = (d: OrderDetail): ReceiptAmounts => {
  const extrasNoFin = sumExtrasFromItems(d);
  const finByItem = new Map(d.financials.map((f) => [f.order_item_id, f]));
  // Para cada item usamos o MAIOR entre o financeiro salvo e o valor gravado
  // em details (pela extensão / edição manual). Isso resolve o caso em que a
  // linha de order_item_financials existe mas está zerada — antes o fallback
  // era ignorado e o "Resumo Financeiro" saía R$ 0,00.
  let itemsTotal = 0, itemsTaxes = 0, itemsDiscount = 0;
  for (const it of d.items) {
    if (it.status === "cancelled") continue;
    const det = (it.details ?? {}) as Record<string, unknown>;
    const detTotal = Number(det.value ?? 0) || 0;
    const detTax = Number(det.tax_value ?? 0) || 0;
    const fin = finByItem.get(it.id);
    const finTotal = Number(fin?.total ?? 0) || 0;
    const finTax = Number(fin?.tax_value ?? 0) || 0;
    const finDisc = Number(fin?.discount_value ?? 0) || 0;
    itemsTotal += Math.max(finTotal, detTotal);
    itemsTaxes += Math.max(finTax, detTax);
    itemsDiscount += finDisc;
  }
  const financialTotal = itemsTotal + extrasNoFin;
  const orderTotal = Number(d.order.totalPrice ?? 0);
  const total = fromCents(toCents(Math.max(Number.isFinite(orderTotal) ? orderTotal : 0, financialTotal)));
  const snapshot = (d.order.packageSnapshot ?? {}) as Record<string, unknown>;
  const snapshotTaxes = Number(snapshot.taxes ?? 0) || 0;
  const taxes = fromCents(toCents(itemsTaxes || snapshotTaxes));
  const discount = fromCents(toCents(itemsDiscount));

  // O total é a fonte final do recibo. A tarifa é reconciliada a partir
  // dele para que Tarifa + Taxas - Desconto seja sempre exatamente o Total.
  const fare = fromCents(toCents(total - taxes + discount));
  return { fare, taxes, discount, total };
};


const drawPassengerTable = (
  ctx: Ctx,
  title: string,
  passengers: OrderDetail["passengers"],
  amounts: { fare: number; taxes: number; discount: number },
) => {
  if (passengers.length === 0) return;
  sectionTitle(ctx, title, 72);
  const showDiscount = amounts.discount > 0.005;
  const cols: Col[] = showDiscount
    ? [
        { header: "Passageiro", width: 175 },
        { header: "Nº Bilhete", width: 85 },
        { header: "Tarifa", width: 68, align: "right" },
        { header: "Taxas", width: 62, align: "right" },
        { header: "Desconto", width: 65, align: "right" },
        { header: "Total", width: CONTENT_W - 455, align: "right" },
      ]
    : [
        { header: "Passageiro", width: 200 },
        { header: "Nº Bilhete", width: 95 },
        { header: "Tarifa", width: 75, align: "right" },
        { header: "Taxas", width: 68, align: "right" },
        { header: "Total", width: CONTENT_W - 438, align: "right" },
      ];

  drawTableHeader(ctx, cols);
  const fares = splitCents(amounts.fare, passengers.length);
  const taxes = splitCents(amounts.taxes, passengers.length);
  const discounts = splitCents(amounts.discount, passengers.length);
  const totals = fares.map((fare, i) => fromCents(toCents(fare + taxes[i] - discounts[i])));

  passengers.forEach((p, i) => {
    const row = showDiscount
      ? [p.full_name, p.ticket_number ?? "—", brl(fares[i]), brl(taxes[i]), brl(discounts[i]), brl(totals[i])]
      : [p.full_name, p.ticket_number ?? "—", brl(fares[i]), brl(taxes[i]), brl(totals[i])];
    drawTableRow(ctx, cols, row);
  });
  ctx.y -= 4;
};

const drawPassengers = (ctx: Ctx, d: OrderDetail) => {
  if (d.passengers.length === 0) return;

  // Agrupa aéreos por localizador (uma "reserva" pode ter ida + volta).
  // Cada reserva ganha sua própria tabela com os passageiros ligados a
  // qualquer item dessa reserva, e valores tirados dos financials daqueles
  // itens divididos pela quantidade de passageiros daquela reserva.
  const flights = d.items.filter((i) => i.kind === "flight" && i.status !== "cancelled");
  const finByItem = new Map(d.financials.map((f) => [f.order_item_id, f]));
  const paxById = new Map(d.passengers.map((p) => [p.id, p]));

  type Group = {
    label: string;
    itemIds: string[];
    passengers: OrderDetail["passengers"];
    fare: number;
    taxes: number;
    discount: number;
  };
  const groups: Group[] = [];
  const seenKeys = new Set<string>();

  // Ordena os aéreos por sort_order para reservas com múltiplos trechos
  // aparecerem na mesma ordem do pedido.
  const sortedFlights = [...flights].sort((a, b) => a.sort_order - b.sort_order);

  const keyOf = (f: (typeof sortedFlights)[number]) => {
    const det = (f.details ?? {}) as Record<string, unknown>;
    const importGroupId = String(det.import_group_id ?? "").trim();
    const carrierLocator = String(det.carrier_locator ?? "").trim();
    return importGroupId || carrierLocator || (f.supplier_locator ?? "").trim() || `__item_${f.id}`;
  };

  for (const f of sortedFlights) {
    const key = keyOf(f);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const groupItems = sortedFlights.filter((x) => keyOf(x) === key);
    const itemIds = groupItems.map((x) => x.id);

    // Passageiros da reserva: união dos vinculados a qualquer item do grupo.
    const paxIdSet = new Set<string>();
    for (const id of itemIds) {
      for (const pid of d.itemPassengers[id] ?? []) paxIdSet.add(pid);
    }
    const passengers = [...paxIdSet]
      .map((pid) => paxById.get(pid))
      .filter((p): p is OrderDetail["passengers"][number] => Boolean(p))
      .sort((a, b) => a.sort_order - b.sort_order);
    if (passengers.length === 0) continue;

    // Financeiro somado dos itens do grupo. O total informado na importação
    // é gravado num único item da reserva; aqui somamos para cobrir edições
    // manuais que distribuíram valores entre trechos. Se não há linha em
    // order_item_financials (import antigo ou falha ao gravar), caímos pra
    // details.value / details.tax_value gravados pela extensão.
    let fare = 0, taxes = 0, discount = 0, total = 0;
    for (const it of groupItems) {
      const fin = finByItem.get(it.id);
      const det = (it.details ?? {}) as Record<string, unknown>;
      const detTotal = Number(det.value ?? 0) || 0;
      const detTax = Number(det.tax_value ?? 0) || 0;
      const finTotal = Number(fin?.total ?? 0) || 0;
      const finTax = Number(fin?.tax_value ?? 0) || 0;
      const finDisc = Number(fin?.discount_value ?? 0) || 0;
      total += Math.max(finTotal, detTotal);
      taxes += Math.max(finTax, detTax);
      discount += finDisc;
    }

    // Reconciliação: tarifa = total - taxas + desconto (garante que a soma feche).
    fare = fromCents(toCents(total - taxes + discount));
    taxes = fromCents(toCents(taxes));
    discount = fromCents(toCents(discount));

    const first = groupItems[0];
    const det = (first.details ?? {}) as Record<string, unknown>;
    const airline = (det.airline as string) ?? "";
    const carrierLocator = String(det.carrier_locator ?? "").trim();
    const locator = carrierLocator || (first.supplier_locator ?? "").trim();
    const label = locator
      ? `Passageiros — ${airline ? airline + " " : ""}Loc. ${locator}`
      : `Passageiros — ${airline || first.title}`;

    groups.push({ label, itemIds, passengers, fare, taxes, discount });
  }


  // Se conseguimos agrupar por reserva com valores próprios, usa uma tabela
  // por reserva. Senão, cai no comportamento antigo: uma única tabela com o
  // total do pedido rateado entre todos os passageiros.
  const hasPerReservaBreakdown = groups.length > 0
    && groups.every((g) => (g.fare + g.taxes + g.discount) > 0.005);

  if (hasPerReservaBreakdown && groups.length >= 1) {
    for (const g of groups) {
      drawPassengerTable(ctx, g.label, g.passengers, {
        fare: g.fare, taxes: g.taxes, discount: g.discount,
      });
    }
    // Passageiros não vinculados a nenhuma reserva aérea entram numa tabela
    // extra rateando o restante do pedido (comum quando só há hospedagem).
    const usedIds = new Set(groups.flatMap((g) => g.passengers.map((p) => p.id)));
    const others = d.passengers.filter((p) => !usedIds.has(p.id));
    if (others.length > 0) {
      const totalOrder = receiptAmounts(d);
      const usedFare = groups.reduce((s, g) => s + g.fare, 0);
      const usedTax = groups.reduce((s, g) => s + g.taxes, 0);
      const usedDisc = groups.reduce((s, g) => s + g.discount, 0);
      const rest = {
        fare: Math.max(0, fromCents(toCents(totalOrder.fare - usedFare))),
        taxes: Math.max(0, fromCents(toCents(totalOrder.taxes - usedTax))),
        discount: Math.max(0, fromCents(toCents(totalOrder.discount - usedDisc))),
      };
      if (rest.fare + rest.taxes + rest.discount > 0.005) {
        drawPassengerTable(ctx, "Passageiros — Demais serviços", others, rest);
      }
    }
    return;
  }

  const amounts = receiptAmounts(d);
  drawPassengerTable(ctx, "Passageiros", d.passengers, {
    fare: amounts.fare, taxes: amounts.taxes, discount: amounts.discount,
  });
};

const drawFlights = (ctx: Ctx, d: OrderDetail) => {
  const flights = d.items.filter((i) => i.kind === "flight" && i.status !== "cancelled");
  if (flights.length === 0) return;

  sectionTitle(ctx, "Passagem Aérea");

  // Chave de agrupamento por reserva — mesma lógica de drawPassengers:
  // import_group_id → carrier_locator → supplier_locator → fallback por item.
  const keyOf = (f: OrderItem) => {
    const det = (f.details ?? {}) as Record<string, unknown>;
    const importGroupId = String(det.import_group_id ?? "").trim();
    const carrierLocator = String(det.carrier_locator ?? "").trim();
    return importGroupId || carrierLocator || (f.supplier_locator ?? "").trim() || `__item_${f.id}`;
  };

  const sortedFlights = [...flights].sort((a, b) => a.sort_order - b.sort_order);
  const seenKeys = new Set<string>();

  for (const f of sortedFlights) {
    const key = keyOf(f);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const groupItems = sortedFlights.filter((x) => keyOf(x) === key);
    const first = groupItems[0];
    const det = (first.details ?? {}) as Record<string, unknown>;
    const airline = (det.airline as string) ?? "";
    const carrierLocator = String(det.carrier_locator ?? "").trim();
    const locator = carrierLocator || (first.supplier_locator ?? "").trim();

    // Cabeçalho da reserva: Cia Aérea + Localizador
    const cols1: Col[] = [
      { header: "Cia Aérea", width: 200 },
      { header: "Localizador", width: CONTENT_W - 200 },
    ];
    drawTableHeader(ctx, cols1);
    drawTableRow(ctx, cols1, [airline, locator || "—"]);
    ctx.y -= 4;

    // Segmentos da reserva
    const cols2: Col[] = [
      { header: "Cia", width: 38, align: "center" },
      { header: "Voo", width: 54, align: "center" },
      { header: "Trecho", width: 315 },
      { header: "Saída / Chegada", width: CONTENT_W - 38 - 54 - 315, align: "center" },
    ];
    drawTableHeader(ctx, cols2);
    for (const it of groupItems) {
      const rows = collectFlightRows(it);
      for (const r of rows) {
        const from = [r.fromIata, r.fromCity].filter(Boolean).join(" ");
        const to = [r.toIata, r.toCity].filter(Boolean).join(" ");
        drawTableRow(ctx, cols2, [
          r.airlineCode,
          r.flightNum,
          `${from || "—"}\n${to || "—"}`,
          `${fmtDateTime(r.depart) || "—"}\n${fmtDateTime(r.arrive) || "—"}`,
        ]);
      }
    }
    ctx.y -= 8;
  }
};



const drawHotels = (ctx: Ctx, d: OrderDetail) => {
  const hotels = d.items.filter((i) => i.kind === "hotel" && i.status !== "cancelled");
  if (hotels.length === 0) return;
  sectionTitle(ctx, "Hospedagem");
  const cols: Col[] = [
    { header: "Hotel", width: 240 },
    { header: "Check-in", width: 80 },
    { header: "Check-out", width: 80 },
    { header: "Noites", width: 50, align: "center" },
    { header: "Regime", width: CONTENT_W - 240 - 80 - 80 - 50 },
  ];
  drawTableHeader(ctx, cols);
  for (const h of hotels) {
    const det = (h.details ?? {}) as Record<string, unknown>;
    drawTableRow(ctx, cols, [
      (det.hotel_name as string) ?? h.title,
      fmtDateShort((det.check_in as string) ?? null),
      fmtDateShort((det.check_out as string) ?? null),
      String((det.nights as number | string) ?? ""),
      (det.meal_plan as string) ?? "",
    ]);
  }
  ctx.y -= 6;
};

const drawOthers = (ctx: Ctx, d: OrderDetail) => {
  const others = d.items.filter((i) => i.kind === "other" && i.status !== "cancelled");
  if (others.length === 0) return;
  sectionTitle(ctx, "Outros Serviços");
  const finById = new Map(d.financials.map((f) => [f.order_item_id, f]));
  const cols: Col[] = [
    { header: "Serviço", width: 260 },
    { header: "Fornecedor", width: 160 },
    { header: "Valor", width: CONTENT_W - 260 - 160, align: "right" },
  ];
  drawTableHeader(ctx, cols);
  for (const o of others) {
    const f = finById.get(o.id);
    const det = (o.details ?? {}) as Record<string, unknown>;
    // valor: usa o financeiro salvo; senão, o valor bruto informado no item
    const rawVal = Number(f?.total ?? 0) || Number(det.value ?? 0) || 0;
    const supplier = f?.supplier_name ?? (det.supplier_name as string) ?? "—";
    drawTableRow(ctx, cols, [o.title, supplier, brl(rawVal)]);
  }
  ctx.y -= 6;
};

const sumExtrasFromItems = (d: OrderDetail): number => {
  const finItemIds = new Set(d.financials.map((f) => f.order_item_id));
  return d.items
    .filter((i) => i.kind === "other" && i.status !== "cancelled" && !finItemIds.has(i.id))
    .reduce((s, i) => {
      const det = (i.details ?? {}) as Record<string, unknown>;
      return s + (Number(det.value ?? 0) || 0);
    }, 0);
};

const drawTotals = (ctx: Ctx, d: OrderDetail) => {
  // Recibo: NÃO exibe comissão. Todos os campos são reconciliados com o total
  // salvo para que a conta visível sempre feche.
  const { fare: produtos, taxes: taxas, discount: desc, total } = receiptAmounts(d);
  const showDisc = desc > 0.005;

  sectionTitle(ctx, "Resumo Financeiro");
  const cols: Col[] = showDisc
    ? [
        { header: "Tarifa", width: CONTENT_W / 4, align: "right" },
        { header: "Taxas", width: CONTENT_W / 4, align: "right" },
        { header: "Desconto", width: CONTENT_W / 4, align: "right" },
        { header: "Total", width: CONTENT_W - (CONTENT_W / 4) * 3, align: "right" },
      ]
    : [
        { header: "Tarifa", width: CONTENT_W / 3, align: "right" },
        { header: "Taxas", width: CONTENT_W / 3, align: "right" },
        { header: "Total", width: CONTENT_W - (CONTENT_W / 3) * 2, align: "right" },
      ];
  drawTableHeader(ctx, cols);
  drawTableRow(ctx, cols, showDisc
    ? [brl(produtos), brl(taxas), brl(desc), brl(total)]
    : [brl(produtos), brl(taxas), brl(total)]);
  ctx.y -= 8;
};




const drawPayments = (ctx: Ctx, d: OrderDetail) => {
  if (d.payments.length === 0) return;
  sectionTitle(ctx, "Pagamentos");
  const cols: Col[] = [
    { header: "Forma", width: 320 },
    { header: "Autorização", width: 110 },
    { header: "Valor Total", width: CONTENT_W - 320 - 110, align: "right" },
  ];
  drawTableHeader(ctx, cols);
  for (const p of d.payments as OrderPayment[]) {
    const parts = [
      paymentMethodLabel(p.method),
      p.card_brand && `${p.card_brand}${p.card_last4 ? ` final ${p.card_last4}` : ""}`,
      p.installments && p.installments > 1 ? `em ${p.installments} parcelas` : (p.installments === 1 ? "em 1 parcela" : ""),
      p.description,
    ].filter(Boolean).join(" ");
    drawTableRow(ctx, cols, [parts, p.authorization_code ?? "—", brl(p.amount)]);
  }
  ctx.y -= 6;
};

// ---------- CONTRATO (condições gerais) ----------
const CONTRACT_CLAUSES: { title: string; body: string[] }[] = [
  {
    title: "1. Responsabilidade do Contratante e Passageiros",
    body: [
      "1.1. No caso de o CONTRATANTE (pagante) e o PASSAGEIRO não serem a mesma pessoa, o pagante compromete-se a informar todos os passageiros sobre as presentes Condições Gerais, sendo solidariamente responsável por qualquer ato praticado por estes.",
      "1.2. O CONTRATANTE declara-se ciente de que é responsável por verificar as condições contratuais, bem como repassar as informações a todos os passageiros envolvidos na viagem.",
    ],
  },
  {
    title: "2. Serviços Contratados",
    body: [
      "2.1. Consideram-se \"serviços inclusos\" apenas aqueles expressamente descritos no contrato/proposta e nos vouchers oficiais emitidos pela Via Air.",
      "2.2. Informações verbais, sugestões de passeios opcionais ou qualquer referência fora do contrato não devem ser consideradas inclusas.",
    ],
  },
  {
    title: "3. Documentação de Viagem",
    body: [
      "3.1. É de inteira responsabilidade dos passageiros portar os documentos exigidos (RG, Passaporte, vistos, vacinas, autorizações para menores etc.), conforme legislação brasileira e normas do país de destino.",
      "3.2. A Via Air não se responsabiliza por negativa de embarque, deportação ou problemas de imigração, não havendo reembolso em tais hipóteses.",
      "3.3. Todos os bilhetes, vouchers e documentos devem ser conferidos imediatamente após recebimento pelo CONTRATANTE/PASSAGEIRO.",
    ],
  },
  {
    title: "4. Seguro Viagem",
    body: [
      "4.1. O CONTRATANTE declara estar ciente da importância de contratar cartão de assistência/seguro viagem, sendo responsável por adquiri-lo caso não esteja incluso no pacote.",
      "4.2. Quando incluso, as coberturas poderão ser ampliadas mediante solicitação prévia e pagamento adicional.",
    ],
  },
  {
    title: "5. Alterações, Cancelamentos, Reembolsos e No-Show",
    body: [
      "5.1. Qualquer alteração, cancelamento, solicitação de crédito ou transferência deverá ser formalizada por escrito, diretamente junto à Via Air, com antecedência mínima de 48 (quarenta e oito) horas úteis da data da viagem.",
      "5.2. Em caso de não comparecimento (no-show), o passageiro fica ciente de que a companhia aérea/hotel/cruzeiro cancelará automaticamente os demais serviços contratados, sem direito a reembolso.",
      "5.3. Os reembolsos seguirão exclusivamente as regras e prazos de cada fornecedor (companhias aéreas, hotéis, cruzeiros etc.).",
      "5.4. Independentemente da política do fornecedor, a Via Air aplicará taxa administrativa de 25% (vinte e cinco por cento) sobre o valor efetivamente reembolsado.",
      "5.5. Reembolsos somente serão processados após o repasse dos valores pelos fornecedores, não cabendo à Via Air antecipação de valores.",
      "5.6. Passagens emitidas em tarifas promocionais, não reembolsáveis ou em voos fretados poderão não ter qualquer valor devolvido, conforme regras da companhia aérea ou operadora.",
    ],
  },
  {
    title: "6. Pagamentos e Chargeback",
    body: [
      "6.1. Pagamentos via cartão de crédito estão sujeitos à aprovação da operadora.",
      "6.2. Em caso de contestação de pagamento (chargeback), mesmo após a utilização dos serviços contratados, o CONTRATANTE permanecerá responsável pelo valor integral, devendo ressarcir imediatamente a Via Air.",
      "6.3. A inadimplência em qualquer modalidade de pagamento autoriza a Via Air a suspender reservas e aplicar multa de 2% e juros de 1% a.m., correção monetária pelo IGP-M, além de honorários advocatícios e custas judiciais, se necessário.",
    ],
  },
  {
    title: "7. Bagagens",
    body: [
      "7.1. A franquia de bagagem segue regras específicas de cada companhia aérea.",
      "7.2. A maioria das tarifas não inclui bagagem despachada, devendo ser adquirida antecipadamente pelo passageiro.",
      "7.3. Recomenda-se que objetos de valor (dinheiro, eletrônicos, documentos, remédios etc.) sejam transportados na bagagem de mão, observadas as restrições da companhia aérea.",
    ],
  },
  {
    title: "8. Condições Gerais de Viagem",
    body: [
      "8.1. Comparecer com antecedência mínima de 2h para voos nacionais e 4h para voos internacionais.",
      "8.2. Hotéis operam com check-in geralmente às 14h e check-out às 11h.",
      "8.3. Pacotes em voos fretados estão sujeitos a alterações de horários, companhias e aeroportos, não havendo reembolso por essas mudanças.",
      "8.4. Viagens rodoviárias dependem de número mínimo de participantes; caso não haja, a viagem poderá ser cancelada com reembolso integral.",
      "8.5. Em viagens a negócios, congressos e compromissos com horário fixo, recomenda-se embarque com no mínimo 2 dias de antecedência.",
      "8.6. Acomodação em apartamentos ou cabines seguirá disponibilidade do fornecedor, podendo ocorrer em camas de solteiro, casal, beliche, sofá-cama etc.",
    ],
  },
  {
    title: "9. Compras e Taxas Extras",
    body: [
      "9.1. Alguns hotéis e resorts podem cobrar taxas adicionais (\"resort fee\", \"fee\" ou similares), não inclusas no valor contratado.",
      "9.2. Em viagens internacionais, é responsabilidade do passageiro portar moeda estrangeira ou meios de pagamento aceitos no destino.",
    ],
  },
  {
    title: "10. Responsabilidades e Ocorrências",
    body: [
      "10.1. A Via Air, fornecedores, hotéis e cias aéreas não se responsabilizam por roubos, furtos, perdas de documentos ou bens pessoais durante a viagem.",
      "10.2. Em caso de ocorrência, o passageiro deverá registrar boletim de ocorrência junto às autoridades locais.",
    ],
  },
  {
    title: "11. Eventos com Descontos",
    body: [
      "11.1. Passageiros que adquirirem ingressos com desconto (estudantes, aposentados, terceira idade etc.) deverão apresentar os documentos comprobatórios na bilheteria.",
      "11.2. Caso não apresentem, será de responsabilidade do CONTRATANTE/PASSAGEIRO pagar a diferença do ingresso diretamente ao organizador do evento.",
    ],
  },
  {
    title: "12. Eleição de Foro",
    body: [
      "12.1. Para dirimir quaisquer dúvidas decorrentes deste contrato, as partes elegem o foro da comarca da sede da Via Air, com renúncia a qualquer outro, por mais privilegiado que seja.",
    ],
  },
];

const drawContract = (ctx: Ctx) => {
  drawFooter(ctx);
  newPage(ctx);
  drawContractHeader(ctx);
  ctx.y -= 8;
  // Título principal do contrato
  const mainTitle = "CONTRATO DE PRESTAÇÃO DE SERVIÇO DE TURISMO";
  const mtW = ctx.fontBold.widthOfTextAtSize(sanitize(mainTitle), 13);
  text(ctx, mainTitle, (A4.w - mtW) / 2, { size: 13, bold: true });
  ctx.y -= 22;
  text(ctx, "CONDIÇÕES GERAIS - VIA AIR AGÊNCIA E REPRESENTACOES LTDA", MARGIN, {
    size: 10, bold: true, color: COLOR_MUTED,
  });
  ctx.y -= 20;

  for (const c of CONTRACT_CLAUSES) {
    ensureSpace(ctx, 20, drawContractHeader);
    text(ctx, c.title, MARGIN, { size: 10, bold: true });
    ctx.y -= 14;
    for (const p of c.body) {
      drawParagraph(ctx, p, 9, 12);
      ctx.y -= 2;
    }
    ctx.y -= 4;
  }
  // Assinatura
  ensureSpace(ctx, 60, drawContractHeader);
  ctx.y -= 30;
  ctx.page.drawLine({
    start: { x: MARGIN + 60, y: ctx.y }, end: { x: A4.w - MARGIN - 60, y: ctx.y },
    thickness: 0.5, color: COLOR_TEXT,
  });
  ctx.y -= 12;
  const name = ctx.order.payerFullName || ctx.order.fullName;
  const w = ctx.fontBold.widthOfTextAtSize(sanitize(name), 9);
  text(ctx, name, (A4.w - w) / 2, { size: 9, bold: true });
  ctx.y -= 12;
  const c2 = "CONTRATANTE";
  const w2 = ctx.font.widthOfTextAtSize(c2, 8);
  text(ctx, c2, (A4.w - w2) / 2, { size: 8, color: COLOR_MUTED });
};

// ---------- Entradas públicas ----------
async function build(detail: OrderDetail, includeContract: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.w, A4.h]);
  let logo: PDFImage | undefined;
  try {
    const res = await fetch(viaAirLogoAsset.url);
    if (res.ok) logo = await pdf.embedPng(await res.arrayBuffer());
  } catch { /* logo é opcional */ }
  const ctx: Ctx = {
    pdf, page, y: A4.h - MARGIN, font, fontBold,
    order: detail.order,
    pageHeader: drawReceiptContinuationHeader,
    logo,
  };

  drawCompanyHeader(ctx);
  drawReciboBlock(ctx, detail);
  // Ordem solicitada: Passageiros → Aéreo → Hospedagem → Outros Serviços.
  drawPassengers(ctx, detail);
  drawFlights(ctx, detail);
  drawHotels(ctx, detail);
  drawOthers(ctx, detail);

  drawTotals(ctx, detail);
  drawPayments(ctx, detail);

  // linha de assinatura do recibo
  ensureSpace(ctx, 50);
  ctx.y -= 30;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y }, end: { x: MARGIN + 220, y: ctx.y },
    thickness: 0.5, color: COLOR_TEXT,
  });
  ctx.page.drawLine({
    start: { x: A4.w - MARGIN - 220, y: ctx.y }, end: { x: A4.w - MARGIN, y: ctx.y },
    thickness: 0.5, color: COLOR_TEXT,
  });
  ctx.y -= 12;
  text(ctx, COMPANY.name, MARGIN, { size: 8, color: COLOR_MUTED });
  const clientName = detail.order.payerFullName || detail.order.fullName;
  const cw = ctx.font.widthOfTextAtSize(sanitize(clientName), 8);
  text(ctx, clientName, A4.w - MARGIN - cw, { size: 8, color: COLOR_MUTED });

  if (includeContract) {
    // A partir daqui, páginas de continuação usam o cabeçalho do CONTRATO.
    ctx.pageHeader = drawContractHeader;
    drawContract(ctx);
  }
  drawFooter(ctx);

  return await pdf.save();
}

export async function generateReceiptAndContract(detail: OrderDetail): Promise<Blob> {
  const bytes = await build(detail, true);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: "application/pdf" });
}

export async function generateReceiptOnly(detail: OrderDetail): Promise<Blob> {
  const bytes = await build(detail, false);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Blob([buf], { type: "application/pdf" });
}

/** Constrói AuthorizationData a partir do OrderDetail. Se `payment` for
 *  informado, gera a autorização específica daquele cartão (valor, bandeira,
 *  últimos 4, validade, parcelas do próprio pagamento). Sem `payment`, usa
 *  o primeiro cartão encontrado (compatibilidade com pedidos antigos). */
function buildAuthorizationFromOrder(detail: OrderDetail, payment?: OrderPayment) {
  const { order, payments } = detail;
  // Se o pagamento aponta reservas específicas (order_item_ids), a autorização
  // lista apenas os passageiros vinculados a essas reservas — não todos do pedido.
  let passengers = detail.passengers;
  const scopedItemIds = payment?.order_item_ids ?? null;
  if (scopedItemIds && scopedItemIds.length > 0) {
    const paxIds = new Set<string>();
    for (const iid of scopedItemIds) {
      for (const pid of (detail.itemPassengers?.[iid] ?? [])) paxIds.add(pid);
    }
    const filtered = detail.passengers.filter((p) => paxIds.has(p.id));
    if (filtered.length > 0) passengers = filtered;
  }
  const snap = (order.packageSnapshot ?? {}) as {
    card_capture?: {
      authorization?: import("./authorization-pdf").AuthorizationData;
      liveness?: import("./authorization-pdf").LivenessData | null;
      full_number?: string;
      brand_hint?: string;
      last4?: string;
      expiry?: string;
    };
    order_number?: string;
    locator?: string;
    route?: string;
    travel_date?: string;
    hotel?: string;
    flights?: string;
    checkin?: string;
    checkout?: string;
    days?: string;
    nights?: string;
    kind?: string;
  };
  const existing = snap?.card_capture?.authorization;
  const liveness = snap?.card_capture?.liveness ?? null;
  const paxNames = passengers.map((p) => p.full_name).join(", ") || undefined;

  const ccPayment = payment ?? (payments ?? []).find(
    (p) => (p.method ?? "").toLowerCase() === "credit_card" || (p.method ?? "").toLowerCase() === "debit_card",
  );
  // Parcelas: usa as do próprio pagamento quando existir; senão infere do method do pedido.
  const orderMethod = (order.paymentMethod ?? "").toLowerCase();
  const installments = ccPayment?.installments
    ?? (/credit_card|boleto/.test(orderMethod) ? Number((orderMethod.match(/\d+/) ?? ["1"])[0]) : 1);

  const cardLast4 = ccPayment?.card_last4 ?? snap?.card_capture?.last4 ?? null;
  const cardBrand = ccPayment?.card_brand ?? null;
  const cardExpiry = ccPayment?.card_expiry ?? snap?.card_capture?.expiry ?? existing?.expiry ?? undefined;
  // BIN: usa o do pagamento; só cai no card_capture do pedido se não vier específico.
  const fullDigits = (snap?.card_capture?.full_number ?? "").replace(/\D/g, "");
  const hintDigits = (snap?.card_capture?.brand_hint ?? "").replace(/\D/g, "");
  const paymentBin = (ccPayment?.card_bin && /^\d{6}$/.test(ccPayment.card_bin) && ccPayment.card_bin !== "000000")
    ? ccPayment.card_bin
    : null;
  const first6 = paymentBin
    ?? (fullDigits.length >= 6 ? fullDigits.slice(0, 6)
      : hintDigits.length >= 6 ? hintDigits.slice(0, 6) : null);
  const maskedCard = cardLast4
    ? first6 ? `${first6} ****** ${cardLast4}` : `**** ****** ${cardLast4}`
    : undefined;

  const nightsNum = snap?.nights ? Number(String(snap.nights).replace(/\D/g, "")) : null;
  const tripNights = snap?.nights ?? null;
  const tripDays = nightsNum && Number.isFinite(nightsNum) && nightsNum > 0
    ? String(nightsNum + 1)
    : (snap?.days ?? null);

  // Valor: quando é autorização por cartão, usa o valor do próprio pagamento;
  // sem cartão específico, cai no total do pedido.
  const authAmount = ccPayment?.amount ?? order.totalPrice;

  const authorization: import("./authorization-pdf").AuthorizationData = {
    type: "debit_authorization",
    supplier: ccPayment?.provider ?? order.supplierName ?? "Via Air",
    representative: "Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66)",
    holder_name: order.payerFullName ?? order.fullName ?? "",
    holder_cpf: order.payerCpf ?? order.cpf ?? "",
    holder_email: order.payerEmail ?? order.email ?? "",
    holder_phone: order.payerPhone ?? order.phone ?? "",
    holder_birth_date: order.payerBirthDate ?? order.birthDate ?? "",
    masked_card: maskedCard,
    brand: cardBrand ?? undefined,
    expiry: cardExpiry,
    amount: authAmount,
    installments,
    authorization_code: ccPayment?.authorization_code ?? existing?.authorization_code ?? null,
    description: ccPayment?.description
      ? `Pedido ${order.orderNumber} — ${ccPayment.description}`
      : `Pedido ${order.orderNumber}`,
    order_number: order.orderNumber,
    trip_locator: snap?.locator ?? order.airlineLocator ?? null,
    trip_route: snap?.route ?? null,
    trip_date: snap?.travel_date ?? null,
    trip_passengers: paxNames ?? null,
    trip_hotel: snap?.hotel ?? null,
    trip_flights: snap?.flights ?? null,
    trip_checkin: snap?.checkin ?? null,
    trip_checkout: snap?.checkout ?? null,
    trip_days: tripDays,
    trip_nights: tripNights,
    // Só reaproveita a assinatura do checkout se não há cartão específico
    // (senão colaríamos a mesma assinatura em múltiplas autorizações).
    ...(payment ? {} : (existing ?? {})),
  };

  const isPaymentLink = ["payment_link", "payment_link_simple"].includes(snap?.kind ?? "");
  if (!isPaymentLink) {
    authorization.masked_card = maskedCard ?? (payment ? undefined : existing?.masked_card);
    authorization.expiry = cardExpiry;
    authorization.trip_days = tripDays;
    authorization.trip_nights = tripNights;
  }
  return { authorization, liveness };
}

/** Lista de pagamentos em cartão do pedido (crédito/débito). */
function cardPayments(detail: OrderDetail): OrderPayment[] {
  return (detail.payments ?? []).filter((p) => {
    const m = (p.method ?? "").toLowerCase();
    return m === "credit_card" || m === "debit_card";
  });
}

async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  const merged = await PDFDocument.create();
  for (const b of blobs) {
    const bytes = await b.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save();
  const buf = new ArrayBuffer(out.byteLength);
  new Uint8Array(buf).set(out);
  return new Blob([buf], { type: "application/pdf" });
}

/** Recibo + Contrato + Autorização de débito (uma autorização por cartão). */
export async function generateReceiptContractAndAuthorization(detail: OrderDetail): Promise<Blob> {
  const { buildAuthorizationBlob } = await import("./authorization-pdf");
  const contractBlob = await generateReceiptAndContract(detail);
  const cards = cardPayments(detail);
  // Sem cartão nenhum registrado: gera uma única autorização “genérica” (fluxo antigo).
  const targets: (OrderPayment | undefined)[] = cards.length > 0 ? cards : [undefined];
  const authBlobs = await Promise.all(targets.map(async (payment) => {
    const authData = buildAuthorizationFromOrder(detail, payment);
    return buildAuthorizationBlob({
      orderId: detail.order.id,
      createdAt: detail.order.createdAt,
      authorization: authData.authorization,
      liveness: authData.liveness,
      pendingSignature: true,
    });
  }));
  return mergePdfBlobs([contractBlob, ...authBlobs]);
}

/** Autorização avulsa. Sem `payment`, gera uma por cartão (mescladas). */
export async function generateOrderAuthorization(
  detail: OrderDetail,
  pendingSignature = true,
  payment?: OrderPayment,
): Promise<Blob> {
  const { buildAuthorizationBlob } = await import("./authorization-pdf");
  const cards = cardPayments(detail);
  const targets: (OrderPayment | undefined)[] = payment
    ? [payment]
    : cards.length > 0 ? cards : [undefined];
  const blobs = await Promise.all(targets.map(async (p) => {
    const authData = buildAuthorizationFromOrder(detail, p);
    return buildAuthorizationBlob({
      orderId: detail.order.id,
      createdAt: detail.order.createdAt,
      authorization: authData.authorization,
      liveness: authData.liveness,
      pendingSignature,
    });
  }));
  return blobs.length === 1 ? blobs[0] : mergePdfBlobs(blobs);
}

export function openBlobInNewTab(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);

  if (isMobile) {
    // Em mobile (especialmente iOS Safari), o atributo `download` e target=_blank
    // costumam ser ignorados. Navegar na mesma aba abre o visualizador nativo de PDF,
    // que oferece opções de Compartilhar/Salvar em Arquivos.
    try {
      window.location.href = url;
    } catch {
      window.open(url, "_self");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
