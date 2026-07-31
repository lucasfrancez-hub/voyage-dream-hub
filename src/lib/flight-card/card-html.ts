/**
 * Gera o HTML do cartão de opção de voo (arte enviada no WhatsApp).
 * Layout vertical "v2" (aprovado): cabeçalho VIA AIR + rota, um bloco por trecho
 * e rodapé escuro com valor total e parcelamento.
 * Puro: sem imports server-only, usado tanto na rota pública quanto no preview.
 */
import { findAirline } from "@/lib/airlines";

export type FlightCardPlace = {
  hora: string; // "03:50"
  iata: string;
  cidade: string;
  aeroporto: string;
  mais_dias?: number; // +1
};

export type FlightCardLeg = {
  rotulo: string; // "IDA" | "VOLTA"
  data?: string | null; // "10/09" – data desse trecho
  cia: string; // nome
  cia_iata?: string | null;
  voo: string; // "G3 1787"
  duracao: string; // "8h20"
  paradas: number;
  escalas?: string | null; // "BSB (1h10)"
  familia?: string | null; // "LIGHT"
  bagagem: string; // "10kg inclusa" | "só de mão"
  partida: FlightCardPlace;
  chegada: FlightCardPlace;
};

export type FlightCardData = {
  origem_iata: string;
  origem_cidade: string;
  destino_iata: string;
  destino_cidade: string;
  data_ida: string; // "10/08"
  data_volta?: string | null; // "15/08"
  total_formatado: string;
  pax_label: string; // "1 PAX"
  parcelas?: number | null;
  parcela_formatada?: string | null;
  legs: FlightCardLeg[];
};

const NAVY = "#0B2545";
const ORANGE = "#F26B1F";
const BLUE = "#1F6FEB";

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function abs(base: string, url: string | undefined): string | null {
  if (!url) return null;
  if (/^https?:/i.test(url)) return url;
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

function stopsLabel(n: number): string {
  if (!n) return "VOO DIRETO";
  return n === 1 ? "1 PARADA" : `${n} PARADAS`;
}

/** Um trecho (ida ou volta). */
function legBlock(leg: FlightCardLeg, base: string, i: number): string {
  const logo = abs(base, findAirline(leg.cia_iata || leg.cia)?.logo);
  const plus = leg.chegada.mais_dias ? `<sup class="plus">+${leg.chegada.mais_dias}</sup>` : "";
  const cor = i ? ORANGE : BLUE;
  return `
  <div class="leg${i ? " leg-b" : ""}">
    <div class="leg-top">
      <div class="leg-tag"><i style="background:${cor}"></i>${esc(leg.rotulo)}${leg.data ? ` &middot; <b class="leg-date">${esc(leg.data)}</b>` : ""} &middot; ${esc(leg.cia)}
        ${logo ? `<img class="cia-logo" src="${esc(logo)}" alt="${esc(leg.cia)}"/>` : ""}
      </div>
      <div class="chips"><span class="chip">${esc(leg.voo)}</span><span class="chip">${esc(leg.duracao)}</span></div>
    </div>
    <div class="leg-mid">
      <div class="pt">
        <div class="time">${esc(leg.partida.hora)}</div>
        <div class="iata">${esc(leg.partida.iata)}</div>
        <div class="city">${esc(leg.partida.cidade)}</div>
      </div>
      <div class="path">
        <div class="stops" style="color:${cor}">${stopsLabel(leg.paradas)}</div>
        <div class="track"><span class="bullet" style="border-color:${cor}"></span></div>
        <div class="scale">${esc(leg.escalas || leg.familia || "")}</div>
      </div>
      <div class="pt right">
        <div class="time">${esc(leg.chegada.hora)}${plus}</div>
        <div class="iata">${esc(leg.chegada.iata)}</div>
        <div class="city">${esc(leg.chegada.cidade)}</div>
      </div>
    </div>
    <div class="bag">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#7b8aa0" stroke-width="1.7"><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/><rect x="4" y="6" width="16" height="14" rx="2.5"/></svg>
      <span>${esc(leg.bagagem)}</span>
    </div>
  </div>`;
}

export function renderFlightCardHtml(d: FlightCardData, baseUrl: string): string {
  const datas = d.data_volta ? `${esc(d.data_ida)} - ${esc(d.data_volta)}` : esc(d.data_ida);
  const parcela =
    d.parcelas && d.parcela_formatada
      ? `<div class="pay"><span>PARCELAMENTO</span><b>${d.parcelas}x de ${esc(d.parcela_formatada)}</b></div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:820px;max-width:820px;overflow-x:hidden;background:#fff}
body{font-family:Poppins,system-ui,sans-serif;color:${NAVY};-webkit-font-smoothing:antialiased}
.card{width:820px;background:#fff;overflow:hidden}
.head{padding:36px 52px 0}
.head-top{display:flex;align-items:center;justify-content:space-between}
.brand{height:52px;width:auto;object-fit:contain;display:block}
.leg-date{font-weight:800;color:#42526b}
.verified{display:flex;align-items:center;gap:10px;background:#eaf1fe;color:${BLUE};border-radius:999px;padding:12px 24px;font-size:16px;font-weight:700;letter-spacing:1.2px}
.verified i{width:10px;height:10px;border-radius:50%;background:${BLUE}}
.route{display:flex;align-items:flex-end;justify-content:space-between;margin-top:34px}
.route .r{font-size:40px;font-weight:800;letter-spacing:-.5px}
.route .r em{font-style:normal;color:#8b98ac;font-weight:600;padding:0 8px}
.route .dt{font-size:22px;color:#8b98ac;font-weight:500}
.leg{padding:34px 52px 0}
.leg-b{border-top:1px dashed #e3e8ef;margin-top:34px}
.leg-top{display:flex;align-items:center;justify-content:space-between}
.leg-tag{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5c6b82}
.leg-tag i{width:12px;height:12px;border-radius:50%;flex:none}
.cia-logo{height:26px;max-width:90px;object-fit:contain}
.chips{display:flex;gap:12px}
.chip{background:#f3f6fa;border-radius:12px;padding:9px 18px;font-size:17px;font-weight:600;color:#42526b}
.leg-mid{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:20px}
.pt{min-width:170px}
.pt.right{text-align:right}
.time{font-size:56px;font-weight:800;line-height:1}
.plus{font-size:24px;color:${ORANGE};font-weight:800;vertical-align:super}
.iata{font-size:26px;font-weight:600;color:#5c6b82;margin-top:8px}
.city{font-size:19px;color:#94a1b2;margin-top:2px}
.path{flex:1;text-align:center}
.stops{font-size:17px;font-weight:700;letter-spacing:1.4px}
.track{position:relative;height:2px;background:#e3e8ef;margin:16px 0 14px}
.bullet{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid ${ORANGE}}
.scale{font-size:17px;color:#94a1b2;letter-spacing:1px}
.bag{display:flex;align-items:center;gap:14px;background:#f6f8fb;border-radius:18px;padding:20px 24px;margin-top:26px;font-size:20px;color:#42526b}
.foot{background:${NAVY};color:#fff;margin-top:34px;padding:40px 52px 34px;text-align:center}
.foot .lab{font-size:18px;font-weight:700;letter-spacing:3px;color:#8fa2bd}
.foot .price{margin-top:14px;font-size:78px;font-weight:800;color:${ORANGE};line-height:1}
.foot .price small{font-size:34px;font-weight:700;vertical-align:super;margin-right:6px}
.pay{display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,.14);margin-top:32px;padding-top:24px;font-size:19px}
.pay span{color:#8fa2bd;font-weight:600;letter-spacing:2px}
.pay b{font-weight:700}
.safe{margin-top:20px;font-size:17px;color:#8fa2bd}
</style></head>
<body><div class="card">
  <div class="head">
    <div class="head-top">
      <img class="brand" src="${esc(abs(baseUrl, LOGO_URL) || "")}" alt="VIA AIR"/>
      <div class="verified"><i></i>VERIFICADO</div>
    </div>
    <div class="route">
      <div class="r">${esc(d.origem_iata)}<em>&rarr;</em>${esc(d.destino_iata)}</div>
      <div class="dt">${datas}</div>
    </div>
  </div>
  ${d.legs.map((l, i) => legBlock(l, baseUrl, i)).join("")}
  <div class="foot">
    <div class="lab">VALOR TOTAL ${esc(d.pax_label)}</div>
    <div class="price">${esc(d.total_formatado).replace(/^R\$\s*/, '<small>R$</small>')}</div>
    ${parcela}
    <div class="safe">Compra 100% segura &bull; VIA AIR</div>
  </div>
</div></body></html>`;
}
