/**
 * Template oficial do boleto VIA AIR (HTML → impressão/PDF).
 *
 * Três camadas independentes:
 *  - o HTML controla o visual;
 *  - a VIA AIR controla a descrição comercial (composição da cobrança);
 *  - o ASAAS controla os dados financeiros/bancários (linha digitável, nosso número...).
 */

import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import asaasLogo from "@/assets/asaas-logo-white.png.asset.json";
import { VIA_AIR_CNPJ } from "@/lib/institucional";

export interface BoletoComposicao {
  servico?: string | null;
  destino?: string | null;
  periodo?: string | null;
  passageiro?: string | null;
}

export interface BoletoBanco {
  nome?: string | null;
  codigo?: string | null;
  linhaDigitavel?: string | null;
  nossoNumero?: string | null;
  agenciaCodigo?: string | null;
  carteira?: string | null;
  especie?: string | null;
  aceite?: string | null;
  dataDocumento?: string | null;
  dataProcessamento?: string | null;
  localPagamento?: string | null;
}

export interface BoletoDocData {
  documentoRef?: string | null;
  vencimento?: string | null;
  valor: number;
  pagador: {
    nome: string;
    cpfCnpj?: string | null;
    telefone?: string | null;
    email?: string | null;
    endereco?: string | null;
  };
  composicao?: BoletoComposicao | null;
  pix?: { qrImage?: string | null; payload?: string | null } | null;
  banco?: BoletoBanco | null;
  multaPercent?: number | null;
  jurosPercentMes?: number | null;
  descontoValor?: number | null;
  beneficiario?: { nome: string; cnpj: string } | null;
  preview?: boolean;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dataBR = (iso?: string | null) => {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

/** Converte a linha digitável (47 dígitos) no código de barras (44 dígitos). */
export function linhaDigitavelParaCodigoBarras(linha?: string | null): string | null {
  const d = String(linha ?? "").replace(/\D/g, "");
  if (d.length !== 47) return null;
  const banco = d.slice(0, 3);
  const moeda = d.slice(3, 4);
  const dv = d.slice(32, 33);
  const fatorValor = d.slice(33, 47);
  const campoLivre = d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  return banco + moeda + dv + fatorValor + campoLivre;
}

/** Barcode Interleaved 2 of 5 em SVG (padrão FEBRABAN). */
export function barcodeItfSvg(code?: string | null, width = 575, height = 68): string {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits || digits.length % 2 !== 0) return "";
  const P: Record<string, string> = {
    "0": "nnwwn", "1": "wnnnw", "2": "nwnnw", "3": "wwnnn", "4": "nnwnw",
    "5": "wnwnn", "6": "nwwnn", "7": "nnnww", "8": "wnnwn", "9": "nwnwn",
  };
  const bars: Array<{ w: number; fill: boolean }> = [];
  // start
  [false, true, false, true].forEach((_, i) => bars.push({ w: 1, fill: i % 2 === 0 }));
  for (let i = 0; i < digits.length; i += 2) {
    const a = P[digits[i]!]!;
    const b = P[digits[i + 1]!]!;
    for (let k = 0; k < 5; k++) {
      bars.push({ w: a[k] === "w" ? 3 : 1, fill: true });
      bars.push({ w: b[k] === "w" ? 3 : 1, fill: false });
    }
  }
  // stop
  bars.push({ w: 3, fill: true }, { w: 1, fill: false }, { w: 1, fill: true });

  const units = bars.reduce((s, b) => s + b.w, 0);
  const unit = width / units;
  let x = 0;
  const rects = bars
    .map((b) => {
      const w = b.w * unit;
      const r = b.fill
        ? `<rect x="${x.toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${height}" fill="#111"/>`
        : "";
      x += w;
      return r;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
}

/** Formata a linha digitável no padrão bancário: 00000.00000 00000.000000 00000.000000 0 00000000000000 */
export function formatarLinhaDigitavel(linha?: string | null): string {
  const d = String(linha ?? "").replace(/\D/g, "");
  if (d.length !== 47) return String(linha ?? "");
  return [
    `${d.slice(0, 5)}.${d.slice(5, 10)}`,
    `${d.slice(10, 15)}.${d.slice(15, 21)}`,
    `${d.slice(21, 26)}.${d.slice(26, 32)}`,
    d.slice(32, 33),
    d.slice(33, 47),
  ].join(" ");
}

/** Texto padrão do cabeçalho — condições reais ficam a cargo do banco emissor. */
export const TEXTO_MULTA_JUROS_PADRAO =
  "Após o vencimento, multa e juros conforme condições cadastradas no banco emissor.";

/** Texto de instruções com multa e juros já calculados em reais. */
export function textoMultaJuros(
  valor: number,
  multaPercent?: number | null,
  jurosMes?: number | null,
): string {
  const partes: string[] = [];
  if (multaPercent) {
    const v = (valor * multaPercent) / 100;
    partes.push(`Multa ${brl(multaPercent)}% = R$ ${brl(v)}`);
  }
  if (jurosMes) {
    const aoDia = jurosMes / 30;
    const v = (valor * aoDia) / 100;
    partes.push(`Juros ${aoDia.toFixed(3).replace(".", ",")}% a.d. = R$ ${brl(v)}/dia`);
  }
  if (!partes.length) return TEXTO_MULTA_JUROS_PADRAO;
  return `Após vencimento: ${partes.join("  ")}`;
}

/** Ícones inline (SVG) — sem dependência de fontes externas no PDF. */
const ICON: Record<string, string> = {
  user: `<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 20a8 8 0 0 1 16 0"/>`,
  phone: `<path d="M4 5c0-.6.4-1 1-1h2.6c.5 0 .9.3 1 .8l.7 3c.1.4 0 .8-.3 1L7.6 10c1 2.1 2.3 3.4 4.4 4.4l1.2-1.4c.3-.3.7-.4 1-.3l3 .7c.5.1.8.5.8 1V17c0 .6-.4 1-1 1A13 13 0 0 1 4 5Z"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>`,
  pin: `<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>`,
  pix: `<path d="m12 3 4.2 4.2a3 3 0 0 1 0 4.2L12 15.6 7.8 11.4a3 3 0 0 1 0-4.2L12 3Z"/><path d="m12 21-4.2-4.2M12 21l4.2-4.2M3 12l4.2-4.2M21 12l-4.2-4.2"/>`,
  qr: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 20h2M20 14h1"/>`,
  phoneApp: `<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>`,
  list: `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
  send: `<path d="M21 3 10.5 13.5M21 3l-7 18-3.5-7.5L3 10l18-7Z"/>`,
  target: `<circle cx="12" cy="12" r="7"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>`,
  copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>`,
};

function icon(name: keyof typeof ICON | string, size = 18, color = "var(--orange)") {
  const path = ICON[name] ?? "";
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function compRow(iconName: string, label: string, value?: string | null) {
  if (!value || !String(value).trim()) return "";
  return `<div class="comp-row"><div class="comp-label">${icon(iconName, 17, "#082f57")}<span>${esc(label)}</span></div><div class="comp-value">${esc(value)}</div></div>`;
}

function bcell(label: string, value?: string | null, cls = "") {
  return `<div class="bcell ${cls}"><span class="blabel">${esc(label)}</span><span class="bvalue">${esc(value ?? "")}</span></div>`;
}

export function renderBoletoHtml(d: BoletoDocData): string {
  const ben = d.beneficiario ?? {
    nome: "VIA AIR AGÊNCIA E REPRESENTAÇÕES LTDA",
    cnpj: VIA_AIR_CNPJ,
  };
  const banco = d.banco ?? {};
  const comp = d.composicao ?? {};
  const instrucoes = textoMultaJuros(d.valor, d.multaPercent, d.jurosPercentMes);
  const codigoBarras = linhaDigitavelParaCodigoBarras(banco.linhaDigitavel);
  const barcode = codigoBarras ? barcodeItfSvg(codigoBarras) : "";
  const temPix = !!(d.pix?.qrImage || d.pix?.payload);
  // Nº do documento sempre vem do ASAAS (nosso número).
  const numeroDocumento = banco.nossoNumero || d.documentoRef || "";
  const especieDoc = banco.especie || "DM";
  const linhaFmt = formatarLinhaDigitavel(banco.linhaDigitavel);
  const compRows =
    compRow("send", "SERVIÇO", comp.servico) +
    compRow("target", "DESTINO", comp.destino) +
    compRow("calendar", "PERÍODO", comp.periodo) +
    compRow("user", "PASSAGEIRO", comp.passageiro);

  const abs = (u: string) =>
    typeof window !== "undefined" ? new URL(u, window.location.origin).toString() : u;
  const logoUrl = abs(viaAirLogo.url);
  const asaasLogoUrl = abs(asaasLogo.url);

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Boleto ${esc(d.documentoRef ?? "")} — VIA AIR</title>
<style>
:root{--navy:#082f57;--navy2:#0a3c6e;--orange:#f47b20;--ink:#12233a;--muted:#6b7787;}
*{box-sizing:border-box}
body{margin:0;background:#eceff2;color:var(--ink);font-family:Inter,ui-sans-serif,-apple-system,"Segoe UI",Arial,sans-serif}
.page{width:1024px;min-height:1448px;margin:24px auto;background:#fff;padding:46px 54px 34px;box-shadow:0 10px 35px rgba(10,38,66,.12)}
.top{display:grid;grid-template-columns:1fr 470px;gap:46px;align-items:start}
.brand img{width:280px;max-height:90px;object-fit:contain;object-position:left center}
h1{margin:24px 0 8px;font-size:34px;letter-spacing:-.8px;color:var(--navy)}
.docline{font-size:15px}.docline b{color:var(--orange)}
.top-cards{display:grid;grid-template-columns:1fr 1.2fr}
.due{padding:18px;border-radius:18px 0 0 18px;background:#fafafa}
.due small,.amount small{display:block;font-weight:700;font-size:12px}
.due strong{display:block;color:var(--orange);font-size:22px;margin-top:3px}
.amount{background:var(--navy);color:#fff;border-radius:18px;padding:18px 24px}
.amount strong{display:block;font-size:34px;margin-top:3px;white-space:nowrap}
.notice{margin-top:20px;padding:18px 22px;background:#f5f5f5;border-radius:18px;font-size:14px;line-height:1.4}
.grid2{display:grid;grid-template-columns:1fr 1.05fr;gap:64px;margin-top:36px}
.section-title{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:800;color:var(--navy);margin-bottom:14px}
.ico{flex:none;display:block}
.card{border:1px solid #edf0f3;border-radius:22px;padding:24px 26px;box-shadow:0 6px 18px rgba(12,39,68,.06);background:#fff}
.payer .row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #e5e9ed;font-size:15px}
.payer .row:last-child{border:0}
.payer .row .sep{width:1px;height:16px;background:#e5e9ed;margin:0 6px}
.pix-top{display:grid;grid-template-columns:188px 1fr;gap:20px;align-items:center}
.qr{width:188px;height:188px;object-fit:contain}
.pix-hint{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.35}
.copytitle{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;margin:18px 0 8px}
.copybox{background:#f0f3f6;border-radius:12px;padding:12px 14px;font-size:10.5px;line-height:1.35;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.copyhint{font-size:11px;color:#9aa3ad;margin-top:7px}
.composition{margin-top:36px}
.comp-card{display:grid;grid-template-columns:1fr 285px;border:1px solid #edf0f3;border-radius:22px;overflow:hidden;box-shadow:0 6px 18px rgba(12,39,68,.05)}
.comp-left{padding:22px 26px}
.comp-row{display:grid;grid-template-columns:185px 1fr;align-items:center;padding:11px 0;border-bottom:1px solid #e6eaee}
.comp-row:last-child{border:0}
.comp-label{display:flex;align-items:center;gap:9px;font-weight:800;color:var(--navy)}
.comp-value{font-weight:600}
.comp-total{border-left:1px solid #e5e9ed;display:flex;flex-direction:column;justify-content:center;padding:26px 40px;background:linear-gradient(90deg,#fff,#fafbfd)}
.comp-total small{font-weight:700;color:var(--navy)}
.comp-total strong{margin-top:12px;font-size:30px;color:var(--navy)}
.cut{margin:44px -54px 22px;border-top:1.5px dashed #9aa4ae;position:relative}
.cut span{position:absolute;top:-12px;left:54px;background:#fff;padding-right:12px;color:#8b96a2;font-size:12px}
.bank{--finance-col:230px;border:1px solid #7d8791;font-family:Arial,Helvetica,sans-serif;font-size:11px;background:#fff}
.bank-head{display:grid;grid-template-columns:180px 90px 1fr;min-height:50px;border-bottom:1px solid #7d8791}
.bank-logo{background:var(--navy);display:flex;align-items:center;justify-content:center;border-right:1px solid #7d8791;padding:8px 14px}
.bank-logo img{width:100%;max-height:30px;object-fit:contain}
.bank-code{display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;border-right:1px solid #7d8791}
.digitable{display:flex;align-items:center;padding:0 18px;font-size:14px;font-weight:800;white-space:nowrap}
.bcell{padding:6px 10px;border-right:1px solid #7d8791;min-width:0}
.bcell:last-child{border-right:0}
.blabel{display:block;font-size:9px;color:#344252;margin-bottom:6px}
.bvalue{font-size:12px;font-weight:800}
.brow,.bank-row-with-side,.instructions-aligned{display:grid;grid-template-columns:minmax(0,1fr) var(--finance-col);border-bottom:1px solid #7d8791}
.brow{min-height:54px}
.bank-meta-left{display:grid;grid-template-columns:1.2fr 1.05fr .78fr .7fr .95fr .72fr}
.bank-values-left{display:grid;grid-template-columns:1.18fr 1fr .92fr .92fr 1fr}
.bank-meta-left .bcell,.bank-values-left .bcell{min-height:58px}
.instructions-aligned{min-height:80px}
.instructions-main{border-right:0}
.right-financial{border-left:1px solid #7d8791;border-right:0}
.right-financial-stack{display:grid;grid-template-rows:1fr 1fr;border-left:1px solid #7d8791}
.right-financial-stack>.bcell{border-left:0;border-right:0}
.right-financial-stack>.bcell:first-child{border-bottom:1px solid #7d8791}
.brow>.bcell:first-child{border-right:0}
.payer-bank{padding:10px 12px;min-height:70px}
.barcode{margin:8px 12px 12px;width:575px}
.bank-foot{display:flex;justify-content:flex-end;font-size:10px;color:#505d69;margin:0 12px 10px}
.preview-flag{position:fixed;top:10px;left:10px;background:var(--orange);color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px}
@media print{body{background:#fff}.preview-flag{display:none}.page{margin:0;box-shadow:none;width:210mm;min-height:297mm;padding:10mm 11mm 8mm}}
</style></head>
<body>
${d.preview ? '<div class="preview-flag">Pré-visualização</div>' : ""}
<div class="page">
  <div class="top">
    <div>
      <div class="brand"><img src="${esc(logoUrl)}" alt="VIA AIR" /></div>
      <h1>BOLETO DE PAGAMENTO</h1>
      <div class="docline">Documento Nº <b>${esc(d.documentoRef ?? "—")}</b></div>
    </div>
    <div>
      <div class="top-cards">
        <div class="due"><small>VENCIMENTO</small><strong>${esc(dataBR(d.vencimento))}</strong></div>
        <div class="amount"><small>VALOR DO PAGAMENTO</small><strong>R$ ${brl(d.valor)}</strong></div>
      </div>
      <div class="notice">${esc(TEXTO_MULTA_JUROS_PADRAO)}</div>
    </div>
  </div>

  <div class="grid2">
    <div>
      <div class="section-title">${icon("user", 19)}<span>DADOS DO PAGADOR</span></div>
      <div class="card payer">
        <div class="row">${icon("user", 17)}<strong>${esc(d.pagador.nome)}</strong>${d.pagador.cpfCnpj ? `<span>— ${esc(d.pagador.cpfCnpj)}</span>` : ""}</div>
        ${
          d.pagador.telefone || d.pagador.email
            ? `<div class="row">${[
                d.pagador.telefone ? `${icon("phone", 17)}<span>${esc(d.pagador.telefone)}</span>` : "",
                d.pagador.email ? `${icon("mail", 17)}<span>${esc(d.pagador.email)}</span>` : "",
              ]
                .filter(Boolean)
                .join('<span class="sep"></span>')}</div>`
            : ""
        }
        ${d.pagador.endereco ? `<div class="row">${icon("pin", 17)}<span>${esc(d.pagador.endereco)}</span></div>` : ""}
      </div>
    </div>
    ${
      temPix
        ? `<div>
      <div class="section-title">${icon("pix", 19)}<span>PAGUE COM PIX</span></div>
      <div class="card">
        <div class="pix-top">
          ${d.pix?.qrImage ? `<img class="qr" src="${esc(d.pix.qrImage)}" alt="QR Code Pix" />` : `<div class="qr"></div>`}
          <div class="pix-hint">${icon("phoneApp", 20)}<span><strong>Escaneie o QR Code</strong><br />com o app do seu banco e pague.</span></div>
        </div>
        <div class="copytitle">${icon("copy", 16)}<span>Pix Copia e Cola</span></div>
        <div class="copybox">${esc(d.pix?.payload ?? "")}</div>
        <div class="copyhint">Copie o código acima e cole no seu banco.</div>
      </div>
    </div>`
        : "<div></div>"
    }
  </div>

  ${
    compRows
      ? `<div class="composition">
    <div class="section-title">${icon("list", 19)}<span>COMPOSIÇÃO DA COBRANÇA</span></div>
    <div class="comp-card">
      <div class="comp-left">${compRows}</div>
      <div class="comp-total"><small>VALOR DO DOCUMENTO</small><strong>R$ ${brl(d.valor)}</strong></div>
    </div>
  </div>`
      : ""
  }

  <div class="cut"><span>✂ CORTE NA LINHA PONTILHADA</span></div>

  <div class="bank">
    <div class="bank-head">
      <div class="bank-logo">${esc(banco.nome ?? "")}</div>
      <div class="bank-code">${esc(banco.codigo ?? "")}</div>
      <div class="digitable">${esc(banco.linhaDigitavel ?? "")}</div>
    </div>
    <div class="brow">
      ${bcell("Local de pagamento", banco.localPagamento ?? "Pagável em qualquer banco até o vencimento.")}
      ${bcell("Vencimento", dataBR(d.vencimento), "right-financial")}
    </div>
    <div class="brow">
      ${bcell("Beneficiário", `${ben.nome} - ${ben.cnpj}`)}
      ${bcell("Agência / Código do Beneficiário", banco.agenciaCodigo ?? "", "right-financial")}
    </div>
    <div class="bank-row-with-side">
      <div class="bank-meta-left">
        ${bcell("Data do documento", dataBR(banco.dataDocumento))}
        ${bcell("Nº do documento", d.documentoRef ?? "")}
        ${bcell("Espécie doc.", banco.especie ?? "")}
        ${bcell("Aceite", banco.aceite ?? "")}
        ${bcell("Data processamento", dataBR(banco.dataProcessamento))}
        ${bcell("Carteira", banco.carteira ?? "")}
      </div>
      ${bcell("Nosso número", banco.nossoNumero ?? "", "right-financial")}
    </div>
    <div class="bank-row-with-side">
      <div class="bank-values-left">
        ${bcell("Uso do banco", "")}
        ${bcell("Carteira / Modalidade", banco.carteira ?? "")}
        ${bcell("Espécie", "R$")}
        ${bcell("Quantidade", "")}
        ${bcell("Valor", "")}
      </div>
      ${bcell("(=) Valor do documento", brl(d.valor), "right-financial")}
    </div>
    <div class="instructions-aligned">
      <div class="bcell instructions-main">
        <span class="blabel">Instruções (texto de responsabilidade do beneficiário)</span>
        <span class="bvalue">${esc(instrucoes)}</span>
      </div>
      <div class="right-financial-stack">
        ${bcell("(-) Desconto / Abatimento", brl(d.descontoValor ?? 0))}
        ${bcell("(+) Mora / Multa / Acréscimos", "")}
      </div>
    </div>
    <div class="payer-bank">
      <span class="blabel">Pagador</span>
      <span class="bvalue">${esc(d.pagador.nome)}${d.pagador.cpfCnpj ? ` - ${esc(d.pagador.cpfCnpj)}` : ""}</span>
      ${d.pagador.endereco ? `<div class="bvalue" style="font-weight:400;margin-top:4px">${esc(d.pagador.endereco)}</div>` : ""}
    </div>
    <div class="barcode">${barcode}</div>
    <div class="bank-foot">Autenticação mecânica - Ficha de compensação</div>
  </div>
</div>
</body></html>`;
}

/** Abre o boleto em uma nova aba (preview ou impressão/PDF).
 *  Usa Blob URL — funciona no Safari/Chrome, onde `document.write`
 *  em janela com `noopener` resulta em página em branco. */
export function abrirBoletoHtml(data: BoletoDocData, imprimir = false) {
  const html = renderBoletoHtml(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Pop-up bloqueado: baixa o arquivo como fallback.
    const a = document.createElement("a");
    a.href = url;
    a.download = `boleto-${data.documentoRef ?? "via-air"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return false;
  }
  if (imprimir) {
    win.addEventListener?.("load", () => setTimeout(() => win.print(), 300));
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
