import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";

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
const azul = rgb(0.024, 0.231, 0.471);       // #063b78
const azulEscuro = rgb(0.020, 0.173, 0.349); // #052c59
const azulClaro = rgb(0.917, 0.949, 0.984);  // #eaf2fb
const laranja = rgb(0.949, 0.478, 0.086);    // #f27a16
const verde = rgb(0.106, 0.560, 0.306);      // #1b8f4e
const verdeBg = rgb(0.874, 0.956, 0.906);
const ink = rgb(0.067, 0.094, 0.153);
const cinza = rgb(0.400, 0.439, 0.494);
const linha = rgb(0.812, 0.839, 0.874);

const clean = (value: unknown) => String(value ?? "")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[^\x00-\xFF]/g, "?");

const money = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL",
});

type Font = { widthOfTextAtSize: (s: string, size: number) => number };

function wrap(text: string, font: Font, size: number, width: number) {
  const paragraphs = clean(text).split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
      else { if (current) lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function download(bytes: Uint8Array | Blob, filename: string, type?: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function barcodePng(value: string): Promise<string> {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, { format: "CODE128", displayValue: false, margin: 0, height: 50, width: 1.3 });
  return canvas.toDataURL("image/png");
}

function responseValue(data: NfseDocumentData, key: string): string {
  const response = (data.focus_response ?? {}) as { bodyPreview?: string };
  const match = response.bodyPreview?.match(new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

export async function downloadNfsePdf(data: NfseDocumentData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.width, A4.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 30;
  const contentWidth = A4.width - margin * 2;
  const right = A4.width - margin;

  const number = data.numero_nfse || responseValue(data, "numero_nfse") || "-";
  const serie = data.serie || responseValue(data, "serie_nfse") || "1";
  const verification = data.codigo_verificacao || responseValue(data, "cod_verificador_autenticidade") || "";
  const issuedDate = responseValue(data, "data_nfse") || new Date(data.data_emissao || data.created_at).toLocaleDateString("pt-BR");
  const issuedTime = responseValue(data, "hora_nfse") || new Date(data.data_emissao || data.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tomador = (data.tomador ?? {}) as Record<string, any>;
  const endereco = (tomador.endereco ?? {}) as Record<string, any>;

  // Helper to draw a section title bar (blue gradient look via solid azul)
  const drawSectionTitle = (title: string, y: number) => {
    page.drawRectangle({ x: margin, y: y - 18, width: contentWidth, height: 18, color: azulEscuro });
    page.drawText(clean(title), { x: margin + 10, y: y - 13, size: 9, font: bold, color: rgb(1, 1, 1) });
    return y - 18;
  };

  // ============ HEADER ============
  const headerTop = A4.height - margin;
  const headerH = 110;
  const headerBottom = headerTop - headerH;
  const col1 = margin + contentWidth * 0.30;
  const col2 = margin + contentWidth * 0.68;

  // Logo
  try {
    const logoBytes = await fetch(viaAirLogoAsset.url).then((r) => r.arrayBuffer());
    const logo = await pdf.embedPng(logoBytes);
    const maxW = contentWidth * 0.28;
    const maxH = 60;
    const ratio = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    page.drawImage(logo, { x: margin + 8, y: headerTop - 20 - h, width: w, height: h });
  } catch { /* fallback: text only */ }

  // Divisores verticais
  page.drawLine({ start: { x: col1, y: headerTop }, end: { x: col1, y: headerBottom }, thickness: 0.7, color: linha });
  page.drawLine({ start: { x: col2, y: headerTop }, end: { x: col2, y: headerBottom }, thickness: 0.7, color: linha });

  // Coluna 2 - título
  page.drawText("Nota Fiscal de", { x: col1 + 12, y: headerTop - 26, size: 13, font: bold, color: azulEscuro });
  page.drawText("Serviço Eletrônica", { x: col1 + 12, y: headerTop - 46, size: 17, font: bold, color: azul });
  page.drawText("Série NFS-e", { x: col1 + 12, y: headerTop - 66, size: 10, font: regular, color: azulEscuro });

  // Coluna 3 - número + status + verificação
  page.drawText("NFS-e Nº", { x: col2 + 12, y: headerTop - 20, size: 9, font: bold, color: azulEscuro });
  page.drawText(clean(number), { x: col2 + 12, y: headerTop - 46, size: 26, font: bold, color: laranja });

  // Status badge
  const statusText = "EMITIDA";
  const statusW = bold.widthOfTextAtSize(statusText, 8) + 14;
  page.drawRectangle({ x: col2 + 12, y: headerTop - 62, width: statusW, height: 12, color: verdeBg });
  page.drawText(statusText, { x: col2 + 19, y: headerTop - 60, size: 8, font: bold, color: verde });

  // Data emissão
  page.drawText("DATA/HORA DA EMISSÃO", { x: col2 + 12, y: headerTop - 78, size: 6.5, font: bold, color: cinza });
  page.drawText(`${issuedDate} ${issuedTime}`, { x: col2 + 12, y: headerTop - 91, size: 9, font: bold, color: ink });

  page.drawText("CÓDIGO DE VERIFICAÇÃO", { x: col2 + 12, y: headerTop - 103, size: 6.5, font: bold, color: cinza });

  // Linha laranja sob header
  page.drawRectangle({ x: margin, y: headerBottom - 2, width: contentWidth, height: 2, color: laranja });

  let y = headerBottom - 12;

  // Verificação abaixo (linha completa)
  if (verification) {
    const short = verification.length > 40 ? `${verification.substring(0, 40)}...` : verification;
    page.drawText(clean(short), { x: col2 + 12, y: headerTop - 115, size: 7, font: bold, color: ink });
  }

  // ============ PRESTADOR + TOMADOR (lado a lado) ============
  const twoColW = (contentWidth - 8) / 2;

  y = drawSectionTitle("PRESTADOR DE SERVIÇO", y);
  const prestadorTitleY = y;
  // Draw second title on right at same y (reset back)
  page.drawRectangle({ x: margin + twoColW + 8, y: prestadorTitleY, width: twoColW, height: 18, color: azulEscuro });
  page.drawText("TOMADOR DE SERVIÇO", { x: margin + twoColW + 18, y: prestadorTitleY + 5, size: 9, font: bold, color: rgb(1, 1, 1) });

  // Boxes
  const boxH = 96;
  page.drawRectangle({ x: margin, y: y - boxH, width: twoColW, height: boxH, borderColor: linha, borderWidth: 0.7 });
  page.drawRectangle({ x: margin + twoColW + 8, y: y - boxH, width: twoColW, height: boxH, borderColor: linha, borderWidth: 0.7 });

  // Prestador content
  let py = y - 12;
  page.drawText("VIA AIR AGÊNCIA & REPRESENTAÇÕES LTDA", { x: margin + 8, y: py, size: 9, font: bold, color: ink });
  py -= 14;
  page.drawText("CNPJ: 56.339.877/0001-66  |  IM: 121788  |  Normal", { x: margin + 8, y: py, size: 7.5, font: regular, color: cinza });
  py -= 12;
  wrap("Rua Takeshi Mitsuyasu, 355 - Jardim Panorama - Paranavaí/PR - CEP 87.707-120", regular, 7.5, twoColW - 16)
    .slice(0, 2).forEach((t, i) => page.drawText(t, { x: margin + 8, y: py - i * 10, size: 7.5, font: regular, color: cinza }));
  py -= 26;
  page.drawText("lucas@voeair.com", { x: margin + 8, y: py, size: 7.5, font: bold, color: azul });
  page.drawText("(44) 99909-3642", { x: margin + 8, y: py - 11, size: 7.5, font: regular, color: cinza });

  // Tomador content
  const tx = margin + twoColW + 16;
  const tw = twoColW - 16;
  let ty = y - 12;
  page.drawText(clean(tomador.razaoSocial || tomador.razao_social || "-"), { x: tx, y: ty, size: 9, font: bold, color: ink });
  ty -= 14;
  page.drawText(`CPF/CNPJ: ${clean(tomador.cpfCnpj || tomador.cpf_cnpj || "-")}`, { x: tx, y: ty, size: 7.5, font: regular, color: cinza });
  ty -= 11;
  if (tomador.email) {
    page.drawText(`E-mail: ${clean(tomador.email)}`, { x: tx, y: ty, size: 7.5, font: regular, color: cinza });
    ty -= 11;
  }
  const addressLine = [endereco.logradouro, endereco.numero, endereco.complemento, endereco.bairro].filter(Boolean).join(", ");
  const cityLine = [endereco.cidade, endereco.uf].filter(Boolean).join("/") + (endereco.cep ? ` - CEP ${endereco.cep}` : "");
  wrap(addressLine || "-", regular, 7.5, tw).slice(0, 2)
    .forEach((t, i) => page.drawText(t, { x: tx, y: ty - i * 10, size: 7.5, font: regular, color: cinza }));
  ty -= 22;
  page.drawText(clean(cityLine), { x: tx, y: ty, size: 7.5, font: regular, color: cinza });
  if (tomador.telefone) {
    ty -= 11;
    page.drawText(clean(tomador.telefone), { x: tx, y: ty, size: 7.5, font: regular, color: cinza });
  }

  y -= boxH + 8;

  // ============ DISCRIMINAÇÃO ============
  y = drawSectionTitle("DISCRIMINAÇÃO DOS SERVIÇOS", y);
  const descLines = wrap(data.discriminacao, regular, 8.5, contentWidth - 20);
  const descBoxH = Math.max(70, descLines.length * 11 + 20);
  page.drawRectangle({ x: margin, y: y - descBoxH, width: contentWidth, height: descBoxH, borderColor: linha, borderWidth: 0.7 });
  descLines.slice(0, Math.floor((descBoxH - 20) / 11)).forEach((t, i) =>
    page.drawText(t, { x: margin + 10, y: y - 14 - i * 11, size: 8.5, font: regular, color: ink })
  );
  y -= descBoxH + 8;

  // ============ VALORES ============
  y = drawSectionTitle("VALORES", y);
  const valW = contentWidth / 5;
  const valH = 48;
  page.drawRectangle({ x: margin, y: y - valH, width: contentWidth, height: valH, borderColor: linha, borderWidth: 0.7 });
  const valores = [
    { label: "VALOR DOS SERVIÇOS", value: money(data.valor_servicos) },
    { label: "DEDUÇÕES", value: money(0) },
    { label: "BASE DE CÁLCULO", value: money(data.valor_servicos) },
    { label: "ALÍQUOTA ISS", value: `${Number(data.aliquota_iss || 4).toFixed(4).replace(".", ",")} %` },
    { label: "VALOR DO ISS", value: money(data.valor_iss), highlight: true },
  ];
  valores.forEach((v, i) => {
    const x = margin + i * valW;
    if (i > 0) page.drawLine({ start: { x, y: y - valH }, end: { x, y }, thickness: 0.5, color: linha });
    if (v.highlight) {
      page.drawRectangle({ x, y: y - 3, width: valW, height: 3, color: laranja });
    }
    const labelW = bold.widthOfTextAtSize(v.label, 6.5);
    page.drawText(v.label, { x: x + (valW - labelW) / 2, y: y - 16, size: 6.5, font: bold, color: cinza });
    const valW2 = bold.widthOfTextAtSize(v.value, 10);
    page.drawText(v.value, { x: x + (valW - valW2) / 2, y: y - 34, size: 10, font: bold, color: v.highlight ? laranja : azulEscuro });
  });
  y -= valH + 8;

  // ============ LÍQUIDO (faixa azul) ============
  const liqH = 46;
  page.drawRectangle({ x: margin, y: y - liqH, width: contentWidth, height: liqH, color: azul });
  page.drawText("VALOR LÍQUIDO DA NFS-E", { x: margin + 12, y: y - 16, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText(money(data.valor_servicos), { x: margin + 12, y: y - 38, size: 20, font: bold, color: rgb(1, 1, 1) });
  const secItems = [
    { l: "DESC. INCONDICIONAL", v: money(0) },
    { l: "DESC. CONDICIONAL", v: money(0) },
    { l: "TOTAL DE RETENÇÕES", v: money(0) },
    { l: "CRÉDITO TRIBUTÁRIO", v: money(0) },
  ];
  const secW = (contentWidth * 0.62) / 4;
  const secStartX = margin + contentWidth * 0.38;
  secItems.forEach((s, i) => {
    const x = secStartX + i * secW;
    page.drawLine({ start: { x, y: y - liqH + 4 }, end: { x, y: y - 4 }, thickness: 0.5, color: rgb(1, 1, 1) });
    page.drawText(s.l, { x: x + 8, y: y - 16, size: 6.5, font: bold, color: rgb(0.9, 0.94, 1) });
    page.drawText(s.v, { x: x + 8, y: y - 32, size: 9, font: bold, color: rgb(1, 1, 1) });
  });
  y -= liqH + 10;

  // ============ AUTENTICIDADE (QR + barcode) ============
  y = drawSectionTitle("AUTENTICIDADE DA NFS-E", y);
  const autH = 110;
  page.drawRectangle({ x: margin, y: y - autH, width: contentWidth, height: autH, borderColor: linha, borderWidth: 0.7 });

  const leftW = contentWidth * 0.55;
  const midW = contentWidth * 0.30;
  const rightW = contentWidth * 0.15;

  page.drawText("IDENTIFICADOR", { x: margin + 10, y: y - 14, size: 6.5, font: bold, color: cinza });
  const idText = verification || "-";
  const idDisplay = idText.match(/.{1,4}/g)?.join(" ") ?? idText;
  wrap(idDisplay, bold, 8.5, leftW - 20).slice(0, 2).forEach((t, i) =>
    page.drawText(t, { x: margin + 10, y: y - 28 - i * 12, size: 8.5, font: bold, color: ink })
  );

  if (verification) {
    try {
      const barcode = await pdf.embedPng(await barcodePng(verification));
      page.drawImage(barcode, { x: margin + 10, y: y - autH + 12, width: leftW - 20, height: 45 });
    } catch { /* skip */ }
  }

  // Meio - consulta
  page.drawLine({ start: { x: margin + leftW, y: y - 6 }, end: { x: margin + leftW, y: y - autH + 6 }, thickness: 0.5, color: linha });
  page.drawRectangle({ x: margin + leftW + 8, y: y - autH + 10, width: midW - 16, height: autH - 20, color: azulClaro });
  wrap("Consulte a autenticidade desta NFS-e no site da Prefeitura de Paranavaí.", regular, 7.5, midW - 30).forEach((t, i) =>
    page.drawText(t, { x: margin + leftW + 16, y: y - 20 - i * 10, size: 7.5, font: regular, color: ink })
  );
  page.drawText("nfse-paranavai.atende.net", { x: margin + leftW + 16, y: y - autH + 22, size: 8, font: bold, color: azul });

  // QR code
  if (verification) {
    try {
      const qrUrl = `https://nfse-paranavai.atende.net/autoatendimento/servicos/consulta-de-autenticidade-de-nota-fiscal-eletronica-nfse/detalhar/1/identificador/${verification}`;
      const qr = await pdf.embedPng(await QRCode.toDataURL(qrUrl, { margin: 0, width: 200 }));
      const qrSize = Math.min(rightW - 10, autH - 14);
      const qrX = margin + leftW + midW + (rightW - qrSize) / 2;
      const qrY = y - autH + (autH - qrSize) / 2;
      page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    } catch { /* skip */ }
  }
  y -= autH + 8;

  // Rodapé
  page.drawLine({ start: { x: margin, y: y }, end: { x: right, y: y }, thickness: 0.5, color: linha });
  page.drawText("Documento auxiliar - Consulte a autenticidade pelo código de verificação.", { x: margin, y: y - 12, size: 7, font: regular, color: cinza });
  page.drawText("Item 9.02 - Agenciamento de viagens  |  CNAE 7911-2/00", { x: margin, y: y - 22, size: 7, font: regular, color: cinza });
  page.drawText("Antes de imprimir, pense em sua responsabilidade com o meio ambiente.", { x: right - 260, y: y - 22, size: 7, font: regular, color: cinza });

  download(await pdf.save(), `NFS-e_${number}_VIA-AIR.pdf`, "application/pdf");
}

export function downloadNfseXml(data: NfseDocumentData) {
  const response = (data.focus_response ?? {}) as { sentXml?: string; bodyPreview?: string };
  const xml = response.sentXml || response.bodyPreview;
  if (!xml) throw new Error("XML desta emissão não está disponível");
  download(new Blob([xml], { type: "application/xml;charset=utf-8" }), `NFS-e_${data.numero_nfse || "emissao"}.xml`);
}
