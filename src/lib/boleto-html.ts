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
  if (!partes.length) {
    return "Após o vencimento, multa e juros conforme condições cadastradas no banco emissor.";
  }
  return `Após vencimento: ${partes.join("  ")}`;
}

function compRow(label: string, value?: string | null) {
  if (!value || !String(value).trim()) return "";
  return `<div class="comp-row"><div class="comp-label">${esc(label)}</div><div class="comp-value">${esc(value)}</div></div>`;
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
  const compRows =
    compRow("SERVIÇO", comp.servico) +
    compRow("DESTINO", comp.destino) +
    compRow("PERÍODO", comp.periodo) +
    compRow("PASSAGEIRO", comp.passageiro);

  const logoUrl =
    typeof window !== "undefined"
      ? new URL(viaAirLogo.url, window.location.origin).toString()
      : viaAirLogo.url;

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
.section-title{font-size:18px;font-weight:800;color:var(--navy);margin-bottom:14px}
.card{border:1px solid #edf0f3;border-radius:22px;padding:24px 26px;box-shadow:0 6px 18px rgba(12,39,68,.06);background:#fff}
.payer .row{padding:12px 0;border-bottom:1px solid #e5e9ed;font-size:15px}
.payer .row:last-child{border:0}
.pix-card{display:grid;grid-template-columns:188px 1fr;gap:20px;align-items:start}
.qr{width:188px;height:188px;object-fit:contain}
.copybox{background:#f0f3f6;border-radius:12px;padding:11px 12px;font-size:10px;line-height:1.28;word-break:break-all;min-height:86px}
.copyhint{font-size:11px;color:#9aa3ad;margin-top:7px}
.composition{margin-top:36px}
.comp-card{display:grid;grid-template-columns:1fr 285px;border:1px solid #edf0f3;border-radius:22px;overflow:hidden;box-shadow:0 6px 18px rgba(12,39,68,.05)}
.comp-left{padding:22px 26px}
.comp-row{display:grid;grid-template-columns:165px 1fr;padding:11px 0;border-bottom:1px solid #e6eaee}
.comp-row:last-child{border:0}
.comp-label{font-weight:800;color:var(--navy)}
.comp-value{font-weight:600}
.comp-total{border-left:1px solid #e5e9ed;display:flex;flex-direction:column;justify-content:center;padding:26px 40px;background:linear-gradient(90deg,#fff,#fafbfd)}
.comp-total small{font-weight:700;color:var(--navy)}
.comp-total strong{margin-top:12px;font-size:30px;color:var(--navy)}
.cut{margin:44px -54px 22px;border-top:1.5px dashed #9aa4ae;position:relative}
.cut span{position:absolute;top:-12px;left:54px;background:#fff;padding-right:12px;color:#8b96a2;font-size:12px}
.bank{--finance-col:230px;border:1px solid #7d8791;font-family:Arial,Helvetica,sans-serif;font-size:11px;background:#fff}
.bank-head{display:grid;grid-template-columns:180px 90px 1fr;min-height:50px;border-bottom:1px solid #7d8791}
.bank-logo{background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;font-style:italic;border-right:1px solid #7d8791;text-align:center;padding:0 8px}
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
      <div class="notice">${esc(instrucoes)}</div>
    </div>
  </div>

  <div class="grid2">
    <div>
      <div class="section-title">DADOS DO PAGADOR</div>
      <div class="card payer">
        <div class="row"><strong>${esc(d.pagador.nome)}</strong>${d.pagador.cpfCnpj ? ` — ${esc(d.pagador.cpfCnpj)}` : ""}</div>
        ${d.pagador.telefone || d.pagador.email ? `<div class="row">${[d.pagador.telefone, d.pagador.email].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
        ${d.pagador.endereco ? `<div class="row">${esc(d.pagador.endereco)}</div>` : ""}
      </div>
    </div>
    ${
      temPix
        ? `<div>
      <div class="section-title">PAGUE COM PIX</div>
      <div class="card">
        <div class="pix-card">
          ${d.pix?.qrImage ? `<img class="qr" src="${esc(d.pix.qrImage)}" alt="QR Code Pix" />` : `<div class="qr"></div>`}
          <div>
            <div>Escaneie o QR Code com o app do seu banco e pague.</div>
            <div style="font-size:14px;margin:13px 0 7px"><strong>Pix Copia e Cola</strong></div>
            <div class="copybox">${esc(d.pix?.payload ?? "")}</div>
            <div class="copyhint">Copie o código acima e cole no seu banco.</div>
          </div>
        </div>
      </div>
    </div>`
        : "<div></div>"
    }
  </div>

  ${
    compRows
      ? `<div class="composition">
    <div class="section-title">COMPOSIÇÃO DA COBRANÇA</div>
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
