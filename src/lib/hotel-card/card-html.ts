/**
 * Gera o HTML do cartão de hotel (arte enviada no WhatsApp).
 * Mesma linguagem visual do cartão de voo: logo VIA AIR, bordas arredondadas,
 * rodapé escuro com o valor total e o parcelamento.
 * Puro: sem imports server-only, usado na rota pública e no preview.
 */
import viaairLogo from "@/assets/viaair-logo.png.asset.json";

const LOGO_URL = viaairLogo.url;

export type HotelCardData = {
  nome: string;
  endereco: string; // "Copacabana, Rio de Janeiro - RJ"
  estrelas?: number | null; // 1..5
  foto?: string | null; // URL da foto do hotel
  check_in: string; // "05/09"
  check_out: string; // "09/09"
  noites: number;
  quartos?: number | null;
  tipo_quarto?: string | null; // "Duplo Standard"
  regime?: string | null; // "Café da manhã incluso"
  nota?: number | null; // 4.7
  nota_label?: string | null; // "Excelente"
  avaliacoes?: number | null; // 892
  comodidades?: string[]; // ["Wi-Fi grátis", "Piscina", ...]
  cancelamento_gratis?: boolean;
  pax_label?: string | null; // "2 adultos"
  total_formatado: string; // "R$ 1.248,00"
  parcelas?: number | null;
  parcela_formatada?: string | null;
};

const NAVY = "#0B2545";
const ORANGE = "#F26B1F";

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function abs(base: string, url: string | undefined | null): string | null {
  if (!url) return null;
  if (/^https?:/i.test(url)) return url;
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

const STAR = `<svg viewBox="0 0 24 24" width="24" height="24" fill="${ORANGE}"><path d="m12 2 2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.1 6.1 20.2l1.2-6.6L2.5 9l6.6-.9z"/></svg>`;
const PIN = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>`;
const CAL = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${ORANGE}" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>`;
const CHECK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#16a34a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const DOT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${ORANGE}"><circle cx="12" cy="12" r="5"/></svg>`;

function estrelas(n?: number | null): string {
  const q = Math.max(0, Math.min(5, Math.round(n ?? 0)));
  if (!q) return "";
  return `<div class="stars">${STAR.repeat(q)}</div>`;
}

export function renderHotelCardHtml(d: HotelCardData, baseUrl: string): string {
  const foto = abs(baseUrl, d.foto);
  const chips = (d.comodidades ?? [])
    .slice(0, 6)
    .map((c) => `<span class="am">${DOT}${esc(c)}</span>`)
    .join("");
  const parcela =
    d.parcelas && d.parcela_formatada
      ? `<div class="pay"><span>PARCELAMENTO</span><b>${d.parcelas}x de ${esc(d.parcela_formatada)}</b></div>`
      : "";
  const nota =
    d.nota != null
      ? `<div class="score"><b>${esc(d.nota.toFixed(1).replace(".", ","))}</b>
          <div><div class="sc-lb">${esc(d.nota_label || "Avaliação")}</div>
          ${d.avaliacoes ? `<div class="sc-sb">${d.avaliacoes} avaliações</div>` : ""}</div></div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:900px;max-width:900px;overflow-x:hidden;background:transparent}
body{font-family:Poppins,system-ui,sans-serif;color:${NAVY};padding:20px;-webkit-font-smoothing:antialiased}
.card{width:820px;background:#fff;overflow:hidden;border-radius:44px}
.top{background:${NAVY};color:#fff;padding:26px 40px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{height:46px;width:auto;object-fit:contain;display:block;filter:brightness(0) invert(1)}
.top .tag{font-size:16px;font-weight:800;letter-spacing:2px;color:${ORANGE};text-transform:uppercase}
.top .sub{font-size:15px;color:#9fb3cd;margin-top:2px}
.hero{width:820px;height:340px;object-fit:cover;display:block}
.hero-ph{width:820px;height:120px;background:#eef2f7}
.body{padding:30px 40px 0}
.stars{display:flex;gap:4px;margin-bottom:8px}
.name{font-size:38px;font-weight:800;letter-spacing:-.6px;line-height:1.1}
.loc{display:flex;align-items:center;gap:8px;font-size:19px;color:#5c6b82;margin-top:8px}
.meta{display:flex;align-items:center;gap:14px;background:#f6f8fb;border-radius:22px;padding:16px 22px;margin-top:20px}
.meta .dates{font-size:21px;font-weight:700}
.meta .noites{font-size:16px;color:#5c6b82;font-weight:600}
.meta .sep{width:1px;height:34px;background:#dfe6ef}
.meta .room{font-size:16px;color:#42526b;font-weight:600;line-height:1.35}
.ams{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.am{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #e5ebf3;border-radius:999px;padding:9px 16px;font-size:15px;font-weight:600;color:#42526b}
.score{display:flex;align-items:center;gap:14px;margin-top:18px}
.score b{background:${NAVY};color:#fff;border-radius:16px;padding:10px 18px;font-size:26px;font-weight:800}
.sc-lb{font-size:19px;font-weight:700}
.sc-sb{font-size:15px;color:#94a1b2}
.free{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:16px;font-weight:700;color:#16a34a}
.foot{background:${NAVY};color:#fff;margin-top:28px;padding:34px 40px 30px;text-align:center;border-radius:0 0 44px 44px}
.foot .lab{font-size:17px;font-weight:700;letter-spacing:3px;color:#8fa2bd}
.foot .price{margin-top:12px;font-size:72px;font-weight:800;color:${ORANGE};line-height:1}
.foot .price small{font-size:32px;font-weight:700;vertical-align:super;margin-right:6px}
.pay{display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,.14);margin-top:26px;padding-top:20px;font-size:18px}
.pay span{color:#8fa2bd;font-weight:600;letter-spacing:2px}
.pay b{font-weight:700}
.safe{margin-top:16px;font-size:16px;color:#8fa2bd}
</style></head>
<body><div class="card">
  <div class="top">
    <img class="brand" src="${esc(abs(baseUrl, LOGO_URL) || "")}" alt="VIA AIR"/>
    <div style="text-align:right">
      <div class="tag">Hotel selecionado</div>
      <div class="sub">Confira os detalhes da sua hospedagem</div>
    </div>
  </div>
  ${foto ? `<img class="hero" src="${esc(foto)}" alt="${esc(d.nome)}"/>` : `<div class="hero-ph"></div>`}
  <div class="body">
    ${estrelas(d.estrelas)}
    <div class="name">${esc(d.nome)}</div>
    <div class="loc">${PIN}${esc(d.endereco)}</div>
    <div class="meta">
      ${CAL}
      <div>
        <div class="dates">${esc(d.check_in)} &rarr; ${esc(d.check_out)}</div>
        <div class="noites">${d.noites} ${d.noites === 1 ? "noite" : "noites"}${d.quartos ? ` &middot; ${d.quartos} ${d.quartos === 1 ? "quarto" : "quartos"}` : ""}${d.pax_label ? ` &middot; ${esc(d.pax_label)}` : ""}</div>
      </div>
      ${
        d.tipo_quarto || d.regime
          ? `<div class="sep"></div><div class="room">${esc(d.tipo_quarto || "")}${d.tipo_quarto && d.regime ? "<br/>" : ""}${esc(d.regime || "")}</div>`
          : ""
      }
    </div>
    ${chips ? `<div class="ams">${chips}</div>` : ""}
    ${nota}
    ${d.cancelamento_gratis ? `<div class="free">${CHECK}Cancelamento grátis</div>` : ""}
  </div>
  <div class="foot">
    <div class="lab">VALOR TOTAL DA HOSPEDAGEM</div>
    <div class="price">${esc(d.total_formatado).replace(/^R\$\s*/, "<small>R$</small>")}</div>
    ${parcela}
    <div class="safe">Compra 100% segura &bull; VIA AIR</div>
  </div>
</div></body></html>`;
}
