/**
 * Templates APROVADOS dos cards de promoção aérea (Feed 4:5 e Story 9:16).
 * O HTML/CSS abaixo é o design aprovado — aqui só trocamos os textos fixos
 * por variáveis. NÃO redesenhar.
 */
import viaairLogo from "@/assets/viaair-logo.png.asset.json";
import type { PromoCardData, PromoCardFormat } from "./card-data";

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

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;background:#07141b;font-family:Arial,Helvetica,sans-serif;color:#f7fbff}
:root{--orange:#ff861b;--orange2:#ff9f3f;--muted:#a7b7c0;--line:rgba(255,255,255,.11);--panel:rgba(5,28,38,.86);--green:#2ed47a;--blue:#2f7fb5}
body{display:grid;place-items:center;min-height:100vh;padding:0}
.frame{position:relative;overflow:hidden;background:
linear-gradient(135deg,#0b3850,#0c2740 52%,#081820)}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.veil{position:absolute;inset:0;z-index:1;background:
linear-gradient(180deg,rgba(2,17,28,.16),rgba(2,17,28,.60) 48%,rgba(4,14,18,.98)),
radial-gradient(circle at 80% 12%,rgba(255,134,27,.18),transparent 24%)}
.frame > *:not(.photo):not(.veil):not(.price-box){position:relative;z-index:2}
.price-box{z-index:3}
.brand{display:flex;align-items:flex-start;justify-content:space-between}
.logo{font-size:34px;letter-spacing:2px}.logo b{font-weight:800}.logo .air{color:var(--orange)}
.logo-slot{width:220px;height:74px;display:flex;align-items:center;justify-content:flex-start;padding:0}
.logo-slot img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
.seal-wrap{display:flex;align-items:center;gap:16px}
.cards-seal{width:146px;height:146px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.32))}
.offer-seal{width:146px;height:146px;filter:drop-shadow(0 10px 22px rgba(0,0,0,.30))}
svg{display:block;width:100%;height:100%}
.kicker{font-size:15px;letter-spacing:2.8px;text-transform:uppercase;color:var(--orange);font-weight:800}
.destination{font-weight:950;line-height:.95;text-transform:uppercase;letter-spacing:-2px;white-space:nowrap;overflow:hidden}
.route-city{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:900;color:#fff;max-width:100%}
.route-city span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.route-city .arrow{color:var(--orange);font-size:28px;flex:none}
.route-iata{font-size:15px;color:var(--muted);margin-top:6px;letter-spacing:1.2px}
.status-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;max-width:940px}
.live,.validity{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.10);font-size:13px}
.live{background:rgba(255,255,255,.06);color:#dce8ee}
.live:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px rgba(46,212,122,.7)}
.validity{background:rgba(255,134,27,.07);border-color:rgba(255,134,27,.22);color:#ffd4ae}
.details{display:flex;flex-direction:column;gap:7px;align-items:flex-start}
.detail-row{display:inline-flex;align-items:center;gap:16px;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:9px 14px;min-height:50px;max-width:100%}
.detail-row .label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:1px;flex:none}
.detail-row .value{font-size:18px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.airline{display:flex;align-items:center;gap:10px}
.airline-logo{width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;box-shadow:0 8px 20px rgba(0,0,0,.18);overflow:hidden;flex:none}
.airline-logo img{width:32px;height:32px;object-fit:contain}
.airline-iata{font-size:12px;color:var(--muted);font-weight:800;letter-spacing:1px}
.price-box{background:linear-gradient(180deg,rgba(27,22,19,.97),rgba(15,15,15,.98));border:1px solid rgba(255,255,255,.11);border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.26)}
.price-top{color:#c8d0d5;text-transform:uppercase;letter-spacing:2.5px;font-size:12px;font-weight:800}
.installments{display:flex;align-items:baseline;gap:8px;margin-top:6px;flex-wrap:wrap}
.main-subtitle{font-size:12px;color:#d6e1e6;margin-top:8px;margin-bottom:2px}
.installments .n{font-size:28px;font-weight:950;letter-spacing:.1px}
.installments .de{font-size:16px;font-weight:800;color:#d7e1e6;margin-left:1px}
.installments .currency{font-size:29px;font-weight:900;color:var(--orange)}
.interest-free{font-size:12px;font-weight:800;color:#dbe4e8;margin-left:8px;margin-bottom:10px;white-space:nowrap}
.original-total{display:inline-flex;align-items:center;gap:9px;margin-top:12px;padding:7px 10px;border-radius:999px;background:linear-gradient(180deg,rgba(255,134,27,.20),rgba(255,134,27,.10));border:1px solid rgba(255,134,27,.42)}
.original-total-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#ffd2aa;font-weight:800}
.original-total-value{font-size:14px;color:#ff9a3d;font-weight:950}
.installments .value{font-weight:950;color:var(--orange);letter-spacing:-2px}
.more-installments{border-left:1px solid rgba(255,134,27,.35);padding-left:26px}
.more-installments .headline{font-size:15px;color:#fff;font-weight:900;margin-bottom:7px}
.more-installments .twelve-label{font-size:12px;color:#d6e1e6;margin-bottom:3px}
.more-installments .twelve-price{display:flex;align-items:baseline;gap:6px;margin-bottom:6px}
.more-installments .twelve-price .n{font-size:22px;font-weight:900}
.more-installments .twelve-price .currency{font-size:20px;font-weight:900;color:var(--orange)}
.more-installments .twelve-price .value{font-size:36px;font-weight:950;color:var(--orange);letter-spacing:-1px}
.more-installments .discount{font-size:13px;line-height:1.45;color:#ffd1a8;font-weight:800}
.note{font-size:11px;color:#aebcc4;line-height:1.5}
`;

const STORY_CSS = `
.frame{width:1080px;height:1920px;padding:62px 58px}
.hero{margin-top:72px}.destination{font-size:128px;margin:12px 0 26px}
.details{margin-top:40px}
.detail-row{min-height:56px;padding:10px 15px}.detail-row .value{font-size:20px}
.price-box{position:absolute;left:58px;right:58px;bottom:96px;padding:34px 36px}
.installments .value{font-size:94px}
.more-installments{margin-top:18px;border-left:0;border-top:1px solid rgba(255,134,27,.35);padding:16px 0 0}
.more-installments .headline{font-size:11px;margin-bottom:4px}
.more-installments .twelve-label{font-size:11px}
.more-installments .twelve-price .n{font-size:20px}
.more-installments .twelve-price .currency{font-size:18px}
.more-installments .twelve-price .value{font-size:42px}
.more-installments .discount{font-size:13px;max-width:780px}
.cards-seal{width:150px;height:150px}.offer-seal{width:150px;height:150px}
`;

const FEED_CSS = `
.original-total-value{font-size:15px}
.frame{width:1080px;height:1350px;padding:54px 58px}
.hero{margin-top:46px}.destination{font-size:108px;margin:12px 0 24px}
.details{margin-top:28px}
.price-box{position:absolute;left:58px;right:58px;bottom:88px;padding:30px 32px}
.installments .value{font-size:76px}
.price-layout{display:grid;grid-template-columns:1fr .82fr;gap:34px;align-items:end}
.price-layout.pix-only{grid-template-columns:1fr}
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
const AUTOFIT = `
<script>
(function(){
  var el=document.querySelector('.destination');
  if(!el) return;
  var frame=document.querySelector('.frame');
  var max=frame.clientWidth-(parseFloat(getComputedStyle(frame).paddingLeft)+parseFloat(getComputedStyle(frame).paddingRight));
  var size=parseFloat(getComputedStyle(el).fontSize);
  var min=size*0.42;
  while(el.scrollWidth>max&&size>min){size-=2;el.style.fontSize=size+'px';}
  document.documentElement.setAttribute('data-ready','1');
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
  const logo = abs(base, viaairLogo.url);
  const ciaLogo = abs(base, d.airlineLogo);
  const foto = d.destinationImage ? abs(base, d.destinationImage) : "";

  const precoSection =
    format === "story"
      ? `<section class="price-box">${melhor}${prazo}
           <div class="note" style="margin-top:16px">Parcelamento sem juros conforme regra vigente da companhia aérea. Valores sujeitos à disponibilidade e atualização tarifária até a emissão.</div>
         </section>`
      : `<section class="price-box">
           <div class="price-layout${prazo ? "" : " pix-only"}">
             <div>${melhor}</div>
             ${prazo}
           </div>
           <div class="note" style="margin-top:16px">Parcelamento sem juros conforme regra vigente da companhia aérea. Valores sujeitos à disponibilidade e atualização tarifária até a emissão.</div>
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
  <div class="kicker">${esc(d.categoria)}</div>
  <h1 class="destination">${esc(d.destination)}</h1>
  <div class="route-city"><span>${esc(d.origin)}</span><span class="arrow">→</span><span>${esc(d.destinationCity)}</span></div>
  <div class="route-iata">${esc(d.originIata)} → ${esc(d.destinationIata)} • ${tipo}</div>
  <div class="status-row">
    <div class="live">${esc(d.statusLabel)}</div>
    <div class="validity">${esc(d.validityLabel)}</div>
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
