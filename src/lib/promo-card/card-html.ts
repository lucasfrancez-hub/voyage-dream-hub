/**
 * Templates APROVADOS dos cards de promoção aérea (Feed 4:5 e Story 9:16).
 * O HTML/CSS abaixo é o design aprovado — aqui só trocamos os textos fixos
 * por variáveis. NÃO redesenhar.
 */
import viaairLogo from "@/assets/viaair-logo.png.asset.json";
import viaairLogoWhite from "@/assets/viaair-logo-white.png.asset.json";
import viaairLogoBlack from "@/assets/viaair-logo-black.png.asset.json";
import type { PromoCardData, PromoCardFormat, PromoLogoVariant } from "./card-data";

/** Arquivos oficiais das três versões da logo (sem filtros CSS). */
export const VIAAIR_LOGOS: Record<PromoLogoVariant, string> = {
  color: viaairLogo.url,
  white: viaairLogoWhite.url,
  black: viaairLogoBlack.url,
};

const MESES_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

/** "12 de agosto de 2026" a partir da data real de coleta da tarifa. */
export function dataTarifaPorExtenso(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  let y: number, mo: number, da: number;
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); da = Number(m[3]);
  } else {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; da = dt.getUTCDate();
  }
  const nome = MESES_PT[mo - 1];
  if (!nome) return null;
  return `${da} de ${nome} de ${y}`;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const abs = (base: string, url?: string | null) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
};

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brlFull = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Regra de cor do destino: última palavra laranja, anteriores brancas. */
export function destinationParts(name: string): { prefix: string; last: string } {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { prefix: "", last: words[0] ?? "" };
  return { prefix: words.slice(0, -1).join(" "), last: words[words.length - 1]! };
}

/** CSS aprovado v24 (Feed/Story). Não redesenhar. */
const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;background:#07141b;font-family:Arial,Helvetica,sans-serif;color:#f7fbff}
:root{--orange:#ff861b;--orange2:#ff9f3f;--muted:#a7b7c0;--line:rgba(255,255,255,.11);--panel:rgba(5,28,38,.86);--green:#2ed47a;--blue:#2f7fb5}
body{display:grid;place-items:center;min-height:100vh;padding:0}
.frame{position:relative;overflow:hidden;background:linear-gradient(135deg,#0b3850,#0c2740 52%,#081820)}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.veil{position:absolute;inset:0;z-index:1;background:
linear-gradient(180deg,rgba(2,17,28,.16),rgba(2,17,28,.60) 48%,rgba(4,14,18,.98)),
radial-gradient(circle at 80% 12%,rgba(255,134,27,.18),transparent 24%)}
.frame > *:not(.photo):not(.veil):not(.price-box){position:relative;z-index:2}
.price-box{z-index:3}
.brand{display:flex;align-items:flex-start;justify-content:space-between}
.logo-slot{width:440px;height:190px;display:flex;align-items:center;justify-content:flex-start;padding:0}
.logo-slot img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35))}
.logo-placeholder{font-size:12px;letter-spacing:2px;font-weight:800;color:rgba(255,255,255,.48)}
.seal-wrap{display:flex;align-items:center;gap:16px}
.cards-seal{width:146px;height:146px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.32))}
.offer-seal{width:146px;height:146px;filter:drop-shadow(0 10px 22px rgba(0,0,0,.30))}
svg{display:block;width:100%;height:100%}
.kicker{font-size:18px;letter-spacing:3px;text-transform:uppercase;color:var(--orange);font-weight:800}
.category-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.category-badge{display:inline-flex;align-items:center;padding:8px 14px;border-radius:10px;background:rgba(255,134,27,.24);border:1px solid rgba(255,163,84,.40);color:#ffd9b8;font-size:15px;font-weight:950;letter-spacing:1.5px;backdrop-filter:blur(12px) saturate(120%);-webkit-backdrop-filter:blur(12px) saturate(120%);box-shadow:0 8px 20px rgba(0,0,0,.14)}
.found-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:rgba(41,163,91,.20);border:1px solid rgba(74,222,128,.40);color:#dffbea;font-size:14px;font-weight:850;backdrop-filter:blur(12px) saturate(125%);-webkit-backdrop-filter:blur(12px) saturate(125%);box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 8px 20px rgba(0,0,0,.14)}
.found-dot{width:8px;height:8px;border-radius:50%;background:#35d07f;box-shadow:0 0 10px rgba(53,208,127,.75)}
.route-glass{display:inline-flex;flex-direction:column;gap:8px;margin-top:18px;padding:17px 22px;border-radius:18px;background:rgba(5,28,38,.34);border:1px solid rgba(255,255,255,.26);backdrop-filter:blur(28px) saturate(150%);-webkit-backdrop-filter:blur(28px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 12px 32px rgba(0,0,0,.28);max-width:100%}
.destination{font-weight:950;line-height:1.0;padding-top:.06em;text-transform:uppercase;letter-spacing:-2px;margin-bottom:24px;text-shadow:0 10px 28px rgba(0,0,0,.48),0 3px 6px rgba(0,0,0,.35)}
.destination-one-line{display:flex;flex-direction:row;align-items:baseline;gap:.20em;white-space:nowrap;max-width:calc(100% - 48px);width:max-content;padding-right:8px;transform-origin:left center}
.destination-one-line .dest-prefix{color:#fff}
.destination-one-line .dest-highlight{color:var(--orange)}
.route-city{display:flex;align-items:center;gap:14px;font-size:46px;font-weight:950;color:#fff;max-width:100%}
.route-city span{white-space:nowrap}
.route-city .arrow{color:var(--orange);font-size:28px;flex:none}
.route-iata{font-size:21px;color:#c9d5db;margin-top:4px;letter-spacing:1.2px}
.details{margin-top:38px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.detail-row{display:flex;align-items:center;gap:16px;background:rgba(4,26,36,.32);border:1px solid rgba(255,255,255,.24);border-radius:15px;padding:13px 18px;min-height:62px;max-width:100%;backdrop-filter:blur(26px) saturate(150%);-webkit-backdrop-filter:blur(26px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 24px rgba(0,0,0,.18)}
.detail-row .label{color:#b9c7ce;font-size:14px;text-transform:uppercase;letter-spacing:1px;flex:none}
.detail-row .value{font-size:26px;font-weight:900;white-space:nowrap}
.airline{display:flex;align-items:center;gap:10px}
.airline-logo{width:46px;height:46px;border-radius:12px;background:#fff;display:grid;place-items:center;box-shadow:0 8px 20px rgba(0,0,0,.18);overflow:hidden;flex:none}
.airline-logo img{width:38px;height:38px;object-fit:contain}
.airline-iata{font-size:12px;color:var(--muted);font-weight:800;letter-spacing:1px}
.price-box{position:absolute;background:linear-gradient(135deg,rgba(255,110,26,.34) 0%,rgba(214,45,18,.30) 46%,rgba(122,20,12,.34) 74%,rgba(10,20,26,.46) 100%);border:1px solid rgba(255,150,70,.40);border-radius:28px;backdrop-filter:blur(34px) saturate(160%);-webkit-backdrop-filter:blur(34px) saturate(160%);box-shadow:0 22px 55px rgba(0,0,0,.45),0 0 0 1px rgba(255,134,27,.14),inset 0 1px 0 rgba(255,214,180,.20);overflow:hidden}
.price-top{color:#dbe3e7;text-transform:uppercase;letter-spacing:2.5px;font-size:16px;font-weight:900}
.installments{display:flex;align-items:baseline;gap:8px;margin-top:6px;flex-wrap:wrap}
.main-subtitle{font-size:17px;color:#e2eaee;margin-top:8px;margin-bottom:2px}
.installments .n{font-size:34px;font-weight:950;letter-spacing:.1px}
.installments .de{font-size:19px;font-weight:800;color:#d7e1e6;margin-left:1px}
.installments .currency{font-size:34px;font-weight:900;color:var(--orange)}
.interest-free{font-size:16px;font-weight:800;color:#e4ecef;margin-left:8px;margin-bottom:10px;white-space:nowrap}
.original-total{display:inline-flex;align-items:center;gap:9px;margin-top:12px;padding:7px 10px;border-radius:999px;background:linear-gradient(180deg,rgba(255,134,27,.28),rgba(255,134,27,.13));border:1px solid rgba(255,134,27,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.original-total-label{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#ffd2aa;font-weight:800}
.original-total-value{font-size:20px;color:#ff9a3d;font-weight:950}
.installments .value{font-weight:950;color:var(--orange);letter-spacing:-2px}
.more-installments{border-left:1px solid rgba(255,134,27,.42);padding-left:30px;position:relative;z-index:1}
.more-installments .headline{font-size:20px;color:#fff;font-weight:900;margin-bottom:7px}
.more-installments .twelve-label{font-size:16px;color:#d6e1e6;margin-bottom:3px}
.more-installments .twelve-price{display:flex;align-items:baseline;gap:6px;margin-bottom:6px}
.more-installments .twelve-price .n{font-size:28px;font-weight:900}
.more-installments .twelve-price .currency{font-size:24px;font-weight:900;color:var(--orange)}
.more-installments .twelve-price .value{font-size:48px;font-weight:950;color:var(--orange);letter-spacing:-1px}
.more-installments .discount{font-size:17px;line-height:1.45;color:#ffd1a8;font-weight:800}
.note{font-size:16px;color:#cbd5da;line-height:1.55}
`;

const STORY_CSS = `
.frame{width:1080px;height:1920px;padding:62px 58px}
.logo-slot{width:520px;height:230px}
.hero{margin-top:72px}.destination{font-size:158px;margin:34px 0 30px}
.category-badge{font-size:19px;padding:11px 18px}
.found-badge{font-size:18px;padding:11px 16px}
.route-glass{padding:22px 28px}
.route-city{font-size:56px}.route-city .arrow{font-size:34px}
.route-iata{font-size:26px}
.details{margin-top:44px;gap:14px}
.detail-row{min-height:76px;padding:16px 22px}
.detail-row .label{font-size:18px}
.detail-row .value{font-size:32px}
.airline-logo{width:56px;height:56px}.airline-logo img{width:46px;height:46px}
.airline-iata{font-size:15px}
.price-box{left:58px;right:58px;bottom:96px;padding:40px 42px}
.price-top{font-size:20px}
.main-subtitle{font-size:21px}
.installments .value{font-size:104px}
.installments .n{font-size:42px}.installments .de{font-size:23px}.installments .currency{font-size:42px}
.interest-free{font-size:20px}
.original-total-label{font-size:15px}.original-total-value{font-size:25px}
.more-installments{margin-top:22px;border-left:0;border-top:1px solid rgba(255,134,27,.35);padding:22px 0 0}
.more-installments .headline{font-size:24px;margin-bottom:6px}
.more-installments .twelve-label{font-size:18px}
.more-installments .twelve-price .n{font-size:32px}
.more-installments .twelve-price .currency{font-size:28px}
.more-installments .twelve-price .value{font-size:56px}
.more-installments .discount{font-size:20px;max-width:880px}
.note{font-size:19px}
.cards-seal{width:170px;height:170px}.offer-seal{width:170px;height:170px}
`;


const FEED_CSS = `
.frame{width:1080px;height:1350px;padding:54px 58px}
.hero{margin-top:46px}.destination{font-size:136px;margin:30px 0 24px}
.details{margin-top:28px}
.price-box{left:58px;right:58px;bottom:88px;padding:30px 32px}
.installments .value{font-size:76px}
.price-layout{display:grid;grid-template-columns:1.05fr .95fr;gap:38px;align-items:center}
.price-layout.pix-only{grid-template-columns:1fr}
.price-layout.pix-only .more-installments{display:none}
`;


const SEALS = `
<div class="seal-wrap">
  <div class="cards-seal" aria-label="Pague em até 3 cartões">
    <svg viewBox="0 0 160 160" role="img">
      <defs>
        <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#ffb15a"/>
          <stop offset="45%" stop-color="#ff861b"/>
          <stop offset="100%" stop-color="#c94f00"/>
        </linearGradient>
        <filter id="shadowA" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-opacity=".28"/>
        </filter>
      </defs>
      <circle cx="80" cy="80" r="73" fill="url(#cardBg)" stroke="#fff3e6" stroke-width="5" filter="url(#shadowA)"/>
      <circle cx="80" cy="80" r="63" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
      <g transform="translate(52 25)">
        <rect x="0" y="8" width="48" height="31" rx="6" fill="#fff" opacity=".98"/>
        <rect x="0" y="14" width="48" height="6" fill="#f4b93b"/>
        <rect x="6" y="27" width="12" height="5" rx="1" fill="#0d3140"/>
        <rect x="22" y="27" width="18" height="3" rx="1.5" fill="#9aa8af"/>
      </g>
      <text x="80" y="84" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="800" letter-spacing="1.6">PAGUE EM</text>
      <text x="80" y="109" text-anchor="middle" fill="#fff" font-size="24" font-weight="950">ATÉ 3</text>
      <text x="80" y="126" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="800" letter-spacing="1.2">CARTÕES</text>
    </svg>
  </div>

  <div class="offer-seal" aria-label="Oferta aérea">
    <svg viewBox="0 0 160 160" role="img">
      <defs>
        <linearGradient id="offerBg3" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#69d75f"/>
          <stop offset="52%" stop-color="#35a947"/>
          <stop offset="100%" stop-color="#17682d"/>
        </linearGradient>
        <filter id="shadowOffer" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-opacity=".28"/>
        </filter>
      </defs>
      <circle cx="80" cy="80" r="73" fill="url(#offerBg3)" stroke="#effff0" stroke-width="5" filter="url(#shadowOffer)"/>
      <circle cx="80" cy="80" r="61" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2"/>
      <g stroke="rgba(255,255,255,.42)" stroke-width="2" stroke-linecap="round">
        <path d="M80 24v7"/><path d="M80 129v7"/>
        <path d="M24 80h7"/><path d="M129 80h7"/>
        <path d="M41 41l5 5"/><path d="M114 114l5 5"/>
        <path d="M119 41l-5 5"/><path d="M46 114l-5 5"/>
      </g>
      <path d="M87 39L64 74h16l-8 30 28-42H82z" fill="#fff"/>
      <text x="80" y="118" text-anchor="middle" fill="#fff" font-size="12" font-weight="950" letter-spacing="1.05">OFERTA AÉREA</text>
    </svg>
  </div>
</div>`;

/** Ajuste automático do destino grande: reduz até caber, sem cortar. */
/** Auto-fit do destino (v24): uma linha, sem cortar, com 48px de respiro. */
const AUTOFIT = `
<script>
(function(){
  function fit(){
    var el=document.querySelector('.destination-one-line');
    if(!el) return;
    el.style.transform='none';
    el.style.marginBottom='';
    var parent=el.parentElement; if(!parent) return;
    var cs=getComputedStyle(parent);
    var safetyRight=48;
    var available=parent.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0)-safetyRight;
    var needed=el.scrollWidth;
    if(needed>available&&available>0){
      var scale=Math.max(0.50,Math.min(1,available/needed));
      el.style.transform='scale('+scale+')';
      el.style.marginBottom=(-(el.offsetHeight*(1-scale)))+'px';
    }
    document.documentElement.setAttribute('data-ready','1');
  }
  window.ViaAirCard=window.ViaAirCard||{};
  window.ViaAirCard.setDestination=function(name){
    var el=document.querySelector('.destination-one-line');
    if(!el) return;
    var words=String(name||'').trim().split(/\\s+/).filter(Boolean);
    if(!words.length) return;
    if(words.length===1){
      el.innerHTML='<span class="dest-highlight">'+words[0]+'</span>';
    }else{
      el.innerHTML='<span class="dest-prefix">'+words.slice(0,-1).join(' ')+'</span>'+
                   '<span class="dest-highlight">'+words[words.length-1]+'</span>';
    }
    fit();
  };
  fit();
  window.addEventListener('load',fit);
  window.addEventListener('resize',fit);
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}
})();
</script>`;


function precoBloco(d: PromoCardData): { melhor: string; prazo: string } {
  const melhor = d.pixOnly
    ? `<div class="price-top">Melhor condição</div>
       <div class="installments"><span class="currency">R$</span><span class="value">${esc(brl(d.totalPrice))}</span><span class="interest-free">via Pix</span></div>`
    : d.interestFreeInstallments > 1
      ? `<div class="price-top">Melhor condição</div><div class="main-subtitle">Parcele em até</div>
         <div class="installments"><span class="n">${d.interestFreeInstallments}x</span><span class="de">de</span><span class="currency">R$</span><span class="value">${esc(brl(d.interestFreeInstallmentValue))}</span><span class="interest-free">sem juros</span></div>
         <div class="original-total"><span class="original-total-label">Valor total</span><span class="original-total-value">${esc(brlFull(d.totalPrice))}</span></div>`
      : `<div class="price-top">Melhor condição</div><div class="main-subtitle">À vista</div>
         <div class="installments"><span class="currency">R$</span><span class="value">${esc(brl(d.totalPrice))}</span></div>`;

  const melhorComTotal =
    d.pixOnly || d.interestFreeInstallments <= 1
      ? `${melhor}<div class="original-total"><span class="original-total-label">Valor total</span><span class="original-total-value">${esc(brlFull(d.totalPrice))}</span></div>`
      : melhor;

  const prazo =
    d.extendedInstallments && d.extendedInstallmentValue
      ? `<div class="more-installments">
           <div class="headline">Precisa de mais prazo?</div>
           <div class="twelve-label">Parcele em até</div>
           <div class="twelve-price"><span class="n">${d.extendedInstallments}x de</span><span class="currency">R$</span><span class="value">${esc(brl(d.extendedInstallmentValue))}</span></div>
           <div class="discount">Nas opções de maior parcelamento, quanto menos parcelas, mais barato você paga.</div>
         </div>`
      : "";

  return { melhor: melhorComTotal, prazo };
}

export function renderPromoCardHtml(
  d: PromoCardData,
  format: PromoCardFormat,
  base = "",
): string {
  const { melhor, prazo } = precoBloco(d);
  const tipo = d.tripType === "ida-e-volta" ? "ida e volta" : "somente ida";
  const periodo = d.returnDate ? `${d.departureDate} → ${d.returnDate}` : d.departureDate;
  const logo = abs(base, VIAAIR_LOGOS[d.logoVariant ?? "color"] ?? viaairLogo.url);
  const dataTarifa = dataTarifaPorExtenso(d.fareFoundAt);
  const nota = `Parcelamento sem juros conforme regra vigente da companhia aérea.${dataTarifa ? ` Tarifa encontrada em ${dataTarifa}.` : ""} Válida para o dia da compra e sujeita à disponibilidade e atualização tarifária até a emissão.`;
  const ciaLogo = abs(base, d.airlineLogo);
  const foto = d.destinationImage ? abs(base, d.destinationImage) : "";

  const precoSection =
    format === "story"
      ? `<section class="price-box">${melhor}${prazo}
           <div class="note" style="margin-top:16px">${esc(nota)}</div>
         </section>`
      : `<section class="price-box">
           <div class="price-layout${prazo ? "" : " pix-only"}">
             <div>${melhor}</div>
             ${prazo}
           </div>
           <div class="note" style="margin-top:16px">${esc(nota)}</div>
         </section>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>VIA AIR — Promoção aérea (${format})</title>
<style>${BASE_CSS}${format === "story" ? STORY_CSS : FEED_CSS}</style></head>
<body><main class="frame">
${foto ? `<img class="photo" src="${esc(foto)}" alt="${esc(d.destinationCity)}" style="object-position:${esc(d.imagePosition ?? "50% 45%")}"/>` : ""}
<div class="veil"></div>
<div class="brand">
  <div class="logo-slot">${logo ? `<img src="${esc(logo)}" alt="VIA AIR"/>` : `<span class="logo-placeholder">VIA AIR</span>`}</div>
  ${SEALS}
</div>

<section class="hero">
  <div class="category-row">
    <div class="category-badge">${esc(d.categoria || "PASSAGEM AÉREA")}</div>
    <div class="found-badge"><span class="found-dot"></span>${esc(d.statusLabel || "Tarifa encontrada hoje")}</div>
  </div>
  <h1 class="destination destination-one-line" data-full-destination="${esc(d.destination)}">${
    destinationParts(d.destination).prefix
      ? `<span class="dest-prefix">${esc(destinationParts(d.destination).prefix)}</span>`
      : ""
  }<span class="dest-highlight">${esc(destinationParts(d.destination).last)}</span></h1>
  <div class="route-glass">
    <div class="route-city"><span>${esc(d.origin)}</span><span class="arrow">→</span><span>${esc(d.destinationCity)}</span></div>
    <div class="route-iata">${esc(d.originIata)} → ${esc(d.destinationIata)} • ${tipo}</div>
  </div>

  <div class="details">
    <div class="detail-row"><span class="label">Período</span><span class="value">${esc(periodo)}</span></div>
    <div class="detail-row"><span class="label">Companhia</span><span class="value airline">
      <span class="airline-logo">${ciaLogo ? `<img src="${esc(ciaLogo)}" alt="${esc(d.airline)}"/>` : `<span class="airline-iata">${esc(d.airlineIata ?? "")}</span>`}</span>
      <span>${esc(d.airline)}</span>${d.airlineIata ? `<span class="airline-iata">${esc(d.airlineIata)}</span>` : ""}
    </span></div>
    <div class="detail-row"><span class="label">Bagagem</span><span class="value">${esc(d.baggage)}</span></div>
  </div>
</section>

${precoSection}
</main>${AUTOFIT}</body></html>`;
}
