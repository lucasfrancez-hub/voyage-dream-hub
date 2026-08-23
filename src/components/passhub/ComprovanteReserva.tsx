/**
 * Comprovante de Reserva Aérea — VIA AIR.
 *
 * Componente único e dinâmico: adapta densidade (normal / medium / compact)
 * conforme a quantidade de voos e alterna entre reserva e emissão.
 * Preparado para tela, impressão e PDF A4 retrato.
 */
import { cidadeDoAeroporto, nomeDoAeroporto } from "@/lib/whatsapp/airport-city";
import { findAirline } from "@/lib/airlines";
import logoViaAir from "@/assets/viaair-logo.png.asset.json";

export type ComprovanteVoo = {
  companhia: string;
  numeroVoo: string;
  origem: string;
  destino: string;
  partida: string;
  chegada: string;
  duracao: string;
  classe: string;
  familiaTarifaria: string;
  aeronave?: string;
  bagagem: { itemPessoal: boolean | null; mao: boolean | null; despachada: boolean | null; despachadaQtd?: number };
};

export type ComprovantePax = {
  nome: string;
  tipo: string;
  documento?: string;
  documentoTipo?: string;
  nascimento?: string;
  bilhete?: string;
  emissao?: string;
};

export type ComprovanteReservaDados = {
  emitido: boolean;
  /** "reserva" = plano de viagem; "bilhete" = e-ticket emitido. Mesma identidade visual. */
  variante?: "reserva" | "bilhete";
  localizador: string;
  localizadorCompanhia?: string;
  companhia: string;
  criadaEm?: string;
  consultor?: string;
  origem: string;
  destino: string;
  limiteEmissao?: string;
  total: number;
  /** Quando true, o plano de viagem sai sem nenhum valor. */
  ocultarValores?: boolean;
  passageiros: ComprovantePax[];
  /** Cada grupo é um sentido/trecho: IDA, VOLTA ou TRECHO 3, 4... */
  grupos: Array<{ titulo: string; voos: ComprovanteVoo[] }>;
  /** Hospedagens, transfers, passeios e demais serviços do mesmo pedido. */
  outrasReservas?: Array<{
    tipo: string;
    titulo: string;
    localizador?: string;
    periodo?: string;
    detalhes?: string[];
  }>;
};


/* ------------------------------- formatação ------------------------------- */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Nome próprio sempre em Caixa Alta Inicial: "lucas rocha francez" -> "Lucas Rocha Francez". */
const MINUSCULAS_NOME = new Set(["de", "da", "do", "das", "dos", "e"]);
export function nomeProprio(v?: string): string {
  if (!v) return "";
  return v
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p, i) =>
      i > 0 && MINUSCULAS_NOME.has(p)
        ? p
        : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1),
    )
    .join(" ");
}

function parseData(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dataHora(v?: string): string {
  const d = parseData(v);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]} ${d.getFullYear()} • ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function diaMes(v?: string): string {
  const d = parseData(v);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]}`;
}

function hora(v?: string): string {
  const d = parseData(v);
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dataBR(v?: string): string {
  const d = parseData(v);
  if (!d) return "";
  return d.toLocaleDateString("pt-BR");
}

function minutosParaTexto(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

/** Aceita "PT3H05M", "03:05", "3h05" ou calcula por partida/chegada. */
function duracaoVoo(v: ComprovanteVoo): string {
  const bruta = (v.duracao || "").trim();
  const iso = /^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?$/i.exec(bruta.replace(/^PT/i, "PT"));
  if (iso && (iso[1] || iso[2])) return minutosParaTexto(Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0));
  const rel = /^(\d{1,2})[:h](\d{1,2})/.exec(bruta);
  if (rel) return minutosParaTexto(Number(rel[1]) * 60 + Number(rel[2]));
  const a = parseData(v.partida);
  const b = parseData(v.chegada);
  if (a && b) return minutosParaTexto((b.getTime() - a.getTime()) / 60000);
  return bruta;
}

function conexaoEntre(anterior: ComprovanteVoo, proximo: ComprovanteVoo): string {
  const a = parseData(anterior.chegada);
  const b = parseData(proximo.partida);
  const cidade = cidadeDoAeroporto(anterior.destino)?.cidade ?? nomeDoAeroporto(anterior.destino) ?? "";
  const espera = a && b ? minutosParaTexto((b.getTime() - a.getTime()) / 60000) : "";
  const local = cidade ? `${cidade} (${anterior.destino})` : anterior.destino;
  return espera ? `Conexão em ${local} • ${espera} entre os voos` : `Conexão em ${local}`;
}

function cidadeDe(iata: string): string {
  return cidadeDoAeroporto(iata)?.cidade ?? "";
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Evita "JJ JJ 3215": remove o código da cia repetido no número do voo. */
function numeroVooLimpo(companhia: string, numeroVoo: string): string {
  const cia = (companhia || "").trim().toUpperCase();
  let num = (numeroVoo || "").trim().toUpperCase();
  if (cia && num.startsWith(cia)) num = num.slice(cia.length).trim();
  num = num.replace(/^[-•]/, "").trim();
  return [cia, num].filter(Boolean).join(" ");
}

function tipoPax(t: string): string {
  const up = (t || "").toUpperCase();
  if (up.startsWith("CHD") || up.includes("CRIAN")) return "Criança";
  if (up.startsWith("INF") || up.includes("BEB")) return "Bebê";
  return "Adulto";
}

function resumoPassageiros(pax: ComprovantePax[]): string {
  const adt = pax.filter((p) => tipoPax(p.tipo) === "Adulto").length;
  const chd = pax.filter((p) => tipoPax(p.tipo) === "Criança").length;
  const inf = pax.filter((p) => tipoPax(p.tipo) === "Bebê").length;
  const partes: string[] = [];
  if (adt) partes.push(`${adt} ${adt > 1 ? "adultos" : "adulto"}`);
  if (chd) partes.push(`${chd} ${chd > 1 ? "crianças" : "criança"}`);
  if (inf) partes.push(`${inf} ${inf > 1 ? "bebês" : "bebê"}`);
  return partes.join(" • ") || `${pax.length} passageiro(s)`;
}

/* --------------------------------- estilo --------------------------------- */

const CSS = `
.crdoc{--blue:#123f61;--orange:#ef7d28;--orange-soft:#fff4eb;--ink:#1c2733;--muted:#667482;--line:#dfe6ec;--soft:#f6f8fa;--green:#16784b;--green-soft:#eaf7f1;--warn:#9b5d00;--warn-soft:#fff6df;
 font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink);}
.crdoc *{box-sizing:border-box}
.crdoc .sheet{width:900px;max-width:calc(100% - 24px);margin:0 auto 32px;background:#fff;box-shadow:0 12px 35px rgba(22,44,66,.11);border-radius:18px;overflow:hidden}
.crdoc .brandbar{height:7px;background:linear-gradient(90deg,var(--orange) 0 28%,var(--blue) 28% 100%)}
.crdoc header{padding:24px 34px 20px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;border-bottom:1px solid var(--line)}
.crdoc .brand{display:flex;flex-direction:column;gap:2px;text-decoration:none;flex-shrink:0}
.crdoc .brand img{height:40px;width:auto;object-fit:contain;display:block;object-position:left}
.crdoc .brand-sub{font-size:9px;font-weight:900;letter-spacing:.22em;color:#9fb0bf;text-transform:uppercase;padding-left:2px}
.crdoc .value-card{border:1px solid #cfe8dc;background:var(--green-soft);border-radius:15px;padding:18px;display:flex;flex-direction:column;justify-content:center}
.crdoc .value-card .price{color:var(--green);font-size:28px}
.crdoc .value-card .price-note{margin-top:6px}
.crdoc .doc-title{text-align:right}
.crdoc .doc-title h1{margin:0;font-size:21px;color:var(--ink);letter-spacing:-.2px}
.crdoc .doc-title p{margin:6px 0 0;color:var(--muted);font-size:12px}
.crdoc .hero{padding:20px 34px 8px;display:grid;grid-template-columns:1.35fr .65fr;gap:14px}
.crdoc .hero.single{grid-template-columns:1fr}
.crdoc .hero-card{border:1px solid var(--line);border-radius:15px;padding:18px}
.crdoc .hero-card.soft{background:var(--soft)}
.crdoc .eyebrow{font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);font-weight:800;margin-bottom:7px}
.crdoc .locator{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.crdoc .locator strong{font-size:24px;color:var(--blue);letter-spacing:2px}
.crdoc .status{display:inline-flex;align-items:center;gap:7px;border-radius:999px;font-size:11px;font-weight:850;padding:7px 10px}
.crdoc .status:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.crdoc .status.reserved{color:var(--warn);background:var(--warn-soft)}
.crdoc .status.issued{color:var(--green);background:var(--green-soft)}
.crdoc .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 22px;margin-top:18px}
.crdoc .meta-grid span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:4px}
.crdoc .meta-grid b{font-size:12px;font-weight:750}
.crdoc .total-price{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-end;gap:18px}
.crdoc .price-label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:800;margin-bottom:4px}
.crdoc .price-note{color:var(--muted);font-size:9px;line-height:1.4}
.crdoc .price{color:var(--blue);font-size:25px;font-weight:900;white-space:nowrap;letter-spacing:-.4px}
.crdoc .deadline{background:var(--orange-soft);border:1px solid #ffd7b7;border-left:4px solid var(--orange);border-radius:12px;padding:15px 16px}
.crdoc .deadline .time{color:#7a3a00;font-size:17px;font-weight:850;margin:4px 0 5px}
.crdoc .deadline small{color:#8b5f39;line-height:1.45;display:block}
.crdoc .deadline.ok{background:var(--green-soft);border-color:#c9eadb;border-left-color:var(--green)}
.crdoc .deadline.ok .time{color:var(--green)}
.crdoc .deadline.ok small{color:#43705c}
.crdoc section{padding:12px 34px 0}
.crdoc .section-head{display:flex;justify-content:space-between;align-items:center;margin:0 0 10px;gap:12px}
.crdoc .section-head h2{margin:0;color:var(--blue);font-size:14px}
.crdoc .section-head .hint{color:var(--muted);font-size:10px}
.crdoc .passenger{border:1px solid var(--line);border-radius:14px;padding:12px 16px;display:grid;grid-template-columns:1.7fr .5fr .75fr .7fr .6fr;gap:14px;align-items:center;break-inside:avoid}
.crdoc .passenger + .passenger{margin-top:8px}
.crdoc .passenger .name{font-size:13px;font-weight:800}
.crdoc .small-label{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px}
.crdoc .small-value{font-size:11px;font-weight:700}
.crdoc .journey{border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:12px;break-inside:avoid}
.crdoc .journey-title{background:var(--soft);padding:10px 15px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:10px}
.crdoc .journey-title strong{color:var(--blue);font-size:12px}
.crdoc .journey-title span{color:var(--muted);font-size:10px}
.crdoc .flight{display:grid;grid-template-columns:132px 1fr 122px;gap:14px;align-items:center;padding:16px;break-inside:avoid}
.crdoc .flight + .flight{border-top:1px solid var(--line)}
.crdoc .airline{display:flex;flex-direction:column;gap:6px}
.crdoc .airline img{height:40px;width:auto;max-width:130px;object-fit:contain;object-position:left}
.crdoc .airline-code{font-size:16px;font-weight:900;color:var(--blue);letter-spacing:.3px}
.crdoc .airline span{color:var(--muted);font-size:9px}
.crdoc .route{display:grid;grid-template-columns:1fr 90px 1fr;align-items:center;gap:10px}
.crdoc .airport .code{font-size:21px;font-weight:900;color:var(--ink)}
.crdoc .airport .city{color:var(--muted);font-size:10px;margin-top:2px}
.crdoc .airport .datetime{margin-top:8px;font-size:11px;font-weight:750}
.crdoc .airport.right{text-align:right}
.crdoc .line{text-align:center;color:var(--muted);font-size:9px}
.crdoc .line .bar{height:1px;background:#b8c4ce;margin:6px 0;position:relative}
.crdoc .line .bar:before,.crdoc .line .bar:after{content:"";position:absolute;top:-3px;width:7px;height:7px;border-radius:50%;background:#b8c4ce}
.crdoc .line .bar:before{left:0}
.crdoc .line .bar:after{right:0}
.crdoc .flight-info{border-left:1px solid var(--line);padding-left:14px}
.crdoc .flight-info div{margin:3px 0;font-size:10px;color:var(--muted)}
.crdoc .flight-info b{color:var(--ink)}
.crdoc .connection{margin:0 16px;padding:7px 12px;border-radius:10px;background:#edf6fb;border:1px solid #d3e8f4;color:#316078;font-size:10px;font-weight:700}
.crdoc .baggage{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.crdoc .bag{border:1px solid var(--line);border-radius:9px;padding:6px 8px;font-size:9px;color:#4c5b69;background:#fff}
.crdoc .bag.no{color:#8b5b58;background:#fff8f7}
.crdoc .notice{margin:16px 34px 0;padding:14px 16px;border-radius:13px;border:1px solid #ffd8bd;background:#fff8f2;display:flex;gap:12px;align-items:flex-start;break-inside:avoid}
.crdoc .notice-icon{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--orange);color:#fff;font-weight:900;flex:0 0 26px}
.crdoc .notice strong{font-size:11px;color:#7a3a00}
.crdoc .notice p{margin:4px 0 0;font-size:10px;line-height:1.5;color:#7b5a40}
.crdoc .tickets{border:1px solid #cfe8db;border-radius:14px;overflow:hidden;break-inside:avoid}
.crdoc .ticket-row{display:grid;grid-template-columns:1fr .9fr .9fr .8fr}
.crdoc .ticket-row > div{padding:10px 12px;border-right:1px solid #e3efe9;font-size:10px}
.crdoc .ticket-row > div:last-child{border-right:0}
.crdoc .ticket-row.head{background:#eff8f4;color:#4c6b5d;font-weight:800;text-transform:uppercase;letter-spacing:.6px}
.crdoc .ticket-row.body{color:#20352c;font-weight:700;border-top:1px solid #dceee5}
.crdoc .checks{margin:18px 34px 0;border-top:1px solid var(--line);padding:16px 0 4px}
.crdoc .checks h3{margin:0 0 10px;font-size:11px;color:var(--blue)}
.crdoc .checks ul{margin:0;padding:0 0 0 17px;color:#596877;font-size:10px;line-height:1.55}
.crdoc .checks li{margin:4px 0}
.crdoc footer{margin-top:18px;border-top:1px solid var(--line);padding:18px 34px 24px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.crdoc footer .contact{font-size:10px;line-height:1.55;color:var(--muted)}
.crdoc footer .contact strong{color:var(--blue)}
.crdoc footer .page-note{font-size:9px;color:#8a96a1;text-align:right}

.crdoc .locator-pill{display:inline-block;margin-top:2px;background:#eef4f9;border:1px solid #d3e0ea;color:var(--blue);border-radius:999px;padding:5px 11px;font-weight:900;font-size:13px;letter-spacing:1.4px}
.crdoc .passenger.nostatus{grid-template-columns:1.8fr .6fr .95fr .8fr}
.crdoc .infoblock{margin:14px 34px 0;border:1px solid var(--line);border-radius:13px;padding:14px 16px;background:#fbfcfd;break-inside:avoid}
.crdoc .infoblock h3{margin:0 0 7px;font-size:11px;color:var(--blue);text-transform:uppercase;letter-spacing:.7px}
.crdoc .infoblock p{margin:0 0 6px;font-size:9.5px;line-height:1.55;color:#5b6a78}
.crdoc .infoblock ul{margin:0;padding-left:16px;color:#5b6a78;font-size:9.5px;line-height:1.55}
.crdoc[data-density="compact"] .infoblock{margin:10px 28px 0;padding:11px 13px}

/* densidade automática conforme a quantidade de voos */
.crdoc[data-density="medium"] .flight{padding:12px 16px}
.crdoc[data-density="medium"] section{padding-top:10px}
.crdoc[data-density="medium"] .journey{margin-bottom:10px}
.crdoc[data-density="medium"] .airport .datetime{margin-top:6px}
.crdoc[data-density="compact"] header{padding:16px 28px 14px}
.crdoc[data-density="compact"] .hero{padding:14px 28px 4px}
.crdoc[data-density="compact"] .hero-card{padding:14px}
.crdoc[data-density="compact"] .meta-grid{margin-top:12px;gap:10px 18px}
.crdoc[data-density="compact"] section{padding:9px 28px 0}
.crdoc[data-density="compact"] .flight{padding:9px 14px}
.crdoc[data-density="compact"] .journey{margin-bottom:8px}
.crdoc[data-density="compact"] .journey-title{padding:7px 14px}
.crdoc[data-density="compact"] .airport .datetime{margin-top:4px}
.crdoc[data-density="compact"] .baggage{margin-top:5px}
.crdoc[data-density="compact"] .passenger{padding:9px 14px}
.crdoc[data-density="compact"] .connection{padding:5px 12px}
.crdoc[data-density="compact"] .checks{margin-top:12px;padding-top:12px}
.crdoc[data-density="compact"] footer{margin-top:12px;padding:12px 28px 16px}

@media (max-width:720px){
  .crdoc{overflow-x:hidden}
  .crdoc .sheet{width:100%;max-width:calc(100% - 16px);border-radius:14px}
  .crdoc header{grid-template-columns:1fr;padding:18px 16px 14px;gap:14px}
  .crdoc .doc-title{text-align:left}
  .crdoc .doc-title h1{font-size:18px}
  .crdoc .value-card{padding:14px}
  .crdoc .value-card .price{font-size:23px}
  .crdoc .hero{grid-template-columns:1fr;padding:14px 16px 4px}
  .crdoc .hero-card{padding:14px}
  .crdoc .meta-grid{grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:14px}
  .crdoc .total-price{align-items:flex-start;flex-direction:column;gap:8px}
  .crdoc .price{font-size:22px}
  .crdoc section{padding:10px 16px 0}
  .crdoc .passenger{grid-template-columns:1fr 1fr;padding:12px 14px;gap:10px}
  .crdoc .passenger.nostatus{grid-template-columns:1fr 1fr}
  .crdoc .passenger .name{grid-column:1 / -1}
  .crdoc .flight{grid-template-columns:1fr;padding:14px}
  .crdoc .flight-info{border-left:0;border-top:1px solid var(--line);padding:10px 0 0}
  .crdoc .route{grid-template-columns:1fr 56px 1fr;gap:6px}
  .crdoc .airport .code{font-size:18px}
  .crdoc .ticket-row{grid-template-columns:1fr 1fr}
  .crdoc .ticket-row > div:nth-child(2n){border-right:0}
  .crdoc .notice,.crdoc .infoblock,.crdoc .checks{margin-left:16px;margin-right:16px}
  .crdoc footer{flex-direction:column;align-items:flex-start;gap:12px;padding:16px}
  .crdoc footer .page-note{text-align:left}
  .crdoc .locator strong{font-size:20px}
}

@media (max-width:420px){
  .crdoc .meta-grid{grid-template-columns:1fr}
  .crdoc .passenger{grid-template-columns:1fr}
  .crdoc .ticket-row{grid-template-columns:1fr}
  .crdoc .ticket-row > div{border-right:0;border-bottom:1px solid #e3efe9}
  .crdoc .brand-name{font-size:20px}
}


@page{size:A4 portrait;margin:8mm}
@media print{
  html,body{background:#fff;margin:0;padding:0}
  .no-print{display:none!important}
  .crdoc{font-size:11px}
  .crdoc .sheet{width:100%;max-width:none;box-shadow:none;border-radius:0;margin:0;overflow:visible}
  .crdoc *{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .crdoc header{padding:12px 20px 10px}
  .crdoc .brand img{height:34px;width:auto}
  .crdoc .doc-title h1{font-size:17px}
  .crdoc .hero{padding:10px 20px 4px;gap:10px}
  .crdoc .hero-card,.crdoc .value-card{padding:12px}
  .crdoc section{padding:8px 20px 0}
  .crdoc .flight{padding:8px 12px}
  .crdoc .journey{margin-bottom:8px}
  .crdoc .passenger{padding:8px 12px}
  .crdoc footer{margin-top:10px;padding:10px 20px 0}
  .crdoc .journey,.crdoc .flight,.crdoc .passenger,.crdoc .tickets,.crdoc .deadline,.crdoc .notice,.crdoc section,.crdoc footer{break-inside:avoid}
  .crdoc .sheet>*:last-child{margin-bottom:0;padding-bottom:0}
}
`;

/* ------------------------------- componente ------------------------------- */

export function ComprovanteReserva({ dados }: { dados: ComprovanteReservaDados }) {
  const eBilhete = dados.variante === "bilhete";
  const voos = dados.grupos.flatMap((g) => g.voos);
  const densidade = voos.length <= 2 ? "normal" : voos.length <= 4 ? "medium" : "compact";
  const bilhetes = dados.passageiros.filter((p) => (p.bilhete ?? "").trim().length > 0);
  const temPrazo = !eBilhete && !dados.emitido && !!dados.limiteEmissao;
  const mostraValorBilhete = eBilhete && !dados.ocultarValores;
  const heroSimples = eBilhete ? !mostraValorBilhete : !temPrazo && !dados.emitido;
  const numeroBilhete = bilhetes[0]?.bilhete ?? "";

  return (
    <div className="crdoc" id="comprovante-print" data-density={densidade}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <main className="sheet">
        <div className="brandbar" />

        <header>
          <a className="brand" href="https://viaair.tur.br" target="_blank" rel="noreferrer">
            <img src={logoViaAir.url} alt="VIA AIR" />
            <span className="brand-sub">Premium Travel</span>
          </a>
          <div className="doc-title">
            <h1>{eBilhete ? "Bilhete Eletrônico" : "Comprovante de Reserva"}</h1>
            <p>
              {eBilhete
                ? "E-ticket • documento de viagem emitido"
                : dados.emitido
                  ? "Confira os dados da sua viagem"
                  : "Confira os dados da sua viagem antes da emissão"}
            </p>
          </div>
        </header>

        <div className={`hero${heroSimples ? " single" : ""}`}>
          <div className="hero-card soft">
            <div className="eyebrow">
              {eBilhete ? "Número do bilhete" : "Reserva aérea"}
            </div>

            <div className="locator">
              <strong>{eBilhete ? numeroBilhete || dados.localizador : dados.localizador}</strong>
              <span className={`status ${dados.emitido ? "issued" : "reserved"}`}>
                {dados.emitido ? "Emitido" : "Reservado"}
              </span>
            </div>

            <div className="meta-grid">
              {eBilhete ? (
                <div>
                  <span>Localizador</span>
                  <div className="locator-pill">{dados.localizador}</div>
                </div>
              ) : null}
              {dados.companhia ? (
                <div>
                  <span>Companhia</span>
                  <b>{findAirline(dados.companhia)?.name ?? dados.companhia}</b>
                </div>
              ) : null}
              {eBilhete ? (
                bilhetes[0]?.emissao ? (
                  <div>
                    <span>Data de emissão</span>
                    <b>{dataBR(bilhetes[0].emissao)}</b>
                  </div>
                ) : null
              ) : dados.criadaEm ? (
                <div>
                  <span>Criada em</span>
                  <b>{dataHora(dados.criadaEm)}</b>
                </div>
              ) : null}
              <div>
                <span>Consultor</span>
                <b>{nomeProprio(dados.consultor) || "VIA AIR"}</b>
              </div>
              <div>
                <span>Origem</span>
                <b>
                  {cidadeDe(dados.origem) ? `${cidadeDe(dados.origem)} (${dados.origem})` : dados.origem}
                </b>
              </div>
              <div>
                <span>Destino final</span>
                <b>
                  {cidadeDe(dados.destino)
                    ? `${cidadeDe(dados.destino)} (${dados.destino})`
                    : dados.destino}
                </b>
              </div>
              <div>
                <span>Passageiros</span>
                <b>{resumoPassageiros(dados.passageiros)}</b>
              </div>
            </div>

            {dados.ocultarValores || eBilhete ? null : (
              <div className="total-price">
                <div>
                  <div className="price-label">Valor total da passagem</div>
                  <div className="price-note">
                    Valor total da reserva aérea para os passageiros informados.
                  </div>
                </div>
                <div className="price">{brl(dados.total)}</div>
              </div>
            )}
          </div>

          {mostraValorBilhete ? (
            <div className="value-card">
              <div className="price-label">Valor total do bilhete</div>
              <div className="price">{brl(dados.total)}</div>
              <div className="price-note">
                Valor total apresentado ao passageiro para este bilhete eletrônico.
              </div>
            </div>
          ) : null}

          {temPrazo ? (
            <div className="deadline">
              <div className="eyebrow">Prazo para emissão</div>
              <div className="time">{dataHora(dados.limiteEmissao)}</div>
              <small>
                A reserva possui prazo para emissão, porém tarifas e valores podem sofrer alterações a
                qualquer momento, inclusive antes do prazo indicado. Somente a emissão do bilhete
                garante a tarifa.
              </small>
            </div>
          ) : null}

          {dados.emitido && !eBilhete ? (
            <div className="deadline ok">
              <div className="eyebrow">Situação da reserva</div>
              <div className="time">Bilhetes emitidos</div>
              <small>
                A reserva está confirmada e os números dos bilhetes estão disponíveis neste
                comprovante.
              </small>
            </div>
          ) : null}
        </div>

        {dados.passageiros.length ? (
          <section>
            <div className="section-head">
              <h2>Passageiros</h2>
              <div className="hint">Confira a grafia exatamente como no documento de viagem</div>
            </div>
            {dados.passageiros.map((p, i) => (
              <div className={`passenger${eBilhete ? " nostatus" : ""}`} key={`${p.nome}-${i}`}>
                <div>
                  <div className="small-label">Nome completo</div>
                  <div className="name">{p.nome.toUpperCase()}</div>
                </div>
                <div>
                  <div className="small-label">Tipo</div>
                  <div className="small-value">{tipoPax(p.tipo)}</div>
                </div>
                <div>
                  <div className="small-label">
                    {p.documentoTipo === "passport" ? "Passaporte" : "CPF"}
                  </div>
                  <div className="small-value">{p.documento || "—"}</div>
                </div>
                <div>
                  <div className="small-label">Nascimento</div>
                  <div className="small-value">
                    {p.nascimento ? dataBR(p.nascimento) : "—"}
                  </div>
                </div>
                {eBilhete ? null : (
                  <div>
                    <div className="small-label">Status</div>
                    <div className="small-value">{dados.emitido ? "Emitido" : "Reservado"}</div>
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {dados.grupos.length ? (
        <section>
          <div className="section-head">
            <h2>Itinerário</h2>
            <div className="hint">Horários locais de cada aeroporto</div>
          </div>

          {dados.grupos.map((g, gi) => {
            const primeiro = g.voos[0];
            const ultimo = g.voos[g.voos.length - 1];
            if (!primeiro || !ultimo) return null;
            const periodo =
              diaMes(primeiro.partida) === diaMes(ultimo.chegada)
                ? diaMes(primeiro.partida)
                : `${diaMes(primeiro.partida)} – ${diaMes(ultimo.chegada)}`;
            return (
              <div className="journey" key={`${g.titulo}-${gi}`}>
                <div className="journey-title">
                  <strong>
                    {g.titulo} • {cidadeDe(primeiro.origem) || primeiro.origem} →{" "}
                    {cidadeDe(ultimo.destino) || ultimo.destino}
                  </strong>
                  <span>{periodo}</span>
                </div>

                {g.voos.map((v, vi) => (
                  <div key={`${v.numeroVoo}-${vi}`}>
                    {vi > 0 ? (
                      <div className="connection">{conexaoEntre(g.voos[vi - 1]!, v)}</div>
                    ) : null}
                    <div className="flight">
                      <div className="airline">
                        {findAirline(v.companhia)?.logo ? (
                          <img
                            src={findAirline(v.companhia)!.logo}
                            alt={findAirline(v.companhia)!.name}
                          />
                        ) : (
                          <div className="airline-code">
                            {findAirline(v.companhia)?.name ?? v.companhia}
                          </div>
                        )}
                        <span>
                          {`Voo ${numeroVooLimpo(v.companhia, v.numeroVoo)}`}
                          {v.classe ? " • Econômica" : ""}
                        </span>
                      </div>

                      <div>
                        <div className="route">
                          <div className="airport">
                            <div className="code">{v.origem}</div>
                            {cidadeDe(v.origem) ? <div className="city">{cidadeDe(v.origem)}</div> : null}
                            <div className="datetime">
                              {diaMes(v.partida)} • {hora(v.partida)}
                            </div>
                          </div>
                          <div className="line">
                            <div>{duracaoVoo(v)}</div>
                            <div className="bar" />
                          </div>
                          <div className="airport right">
                            <div className="code">{v.destino}</div>
                            {cidadeDe(v.destino) ? (
                              <div className="city">{cidadeDe(v.destino)}</div>
                            ) : null}
                            <div className="datetime">
                              {diaMes(v.chegada)} • {hora(v.chegada)}
                            </div>
                          </div>
                        </div>

                        <div className="baggage">
                          <Bagagem rotulo="Item pessoal" valor={v.bagagem.itemPessoal} />
                          <Bagagem rotulo="Bagagem de mão" valor={v.bagagem.mao} />
                          <Bagagem
                            rotulo={
                              v.bagagem.despachada && v.bagagem.despachadaQtd
                                ? `Bagagem despachada (${v.bagagem.despachadaQtd})`
                                : "Bagagem despachada"
                            }
                            valor={v.bagagem.despachada}
                          />
                        </div>
                      </div>

                      <div className="flight-info">
                        {v.classe ? (
                          <div>
                            Classe: <b>{v.classe}</b>
                          </div>
                        ) : null}
                        {v.familiaTarifaria ? (
                          <div>
                            Tarifa: <b>{v.familiaTarifaria}</b>
                          </div>
                        ) : null}
                        {v.aeronave ? (
                          <div>
                            Aeronave: <b>{v.aeronave}</b>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
        ) : null}

        {dados.outrasReservas?.length ? (
          <section>
            <div className="section-head">
              <h2>Demais reservas</h2>
              <div className="hint">Hospedagens, transfers e serviços do mesmo pedido</div>
            </div>
            {dados.outrasReservas.map((r, i) => (
              <div className="journey" key={`${r.titulo}-${i}`}>
                <div className="journey-title">
                  <strong>
                    {r.tipo} • {r.titulo}
                  </strong>
                  <span>{r.periodo || ""}</span>
                </div>
                <div className="flight" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="flight-info" style={{ borderLeft: 0, paddingLeft: 0 }}>
                    {r.localizador ? (
                      <div>
                        Localizador: <b>{r.localizador}</b>
                      </div>
                    ) : null}
                    {(r.detalhes ?? []).map((d, di) => (
                      <div key={di}>{d}</div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </section>
        ) : null}



        {!dados.emitido ? (
          <div className="notice">
            <div className="notice-icon">!</div>
            <div>
              <strong>Este documento é um comprovante de reserva — não é um bilhete aéreo.</strong>
              <p>
                A viagem ainda não está emitida. Confira cuidadosamente nomes, datas, aeroportos,
                horários e voos antes da emissão. Tarifas e valores podem sofrer alterações a qualquer
                momento. Somente a emissão do bilhete garante a tarifa.
              </p>
            </div>
          </div>
        ) : null}

        {bilhetes.length ? (
          <section>
            <div className="section-head">
              <h2>{eBilhete ? "Dados do bilhete" : "Bilhetes emitidos"}</h2>
            </div>
            <div className="tickets">
              <div className="ticket-row head">
                <div>Passageiro</div>
                <div>Número do bilhete</div>
                <div>Localizador</div>
                <div>Emissão</div>
              </div>
              {bilhetes.map((p, i) => (
                <div className="ticket-row body" key={`${p.bilhete}-${i}`}>
                  <div>{p.nome.toUpperCase()}</div>
                  <div>{p.bilhete}</div>
                  <div>{dados.localizadorCompanhia || dados.localizador}</div>
                  <div>{dataBR(p.emissao)}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {eBilhete ? (
          <>
            <div className="infoblock">
              <h3>Informações</h3>
              <p>
                Os voos são válidos apenas para utilização nas datas e horários reservados e
                emitidos. Em caso de alteração voluntária, estão sujeitos às condições impostas pela
                companhia aérea e pela regra tarifária.
              </p>
              <p>
                O transporte aéreo aqui contratado está sujeito às condições gerais de transporte e
                às demais legislações aplicáveis. Algumas tarifas não permitem alterações e/ou
                reembolso após a compra. Caso julgue necessário ter esta informação, consulte a VIA
                AIR para conhecer as condições da sua tarifa.
              </p>
              <p>
                O não comparecimento para o embarque (no-show) em qualquer voo cancela os voos
                subsequentes. Em alguns casos, perde-se o bilhete, impossibilitando alteração e/ou
                reembolso.
              </p>
            </div>
            <div className="infoblock">
              <h3>Informações para embarque</h3>
              <ul>
                <li>Apresente-se no check-in com 2 horas de antecedência em voos nacionais e com 3 horas de antecedência em voos internacionais.</li>
                <li>Leve documento original de identificação para voos nacionais.</li>
                <li>Para voos internacionais, leve passaporte original e os vistos necessários para entrada no país de destino.</li>
                <li>Informações sobre validade de passaporte, vacinas e vistos que possam ser necessários para sua viagem devem ser consultadas com as respectivas embaixadas ou despachantes de vistos.</li>
                <li>Verifique essa necessidade para todos os países envolvidos na viagem, mesmo aqueles em que houver apenas escala. Alguns países exigem passaporte com validade mínima de 6 meses para embarque.</li>
              </ul>
            </div>
          </>
        ) : (
          <div className="checks">
            <h3>Antes de viajar</h3>
            <ul>
              <li>Confira dados do passageiro, datas, aeroportos e horários.</li>
              <li>Tarifas e valores podem sofrer alterações até que o bilhete seja efetivamente emitido.</li>
              <li>Regras de alteração, cancelamento e reembolso dependem da tarifa adquirida.</li>
              <li>Bagagem está sujeita às regras da tarifa e da companhia aérea.</li>
              <li>Documentos, vistos, vacinas e requisitos migratórios devem ser conferidos pelo viajante.</li>
            </ul>
          </div>
        )}

        <footer>
          <div className="contact">
            <strong>VIA AIR • Premium Travel</strong>
            <br />
            Atendimento humano antes, durante e depois da sua viagem.
            <br />
            viaair.tur.br
          </div>
          <div className="page-note">
            {eBilhete ? "Bilhete eletrônico • E-ticket" : `Localizador ${dados.localizador}`}
            <br />
            Documento gerado em {dataBR(new Date().toISOString())}
          </div>
        </footer>
      </main>
    </div>
  );
}

function Bagagem({ rotulo, valor }: { rotulo: string; valor: boolean | null }) {
  if (valor === null || valor === undefined) {
    return <div className="bag">{rotulo}: informação não disponível</div>;
  }
  return <div className={`bag${valor ? "" : " no"}`}>{valor ? "✓" : "×"} {rotulo}</div>;
}
