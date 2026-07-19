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
  prestador?: unknown;
  prestador_id?: string | null;
  focus_response?: unknown;
  order_id?: string | null;
};

// Mapa de logo por CNPJ do prestador (somente dígitos). Adicione novos aqui.
const LOGO_POR_CNPJ: Record<string, string> = {
  "56339877000166": viaAirLogoAsset.url, // VIA AIR
  "47430791000153": viaAirLogoAsset.url, // LRF TRAVEL (mesma logo)
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
  return v || "";
}
function fmtCep(v: string | null | undefined) {
  const n = String(v || "").replace(/\D/g, "");
  return n.length === 8 ? n.replace(/(\d{5})(\d{3})/, "$1-$2") : v || "";
}

const pick = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
};

export async function downloadNfsePdf(data: NfseDocumentData) {
  // Snapshot do prestador salvo na emissão (fonte da verdade retroativa)
  const psnap = (data.prestador ?? {}) as Record<string, any>;
  const psnapEnd = (psnap.endereco ?? {}) as Record<string, any>;
  const cnpjSnap = String(psnap.cnpj || "").replace(/\D/g, "");

  // Config atual do prestador (por id, ou por CNPJ do snapshot, fallback: primeiro)
  let cfgQuery = supabase.from("nfse_config").select("*").limit(1);
  if (data.prestador_id) cfgQuery = supabase.from("nfse_config").select("*").eq("id", data.prestador_id).limit(1);
  else if (cnpjSnap) cfgQuery = supabase.from("nfse_config").select("*").eq("cnpj", cnpjSnap).limit(1);
  const { data: cfg } = await cfgQuery.maybeSingle();

  const cnpjPrest = String(psnap.cnpj || cfg?.cnpj || "").replace(/\D/g, "");
  const razaoPrest = String(psnap.razao_social || (cfg as any)?.razao_social || "");
  const fantasiaPrest = String(psnap.nome_fantasia || (cfg as any)?.nome_fantasia || razaoPrest);
  const imPrest = String(psnap.inscricao_municipal || cfg?.inscricao_municipal || "");
  const logradouroPrest = String(psnapEnd.logradouro || (cfg as any)?.logradouro || "");
  const numeroPrest = String(psnapEnd.numero || (cfg as any)?.numero || "");
  const bairroPrest = String(psnapEnd.bairro || (cfg as any)?.bairro || "");
  const cepPrest = String(psnapEnd.cep || (cfg as any)?.cep || "");
  const emailPrest = String(psnap.email || (cfg as any)?.email || "");
  const telPrest = String(psnap.telefone || (cfg as any)?.telefone || "");
  const logoPrest = LOGO_POR_CNPJ[cnpjPrest] || "";

  // Distintos — sem fallback cruzado entre campos diferentes
  const codServico = String(cfg?.ipm_codigo_servico || "");
  const codTribMun = String(cfg?.codigo_tributario_municipio || "");
  const listaServ = String(cfg?.item_lista_servico || cfg?.codigo_tributario_nacional || "");
  const codMun = String((cfg as unknown as { codigo_municipio?: string })?.codigo_municipio || "4118402");
  const cnae = String(cfg?.cnae_principal || "7911-2/00");
  const municipioPrest = `${cfg?.municipio_prestacao || psnapEnd.cidade || "Paranavaí"}/${cfg?.uf_prestacao || psnapEnd.uf || "PR"}`;
  const regime = String(cfg?.regime_tributario || "Normal").replace(/_/g, " ").toUpperCase();

  const numero = data.numero_nfse || responseValue(data, "numero_nfse") || "-";
  const serie = data.serie || responseValue(data, "serie_nfse") || "1";
  const verification = data.codigo_verificacao || responseValue(data, "cod_verificador_autenticidade") || "";
  const rps = responseValue(data, "numero_rps") || "";
  const dateStr = new Date(data.data_emissao || data.created_at).toLocaleDateString("pt-BR");
  const timeStr = new Date(data.data_emissao || data.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });



  // Tomador — mapeamento robusto com fallback amplo
  const t = (data.tomador ?? {}) as Record<string, any>;
  const end = (t.endereco ?? t.address ?? {}) as Record<string, any>;
  const nomeTomador = pick(t.razaoSocial, t.razao_social, t.nome, t.name, t.full_name, t.fullName);
  const docTomador = pick(t.cpfCnpj, t.cnpj, t.cpf, t.documento, t.document, t.doc);
  const imTomador = pick(t.inscricaoMunicipal, t.inscricao_municipal, t.im);
  const emailTomador = pick(t.email, t.mail, t.e_mail);
  let telTomador = pick(t.telefone, t.phone, t.celular, t.whatsapp);
  const paisTomador = pick(t.pais, end.pais, "Brasil");

  // Fallback: buscar telefone/e-mail do pedido quando não estiverem no tomador salvo
  let emailTomadorFinal = emailTomador;
  if ((!telTomador || !emailTomadorFinal) && data.order_id) {
    const { data: ord } = await supabase.from("orders")
      .select("phone,email").eq("id", data.order_id).maybeSingle();
    if (!telTomador) telTomador = pick(ord?.phone);
    if (!emailTomadorFinal) emailTomadorFinal = pick(ord?.email);
  }

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
  const vIssRet = n(data.valor_iss_retido);
  const vIr = n(data.valor_ir), vInss = n(data.valor_inss), vCsll = n(data.valor_csll);
  const vCof = n(data.valor_cofins), vPis = n(data.valor_pis), vOut = n(data.outras_retencoes);
  // ISS só entra no total de retenções quando é retido na fonte (ISSRF).
  // Sem retenção, valor líquido = valor dos serviços (menos descontos).
  const totalRet = vIssRet + vIr + vInss + vCsll + vCof + vPis + vOut;
  const vLiq = data.valor_liquido != null ? n(data.valor_liquido) : Math.max(vServ - vDed - totalRet, 0);
  const dIncond = n(data.desconto_incondicional), dCond = n(data.desconto_condicional);
  const vCred = n(data.credito_tributario);
  const tFed = n(data.tributos_federais);



  const dash = (v: string) => v || '<span class="sem-informacao">–</span>';

  const enderecoTomador = [
    [pick(end.logradouro, end.rua, end.street), pick(end.numero, end.number)].filter(Boolean).join(", "),
    pick(end.complemento),
    pick(end.bairro),
  ].filter(Boolean).join(" – ");
  const cidadeTomador = pick(end.cidade, end.municipio, end.city);
  const ufTomador = pick(end.uf, end.estado, end.state);
  const cepTomador = fmtCep(pick(end.cep, end.zip, end.postal_code));

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>NFS-e ${esc(numero)} - ${esc(fantasiaPrest || razaoPrest || "Prestador")}</title>
<style>
:root{--azul:#063b78;--azul-escuro:#052c59;--azul-claro:#eaf2fb;--laranja:#f27a16;--verde:#1b8f4e;--texto:#111827;--cinza:#667085;--linha:#cfd6df;--fundo:#fff}
*{box-sizing:border-box}
@page{size:A4 portrait;margin:0}
html,body{width:210mm;height:297mm;margin:0;padding:0;background:#fff}
body{color:var(--texto);font-family:Arial,Helvetica,sans-serif;font-size:10.2px;line-height:1.22}
.pagina{width:210mm;height:297mm;min-height:297mm;margin:0 auto;padding:8mm 8mm 6mm;background:var(--fundo);box-shadow:none;overflow:hidden}
.cabecalho{display:grid;grid-template-columns:30% 38% 32%;min-height:102px;border-bottom:2px solid var(--laranja);padding-bottom:10px;margin-bottom:9px}
.marca,.titulo-nota,.resumo-nota{padding:4px 12px}
.marca,.titulo-nota{border-right:1px solid var(--linha)}
.logo{max-width:175px;max-height:64px;object-fit:contain;display:block;margin-top:7px}
.titulo-nota{display:flex;flex-direction:column;justify-content:center}
.titulo-nota .linha-1{font-size:14px;color:var(--azul-escuro);font-weight:700;text-transform:uppercase}
.titulo-nota .linha-2{margin-top:3px;font-size:22px;line-height:1.04;color:var(--azul);font-weight:800;text-transform:uppercase}
.titulo-nota .serie{margin-top:5px;font-size:11px;color:var(--azul-escuro)}
.resumo-nota{display:grid;grid-template-columns:1fr 88px;gap:10px;align-items:center}
.nf-numero .rotulo{font-size:10px;font-weight:700;color:var(--azul-escuro)}
.nf-numero .numero{font-size:29px;line-height:1;font-weight:800;color:var(--laranja);margin:3px 0 6px}
.status{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;background:#dff4e7;color:var(--verde);font-weight:800;text-transform:uppercase;font-size:10px}
.meta-emissao{margin-top:8px}
.meta-emissao small{display:block;color:var(--cinza);font-size:7.8px;font-weight:700;text-transform:uppercase;margin-bottom:2px}
.meta-emissao strong{font-size:10px;white-space:nowrap}
.qr-topo{width:82px;height:82px;object-fit:contain;border:1px solid var(--linha);padding:3px;background:#fff}
.linha-dupla{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;align-items:stretch}
.linha-dupla .bloco{height:100%}
.linha-dupla .conteudo{height:calc(100% - 26px);display:flex;flex-direction:column}
.linha-dupla .contatos{margin-top:auto}
.bloco{border:1px solid var(--linha);background:#fff;break-inside:avoid;page-break-inside:avoid}
.titulo-bloco{background:linear-gradient(90deg,var(--azul-escuro),var(--azul));color:#fff;font-weight:800;font-size:11px;text-transform:uppercase;padding:5px 10px;letter-spacing:.2px}
.conteudo{padding:8px 10px}
.razao{font-size:12.5px;font-weight:800;margin-bottom:8px;line-height:1.18}
.campos-3{display:grid;grid-template-columns:1fr .82fr 1.18fr;margin-bottom:8px}
.campo{min-width:0;padding-right:7px;margin-right:7px;border-right:1px solid var(--linha)}
.campo:last-child{border-right:0;margin-right:0;padding-right:0}
.rotulo{color:var(--cinza);text-transform:uppercase;font-size:7.8px;font-weight:700;margin-bottom:3px}
.valor{font-size:9.8px;font-weight:700;word-break:normal;overflow-wrap:normal}
.campo:nth-child(1) .valor,.campo:nth-child(3) .valor{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.endereco{border-top:1px solid #e5e9ef;padding-top:7px;margin-top:3px;line-height:1.32;font-size:9.4px}
.contatos{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:7px;font-size:9px}
.contatos div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal;overflow-wrap:normal}
.contatos .email{font-size:8.6px}
.servico-grid{display:grid;grid-template-columns:20% 54% 26%;min-height:96px}
.servico-coluna{padding:8px 10px;border-right:1px solid var(--linha)}
.servico-coluna:last-child{border-right:0}
.servico-coluna .item{margin-bottom:7px}
.descricao-principal{font-size:11px;font-weight:700;margin:11px 0 8px}
.datas{display:flex;gap:20px;font-size:9.2px}
.passageiros{margin:6px 0 0;padding-left:15px;font-size:9.4px}
.passageiros li{margin-bottom:3px}
.valores{margin-top:8px}
.valores-principais{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid var(--linha)}
.valor-box{text-align:center;padding:8px 5px;border-right:1px solid var(--linha)}
.valor-box:last-child{border-right:0}
.valor-box .numero-valor{margin-top:4px;font-size:13px;font-weight:800;color:var(--azul-escuro)}
.valor-box.destaque-iss{border-top:4px solid var(--laranja);background:#fffaf5}
.valor-box.destaque-iss .numero-valor{color:var(--laranja)}
.tributos{display:grid;grid-template-columns:repeat(7,1fr)}
.tributo{text-align:center;padding:5px 2px;border-right:1px solid var(--linha)}
.tributo:last-child{border-right:0}
.tributo .numero-valor{margin-top:3px;font-weight:800;font-size:9.6px}
.liquido{margin-top:8px;display:grid;grid-template-columns:34% repeat(4,1fr);background:linear-gradient(90deg,var(--azul),var(--azul-escuro));color:#fff;break-inside:avoid}
.liquido>div{padding:8px 10px;border-right:1px solid rgba(255,255,255,.35)}
.liquido>div:last-child{border-right:0}
.liquido .rotulo{color:rgba(255,255,255,.86)}
.liquido-total .numero{font-size:23px;line-height:1.05;font-weight:800;margin-top:3px}
.liquido-secundario .numero{margin-top:5px;font-size:10px;font-weight:800}
.informacoes-fiscais{margin-top:8px}
.fiscal-grid{display:grid;grid-template-columns:1.35fr 1fr 1.05fr .85fr}
.fiscal-coluna{padding:8px 10px;border-right:1px solid var(--linha)}
.fiscal-coluna:last-child{border-right:0}
.fiscal-item{margin-bottom:6px}
.autenticidade{margin-top:8px}
.autenticidade-grid{display:grid;grid-template-columns:52% 33% 15%;align-items:center;min-height:78px}
.autenticidade-coluna{padding:7px 10px}
.identificador{font-size:9.4px;font-weight:700;word-spacing:2px;margin:3px 0 6px;word-break:break-all}
.barcode{width:100%;max-height:38px;object-fit:fill}
.consulta{background:var(--azul-claro);padding:7px 9px;border-radius:5px;line-height:1.35;font-size:9.4px}
.consulta strong{display:block;color:var(--azul);font-size:10px;margin-top:4px}
.qr-rodape{width:68px;height:68px;object-fit:contain;display:block;margin:auto}
.rodape-legal{margin-top:5px;font-size:6.8px;color:#475467}
.rodape-linha{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:2px}
.ambiental{color:#475467}
.rodape-sistema{color:#98a2b3;font-style:italic;white-space:nowrap}
.sem-informacao{color:#98a2b3;font-style:italic}
.cabecalho,.linha-dupla,.bloco,.valores,.liquido,.informacoes-fiscais,.autenticidade,.rodape-legal{break-inside:avoid;page-break-inside:avoid}
@media print{html,body{width:210mm;height:297mm;margin:0;padding:0;background:#fff}.pagina{width:210mm;height:297mm;min-height:297mm;margin:0;padding:8mm 8mm 6mm;box-shadow:none;overflow:hidden}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}
</style></head>
<body>
<div class="pagina">
  <div class="cabecalho">
    <div class="marca">${logoPrest ? `<img class="logo" src="${esc(logoPrest)}" alt="${esc(fantasiaPrest || razaoPrest)}"/>` : `<div class="logo" style="display:flex;align-items:center;font-weight:800;color:var(--azul-escuro);font-size:16px;line-height:1.1">${esc(fantasiaPrest || razaoPrest)}</div>`}</div>
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
      <div>${qrPng && qrUrl ? `<a href="${esc(qrUrl)}" target="_blank" rel="noopener noreferrer"><img class="qr-topo" src="${qrPng}" alt="QR"/></a>` : qrPng ? `<img class="qr-topo" src="${qrPng}" alt="QR"/>` : ""}</div>
    </div>
  </div>

  <div class="linha-dupla">
    <div class="bloco">
      <div class="titulo-bloco">Prestador de serviço</div>
      <div class="conteudo">
        <div class="razao">${esc(razaoPrest || "-")}</div>
        <div class="campos-3">
          <div class="campo"><div class="rotulo">CNPJ</div><div class="valor">${esc(fmtCpfCnpj(cnpjPrest))}</div></div>
          <div class="campo"><div class="rotulo">Inscrição Municipal</div><div class="valor">${esc(imPrest)}</div></div>
          <div class="campo"><div class="rotulo">Regime Tributário</div><div class="valor">${esc(regime)}</div></div>
        </div>
        <div class="endereco">${esc(logradouroPrest)}${numeroPrest ? ", " + esc(numeroPrest) : ""}${bairroPrest ? " – " + esc(bairroPrest) : ""}<br/>${esc(municipioPrest)}${cepPrest ? " – CEP " + esc(fmtCep(cepPrest)) : ""}</div>
        <div class="contatos"><div class="email">${esc(emailPrest)}</div><div>${esc(telPrest)}</div></div>
      </div>
    </div>
    <div class="bloco">
      <div class="titulo-bloco">Tomador de serviço</div>
      <div class="conteudo">
        <div class="razao">${dash(esc(nomeTomador))}</div>
        <div class="campos-3">
          <div class="campo"><div class="rotulo">CPF/CNPJ</div><div class="valor">${dash(esc(fmtCpfCnpj(docTomador)))}</div></div>
          <div class="campo"><div class="rotulo">Telefone</div><div class="valor">${dash(esc(telTomador))}</div></div>
          <div class="campo"><div class="rotulo">E-mail</div><div class="valor email" style="white-space:normal;font-size:8.4px">${dash(esc(emailTomadorFinal))}</div></div>
        </div>
        <div class="endereco">${esc(enderecoTomador) || '<span class="sem-informacao">Endereço não informado</span>'}${enderecoTomador ? "<br/>" : ""}${esc(cidadeTomador)}${ufTomador ? "/" + esc(ufTomador) : ""}${cepTomador ? " – CEP " + esc(cepTomador) : ""}</div>
        <div class="contatos"><div>${dash(esc(imTomador ? "IM: " + imTomador : ""))}</div><div>${esc(paisTomador)}</div></div>
      </div>
    </div>
  </div>

  <div class="bloco">
    <div class="titulo-bloco">Discriminação dos serviços</div>
    <div class="servico-grid">
      <div class="servico-coluna">
        <div class="item"><div class="rotulo">Cód. serviço</div><div class="valor">${dash(esc(codServico))}</div></div>
        <div class="item"><div class="rotulo">Município da prestação</div><div class="valor">${esc(municipioPrest)}${codMun ? ` (${esc(codMun)})` : ""}</div></div>
        <div class="item"><div class="rotulo">Cód. tributação municipal</div><div class="valor">${dash(esc(codTribMun))}</div></div>
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
        <div class="fiscal-item"><div class="rotulo">Lista de serviço</div><div class="valor">${dash(esc(listaServ))} - Organização, promoção e execução de programas de turismo, passeios, viagens, excursões, hospedagens e congêneres.</div></div>
        <div class="fiscal-item"><div class="rotulo">Tributação</div><div class="valor">Serviço tributado no município do prestador</div></div>
      </div>
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">Local de prestação</div><div class="valor">${esc(municipioPrest)}${codMun ? ` (${esc(codMun)})` : ""}</div></div>
        <div class="fiscal-item"><div class="rotulo">Autorização para emissão</div><div class="valor">${rps ? esc(rps) + " de " : ""}${esc(dateStr)} ${esc(timeStr)}</div></div>
      </div>
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">Situação tributária</div><div class="valor">TI - Tributada Integralmente</div></div>
        <div class="fiscal-item"><div class="rotulo">Enquadramento</div><div class="valor">${esc(regime)}</div></div>
      </div>
      <div class="fiscal-coluna">
        <div class="fiscal-item"><div class="rotulo">CNAE</div><div class="valor">${esc(cnae)}</div></div>
        <div class="fiscal-item"><div class="rotulo">Cód. município</div><div class="valor">${dash(esc(codMun))}</div></div>
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
      <div class="autenticidade-coluna">${qrPng && qrUrl ? `<a href="${esc(qrUrl)}" target="_blank" rel="noopener noreferrer"><img class="qr-rodape" src="${qrPng}" alt="QR"/></a>` : qrPng ? `<img class="qr-rodape" src="${qrPng}" alt="QR"/>` : ""}</div>
    </div>
  </div>

  <div class="rodape-legal">
    <div>Valor aproximado dos tributos: Federais ${money(tFed)} (0,00%), Municipais ${money(vIss)} (${pct(aliq)}), conforme Lei nº 12.741/2012 e Decreto nº 8.264/2014 — Fonte IBPT.</div>
    <div class="rodape-linha">
      <span class="ambiental">Antes de imprimir, pense em sua responsabilidade com o meio ambiente.</span>
      <span class="rodape-sistema">Sistema VIA AIR — Todos os direitos reservados</span>
    </div>
  </div>

</div>
<script>
async function aguardarImagens(){
  const imgs=Array.from(document.images);
  await Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;})));
}
window.addEventListener('load',async()=>{await aguardarImagens();setTimeout(()=>window.print(),300);});
</script>
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
