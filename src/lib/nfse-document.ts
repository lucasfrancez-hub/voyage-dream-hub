import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import viaAirLogoAsset from "@/assets/viaair-logo.png.asset.json";

export type NfseDocumentData = {
  numero_nfse?: string | null;
  serie?: string | null;
  codigo_verificacao?: string | null;
  data_emissao?: string | null;
  created_at: string;
  valor_servicos: number | string;
  valor_iss?: number | string | null;
  aliquota_iss?: number | string | null;
  discriminacao: string;
  tomador: unknown;
  focus_response?: unknown;
};

const A4 = { width: 595.28, height: 841.89 };
const orange = rgb(0.95, 0.42, 0.12);
const ink = rgb(0.08, 0.1, 0.12);
const muted = rgb(0.38, 0.41, 0.45);
const line = rgb(0.82, 0.84, 0.86);
const light = rgb(0.96, 0.97, 0.98);

const clean = (value: unknown) => String(value ?? "")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[^\x00-\xFF]/g, "?");

const money = (value: unknown) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL",
});

function wrap(text: string, font: { widthOfTextAtSize: (s: string, size: number) => number }, size: number, width: number) {
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
  JsBarcode(canvas, value, { format: "CODE128", displayValue: false, margin: 0, height: 40, width: 1.25 });
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
  const margin = 38;
  const contentWidth = A4.width - margin * 2;
  const number = data.numero_nfse || responseValue(data, "numero_nfse") || "-";
  const verification = data.codigo_verificacao || responseValue(data, "cod_verificador_autenticidade") || "";
  const issuedDate = responseValue(data, "data_nfse") || new Date(data.data_emissao || data.created_at).toLocaleDateString("pt-BR");
  const issuedTime = responseValue(data, "hora_nfse") || new Date(data.data_emissao || data.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tomador = (data.tomador ?? {}) as Record<string, unknown>;
  const endereco = (tomador.endereco ?? {}) as Record<string, unknown>;

  page.drawRectangle({ x: 0, y: A4.height - 12, width: A4.width, height: 12, color: orange });
  try {
    const logoBytes = await fetch(viaAirLogoAsset.url).then((r) => r.arrayBuffer());
    const logo = await pdf.embedPng(logoBytes);
    const dimensions = logo.scale(0.14);
    page.drawImage(logo, { x: margin, y: 748, width: dimensions.width, height: dimensions.height });
  } catch { /* O texto mantém a identificação caso a imagem não carregue. */ }

  page.drawText("NOTA FISCAL DE SERVIÇO ELETRÔNICA", { x: 235, y: 782, size: 12, font: bold, color: ink });
  page.drawText("NFS-e", { x: 500, y: 754, size: 11, font: bold, color: orange });
  page.drawText(`Nº ${clean(number)}`, { x: 455, y: 729, size: 20, font: bold, color: ink });
  page.drawText(`Série ${clean(data.serie || responseValue(data, "serie_nfse") || "1")}`, { x: 500, y: 712, size: 8, font: regular, color: muted });
  page.drawLine({ start: { x: margin, y: 700 }, end: { x: A4.width - margin, y: 700 }, thickness: 1, color: line });

  page.drawText("PRESTADOR DE SERVIÇOS", { x: margin, y: 680, size: 8, font: bold, color: orange });
  page.drawText("VIA AIR AGÊNCIA E REPRESENTAÇÕES LTDA", { x: margin, y: 660, size: 12, font: bold, color: ink });
  page.drawText("CNPJ 56.339.877/0001-66  |  IM 121788  |  Regime normal", { x: margin, y: 644, size: 8.5, font: regular, color: muted });
  page.drawText("Rua Takeshi Mitsuyasu, 355 - Jardim Panorama - Paranavaí/PR - CEP 87707-120", { x: margin, y: 630, size: 8.5, font: regular, color: muted });
  page.drawText("lucas@voeair.com  |  (44) 99909-3642", { x: margin, y: 616, size: 8.5, font: regular, color: muted });

  page.drawRectangle({ x: margin, y: 500, width: contentWidth, height: 96, color: light, borderColor: line, borderWidth: 0.7 });
  page.drawText("TOMADOR DE SERVIÇOS", { x: margin + 12, y: 578, size: 8, font: bold, color: orange });
  page.drawText(clean(tomador.razaoSocial || tomador.razao_social || "-"), { x: margin + 12, y: 557, size: 11, font: bold, color: ink });
  page.drawText(`CPF/CNPJ: ${clean(tomador.cpfCnpj || tomador.cpf_cnpj || "-")}`, { x: margin + 12, y: 540, size: 8.5, font: regular, color: muted });
  page.drawText(`E-mail: ${clean(tomador.email || "-")}`, { x: 320, y: 540, size: 8.5, font: regular, color: muted });
  const address = [endereco.logradouro, endereco.numero, endereco.complemento, endereco.bairro, endereco.cidade, endereco.uf, endereco.cep].filter(Boolean).join(", ");
  page.drawText(`Endereço: ${clean(address || "-")}`, { x: margin + 12, y: 520, size: 8.5, font: regular, color: muted });

  page.drawText("DISCRIMINAÇÃO DOS SERVIÇOS", { x: margin, y: 476, size: 8, font: bold, color: orange });
  const descriptionLines = wrap(data.discriminacao, regular, 9, contentWidth - 20).slice(0, 13);
  page.drawRectangle({ x: margin, y: 332, width: contentWidth, height: 130, borderColor: line, borderWidth: 0.7 });
  descriptionLines.forEach((text, index) => page.drawText(text, { x: margin + 10, y: 445 - index * 10.5, size: 9, font: regular, color: ink }));

  page.drawRectangle({ x: margin, y: 258, width: contentWidth, height: 54, color: light, borderColor: line, borderWidth: 0.7 });
  page.drawText("VALOR DOS SERVIÇOS", { x: margin + 12, y: 294, size: 7.5, font: bold, color: muted });
  page.drawText(money(data.valor_servicos), { x: margin + 12, y: 273, size: 14, font: bold, color: ink });
  page.drawText("ALÍQUOTA ISS", { x: 260, y: 294, size: 7.5, font: bold, color: muted });
  page.drawText(`${Number(data.aliquota_iss || 4).toFixed(2).replace(".", ",")}%`, { x: 260, y: 273, size: 11, font: bold, color: ink });
  page.drawText("VALOR ISS", { x: 405, y: 294, size: 7.5, font: bold, color: muted });
  page.drawText(money(data.valor_iss), { x: 405, y: 273, size: 11, font: bold, color: ink });

  page.drawText(`Emitida em ${issuedDate} às ${issuedTime}`, { x: margin, y: 229, size: 8.5, font: regular, color: muted });
  page.drawText("Código de verificação", { x: margin, y: 207, size: 7.5, font: bold, color: muted });
  page.drawText(clean(verification || "Não informado"), { x: margin, y: 190, size: 8, font: bold, color: ink });

  if (verification) {
    const qrUrl = `https://nfse-paranavai.atende.net/autoatendimento/servicos/consulta-de-autenticidade-de-nota-fiscal-eletronica-nfse/detalhar/1/identificador/${verification}`;
    const qr = await pdf.embedPng(await QRCode.toDataURL(qrUrl, { margin: 0, width: 150 }));
    page.drawImage(qr, { x: 465, y: 152, width: 88, height: 88 });
    const barcode = await pdf.embedPng(await barcodePng(verification));
    page.drawImage(barcode, { x: margin, y: 126, width: 390, height: 42 });
  }

  page.drawLine({ start: { x: margin, y: 102 }, end: { x: A4.width - margin, y: 102 }, thickness: 0.7, color: line });
  page.drawText("Documento auxiliar gerado pela VIA AIR. Consulte a autenticidade pelo código de verificação.", { x: margin, y: 84, size: 7.5, font: regular, color: muted });
  page.drawText("Item 9.02 - Agenciamento de viagens | CNAE 7911-2/00", { x: margin, y: 69, size: 7.5, font: regular, color: muted });

  download(await pdf.save(), `NFS-e_${number}_VIA-AIR.pdf`, "application/pdf");
}

export function downloadNfseXml(data: NfseDocumentData) {
  const response = (data.focus_response ?? {}) as { sentXml?: string; bodyPreview?: string };
  const xml = response.sentXml || response.bodyPreview;
  if (!xml) throw new Error("XML desta emissão não está disponível");
  download(new Blob([xml], { type: "application/xml;charset=utf-8" }), `NFS-e_${data.numero_nfse || "emissao"}.xml`);
}