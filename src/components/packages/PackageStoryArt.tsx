/**
 * Arte 9:16 (1080x1920) para Instagram Story do pacote pronto.
 * Porta 1:1 do mockup aprovado (Tailwind 540x960) escalado 2x via transform.
 * Todos os campos vêm do cadastro; a frase (tagline) é gerada por IA.
 * Regras específicas do Story:
 *  - destino: 1 palavra → tudo laranja; 2+ palavras → 1ª branca em cima, resto laranja embaixo
 *  - frase: máximo 4 palavras (garantido pelo prompt/pós-processamento em ai.functions)
 *  - card de pagamento: inclui aviso "*Boleto sujeito a análise de crédito."
 */
import { forwardRef, Fragment, type ReactElement } from "react";
import logoAsset from "@/assets/viaair-logo-white.png.asset.json";
import type { FeedArtData } from "./PackageFeedArt";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const I = {
  mapPin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  ),
  plane: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  ),
  coffee: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>
  ),
  briefcase: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
  ),
  bus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h.01M7 18h.01M20 18v-8a3 3 0 0 0-3-3H7a5 5 0 0 0-5 5v6h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
  ),
  wifi: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
};

type IncludeItem = { key: keyof FeedArtData["inclusos"]; label: string; icon: ReactElement };
const INCLUDES: IncludeItem[] = [
  { key: "aereo",             label: "Aéreo",    icon: I.plane },
  { key: "hotel",             label: "Hotel",    icon: I.building },
  { key: "cafeDaManha",       label: "Café",     icon: I.coffee },
  { key: "bagagem23kg",       label: "Bagagem",  icon: I.briefcase },
  { key: "transfer",          label: "Transfer", icon: I.bus },
  { key: "seguroViagem",      label: "Seguro",   icon: I.shield },
  { key: "esimInternacional", label: "eSIM",     icon: I.wifi },
];

function splitDestino(destino: string) {
  const parts = destino.trim().split(/\s+/);
  if (parts.length === 1) return { top: "", bottom: parts[0].toUpperCase() };
  return { top: parts[0].toUpperCase(), bottom: parts.slice(1).join(" ").toUpperCase() };
}

const APT_LABEL: Record<number, string> = {
  1: "individual", 2: "duplo", 3: "triplo", 4: "quádruplo", 5: "quíntuplo",
};

export const PackageStoryArt = forwardRef<HTMLDivElement, { data: FeedArtData }>(function PackageStoryArt(
  { data },
  ref,
) {
  const parcelas = data.parcelas || 10;
  const valorParcela = (data.valorTotal || 0) / parcelas;
  const [reais, centavos] = BRL(valorParcela).split(",");
  const includes = INCLUDES.filter((it) => data.inclusos[it.key]);
  const { top, bottom } = splitDestino(data.destino);
  const stars = data.estrelas && data.estrelas > 0 ? Math.max(1, Math.min(5, Math.round(data.estrelas))) : 0;
  const apto = data.apartamento || APT_LABEL[data.quantidadePessoas] || "";
  const nightsLabel = data.noites ? `${data.noites} ${data.noites === 1 ? "noite" : "noites"}` : "";

  return (
    <div ref={ref}>
      <style>{CSS}</style>
      <div className="vstory-outer">
        <div className="vstory-inner">
          {/* Background */}
          <div className="vstory-bg">
            <img src={data.backgroundDataUrl} alt="" crossOrigin="anonymous" />
            <div className="vstory-bg-grad" />
          </div>

          {/* Content */}
          <div className="vstory-content">
            {/* TOP */}
            <div className="vstory-top">
              <div className="vstory-logo-wrap">
                <img src={logoAsset.url} alt="Via Air" crossOrigin="anonymous" />
              </div>

              {data.estado ? (
                <div className="vstory-tag-wrap">
                  <div className="vstory-tag">
                    <span className="vstory-tag-icon">{I.mapPin}</span>
                    <span className="vstory-tag-text">{data.estado}</span>
                  </div>
                </div>
              ) : null}

              <h2 className="vstory-dest">
                {top ? (
                  <>
                    {top}
                    <br />
                    <span>{bottom}</span>
                  </>
                ) : (
                  <span>{bottom}</span>
                )}
              </h2>

              <div className="vstory-sub-wrap">
                <p className="vstory-sub">{data.frase}</p>
                <svg className="vstory-swoosh" viewBox="0 0 200 20" preserveAspectRatio="none">
                  <path d="M5,15 Q100,0 195,15" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* BOTTOM */}
            <div className="vstory-bottom">
              {/* Flight & Hotel Info */}
              <div className="vstory-info glass-panel">
                <div className="vstory-info-col">
                  <div className="vstory-info-icon">{I.calendar}</div>
                  <p className="vstory-info-strong">{data.dataIda}</p>
                  <p className="vstory-info-small">até {data.dataVolta}</p>
                  {nightsLabel ? <p className="vstory-info-small">{nightsLabel}</p> : null}
                </div>
                <div className="vstory-info-div" />
                <div className="vstory-info-col">
                  <div className="vstory-info-icon">{I.plane}</div>
                  <p className="vstory-info-small">Saída de</p>
                  <p className="vstory-info-strong">{data.origem}</p>
                </div>
                <div className="vstory-info-div" />
                <div className="vstory-info-col vstory-info-col-hotel">
                  <div className="vstory-info-icon">{I.building}</div>
                  <p className="vstory-info-hotel">{data.hotel}</p>
                  {stars > 0 ? (
                    <div className="vstory-stars">
                      {Array.from({ length: stars }).map((_, i) => (
                        <span key={i}>{I.star}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Includes */}
              <div className="vstory-inc glass-panel">
                {includes.map((it) => (
                  <Fragment key={it.key}>
                    <div className="vstory-inc-item">
                      <div className="vstory-inc-icon">{it.icon}</div>
                      <span>{it.label}</span>
                    </div>
                  </Fragment>
                ))}
              </div>

              {/* Pricing */}
              <div className="vstory-price glass-panel-dark">
                <p className="vstory-price-kicker">A PARTIR DE</p>
                <div className="vstory-price-line">
                  <span className="vstory-price-x">{parcelas}x</span>
                  <span className="vstory-price-cur">R$</span>
                  <span className="vstory-price-num">{reais}</span>
                  <span className="vstory-price-cents">,{centavos}</span>
                </div>
                <div className="vstory-price-bar" />
                <p className="vstory-price-total">
                  Total do pacote: <span>R$ {BRL(data.valorTotal)}</span>
                </p>
              </div>

              {/* Info Boxes */}
              <div className="vstory-side">
                <div className="vstory-side-card glass-panel-dark">
                  <div className="vstory-side-icon">{I.users}</div>
                  <p>
                    Valor para {data.quantidadePessoas} {data.quantidadePessoas === 1 ? "pessoa" : "pessoas"}
                    {apto ? ` em apto ${apto}` : ""}
                  </p>
                </div>
                <div className="vstory-side-card glass-panel-dark">
                  <div className="vstory-side-icon">{I.card}</div>
                  <p>
                    No cartão e boleto bancário sem juros
                    <br />
                    <span className="vstory-side-fine">*Boleto sujeito a análise de crédito.</span>
                  </p>
                </div>
              </div>

              <p className="vstory-note">*Sujeito à disponibilidade de vagas e alteração tarifária sem aviso prévio.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* CSS 1:1 com o mockup Story 540x960. Outer escala 2x → 1080x1920. */
const CSS = `
.vstory-outer{width:1080px;height:1920px;position:relative;background:#000;overflow:hidden;--brand-orange:#ff7f00}
.vstory-outer *{box-sizing:border-box}
.vstory-inner{width:540px;height:960px;position:absolute;top:0;left:0;transform:scale(2);transform-origin:top left;background:#000;color:#fff;font-family:'Montserrat',Arial,sans-serif;overflow:hidden}
.vstory-bg{position:absolute;inset:0;z-index:0}
.vstory-bg img{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}
.vstory-bg-grad{position:absolute;inset:0;background:transparent}
.vstory-content{position:relative;z-index:10;width:100%;height:100%;padding:28px 28px 20px;display:flex;flex-direction:column;justify-content:space-between}
.vstory-top{display:flex;flex-direction:column;margin-top:8px}
.vstory-logo-wrap{display:flex;align-items:center;margin-bottom:24px;height:44px}
.vstory-logo-wrap img{max-height:100%;max-width:200px;object-fit:contain;display:block}
.vstory-tag-wrap{margin-bottom:14px}
.vstory-tag{display:inline-flex;align-items:center;border:1px solid var(--brand-orange);border-radius:9999px;padding:5px 18px}
.vstory-tag-icon{width:16px;height:16px;color:var(--brand-orange);margin-right:8px;display:inline-flex}
.vstory-tag-icon svg{width:16px;height:16px}
.vstory-tag-text{color:var(--brand-orange);font-weight:700;letter-spacing:.18em;text-transform:uppercase;font-size:13px;line-height:1}
.vstory-dest{font-size:96px;font-weight:900;line-height:.9;letter-spacing:-.03em;margin:0;text-shadow:0 4px 12px rgba(0,0,0,.55),0 8px 24px rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.35);text-transform:uppercase;color:#fff}
.vstory-dest span{color:var(--brand-orange)}
.vstory-sub-wrap{position:relative;display:inline-block;align-self:flex-start;margin-top:12px}
.vstory-sub{font-family:'Dancing Script','Brush Script MT',cursive;font-size:48px;line-height:1;margin:0;padding-right:20px;position:relative;z-index:10;text-shadow:0 2px 8px rgba(0,0,0,.4);font-weight:700}
.vstory-swoosh{position:absolute;width:100%;height:14px;bottom:-6px;left:0;color:var(--brand-orange)}
.vstory-bottom{display:flex;flex-direction:column;gap:14px}
.glass-panel{background:rgba(0,0,0,.30);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.30);border-radius:20px}
.glass-panel-dark{background:rgba(20,20,20,.35);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.18);border-radius:20px}
.vstory-info{width:100%;padding:20px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.vstory-info-col{display:flex;flex-direction:column;align-items:center;text-align:center;flex:1;min-width:0}
.vstory-info-col-hotel{max-width:150px}
.vstory-info-icon{width:26px;height:26px;margin-bottom:6px;color:rgba(255,255,255,.9);display:inline-flex}
.vstory-info-icon svg{width:26px;height:26px}
.vstory-info-strong{margin:0;font-weight:700;font-size:16px;line-height:1.2}
.vstory-info-small{margin:0;font-size:13px;color:rgba(255,255,255,.85);line-height:1.25}
.vstory-info-hotel{margin:0;font-weight:700;font-size:14px;line-height:1.15;word-wrap:break-word;hyphens:auto;text-align:center}
.vstory-info-div{width:1px;height:56px;background:rgba(255,255,255,.2);flex-shrink:0}
.vstory-stars{display:flex;justify-content:center;gap:2px;color:var(--brand-orange);margin-top:4px}
.vstory-stars svg{width:12px;height:12px}
.vstory-inc{width:100%;padding:18px 10px;display:flex;justify-content:space-around;align-items:flex-start;flex-wrap:wrap;gap:8px}
.vstory-inc-item{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:64px}
.vstory-inc-item .vstory-inc-icon{width:30px;height:30px;margin-bottom:6px;color:rgba(255,255,255,.95);display:inline-flex}
.vstory-inc-item .vstory-inc-icon svg{width:30px;height:30px}
.vstory-inc-item span{font-size:13px;line-height:1.15;font-weight:600;color:rgba(255,255,255,.9)}
.vstory-price{width:100%;padding:20px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.vstory-price-kicker{margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.18em;color:rgba(255,255,255,.7)}
.vstory-price-line{display:flex;align-items:baseline;justify-content:center;margin-bottom:6px}
.vstory-price-x{font-size:18px;font-weight:700;margin-right:6px}
.vstory-price-cur{font-size:28px;font-weight:700;color:var(--brand-orange);margin-right:6px}
.vstory-price-num{font-size:84px;font-weight:900;color:var(--brand-orange);letter-spacing:-.04em;line-height:1}
.vstory-price-cents{font-size:32px;font-weight:700;color:var(--brand-orange)}
.vstory-price-bar{width:100%;height:1px;background:var(--brand-orange);opacity:.5;margin:10px 0}
.vstory-price-total{margin:0;font-size:16px;font-weight:500;text-align:center}
.vstory-price-total span{color:var(--brand-orange);font-weight:700}
.vstory-side{display:flex;flex-direction:column;gap:8px}
.vstory-side-card{width:100%;padding:14px 16px;display:flex;align-items:center;gap:12px}
.vstory-side-icon{width:26px;height:26px;color:rgba(255,255,255,.9);display:inline-flex;flex-shrink:0}
.vstory-side-icon svg{width:26px;height:26px}
.vstory-side-card p{margin:0;font-size:13px;font-weight:500;line-height:1.3;color:#fff}
.vstory-side-fine{opacity:.7;font-size:11px}
.vstory-note{margin:6px 0 0;text-align:center;font-size:10px;color:rgba(255,255,255,.5);line-height:1.2;padding:0 8px}
`;
