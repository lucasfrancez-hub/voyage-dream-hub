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

/** Linguagem visual premium (mesma dos cards de pacote/ingresso). */
const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;background:#000;color:#fff;font-family:'Montserrat',Arial,Helvetica,sans-serif}
:root{--orange:#ff7f00;--orange2:#ff9f3f;--muted:rgba(255,255,255,.85)}
body{display:grid;place-items:center;min-height:100vh}
.frame{position:relative;overflow:hidden;background:#000;display:flex;flex-direction:column;justify-content:space-between}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:block}
.veil{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,.06) 34%,rgba(0,0,0,.55) 62%,rgba(0,0,0,.88) 100%)}
.frame > *:not(.photo):not(.veil){position:relative;z-index:2}

.glass{background:rgba(0,0,0,.34);backdrop-filter:blur(30px) saturate(150%);border:1px solid rgba(255,255,255,.30);border-radius:40px}
.glass-dark{background:rgba(10,10,10,.56);backdrop-filter:blur(30px) saturate(150%);border:1px solid rgba(255,255,255,.16);border-radius:40px}

.top{display:flex;flex-direction:column}
.brand{display:flex;align-items:center;justify-content:space-between;gap:24px}
.logo-slot{display:flex;align-items:center}
.logo-slot img{display:block;max-width:100%;object-fit:contain;filter:drop-shadow(0 6px 18px rgba(0,0,0,.45))}
.logo-placeholder{font-size:24px;letter-spacing:4px;font-weight:900;color:rgba(255,255,255,.55)}
.seal-wrap{display:flex;align-items:center;gap:26px}
/* Carimbo de passaporte */
.stamp{border:3px solid currentColor;border-radius:16px;padding:7px;box-shadow:0 14px 30px rgba(0,0,0,.42);background:rgba(255,255,255,.06)}
.stamp-cards{color:#c2410c;transform:rotate(-9deg)}
.stamp-offer{color:#15803d;transform:rotate(6deg)}
.stamp-inner{border:1.5px dashed currentColor;border-radius:10px;background:rgba(255,255,255,.94);display:flex;flex-direction:column;align-items:center;text-align:center;line-height:1}
.stamp-tag,.stamp-foot{font-weight:800;text-transform:uppercase;opacity:.85;white-space:nowrap}
.stamp-l1,.stamp-l2{font-weight:900;letter-spacing:-.01em;white-space:nowrap}
.stamp-rule{display:block;width:100%;height:1px;background:currentColor;opacity:.32}

svg{display:block;width:100%;height:100%}

.category-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.category-badge{display:inline-flex;align-items:center;gap:12px;border:none;border-radius:9999px;color:#fff;font-weight:800;letter-spacing:.2em;text-transform:uppercase;line-height:1;background:linear-gradient(135deg,#ff9f3f 0%,#ff7f00 52%,#d85c00 100%);box-shadow:0 10px 28px rgba(255,127,0,.35)}
.category-badge .cb-ico{display:inline-flex;flex:none;color:#fff}
.category-badge .cb-ico svg{width:100%;height:100%}
.found-badge{display:inline-flex;align-items:center;gap:12px;border:1px solid rgba(53,208,127,.55);border-radius:9999px;color:#9dfbc6;font-weight:700;letter-spacing:.06em;line-height:1;background:rgba(6,32,20,.5);backdrop-filter:blur(24px) saturate(150%)}
.found-dot{width:14px;height:14px;border-radius:50%;background:#35d07f;box-shadow:0 0 0 6px rgba(53,208,127,.18),0 0 16px rgba(53,208,127,.9);flex:none}

.destination{font-weight:900;line-height:.9;letter-spacing:-.03em;margin:0;text-transform:uppercase;color:#fff;text-shadow:0 4px 12px rgba(0,0,0,.55),0 8px 24px rgba(0,0,0,.45)}
.destination-one-line{display:flex;flex-direction:row;align-items:baseline;gap:.22em;white-space:nowrap;width:max-content;max-width:100%;transform-origin:left center}
.destination-one-line .dest-prefix{color:#fff}
.destination-one-line .dest-highlight{color:var(--orange)}

/* Rota em cartão de embarque */
.route{margin-top:22px;display:flex;align-items:center;width:max-content;max-width:100%}
.route-end{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.route-iata-big{font-weight:900;color:#fff;line-height:1;letter-spacing:-.02em;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.route-city-name{font-weight:600;color:rgba(255,255,255,.86);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.route-mid{display:flex;flex-direction:column;align-items:center;gap:8px;flex:none}
.route-track{display:flex;align-items:center;gap:8px;color:var(--orange)}
.route-track i{display:block;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(255,127,0,.15),rgba(255,127,0,.95))}
.route-track i.rev{background:linear-gradient(90deg,rgba(255,127,0,.95),rgba(255,127,0,.15))}
.route-track .route-plane{display:inline-flex;color:var(--orange)}
.route-trip{display:inline-flex;align-items:center;border-radius:9999px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#ffd7ac;background:rgba(255,127,0,.16);border:1px solid rgba(255,159,63,.5);white-space:nowrap}


/* Bloco de informações em LINHAS (período / companhia / bagagem) */
.info{display:flex;flex-direction:column;width:100%}
.info-row{display:flex;align-items:center;gap:18px}
.info-row + .info-row{border-top:1px solid rgba(255,255,255,.16)}
.info-icon{color:var(--orange);display:inline-flex;flex-shrink:0}
.info-label{margin:0;color:rgba(255,255,255,.72);font-weight:600;letter-spacing:.14em;text-transform:uppercase;flex-shrink:0}
.info-value{margin:0 0 0 auto;font-weight:700;color:#fff;text-align:right;display:flex;align-items:center;gap:14px;justify-content:flex-end;min-width:0}
.info-value .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.info-value .txt.wrap{white-space:normal;line-height:1.2}
.airline-logo{border-radius:12px;background:#fff;display:grid;place-items:center;overflow:hidden;flex:none;padding:6px}
.airline-logo img{width:100%;height:100%;object-fit:contain}
.airline-iata{color:var(--orange);font-weight:800;letter-spacing:.06em}

/* Melhor condição + mais prazo em duas colunas */
.price{display:flex;align-items:stretch;width:100%}
.price-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;text-align:center}
.price-div{width:1px;background:rgba(255,255,255,.2);flex:none}
.price-kicker{margin:0 0 8px;font-weight:700;letter-spacing:.18em;color:rgba(255,255,255,.72);text-transform:uppercase}
.price-line{display:flex;align-items:baseline;justify-content:center;flex-wrap:nowrap}
.price-x{font-weight:700;margin-right:8px}
.price-cur{font-weight:700;color:var(--orange);margin-right:6px}
.price-num{font-weight:900;color:var(--orange);letter-spacing:-.03em;line-height:1;margin-right:4px}
.price-cents{font-weight:700;color:var(--orange)}
.price-free{font-weight:600;color:rgba(255,255,255,.92);margin-left:10px}
.price-total{margin:10px 0 0;font-weight:500;color:rgba(255,255,255,.92)}
.price-total span{color:#fff;font-weight:800}
.price-fine{margin:10px 0 0;color:rgba(255,255,255,.7);line-height:1.3}
.price-alt-num{font-weight:900;color:#fff;line-height:1}
.price-alt-num span{color:var(--orange)}

.side{display:flex;gap:14px}
.side-card{display:flex;align-items:center;gap:16px;width:100%}
.side-icon{color:var(--orange);display:inline-flex;flex-shrink:0}
.side-card p{margin:0;font-weight:500;line-height:1.35;color:#fff}
.side-card p b{color:var(--orange);font-weight:800}
.side-fine{opacity:.72}
.note{margin:0;text-align:center;color:rgba(255,255,255,.95);line-height:1.35;font-weight:500;text-shadow:0 1px 3px rgba(0,0,0,.9)}

`;

const STORY_CSS = `
.frame{width:1080px;height:1920px;padding:56px 56px 44px}
.logo-slot img{max-height:88px;max-width:400px}
.stamp-inner{padding:16px 26px;gap:9px}
.stamp-tag{font-size:17px;letter-spacing:.34em}
.stamp-foot{font-size:15px;letter-spacing:.3em}
.stamp-l1{font-size:46px}
.stamp-l2{font-size:34px}

.category-badge{font-size:26px;padding:12px 30px}
.category-badge .cb-ico,.category-badge .cb-ico svg{width:30px;height:30px}
.found-badge{font-size:24px;padding:12px 26px}
.hero{margin-top:56px}
.destination{font-size:170px;margin:34px 0 0}
.route-iata-big{font-size:66px}
.route-city-name{font-size:24px}
.route-mid{padding:0 26px}
.route-track i{width:74px}
.route-track .route-plane,.route-track .route-plane svg{width:40px;height:40px}
.route-trip{font-size:20px;padding:8px 20px}

.bottom{display:flex;flex-direction:column;gap:22px}
.info{padding:12px 34px}
.info-row{padding:22px 0}
.info-icon,.info-icon svg{width:44px;height:44px}
.info-label{font-size:23px}
.info-value{font-size:30px;max-width:640px}
.airline-logo{width:62px;height:62px}
.airline-iata{font-size:24px}
.price{padding:34px 26px}
.price-kicker{font-size:23px}
.price-x{font-size:36px}
.price-cur{font-size:46px}
.price-num{font-size:110px}
.price-cents{font-size:46px}
.price-free{font-size:26px}
.price-total{font-size:26px}
.price-fine{font-size:20px}
.price-alt-num{font-size:64px}
.side-card{padding:24px 30px}
.side-icon,.side-icon svg{width:44px;height:44px}
.side-card p{font-size:25px}
.side-fine{font-size:21px}
.note{font-size:21px;margin-top:4px}
`;

const FEED_CSS = `
.frame{width:1080px;height:1350px;padding:48px 48px 38px}
.logo-slot img{max-height:74px;max-width:340px}
.stamp-inner{padding:13px 21px;gap:7px}
.stamp-tag{font-size:14px;letter-spacing:.32em}
.stamp-foot{font-size:12.5px;letter-spacing:.3em}
.stamp-l1{font-size:38px}
.stamp-l2{font-size:28px}

.category-badge{font-size:22px;padding:10px 24px}
.category-badge .cb-ico,.category-badge .cb-ico svg{width:26px;height:26px}
.found-badge{font-size:20px;padding:10px 22px}
.hero{margin-top:28px}
.destination{font-size:132px;margin:22px 0 0}
.route-iata-big{font-size:54px}
.route-city-name{font-size:20px}
.route-mid{padding:0 20px}
.route-track i{width:58px}
.route-track .route-plane,.route-track .route-plane svg{width:34px;height:34px}
.route-trip{font-size:17px;padding:7px 16px}

.bottom{display:flex;flex-direction:column;gap:16px}
.info{padding:6px 28px}
.info-row{padding:16px 0}
.info-icon,.info-icon svg{width:36px;height:36px}
.info-label{font-size:19px}
.info-value{font-size:25px;max-width:600px}
.airline-logo{width:52px;height:52px}
.airline-iata{font-size:20px}
.price{padding:26px 22px}
.price-kicker{font-size:19px}
.price-x{font-size:30px}
.price-cur{font-size:38px}
.price-num{font-size:88px}
.price-cents{font-size:38px}
.price-free{font-size:22px}
.price-total{font-size:22px}
.price-fine{font-size:17px}
.price-alt-num{font-size:52px}
.side-card{padding:18px 24px}
.side-icon,.side-icon svg{width:36px;height:36px}
.side-card p{font-size:21px}
.side-fine{font-size:18px}
.note{font-size:18px;margin-top:2px}
`;




const SEALS = `
<div class="seal-wrap">
  <div class="stamp stamp-cards" aria-label="Divida em até 3 cartões">
    <div class="stamp-inner">
      <span class="stamp-tag">Parcele sem susto</span>
      <span class="stamp-rule"></span>
      <span class="stamp-l1">ATÉ 3</span>
      <span class="stamp-l2">CARTÕES</span>
      <span class="stamp-rule"></span>
      <span class="stamp-foot">VIA AIR</span>
    </div>
  </div>
  <div class="stamp stamp-offer" aria-label="Tarifa relâmpago">
    <div class="stamp-inner">
      <span class="stamp-tag">Oferta do dia</span>
      <span class="stamp-rule"></span>
      <span class="stamp-l1">TARIFA</span>
      <span class="stamp-l2">RELÂMPAGO</span>
      <span class="stamp-rule"></span>
      <span class="stamp-foot">VIA AIR</span>
    </div>
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
  function fitAll(){ fit(); }

  fitAll();
  window.addEventListener('load',fitAll);
  window.addEventListener('resize',fitAll);
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fitAll);}
})();
</script>`;



const ICONS = {
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
};

/** Melhor condição + mais prazo, lado a lado em duas colunas. */
function precoBloco(d: PromoCardData): string {
  const parcelado = !d.pixOnly && d.interestFreeInstallments > 1;
  const valor = parcelado ? d.interestFreeInstallmentValue : d.totalPrice;
  const [reais, centavos] = brl(valor).split(",");
  const kicker = parcelado ? "Melhor condição" : d.pixOnly ? "À vista no Pix" : "À vista";

  const principal = `<div class="price-col">
    <p class="price-kicker">${esc(kicker)}</p>
    <div class="price-line">
      ${parcelado ? `<span class="price-x">${d.interestFreeInstallments}x</span>` : ""}
      <span class="price-cur">R$</span>
      <span class="price-num">${esc(reais)}</span>
      <span class="price-cents">,${esc(centavos ?? "00")}</span>
    </div>
    ${parcelado ? `<p class="price-fine">sem juros no cartão</p>` : ""}
    <p class="price-total">Valor total: <span>${esc(brlFull(d.totalPrice))}</span></p>
  </div>`;

  const segunda =
    d.extendedInstallments && d.extendedInstallmentValue
      ? `<div class="price-col">
           <p class="price-kicker">Precisa de mais prazo?</p>
           <p class="price-alt-num">${d.extendedInstallments}x <span>R$ ${esc(brl(d.extendedInstallmentValue))}</span></p>
           <p class="price-fine">Quanto menos parcelas,<br/>mais barato você paga.</p>
         </div>`
      : `<div class="price-col">
           <p class="price-kicker">Formas de pagamento</p>
           <p class="price-alt-num"><span>Pix</span> ou cartão</p>
           <p class="price-fine">Pague em até 3 cartões diferentes.</p>
         </div>`;

  return `<section class="price glass-dark">${principal}<div class="price-div"></div>${segunda}</section>`;
}

export function renderPromoCardHtml(
  d: PromoCardData,
  format: PromoCardFormat,
  base = "",
): string {
  const tipo = d.tripType === "ida-e-volta" ? "ida e volta" : "somente ida";
  const periodo = d.returnDate ? `${d.departureDate} → ${d.returnDate}` : d.departureDate;
  const logo = abs(base, VIAAIR_LOGOS[d.logoVariant ?? "white"] ?? viaairLogoWhite.url);
  const dataTarifa = dataTarifaPorExtenso(d.fareFoundAt);
  const nota = `Parcelamento sem juros conforme regra vigente da companhia aérea.${dataTarifa ? ` Tarifa encontrada em ${dataTarifa}.` : ""} Válida para o dia da compra e sujeita à disponibilidade e atualização tarifária até a emissão.`;
  const ciaLogo = abs(base, d.airlineLogo);
  const foto = d.destinationImage ? abs(base, d.destinationImage) : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>VIA AIR — Promoção aérea (${format})</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<style>${BASE_CSS}${format === "story" ? STORY_CSS : FEED_CSS}</style></head>
<body><main class="frame">
${foto ? `<img class="photo" src="${esc(foto)}" alt="${esc(d.destinationCity)}" style="object-position:${esc(d.imagePosition ?? "50% 45%")}"/>` : ""}
<div class="veil"></div>

<header class="top">
  <div class="brand">
    <div class="logo-slot">${logo ? `<img src="${esc(logo)}" alt="VIA AIR"/>` : `<span class="logo-placeholder">VIA AIR</span>`}</div>
    ${SEALS}
  </div>

  <section class="hero">
    <div class="category-row">
      <div class="category-badge"><span class="cb-ico">${ICONS.plane}</span>${esc(d.categoria || "PASSAGEM AÉREA")}</div>
      <div class="found-badge"><span class="found-dot"></span>${esc(d.statusLabel || "Tarifa encontrada hoje")}</div>
    </div>
    <h1 class="destination destination-one-line" data-full-destination="${esc(d.destination)}">${
      destinationParts(d.destination).prefix
        ? `<span class="dest-prefix">${esc(destinationParts(d.destination).prefix)}</span>`
        : ""
    }<span class="dest-highlight">${esc(destinationParts(d.destination).last)}</span></h1>
    <div class="route">
      <div class="route-end">
        <span class="route-iata-big">${esc(d.originIata)}</span>
        <span class="route-city-name">${esc(d.origin)}</span>
      </div>
      <div class="route-mid">
        <div class="route-track">
          <i></i><span class="route-plane">${ICONS.plane}</span><i class="rev"></i>
        </div>
        <span class="route-trip">${esc(tipo)}</span>
      </div>
      <div class="route-end">
        <span class="route-iata-big">${esc(d.destinationIata)}</span>
        <span class="route-city-name">${esc(d.destinationCity)}</span>
      </div>
    </div>

  </section>
</header>

<div class="bottom">
  <section class="info glass">
    <div class="info-row">
      <span class="info-icon">${ICONS.calendar}</span>
      <p class="info-label">Período</p>
      <p class="info-value"><span class="txt">${esc(periodo)}</span></p>
    </div>
    <div class="info-row">
      <span class="info-icon">${ICONS.plane}</span>
      <p class="info-label">Companhia</p>
      <p class="info-value">
        ${ciaLogo ? `<span class="airline-logo"><img src="${esc(ciaLogo)}" alt="${esc(d.airline)}"/></span>` : ""}
        <span class="txt">${esc(d.airline)}</span>
        ${!ciaLogo && d.airlineIata ? `<span class="airline-iata">${esc(d.airlineIata)}</span>` : ""}
      </p>
    </div>
    <div class="info-row">
      <span class="info-icon">${ICONS.briefcase}</span>
      <p class="info-label">Bagagem</p>
      <p class="info-value"><span class="txt wrap">${esc(d.baggage)}</span></p>
    </div>
  </section>

  ${precoBloco(d)}

  <p class="note">${esc(nota)}</p>
</div>
</main>${AUTOFIT}</body></html>`;
}


