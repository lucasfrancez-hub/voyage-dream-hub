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

const money = (v: unknown) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: unknown) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " %";
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function responseValue(data: NfseDocumentData, key: string): string {
  const r = (data.focus_response ?? {}) as { bodyPreview?: string };
  const m = r.bodyPreview?.match(new RegExp(`<${key}[^>]*>([\\s\\S]*?)<\\/${key}>`, "i"));
  return m?.[1]?.trim() ?? "";
}

function parseDiscriminacao(disc: string) {
  const text = String(disc || "");
  const parts = text.split(/\n{2,}/);
  const header = (parts[0] || "").trim();
  const rest = parts.slice(1).join("\n\n");
  const passageiros: string[] = [];
  const paxBlock = rest.match(/Passageiros?:\s*\n([\s\S]+)/i);
  if (paxBlock) {
    paxBlock[1].split(/\n/).forEach((l) => {
      const n = l.replace(/^[-•\s]+/, "").trim();
      if (n) passageiros.push(n);
    });
  } else {
    const single = rest.match(/Passageiro:\s*(.+)/i);
    if (single) passageiros.push(single[1].trim());
  }
  let descricao = header, ida = "", volta = "";
  const range = header.match(/(\d{2}\/\d{2}(?:\/\d{4})?)\s*a\s*(\d{2}\/\d{2}(?:\/\d{4})?)/);
  if (range) {
    ida = range[1]; volta = range[2];
    descricao = header.replace(/\s*-\s*\d{2}\/\d{2}(?:\/\d{4})?\s*a\s*\d{2}\/\d{2}(?:\/\d{4})?/, "").trim();
  }
  return { descricao, ida, volta, passageiros };
}

async function barcodeDataUrl(value: string): Promise<string> {
  const c = document.createElement("canvas");
  JsBarcode(c, value || "0", { format: "CODE128", displayValue: false, margin: 0, height: 60, width: 1.3 });
  return c.toDataURL("image/png");
}

function fmtCpfCnpj(v: string | null | undefined) {
  const n = String(v || "").replace(/\D/g, "");
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v || "-";
}
function fmtCep(v: string | null | undefined) {
  const n = String(v || "").replace(/\D/g, "");
  return n.length === 8 ? n.replace(/(\d{5})(\d{3})/, "$1-$2") : v || "";
}

export async function downloadNfsePdf(data: NfseDocumentData) {
  const { data: cfg } = await supabase.from("nfse_config")
    .select("*").limit(1).maybeSingle();

  const codServico = String(cfg?.ipm_codigo_servico || cfg?.ipm_codigo_atividade || "-");
  const codTribMun = String(cfg?.codigo_tributario_municipio || cfg?.ipm_codigo_servico || "-");
  const listaServ = String(cfg?.item_lista_servico || cfg?.codigo_tributario_nacional || "-");
  const cnae = String(cfg?.cnae_principal || "7911-2/00");
  const municipioPrest = `${cfg?.municipio_prestacao || "Paranavaí"}/${cfg?.uf_prestacao || "PR"}`;
  const regime = String(cfg?.regime_tributario || "Normal");

  const numero = data.numero_nfse || responseValue(data, "numero_nfse") || "-";
  const serie = data.serie || responseValue(data, "serie_nfse") || "1";
  const verification = data.codigo_verificacao || responseValue(data, "cod_verificador_autenticidade") || "";
  const rps = responseValue(data, "numero_rps") || "";
  const dateStr = new Date(data.data_emissao || data.created_at).toLocaleDateString("pt-BR");
  const timeStr = new Date(data.data_emissao || data.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const tomador = (data.tomador ?? {}) as Record<string, any>;
  const end = (tomador.endereco ?? {}) as Record<string, any>;
  const disc = parseDiscriminacao(data.discriminacao);

  const qrUrl = verification
    ? `https://nfse-paranavai.atende.net/autoatendimento/servicos/consulta-de-autenticidade-de-nota-fiscal-eletronica-nfse/detalhar/1/identificador/${verification}`
    : "";
  const qrPng = qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 0, width: 260 }) : "";
  const identificador = verification || "-";
  const barcode = await barcodeDataUrl(verification || String(numero));

  const n = (v: Num) => Number(v || 0);
  const vServ = n(data.valor_servicos);
  const vDed = n(data.valor_deducoes);
  const vBase = data.base_calculo != null ? n(data.base_calculo) : vServ - vDed;
  const aliq = n(data.aliquota_iss);
  const vIss = n(data.valor_iss);
  const vIr = n(data.valor_ir), vInss = n(data.valor_inss), vCsll = n(data.valor_csll);
  const vCof = n(data.valor_cofins), vPis = n(data.valor_pis), vOut = n(data.outras_retencoes);
  const totalRet = vIss + vIr + vInss + vCsll + vCof + vPis + vOut;
  const vLiq = data.valor_liquido != null ? n(data.valor_liquido) : Math.max(vServ - vDed - totalRet, 0);
  const dIncond = n(data.desconto_incondicional), dCond = n(data.desconto_condicional);
  const vCred = n(data.credito_tributario);
  const tFed = n(data.tributos_federais);

  const emailPrest = "lucas@voeair.com";
  const telPrest = "(44) 99909-3642";

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>NFS-e ${esc(numero)} - VIA AIR</title>
<style>
:root{--azul:#063b78;--azul-escuro:#052c59;--azul-claro:#eaf2fb;--laranja:#f27a16;--verde:#1b8f4e;--texto:#111827;--cinza:#667085;--linha:#cfd6df;--fundo:#fff}
*{box-sizing:border-box}
body{margin:0;background:#eef1f5;color:var(--texto);font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35}
.pagina{width:210mm;min-height:297mm;margin:20px auto;padding:12mm 10mm 10mm;background:var(--fundo);box-shadow:0 8px 30px rgba(0,0,0,.10)}
.cabecalho{display:grid;grid-template-columns:30% 38% 32%;min-height:118px;border-bottom:2px solid var(--laranja);padding-bottom:16px;margin-bottom:14px}
.marca,.titulo-nota,.resumo-nota{padding:4px 16px}
.marca,.titulo-nota{border-right:1px solid var(--linha)}
.logo{max-width:210px;max-height:76px;object-fit:contain;display:block;margin-top:8px}
.titulo-nota{display:flex;flex-direction:column;justify-content:center}
.titulo-nota .linha-1{font-size:17px;color:var(--azul-escuro);font-weight:700;text-transform:uppercase}
.titulo-nota .linha-2{margin-top:4px;font-size:25px;line-height:1.1;color:var(--azul);font-weight:800;text-transform:uppercase}
.titulo-nota .serie{margin-top:8px;font-size:14px;color:var(--azul-escuro)}
.resumo-nota{display:grid;grid-template-columns:1fr 104px;gap:12px;align-items:center}
.nf-numero .rotulo{font-size:13px;font-weight:700;color:var(--azul-escuro)}
.nf-numero .numero{font-size:32px;line-height:1;font-weight:800;color:var(--laranja);margin:4px 0 8px}
.status{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;background:#dff4e7;color:var(--verde);font-weight:800;text-transform:uppercase;font-size:11px}
.meta-emissao{margin-top:12px}
.meta-emissao small{display:block;color:var(--cinza);font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:3px}
.meta-emissao strong{font-size:13px}
.qr-topo{width:104px;height:104px;object-fit:contain;border:1px solid var(--linha);padding:4px;background:#fff}
.linha-dupla{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.bloco{border:1px solid var(--linha);background:#fff;page-break-inside:avoid}
.titulo-bloco{background:linear-gradient(90deg,var(--azul-escuro),var(--azul));color:#fff;font-weight:800;font-size:13px;text-transform:uppercase;padding:7px 12px;letter-spacing:.2px}
.conteudo{padding:12px 14px}
.razao{font-size:16px;font-weight:800;margin-bottom:11px}
.campos-3{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:12px}
.campo{min-width:0;padding-right:10px;margin-right:10px;border-right:1px solid var(--linha)}
.campo:last-child{border-right:0;margin-right:0}
.rotulo{color:var(--cinza);text-transform:uppercase;font-size:9px;font-weight:700;margin-bottom:4px}
.valor{font-size:12px;font-weight:700;word-break:break-word}
.endereco{border-top:1px solid #e5e9ef;padding-top:10px;margin-top:4px;line-height:1.5}
.contatos{display:grid;grid-template-columns:1fr auto;gap:12px;margin-top:10px}
.servico-grid{display:grid;grid-template-columns:20% 54% 26%;min-height:120px}
.servico-coluna{padding:13px 16px;border-right:1px solid var(--linha)}
.servico-coluna:last-child{border-right:0}
.servico-coluna .item{margin-bottom:10px}
.descricao-principal{font-size:14px;font-weight:700;margin:14px 0 12px}
.datas{display:flex;gap:28px;font-size:11px}
.passageiros{margin:10px 0 0;padding-left:17px}
.passageiros li{margin-bottom:5px}
.valores{margin-top:10px}
.valores-principais{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid var(--linha)}
.valor-box{text-align:center;padding:13px 8px;border-right:1px solid var(--linha)}
.valor-box:last-child{border-right:0}
.valor-box .numero-valor{margin-top:8px;font-size:16px;font-weight:800;color:var(--azul-escuro)}
.valor-box.destaque-iss{border-top:5px solid var(--laranja);background:#fffaf5}
.valor-box.destaque-iss .numero-valor{color:var(--laranja)}
.tributos{display:grid;grid-template-columns:repeat(7,1fr)}
.tributo{text-align:center;padding:9px 4px;border-right:1px solid var(--linha)}
.tributo:last-child{border-right:0}
.tributo .numero-valor{margin-top:5px;font-weight:800;font-size:12px}
.liquido{margin-top:10px;display:grid;grid-template-columns:34% repeat(4,1fr);background:linear-gradient(90deg,var(--azul),var(--azul-escuro));color:#fff;page-break-inside:avoid}
.liquido>div{padding:11px 14px;border-right:1px solid rgba(255,255,255,.35)}
.liquido>div:last-child{border-right:0}
.liquido .rotulo{color:rgba(255,255,255,.86)}
.liquido-total .numero{font-size:30px;line-height:1.05;font-weight:800;margin-top:5px}
.liquido-secundario .numero{margin-top:8px;font-size:12px;font-weight:800}
.informacoes-fiscais{margin-top:10px}
.fiscal-grid{display:grid;grid-template-columns:1.35fr 1fr 1.05fr .85fr}
.fiscal-coluna{padding:13px 14px;border-right:1px solid var(--linha)}
.fiscal-coluna:last-child{border-right:0}
.fiscal-item{margin-bottom:13px}
.autenticidade{margin-top:10px}
.autenticidade-grid{display:grid;grid-template-columns:52% 33% 15%;align-items:center;min-height:110px}
.autenticidade-coluna{padding:12px 14px}
.identificador{font-size:12px;font-weight:700;word-spacing:3px;margin:5px 0 10px}
.barcode{width:100%;max-height:58px;object-fit:fill}
.consulta{background:var(--azul-claro);padding:10px 12px;border-radius:5px;line-height:1.45;font-size:10.5px}
.consulta strong{display:block;color:var(--azul);font-size:12px;margin-top:5px}
.qr-rodape{width:92px;height:92px;object-fit:contain;display:block;margin:auto}
.rodape-legal{display:grid;grid-template-columns:1fr 260px;gap:20px;align-items:end;margin-top:12px;font-size:9px;color:#475467}
.ambiental{text-align:right}
@media print{@page{size:A4;margin:0}body{background:#fff}.pagina{margin:0;box-shadow:none;width:210mm;min-height:297mm}}
</style></head>
<body>
<div class="pagina">
  <div class="cabecalho">
    <div class="marca"><img class="logo" src="${esc(viaAirLogoAsset.url)}" alt="VIA AIR"/></div>
    <div class="titulo-nota">
      <div class="linha-1">Nota Fiscal de</div>
      <div class="linha-2">Serviço Eletrônica</div>
      <div class="serie">Série NFS-e ${esc(serie)}</div>
    </div>
    <div class="resumo-nota">
      <div class="nf-numero">
        <div class="rotulo">NFS-e Nº</div>
        <div class="numero">${esc(numero)}</div>
        <span class="status">Emitida</span>
        <div class="meta-emissao"><small>Data/Hora da emissão</small><strong>${esc(dateStr)} ${esc(timeStr)}</strong></div>
      </div>
      <div>${qrPng ? `<img class="qr-topo" src="${qrPng}" alt="QR"/>` : ""}</div>
    </div>
  </div>

  <div class="linha-dupla">
    <div class="bloco">
      <div class="titulo-bloco">Prestador de serviço</div>
      <div class="conteudo">
        <div class="razao">VIA AIR AGÊNCIA &amp; REPRESENTAÇÕES LTDA</div>
        <div class="campos-3">
          <div class="campo"><div class="rotulo">CNPJ</div><div class="valor">${esc(cfg?.cnpj || "56.339.877/0001-66")}</div></div>
          <div class="campo"><div class="rotulo">Inscrição Municipal</div><div class="valor">${esc(cfg?.inscricao_municipal || "121788")}</div></div>
          <div class="campo"><div class="rotulo">Regime Tributário</div><div class="valor">${esc(regime)}</div></div>
        </div>
        <div class="endereco">${esc(cfg?.logradouro || "")}, ${esc(cfg?.numero || "")} – ${esc(cfg?.bairro || "")}<br/>${esc(municipioPrest)} – CEP ${esc(fmtCep(cfg?.cep))}</div>
        <div class="contatos"><div>${esc(emailPrest)}</div><div>${esc(telPrest)}</div></div>
      </div>
    </div>
    <div class="bloco">
      <div class="titulo-bloco">Tomador de serviço</div>
      <div class="conteudo">
        <div class="razao">${esc((tomador.razaoSocial || tomador.razao_social || tomador.nome || "-") as string)}</div>
        <div class="campos-3">
          <div class="campo"><div class="rotulo">CPF/CNPJ</div><div class="valor">${esc(fmtCpfCnpj((tomador.cpfCnpj || tomador.cnpj || tomador.cpf || "") as string))}</div></div>
          <div class="campo"><div class="rotulo">Inscrição Municipal</div><div class="valor">${esc((tomador.inscricaoMunicipal || tomador.inscricao_municipal) as string || "–")}</div></div>
          <div class="campo"><div class="rotulo">E-mail</div><div class="valor">${esc((tomador.email as string) || "–")}</div></div>
        </div>
        <div class="endereco">${esc(end.logradouro || "")}${end.numero ? ", " + esc(end.numero) : ""}${end.complemento ? " – " + esc(end.complemento) : ""}${end.bairro ? " – " + esc(end.bairro) : ""}<br/>${esc(end.cidade || end.municipio || "")}${end.uf ? "/" + esc(end.uf) : ""}${end.cep ? " – CEP " + esc(fmtCep(end.cep)) : ""}</div>
        <div class="contatos"><div>${esc((tomador.telefone as string) || "")}</div><div>Brasil</div></div>
      </div>
    </div>
  </div>

  <div class="bloco">
    <div class="titulo-bloco">Discriminação dos serviços</div>
    <div class="servico-grid">
      <div class="servico-coluna">
        <div class="item"><div class="rotulo">Serviço</div><div class="valor">${esc(codServico)}</div></div>
        <div class="item"><div class="rotulo">Município da prestação</div><div class="valor">${esc(municipioPrest)}</div></div>
        <div class="item"><div class="rotulo">Cód. tributação</div><div class="valor">${esc(codTribMun)}</div></div>
      </div>
      <div class="servico-coluna">
        <div class="rotulo">Descrição do serviço</div>
        <div class="descricao-principal">${esc(disc.descricao || "-")}</div>
        <div class="datas">${disc.ida ? `<div><strong>IDA:</strong> ${esc(disc.ida)}</div>` : ""}${disc.volta ? `<div><strong>VOLTA:</strong> ${esc(disc.volta)}</div>` : ""}</div>
      </div>
      <div class="servico-coluna">
        <div class="rotulo">${disc.passageiros.length > 1 ? "Passageiros" : "Passageiro"}</div>
        <ul class="passageiros">${disc.passageiros.map((p) => `<li>${esc(p)}</li>`).join("") || "<li>-</li>"}</ul>
      </div>
    </div>
  </div>

  <div class="bloco valores">
    <div class="titulo-bloco">Valores</div>
    <div class="valores-principais">
      <div class="valor-box"><div class="rotulo">Valor dos serviços</div><div class="numero-valor">${money(vServ)}</div></div>
      <div class="valor-box"><div class="rotulo">Deduções</div><div class="numero-valor">${money(vDed)}</div></div>
      <div class="valor-box"><div class="rotulo">Base de cálculo</div><div class="numero-valor">${money(vBase)}</div></div>
      <div class="valor-box"><div class="rotulo">Alíquota ISS</div><div class="numero-valor">${pct(aliq)}</div></div>
      <div class="valor-box destaque-iss"><div class="rotulo">Valor do ISS</div><div class="numero-valor">${money(vIss)}</div></div>
    </div>
    <div class="tributos">
      <div class="tributo"><div class="rotulo">ISS</div><div class="numero-valor">${money(vIss)}</div></div>
      <div class="tributo"><div class="rotulo">IR</div><div class="numero-valor">${money(vIr)}</div></div>
      <div class="tributo"><div class="rotulo">INSS</div><div class="numero-valor">${money(vInss)}</div></div>
      <div class="tributo"><div class="rotulo">CSLL</div><div class="numero-valor">${money(vCsll)}</div></div>
      <div class="tributo"><div class="rotulo">COFINS</div><div class="numero-valor">${money(vCof)}</div></div>
      <div class="tributo"><div class="rotulo">PIS</div><div class="numero-valor">${money(vPis)}</div></div>
      <div class="tributo"><div class="rotulo">Outras retenções</div><div class="numero-valor">${money(vOut)}</div></div>
    </div>
  </div>

  <div class="liquido">
    <div class="liquido-total"><div class="rotulo">Valor líquido da NFS-e</div><div class="numero">${money(vLiq)}</div></div>
    <div class="liquido-secundario"><div class="rotulo">Desc. incondicional</div><div class="numero">${money(dIncond)}</div></div>
    <div class="liquido-secundario"><div class="rotulo">Desc. condicional</div><div class="numero">${money(dCond)}</div></div>
    <div class="liquido-secundario"><div class="rotulo">Total de retenções</div><div class="numero">${money(totalRet)}</div></div>
    <div class="liquido-secundario"><div class="rotulo">Crédito tributário</div><div class="numero">${money(vCred)}</div></div>
  </div>

  <div class="bloco informacoes-fiscais">
    <div class="titulo-bloco">Informações fiscais</div>
    <div class="fiscal-grid">
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">Lista de serviço</div><div class="valor">${esc(listaServ)} - Organização, promoção e execução de programas de turismo, passeios, viagens, excursões, hospedagens e congêneres.</div></div>
        <div class="fiscal-item"><div class="rotulo">Tributação</div><div class="valor">(${esc(listaServ)}) Serviço tributado no município do prestador</div></div>
      </div>
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">Local de prestação</div><div class="valor">${esc(codTribMun)} - ${esc(cfg?.municipio_prestacao || "Paranavaí")}</div></div>
        <div class="fiscal-item"><div class="rotulo">Autorização para emissão</div><div class="valor">${rps ? esc(rps) + " de " : ""}${esc(dateStr)} ${esc(timeStr)}</div></div>
      </div>
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">Situação tributária</div><div class="valor">TI - Tributada Integralmente</div></div>
        <div class="fiscal-item"><div class="rotulo">Enquadramento</div><div class="valor">Simples Nacional - Homologado de ISS ou ISS em regime estimado/fixo</div></div>
      </div>
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">Regime</div><div class="valor">${esc(regime)}</div></div>
        <div class="fiscal-item"><div class="rotulo">CNAE</div><div class="valor">${esc(cnae)}</div></div>
      </div>
    </div>
  </div>

  <div class="bloco autenticidade">
    <div class="titulo-bloco">Autenticidade da NFS-e</div>
    <div class="autenticidade-grid">
      <div class="autenticidade-coluna">
        <div class="rotulo">Identificador</div>
        <div class="identificador">${esc(identificador)}</div>
        <img class="barcode" src="${barcode}" alt="barcode"/>
      </div>
      <div class="autenticidade-coluna">
        <div class="consulta">A veracidade das informações declaradas na NFS-e pode ser consultada no site da Prefeitura de Paranavaí.<strong>www.paranavai.pr.gov.br/nfse</strong></div>
      </div>
      <div class="autenticidade-coluna">${qrPng ? `<img class="qr-rodape" src="${qrPng}" alt="QR"/>` : ""}</div>
    </div>
  </div>

  <div class="rodape-legal">
    <div>Valor aproximado dos tributos: Federais ${money(tFed)} (0,00%), Municipais ${money(vIss)} (${pct(aliq)}), conforme Lei nº 12.741/2012 e Decreto nº 8.264/2014 — Fonte IBPT.</div>
    <div class="ambiental">Antes de imprimir, pense em sua responsabilidade com o meio ambiente.</div>
  </div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Permita pop-ups para gerar a NFS-e."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function downloadNfseXml(data: NfseDocumentData) {
  const r = (data.focus_response ?? {}) as { sentXml?: string; bodyPreview?: string };
  const xml = r.sentXml || r.bodyPreview;
  if (!xml) throw new Error("XML desta emissão não está disponível");
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `NFS-e_${data.numero_nfse || "emissao"}.xml`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
