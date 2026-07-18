import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

type Num = number | string | null | undefined;
export type NfseDocumentData = {
  numero_nfse?: string | null;
  serie?: string | null;
  codigo_verificacao?: string | null;
  data_emissao?: string | null;
  created_at: string;
  valor_servicos: number | string;
  valor_iss?: Num;
  aliquota_iss?: Num;
  valor_deducoes?: Num;
  base_calculo?: Num;
  valor_iss_retido?: Num;
  valor_ir?: Num;
  valor_inss?: Num;
  valor_csll?: Num;
  valor_cofins?: Num;
  valor_pis?: Num;
  outras_retencoes?: Num;
  tributos_federais?: Num;
  tributos_estaduais?: Num;
  tributos_municipais?: Num;
  desconto_incondicional?: Num;
  desconto_condicional?: Num;
  valor_liquido?: Num;
  credito_tributario?: Num;
  discriminacao: string;
  tomador: unknown;
  focus_response?: unknown;
};

const A4 = { width: 595.28, height: 841.89 };
const azul = rgb(0.024, 0.231, 0.471);
const azulEscuro = rgb(0.020, 0.173, 0.349);
const azulClaro = rgb(0.917, 0.949, 0.984);
const laranja = rgb(0.949, 0.478, 0.086);
const laranjaSuave = rgb(1, 0.980, 0.960);
const verde = rgb(0.106, 0.560, 0.306);
const verdeBg = rgb(0.874, 0.956, 0.906);
const ink = rgb(0.067, 0.094, 0.153);
const cinza = rgb(0.400, 0.439, 0.494);
const linha = rgb(0.812, 0.839, 0.874);
const white = rgb(1, 1, 1);

const clean = (v: unknown) => String(v ?? "")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/[^\x00-\xFF]/g, "?");

const money = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = clean(text).split(/\n/);
  const out: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) <= width) cur = cand;
      else { if (cur) out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function download(bytes: Uint8Array | Blob, filename: string, type?: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function barcodePng(value: string): Promise<string> {
  const c = document.createElement("canvas");
  JsBarcode(c, value, { format: "CODE128", displayValue: false, margin: 0, height: 60, width: 1.3 });
  return c.toDataURL("image/png");
}

function responseValue(data: NfseDocumentData, key: string): string {
  const r = (data.focus_response ?? {}) as { bodyPreview?: string };
  const m = r.bodyPreview?.match(new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`, "i"));
  return m?.[1]?.trim() ?? "";
}

// ---- Parsing helpers ----
function parseDiscriminacao(disc: string): { header: string; descricao: string; ida: string; volta: string; passageiros: string[] } {
  const text = String(disc || "");
  const parts = text.split(/\n{2,}/);
  const header = (parts[0] || "").trim();
  const rest = parts.slice(1).join("\n\n");

  // passageiros
  const passageiros: string[] = [];
  const paxBlockMatch = rest.match(/Passageiros?:\s*\n([\s\S]+)/i);
  if (paxBlockMatch) {
    paxBlockMatch[1].split(/\n/).forEach((l) => {
      const n = l.replace(/^[-•\s]+/, "").trim();
      if (n) passageiros.push(n);
    });
  } else {
    const singleMatch = rest.match(/Passageiro:\s*(.+)/i);
    if (singleMatch) passageiros.push(singleMatch[1].trim());
  }

  // ida/volta e destino a partir do header "Tipo - Destino - dd/mm a dd/mm"
  let descricao = header;
  let ida = "", volta = "";
  const dateRange = header.match(/(\d{2}\/\d{2}(?:\/\d{4})?)\s*a\s*(\d{2}\/\d{2}(?:\/\d{4})?)/);
  if (dateRange) {
    ida = dateRange[1];
    volta = dateRange[2];
    descricao = header.replace(/\s*-\s*\d{2}\/\d{2}(?:\/\d{4})?\s*a\s*\d{2}\/\d{2}(?:\/\d{4})?/, "").trim();
  } else {
    const single = header.match(/(\d{2}\/\d{2}(?:\/\d{4})?)/);
    if (single) { ida = single[1]; descricao = header.replace(/\s*-\s*\d{2}\/\d{2}(?:\/\d{4})?/, "").trim(); }
  }
  return { header, descricao, ida, volta, passageiros };
}

// ---- Drawing helpers ----
type Ctx = { page: PDFPage; regular: PDFFont; bold: PDFFont; margin: number; contentW: number };

function sectionTitle(ctx: Ctx, title: string, y: number, x?: number, w?: number) {
  const bx = x ?? ctx.margin;
  const bw = w ?? ctx.contentW;
  ctx.page.drawRectangle({ x: bx, y: y - 18, width: bw, height: 18, color: azulEscuro });
  ctx.page.drawText(clean(title), { x: bx + 12, y: y - 13, size: 9, font: ctx.bold, color: white });
  return y - 18;
}

function labelValue(ctx: Ctx, x: number, y: number, label: string, value: string, valSize = 10, valColor = ink) {
  ctx.page.drawText(clean(label).toUpperCase(), { x, y, size: 7, font: ctx.bold, color: cinza });
  ctx.page.drawText(clean(value || "-"), { x, y: y - 12, size: valSize, font: ctx.bold, color: valColor });
}

// ============ MAIN ============
export async function downloadNfsePdf(data: NfseDocumentData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.width, A4.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 28;
  const contentW = A4.width - margin * 2;
  const ctx: Ctx = { page, regular, bold, margin, contentW };

  // Puxa códigos fiscais da configuração
  const { data: cfg } = await supabase.from("nfse_config")
    .select("item_lista_servico, ipm_codigo_servico, ipm_codigo_atividade, codigo_tributario_municipio, codigo_tributario_nacional, municipio_prestacao, uf_prestacao, cnae_principal")
    .limit(1).maybeSingle();
  const codServico = String(cfg?.ipm_codigo_servico || cfg?.ipm_codigo_atividade || "-");
  const codTribMun = String(cfg?.codigo_tributario_municipio || cfg?.ipm_codigo_servico || "-");
  const codTribNac = String(cfg?.codigo_tributario_nacional || cfg?.item_lista_servico || "-");
  const cnae = String(cfg?.cnae_principal || "-");
  const municipioPrest = `${cfg?.municipio_prestacao || "Paranavaí"}/${cfg?.uf_prestacao || "PR"}`;

  const numero = data.numero_nfse || responseValue(data, "numero_nfse") || "-";
  const serie = data.serie || responseValue(data, "serie_nfse") || "1";
  const verification = data.codigo_verificacao || responseValue(data, "cod_verificador_autenticidade") || "";
  const issuedDate = responseValue(data, "data_nfse") || new Date(data.data_emissao || data.created_at).toLocaleDateString("pt-BR");
  const issuedTime = responseValue(data, "hora_nfse") || new Date(data.data_emissao || data.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const tomador = (data.tomador ?? {}) as Record<string, any>;
  const end = (tomador.endereco ?? {}) as Record<string, any>;
  const disc = parseDiscriminacao(data.discriminacao);

  const qrUrl = verification
    ? `https://nfse-paranavai.atende.net/autoatendimento/servicos/consulta-de-autenticidade-de-nota-fiscal-eletronica-nfse/detalhar/1/identificador/${verification}`
    : "";

  // ============ HEADER (30% / 38% / 32%) ============
  const headerTop = A4.height - margin;
  const headerH = 118;
  const headerBottom = headerTop - headerH;
  const c1 = margin + contentW * 0.30;
  const c2 = margin + contentW * 0.68;

  // Logo (menor)
  try {
    const logoBytes = await fetch(viaAirLogoAsset.url).then((r) => r.arrayBuffer());
    const logo = await pdf.embedPng(logoBytes);
    const maxW = contentW * 0.30 - 32;
    const maxH = 46;
    const r = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * r, h = logo.height * r;
    page.drawImage(logo, { x: margin + 16 + ((maxW - w) / 2), y: headerBottom + (headerH - h) / 2, width: w, height: h });
  } catch { /* fallback */ }

  // Divisores verticais
  page.drawLine({ start: { x: c1, y: headerTop - 4 }, end: { x: c1, y: headerBottom + 8 }, thickness: 0.6, color: linha });
  page.drawLine({ start: { x: c2, y: headerTop - 4 }, end: { x: c2, y: headerBottom + 8 }, thickness: 0.6, color: linha });

  // Título central
  page.drawText("Nota Fiscal de", { x: c1 + 16, y: headerTop - 40, size: 14, font: bold, color: azulEscuro });
  page.drawText("Serviço Eletrônica", { x: c1 + 16, y: headerTop - 60, size: 19, font: bold, color: azul });
  page.drawText("Série NFS-e", { x: c1 + 16, y: headerTop - 80, size: 11, font: regular, color: azulEscuro });

  // Coluna resumo — número, status, data + QR à direita
  const resumoX = c2 + 12;
  const qrSize = 78;
  const qrX = A4.width - margin - qrSize - 4;
  const resumoTextW = qrX - resumoX - 8;

  page.drawText("NFS-e Nº", { x: resumoX, y: headerTop - 22, size: 10, font: bold, color: azulEscuro });
  page.drawText(clean(numero), { x: resumoX, y: headerTop - 55, size: 30, font: bold, color: laranja });

  // Badge EMITIDA
  const badge = "EMITIDA";
  const badgeW = bold.widthOfTextAtSize(badge, 8) + 14;
  page.drawRectangle({ x: resumoX, y: headerTop - 72, width: badgeW, height: 14, color: verdeBg });
  page.drawText(badge, { x: resumoX + 7, y: headerTop - 70, size: 8, font: bold, color: verde });

  page.drawText("DATA/HORA DA EMISSÃO", { x: resumoX, y: headerTop - 90, size: 6.5, font: bold, color: cinza });
  page.drawText(`${issuedDate} ${issuedTime}`, { x: resumoX, y: headerTop - 102, size: 9.5, font: bold, color: ink });

  // QR no header
  if (qrUrl) {
    try {
      const qr = await pdf.embedPng(await QRCode.toDataURL(qrUrl, { margin: 0, width: 220 }));
      page.drawRectangle({ x: qrX - 3, y: headerBottom + (headerH - qrSize) / 2 - 3, width: qrSize + 6, height: qrSize + 6, borderColor: linha, borderWidth: 0.7, color: white });
      page.drawImage(qr, { x: qrX, y: headerBottom + (headerH - qrSize) / 2, width: qrSize, height: qrSize });
    } catch { /* skip */ }
  }

  // Linha laranja
  page.drawRectangle({ x: margin, y: headerBottom - 4, width: contentW, height: 2, color: laranja });

  let y = headerBottom - 14;

  // ============ PRESTADOR + TOMADOR ============
  const colW = (contentW - 8) / 2;
  const boxH = 108;

  sectionTitle(ctx, "PRESTADOR DE SERVIÇO", y, margin, colW);
  sectionTitle(ctx, "TOMADOR DE SERVIÇO", y, margin + colW + 8, colW);
  y -= 18;

  const drawParty = (x: number, w: number, cfg: {
    razao: string; cnpj: string; im: string; regime: string;
    address: string; city: string; contactLeft: string; contactRight: string;
  }) => {
    page.drawRectangle({ x, y: y - boxH, width: w, height: boxH, borderColor: linha, borderWidth: 0.7 });
    const px = x + 12;
    const pw = w - 24;

    // razão social
    const razaoLines = wrap(cfg.razao, bold, 11.5, pw).slice(0, 2);
    razaoLines.forEach((t, i) => page.drawText(t, { x: px, y: y - 16 - i * 13, size: 11.5, font: bold, color: ink }));
    const afterRazao = y - 16 - razaoLines.length * 13 - 4;

    // 3-col: CNPJ | Inscrição Municipal | Regime Tributário
    const cw = pw / 3;
    labelValue(ctx, px, afterRazao, "CNPJ", cfg.cnpj, 9);
    page.drawLine({ start: { x: px + cw - 6, y: afterRazao + 8 }, end: { x: px + cw - 6, y: afterRazao - 16 }, thickness: 0.4, color: linha });
    labelValue(ctx, px + cw, afterRazao, "Inscrição Municipal", cfg.im, 9);
    page.drawLine({ start: { x: px + cw * 2 - 6, y: afterRazao + 8 }, end: { x: px + cw * 2 - 6, y: afterRazao - 16 }, thickness: 0.4, color: linha });
    labelValue(ctx, px + cw * 2, afterRazao, "Regime Tributário", cfg.regime, 9);

    // divisor
    const dividerY = afterRazao - 22;
    page.drawLine({ start: { x: px, y: dividerY }, end: { x: px + pw, y: dividerY }, thickness: 0.4, color: linha });

    // endereço (2 linhas)
    const addrLines = wrap(cfg.address, regular, 8.5, pw);
    if (addrLines[0]) page.drawText(addrLines[0], { x: px, y: dividerY - 12, size: 8.5, font: regular, color: ink });
    page.drawText(clean(cfg.city), { x: px, y: dividerY - 24, size: 8.5, font: regular, color: ink });

    // contatos
    if (cfg.contactLeft) page.drawText(clean(cfg.contactLeft), { x: px, y: dividerY - 42, size: 8.5, font: bold, color: azul });
    if (cfg.contactRight) {
      const rw = regular.widthOfTextAtSize(clean(cfg.contactRight), 8.5);
      page.drawText(clean(cfg.contactRight), { x: px + pw - rw, y: dividerY - 42, size: 8.5, font: regular, color: cinza });
    }
  };

  drawParty(margin, colW, {
    razao: "VIA AIR AGÊNCIA & REPRESENTAÇÕES LTDA",
    cnpj: "56.339.877/0001-66",
    im: "121788",
    regime: "Normal",
    address: "Rua Takeshi Mitsuyasu, 355 - Jardim Panorama",
    city: "Paranavaí/PR - CEP 87.707-120",
    contactLeft: "lucas@voeair.com",
    contactRight: "(44) 99909-3642",
  });

  const tomEnd = [end.logradouro, end.numero, end.complemento, end.bairro].filter(Boolean).join(", ");
  const tomCity = [end.cidade, end.uf].filter(Boolean).join("/") + (end.cep ? ` - CEP ${end.cep}` : "");
  drawParty(margin + colW + 8, colW, {
    razao: String(tomador.razaoSocial || tomador.razao_social || "-"),
    cnpj: String(tomador.cpfCnpj || tomador.cpf_cnpj || "-"),
    im: String(tomador.inscricao_municipal || tomador.im || "-"),
    regime: String(tomador.regime || "-"),
    address: tomEnd || "-",
    city: tomCity || "-",
    contactLeft: tomador.email ? String(tomador.email) : "",
    contactRight: tomador.telefone ? String(tomador.telefone) : "",
  });

  y -= boxH + 10;

  // ============ DISCRIMINAÇÃO DOS SERVIÇOS ============
  y = sectionTitle(ctx, "DISCRIMINAÇÃO DOS SERVIÇOS", y);
  const discH = 116;
  page.drawRectangle({ x: margin, y: y - discH, width: contentW, height: discH, borderColor: linha, borderWidth: 0.7 });

  const g1 = contentW * 0.20;
  const g2 = contentW * 0.54;
  const g3 = contentW * 0.26;
  page.drawLine({ start: { x: margin + g1, y: y }, end: { x: margin + g1, y: y - discH }, thickness: 0.5, color: linha });
  page.drawLine({ start: { x: margin + g1 + g2, y: y }, end: { x: margin + g1 + g2, y: y - discH }, thickness: 0.5, color: linha });

  // Col 1: Serviço / Município / Cód. tributação
  const col1x = margin + 14;
  labelValue(ctx, col1x, y - 16, "Serviço", "90202", 10);
  labelValue(ctx, col1x, y - 50, "Município da prestação", "Paranavaí/PR", 10);
  labelValue(ctx, col1x, y - 84, "Cód. tributação", "7749", 10);

  // Col 2: Descrição + IDA/VOLTA
  const col2x = margin + g1 + 14;
  const col2w = g2 - 28;
  ctx.page.drawText("DESCRIÇÃO DO SERVIÇO", { x: col2x, y: y - 16, size: 7, font: bold, color: cinza });
  const descLines = wrap(disc.descricao || "-", bold, 12.5, col2w).slice(0, 3);
  descLines.forEach((t, i) => page.drawText(t, { x: col2x, y: y - 34 - i * 15, size: 12.5, font: bold, color: ink }));
  const datasY = y - 34 - descLines.length * 15 - 8;
  if (disc.ida) {
    page.drawText("IDA:", { x: col2x, y: datasY, size: 8, font: bold, color: cinza });
    page.drawText(clean(disc.ida), { x: col2x + 26, y: datasY, size: 9.5, font: bold, color: ink });
  }
  if (disc.volta) {
    page.drawText("VOLTA:", { x: col2x + 110, y: datasY, size: 8, font: bold, color: cinza });
    page.drawText(clean(disc.volta), { x: col2x + 146, y: datasY, size: 9.5, font: bold, color: ink });
  }

  // Col 3: Passageiros
  const col3x = margin + g1 + g2 + 14;
  const col3w = g3 - 28;
  const paxLabel = disc.passageiros.length > 1 ? "PASSAGEIROS" : "PASSAGEIRO";
  page.drawText(paxLabel, { x: col3x, y: y - 16, size: 7, font: bold, color: cinza });
  let py = y - 32;
  const maxPax = 6;
  disc.passageiros.slice(0, maxPax).forEach((p) => {
    page.drawCircle({ x: col3x + 3, y: py + 3, size: 1.5, color: ink });
    const lines = wrap(p, regular, 8.5, col3w - 10).slice(0, 2);
    lines.forEach((t, i) => page.drawText(t, { x: col3x + 10, y: py - i * 10, size: 8.5, font: regular, color: ink }));
    py -= (lines.length * 10) + 4;
  });
  if (disc.passageiros.length > maxPax) {
    page.drawText(`+${disc.passageiros.length - maxPax} passageiro(s)`, { x: col3x + 10, y: py, size: 7.5, font: regular, color: cinza });
  }

  y -= discH + 10;

  // ============ VALORES ============
  const n = (v: Num) => Number(v || 0);
  const vServ = n(data.valor_servicos);
  const vDed = n(data.valor_deducoes);
  const vBase = data.base_calculo != null ? n(data.base_calculo) : vServ - vDed;
  const vIss = n(data.valor_iss);
  const vIssqn = vIss; // ISSQN = valor_iss retornado pela prefeitura
  const vIr = n(data.valor_ir);
  const vInss = n(data.valor_inss);
  const vCsll = n(data.valor_csll);
  const vCofins = n(data.valor_cofins);
  const vPis = n(data.valor_pis);
  const vOutras = n(data.outras_retencoes);
  const totRet = vIssqn + vIr + vInss + vCsll + vCofins + vPis + vOutras;
  const dInc = n(data.desconto_incondicional);
  const dCon = n(data.desconto_condicional);
  const vLiq = data.valor_liquido != null ? n(data.valor_liquido) : vServ - dInc - totRet;
  const vCred = n(data.credito_tributario);
  const tFed = n(data.tributos_federais);

  y = sectionTitle(ctx, "VALORES", y);
  const valMain = [
    { label: "VALOR DOS SERVIÇOS", value: money(vServ) },
    { label: "DEDUÇÕES", value: money(vDed) },
    { label: "BASE DE CÁLCULO", value: money(vBase) },
    { label: "ALÍQUOTA ISS", value: `${Number(data.aliquota_iss || 0).toFixed(4).replace(".", ",")} %` },
    { label: "VALOR DO ISS", value: money(vIss), highlight: true },
  ];
  const vh1 = 52;
  page.drawRectangle({ x: margin, y: y - vh1, width: contentW, height: vh1, borderColor: linha, borderWidth: 0.7 });
  const vcol = contentW / valMain.length;
  valMain.forEach((v, i) => {
    const x = margin + i * vcol;
    if (i > 0) page.drawLine({ start: { x, y: y - vh1 }, end: { x, y }, thickness: 0.4, color: linha });
    if (v.highlight) {
      page.drawRectangle({ x, y: y - vh1, width: vcol, height: vh1, color: laranjaSuave });
      page.drawRectangle({ x, y: y - 4, width: vcol, height: 4, color: laranja });
    }
    const lw = bold.widthOfTextAtSize(v.label, 7);
    page.drawText(v.label, { x: x + (vcol - lw) / 2, y: y - 20, size: 7, font: bold, color: cinza });
    const vw = bold.widthOfTextAtSize(v.value, 12);
    page.drawText(v.value, { x: x + (vcol - vw) / 2, y: y - 40, size: 12, font: bold, color: v.highlight ? laranja : azulEscuro });
  });
  y -= vh1;

  // Tributos (7 colunas) - ISSQN primeiro
  const trib = [
    { l: "ISSQN", v: money(vIssqn) },
    { l: "IR", v: money(vIr) },
    { l: "INSS", v: money(vInss) },
    { l: "CSLL", v: money(vCsll) },
    { l: "COFINS", v: money(vCofins) },
    { l: "PIS", v: money(vPis) },
    { l: "OUTRAS RET.", v: money(vOutras) },
  ];
  const trH = 38;
  page.drawRectangle({ x: margin, y: y - trH, width: contentW, height: trH, borderColor: linha, borderWidth: 0.7 });
  const tcol = contentW / trib.length;
  trib.forEach((t, i) => {
    const x = margin + i * tcol;
    if (i > 0) page.drawLine({ start: { x, y: y - trH }, end: { x, y }, thickness: 0.4, color: linha });
    const lw = bold.widthOfTextAtSize(t.l, 7);
    page.drawText(t.l, { x: x + (tcol - lw) / 2, y: y - 13, size: 7, font: bold, color: cinza });
    const vw = bold.widthOfTextAtSize(t.v, 8.5);
    page.drawText(t.v, { x: x + (tcol - vw) / 2, y: y - 28, size: 8.5, font: bold, color: azulEscuro });
  });
  y -= trH + 10;

  // ============ LÍQUIDO (faixa azul) ============
  const liqH = 52;
  page.drawRectangle({ x: margin, y: y - liqH, width: contentW, height: liqH, color: azul });
  const liqLeftW = contentW * 0.34;
  page.drawText("VALOR LÍQUIDO DA NFS-E", { x: margin + 14, y: y - 16, size: 8, font: bold, color: white });
  page.drawText(money(vLiq), { x: margin + 14, y: y - 42, size: 22, font: bold, color: white });

  const secItems = [
    { l: "DESC. INCONDICIONAL", v: money(dInc) },
    { l: "DESC. CONDICIONAL", v: money(dCon) },
    { l: "TOTAL DE RETENÇÕES", v: money(totRet) },
    { l: "CRÉDITO TRIBUTÁRIO", v: money(vCred) },
  ];
  const secStart = margin + liqLeftW;
  const secW = (contentW - liqLeftW) / secItems.length;
  secItems.forEach((s, i) => {
    const x = secStart + i * secW;
    page.drawLine({ start: { x, y: y - liqH + 6 }, end: { x, y: y - 6 }, thickness: 0.4, color: rgb(1, 1, 1) });
    page.drawText(s.l, { x: x + 8, y: y - 18, size: 6.5, font: bold, color: rgb(0.85, 0.9, 1) });
    page.drawText(s.v, { x: x + 8, y: y - 36, size: 10, font: bold, color: white });
  });
  y -= liqH + 10;

  // ============ AUTENTICIDADE (identificador + barcode | consulta | QR) ============
  y = sectionTitle(ctx, "AUTENTICIDADE DA NFS-E", y);
  const autH = 100;
  page.drawRectangle({ x: margin, y: y - autH, width: contentW, height: autH, borderColor: linha, borderWidth: 0.7 });

  const aL = contentW * 0.52;
  const aM = contentW * 0.33;
  const aR = contentW * 0.15;

  // Esquerda - identificador + barcode
  page.drawText("IDENTIFICADOR", { x: margin + 14, y: y - 14, size: 7, font: bold, color: cinza });
  const idFormatted = (verification || "-").match(/.{1,4}/g)?.join(" ") ?? verification;
  wrap(idFormatted, bold, 9.5, aL - 28).slice(0, 2).forEach((t, i) =>
    page.drawText(t, { x: margin + 14, y: y - 30 - i * 12, size: 9.5, font: bold, color: ink })
  );
  if (verification) {
    try {
      const bar = await pdf.embedPng(await barcodePng(verification));
      page.drawImage(bar, { x: margin + 14, y: y - autH + 10, width: aL - 28, height: 42 });
    } catch { /* skip */ }
  }

  page.drawLine({ start: { x: margin + aL, y: y - 6 }, end: { x: margin + aL, y: y - autH + 6 }, thickness: 0.5, color: linha });

  // Meio - consulta
  const consX = margin + aL + 10;
  const consW = aM - 20;
  page.drawRectangle({ x: consX, y: y - autH + 10, width: consW, height: autH - 20, color: azulClaro });
  wrap("A veracidade das informações declaradas na NFS-e pode ser consultada no site da Prefeitura de Paranavaí.", regular, 7.5, consW - 20).forEach((t, i) =>
    page.drawText(t, { x: consX + 10, y: y - 20 - i * 10, size: 7.5, font: regular, color: ink })
  );
  page.drawText("nfse-paranavai.atende.net", { x: consX + 10, y: y - autH + 22, size: 8.5, font: bold, color: azul });

  page.drawLine({ start: { x: margin + aL + aM, y: y - 6 }, end: { x: margin + aL + aM, y: y - autH + 6 }, thickness: 0.5, color: linha });

  // Direita - QR rodapé (também)
  if (qrUrl) {
    try {
      const qr = await pdf.embedPng(await QRCode.toDataURL(qrUrl, { margin: 0, width: 220 }));
      const size = Math.min(aR - 10, autH - 14);
      const qx = margin + aL + aM + (aR - size) / 2;
      const qy = y - autH + (autH - size) / 2;
      page.drawImage(qr, { x: qx, y: qy, width: size, height: size });
    } catch { /* skip */ }
  }

  y -= autH + 10;

  // Rodapé legal
  page.drawText(`Valor aproximado dos tributos: Federais ${money(tFed)}, Municipais ${money(vIssqn)} - Lei 12.741/2012.`, { x: margin, y: y, size: 7, font: regular, color: cinza });
  page.drawText("Documento auxiliar - Item 9.02 (Agenciamento de viagens) - CNAE 7911-2/00", { x: margin, y: y - 10, size: 7, font: regular, color: cinza });
  const eco = "Antes de imprimir, pense em sua responsabilidade com o meio ambiente.";
  const ew = regular.widthOfTextAtSize(eco, 7);
  page.drawText(eco, { x: A4.width - margin - ew, y: y - 22, size: 7, font: regular, color: cinza });

  download(await pdf.save(), `NFS-e_${numero}_VIA-AIR.pdf`, "application/pdf");
}

export function downloadNfseXml(data: NfseDocumentData) {
  const r = (data.focus_response ?? {}) as { sentXml?: string; bodyPreview?: string };
  const xml = r.sentXml || r.bodyPreview;
  if (!xml) throw new Error("XML desta emissão não está disponível");
  download(new Blob([xml], { type: "application/xml;charset=utf-8" }), `NFS-e_${data.numero_nfse || "emissao"}.xml`);
}
