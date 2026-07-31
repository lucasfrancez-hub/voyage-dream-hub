/**
 * Gera o HTML do cartão de opção de voo (arte enviada no WhatsApp).
 * Puro: sem imports server-only, usado tanto na rota pública quanto no preview.
 */
import { findAirline } from "@/lib/airlines";
import viaairLogo from "@/assets/viaair-logo-white.png.asset.json";

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
  return n === 1 ? "1 CONEXÃO" : `${n} CONEXÕES`;
}

function planeIcon(rot: number): string {
  return `<svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" style="transform:rotate(${rot}deg)"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
}

function legBlock(leg: FlightCardLeg, base: string, i: number): string {
  const logo = abs(base, findAirline(leg.cia_iata || leg.cia)?.logo);
  const plus = leg.chegada.mais_dias ? `<sup class="plus">+${leg.chegada.mais_dias}</sup>` : "";
  return `
  <div class="leg${i ? " leg-b" : ""}">
    <div class="tag">${planeIcon(i ? 20 : -20)}<span>${esc(leg.rotulo)}</span></div>
    <div class="side">
      <div class="time">${esc(leg.partida.hora)}</div>
      <div class="iata">${esc(leg.partida.iata)}</div>
      <div class="city">${esc(leg.partida.cidade)}</div>
      <div class="apt">${esc(leg.partida.aeroporto)}</div>
    </div>
    <div class="carrier">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="${esc(leg.cia)}"/>` : ""}
      <div class="cia">${esc(leg.cia)}</div>
      <div class="voo">${esc(leg.voo)}</div>
    </div>
    <div class="mid">
      <div class="dur">${esc(leg.duracao)}</div>
      <div class="line"><i class="dot"></i><span class="pill">${stopsLabel(leg.paradas)}</span><i class="dot"></i></div>
      ${leg.familia ? `<div class="fam">${esc(leg.familia)}</div>` : ""}
    </div>
    <div class="side right">
      <div class="time">${esc(leg.chegada.hora)}${plus}</div>
      <div class="iata">${esc(leg.chegada.iata)}</div>
      <div class="city">${esc(leg.chegada.cidade)}</div>
      <div class="apt">${esc(leg.chegada.aeroporto)}</div>
    </div>
    <div class="bag">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="${NAVY}" stroke-width="1.7"><path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6"/><rect x="4" y="6" width="16" height="14" rx="2.5"/></svg>
      <div class="bag-t">${esc(leg.bagagem)}</div>
    </div>
  </div>`;
}

export function renderFlightCardHtml(d: FlightCardData, baseUrl: string): string {
  const logo = abs(baseUrl, viaairLogo.url);
  const parcela =
    d.parcelas && d.parcela_formatada
      ? `<div class="f-item"><div class="f-ico">${creditIcon()}</div><div><div class="f-lab">PARCELE EM ATÉ</div><div class="f-big">${d.parcelas}x</div><div class="f-sub">de ${esc(d.parcela_formatada)} sem juros</div></div></div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1200px;background:#fff;font-family:Poppins,system-ui,sans-serif;color:${NAVY};-webkit-font-smoothing:antialiased}
.card{width:1200px;border-radius:34px;overflow:hidden;box-shadow:0 24px 60px rgba(11,37,69,.16);border:1px solid #eef1f5}
.head{display:flex;align-items:stretch;background:#fff;height:150px}
.brand{position:relative;width:300px;flex:none;background:${NAVY};display:flex;flex-direction:column;justify-content:center;padding:0 34px;color:#fff}
.brand:after{content:"";position:absolute;right:-58px;top:0;bottom:0;width:120px;background:${NAVY};transform:skewX(-14deg)}
.brand img{height:46px;object-fit:contain;object-position:left}
.brand .tagline{margin-top:8px;font-size:15px;opacity:.9;white-space:nowrap}
.route{flex:1;display:flex;align-items:center;justify-content:center;gap:22px;padding-left:90px;min-width:0;position:relative;z-index:1}
.route .r-city{font-size:34px;font-weight:800;line-height:1.05;text-align:center;max-width:200px}
.route .r-iata{font-size:19px;font-weight:600;letter-spacing:2px;text-align:center;color:#8b98ac;margin-top:4px}
.route .circle{width:62px;height:62px;flex:none;border-radius:50%;background:${NAVY};display:flex;align-items:center;justify-content:center}
.dates{display:flex;align-items:center;gap:14px;flex:none;padding:0 32px 0 18px}
.dates .cal{width:46px;height:46px;border:3px solid ${ORANGE};border-radius:10px;position:relative}
.dates .cal:before{content:"";position:absolute;left:0;right:0;top:8px;height:3px;background:${ORANGE}}
.dates .d-row{font-size:20px;font-weight:700;letter-spacing:.5px;white-space:nowrap}
.dates .d-row span{color:${ORANGE};display:inline-block;min-width:82px}
.leg{display:grid;grid-template-columns:120px 1fr 1fr 1fr 1fr 170px;align-items:center;border-top:1px solid #edf0f4;min-height:200px}
.leg-b{border-top:1px solid #edf0f4}
.tag{align-self:stretch;background:${ORANGE};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-weight:700;letter-spacing:1px;font-size:17px}
.side{padding:0 16px}
.side.right{text-align:right}
.time{font-size:46px;font-weight:800;line-height:1.05}
.plus{font-size:22px;color:${ORANGE};font-weight:700;vertical-align:super}
.iata{font-size:28px;font-weight:700;color:${ORANGE};margin-top:2px}
.city{font-size:18px;color:#42526b}
.apt{font-size:16px;color:#7b8aa0}
.carrier{text-align:center;padding:0 10px}
.carrier .logo{height:42px;max-width:150px;object-fit:contain;margin-bottom:8px}
.cia{font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.voo{font-size:16px;color:#8b98ac;margin-top:2px}
.mid{text-align:center;padding:0 10px}
.dur{font-size:22px;font-weight:600;color:#42526b}
.line{display:flex;align-items:center;justify-content:center;gap:8px;margin:10px 0 8px}
.line .dot{width:12px;height:12px;border-radius:50%;background:${ORANGE}}
.pill{background:${NAVY};color:#fff;border-radius:999px;padding:7px 16px;font-size:15px;font-weight:600;letter-spacing:.6px}
.fam{font-size:16px;color:#9aa6b8;letter-spacing:1px}
.bag{border-left:1px solid #edf0f4;height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.bag-t{font-size:16px;text-align:center;line-height:1.25;max-width:130px}
.footer{display:flex;align-items:center;background:#f4f6f9;padding:26px 34px;gap:26px}
.f-item{flex:1;display:flex;align-items:center;gap:16px;border-right:1px solid #e2e7ee}
.f-item:last-child{border-right:0}
.f-ico{width:64px;height:64px;border-radius:50%;background:${NAVY};display:flex;align-items:center;justify-content:center;flex:none}
.f-lab{font-size:15px;font-weight:600;letter-spacing:1px;color:#42526b}
.f-big{font-size:36px;font-weight:800;color:${ORANGE};line-height:1.1}
.f-sub{font-size:15px;color:#6b7a90}
.bar{background:${NAVY};color:#fff;display:flex;align-items:center;gap:20px;padding:20px 34px;font-size:19px}
.bar b{font-weight:700}
.bar .sep{width:1px;height:26px;background:rgba(255,255,255,.3)}
.bar .soft{opacity:.85;font-size:17px}
</style></head>
<body><div class="card">
  <div class="head">
    <div class="brand">${logo ? `<img src="${esc(logo)}" alt="VIA AIR"/>` : `<div style="font-size:38px;font-weight:800">VIA AIR</div>`}<div class="tagline">Sua viagem, do seu jeito.</div></div>
    <div class="route">
      <div><div class="r-city">${esc(d.origem_cidade || d.origem_iata)}</div><div class="r-iata">${esc(d.origem_iata)}</div></div>
      <div class="circle">${planeIcon(0)}</div>
      <div><div class="r-city">${esc(d.destino_cidade || d.destino_iata)}</div><div class="r-iata">${esc(d.destino_iata)}</div></div>
    </div>
    <div class="dates">
      <div class="cal"></div>
      <div>
        <div class="d-row"><span>IDA</span>${esc(d.data_ida)}</div>
        ${d.data_volta ? `<div class="d-row"><span>VOLTA</span>${esc(d.data_volta)}</div>` : ""}
      </div>
    </div>
  </div>
  ${d.legs.map((l, i) => legBlock(l, baseUrl, i)).join("")}
  <div class="footer">
    <div class="f-item"><div class="f-ico">${moneyIcon()}</div><div><div class="f-lab">VALOR FINAL</div><div class="f-big">${esc(d.total_formatado)}</div><div class="f-sub">${esc(d.pax_label)}</div></div></div>
    ${parcela}
    <div class="f-item"><div class="f-ico">${shieldIcon()}</div><div><div class="f-lab" style="font-size:17px;color:${NAVY}">COMPRA 100% SEGURA</div><div class="f-sub">Seus dados protegidos</div></div></div>
  </div>
  <div class="bar"><b>Atendimento inteligente VIA AIR</b><div class="sep"></div><span class="soft">Agilidade, segurança e as melhores opções para você.</span></div>
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
