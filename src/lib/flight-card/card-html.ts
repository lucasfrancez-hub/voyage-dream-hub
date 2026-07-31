/**
 * Gera o HTML do cartão de opção de voo (arte enviada no WhatsApp).
 * Puro: sem imports server-only, usado tanto na rota pública quanto no preview.
 */
import { findAirline } from "@/lib/airlines";
import viaairLogo from "@/assets/viaair-logo.png.asset.json";

export type FlightCardPlace = {
  hora: string; // "03:50"
  iata: string;
  cidade: string;
  aeroporto: string;
  mais_dias?: number; // +1
};

export type FlightCardLeg = {
  rotulo: string; // "IDA" | "VOLTA"
  cia: string; // nome
  cia_iata?: string | null;
  voo: string; // "G3 1787"
  duracao: string; // "8h20"
  paradas: number;
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
const BLUE = "#2563EB";


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
  if (!n) return "DIRETO";
  return n === 1 ? "1 PARADA" : `${n} PARADAS`;
}

function planeIcon(rot: number, color: string, size = 26): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" style="transform:rotate(${rot}deg)"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
}

function legBlock(leg: FlightCardLeg, base: string, i: number): string {
  const logo = abs(base, findAirline(leg.cia_iata || leg.cia)?.logo);
  const accent = i ? ORANGE : BLUE;
  const plus = leg.chegada.mais_dias ? `<sup class="plus">+${leg.chegada.mais_dias}</sup>` : "";
  const direto = !leg.paradas;
  const marker = direto
    ? `<div class="marker">${planeIcon(90, accent, 24)}</div>`
    : `<div class="marker"><i class="ring" style="border-color:${accent}"></i></div>`;
  return `
  <div class="leg">
    <div class="leg-head">
      <div class="leg-id">
        <i class="bul" style="background:${accent}"></i>
        <span>${esc(leg.rotulo)} &bull; ${esc(leg.cia)}</span>
        ${logo ? `<img class="logo" src="${esc(logo)}" alt="${esc(leg.cia)}"/>` : ""}
      </div>
      <div class="chips">
        <span class="chip">${esc(leg.voo)}</span>
        <span class="chip">${esc(leg.duracao)}</span>
      </div>
    </div>
    <div class="leg-body">
      <div class="side">
        <div class="time">${esc(leg.partida.hora)}</div>
        <div class="iata">${esc(leg.partida.iata)}</div>
        <div class="city">${esc(leg.partida.cidade)}</div>
      </div>
      <div class="mid">
        <div class="stops" style="color:${accent}">${stopsLabel(leg.paradas)}</div>
        <div class="track">${marker}</div>
        ${leg.familia ? `<div class="fam">${esc(leg.familia)}</div>` : ""}
      </div>
      <div class="side right">
        <div class="time">${esc(leg.chegada.hora)}${plus}</div>
        <div class="iata">${esc(leg.chegada.iata)}</div>
        <div class="city">${esc(leg.chegada.cidade)}</div>
      </div>
    </div>
    <div class="bag">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#93a1b5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/><rect x="4" y="6" width="16" height="14" rx="2.5"/></svg>
      <span>${esc(leg.bagagem)}</span>
    </div>
  </div>`;
}

export function renderFlightCardHtml(d: FlightCardData, baseUrl: string): string {
  const logo = abs(baseUrl, viaairLogo.url);
  const rota = `${esc(d.origem_iata)} → ${esc(d.destino_iata)}`;
  const datas = d.data_volta ? `${esc(d.data_ida)} - ${esc(d.data_volta)}` : esc(d.data_ida);

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:900px;background:#f1f5f9;padding:40px;font-family:Inter,system-ui,sans-serif;color:${NAVY};-webkit-font-smoothing:antialiased}
.card{width:820px;background:#fff;border-radius:56px;overflow:hidden;border:1px solid #eef2f7;box-shadow:0 40px 90px rgba(15,23,42,.18)}
.head{display:flex;align-items:center;justify-content:space-between;padding:44px 52px 24px}
.head img{height:60px;object-fit:contain}
.head .name{font-size:40px;font-weight:900;letter-spacing:-1.5px;font-style:italic;color:#0f172a}
.head .name span{color:${ORANGE}}
.badge{display:flex;align-items:center;gap:10px;background:#eff6ff;border:1px solid #dbeafe;border-radius:999px;padding:12px 22px}
.badge i{width:10px;height:10px;border-radius:50%;background:${BLUE}}
.badge span{font-size:16px;font-weight:800;color:#1d4ed8;letter-spacing:2px}
.trip{padding:0 52px 8px;display:flex;align-items:baseline;justify-content:space-between}
.trip .r{font-size:34px;font-weight:900;letter-spacing:-1px}
.trip .dt{font-size:20px;font-weight:700;color:#94a3b8}
.leg{padding:30px 52px 8px}
.leg + .leg{border-top:1px dashed #e2e8f0;margin-top:14px;padding-top:34px}
.leg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.leg-id{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:800;color:#94a3b8;letter-spacing:2px;text-transform:uppercase}
.leg-id .bul{width:12px;height:12px;border-radius:50%}
.leg-id .logo{height:30px;max-width:110px;object-fit:contain}
.chips{display:flex;gap:10px}
.chip{font-size:17px;font-weight:700;color:#64748b;background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:6px 14px}
.leg-body{display:flex;align-items:center;justify-content:space-between}
.side{min-width:190px}
.side.right{text-align:right}
.time{font-size:60px;font-weight:900;letter-spacing:-2px;line-height:1;color:#0f172a}
.plus{font-size:24px;color:${ORANGE};font-weight:800;vertical-align:super}
.iata{font-size:22px;font-weight:800;color:#94a3b8;letter-spacing:2px;margin-top:8px}
.city{font-size:18px;color:#b0bccc;margin-top:2px}
.mid{flex:1;padding:0 26px;text-align:center}
.stops{font-size:16px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px}
.track{position:relative;height:3px;background:#eef2f7;border-radius:2px}
.marker{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;padding:0 10px;display:flex;align-items:center;justify-content:center}
.ring{display:block;width:16px;height:16px;border-radius:50%;border:4px solid;background:#fff}
.fam{margin-top:12px;font-size:15px;font-weight:700;color:#b0bccc;letter-spacing:2px}
.bag{margin-top:26px;display:flex;align-items:center;gap:14px;background:#f8fafc;border:1px solid #eef2f7;border-radius:22px;padding:16px 22px}
.bag span{font-size:18px;font-weight:600;color:#64748b}
.foot{margin-top:34px;background:#0f172a;padding:46px 52px 40px;text-align:center}
.foot .lab{font-size:16px;font-weight:800;letter-spacing:4px;color:#94a3b8;text-transform:uppercase}
.price{margin-top:14px;display:flex;align-items:baseline;justify-content:center;gap:6px;color:${ORANGE}}
.price .cur{font-size:26px;font-weight:800}
.price .val{font-size:76px;font-weight:900;letter-spacing:-3px}
.pax{margin-top:6px;font-size:17px;color:#64748b;font-weight:600}
.split{margin-top:30px;padding-top:26px;border-top:1px solid rgba(148,163,184,.22);display:flex;align-items:center;justify-content:space-between}
.split .l{font-size:15px;font-weight:800;letter-spacing:3px;color:#64748b;text-transform:uppercase}
.split .v{font-size:19px;font-weight:800;color:#e2e8f0}
.seal{margin-top:18px;font-size:15px;color:#64748b;font-weight:600;letter-spacing:1px}
</style></head>
<body><div class="card">
  <div class="head">
    <div class="name">VIA<span>AIR</span></div>
    <div class="badge"><i></i><span>VERIFICADO</span></div>
  </div>
  <div class="trip"><div class="r">${rota}</div><div class="dt">${datas}</div></div>
  ${d.legs.map((l, i) => legBlock(l, baseUrl, i)).join("")}
  <div class="foot">
    <div class="lab">Valor total ${esc(d.pax_label)}</div>
    <div class="price"><span class="cur">R$</span><span class="val">${esc(d.total_formatado.replace(/^R\$\s*/, ""))}</span></div>
    ${
      d.parcelas && d.parcela_formatada
        ? `<div class="split"><span class="l">Parcelamento</span><span class="v">${d.parcelas}x de ${esc(d.parcela_formatada)}</span></div>`
        : ""
    }
    <div class="seal">Compra 100% segura &bull; VIA AIR</div>
  </div>
</div></body></html>`;
}


function moneyIcon(): string {
  return `<svg viewBox="0 0 24 24" width="32" height="32" fill="#fff"><path d="M12 2a1 1 0 0 1 1 1v1.1c1.9.3 3.2 1.5 3.3 3.2h-2.1c-.1-.8-.9-1.4-2.2-1.4-1.3 0-2.1.5-2.1 1.3 0 .7.5 1.1 2.3 1.5l.9.2c2.5.5 3.6 1.5 3.6 3.3 0 1.9-1.4 3.1-3.7 3.4V17a1 1 0 1 1-2 0v-1.4c-2-.3-3.4-1.5-3.5-3.4h2.1c.1 1 1 1.6 2.5 1.6 1.4 0 2.3-.6 2.3-1.4 0-.7-.5-1.1-2.1-1.4l-1-.2C9 10.2 7.9 9.2 7.9 7.5c0-1.8 1.3-3 3.1-3.4V3a1 1 0 0 1 1-1z"/></svg>`;
}
function creditIcon(): string {
  return `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fff" stroke-width="1.9"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M5.5 15h4"/></svg>`;
}
function shieldIcon(): string {
  return `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fff" stroke-width="1.9"><path d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z"/><path d="M9 12.2l2.2 2.2L15.5 10"/></svg>`;
}
