/**
 * Arte 3:4 (1080x1440) para post de pacote pronto.
 * Porta 1:1 do mockup aprovado (React/Tailwind 768x1024) escalado por 1.40625
 * via transform, preservando estrutura/CSS/posições/tamanhos/fontes.
 * Todos os campos vêm do cadastro; a frase (tagline) é gerada por IA.
 */
import { forwardRef, Fragment, type ReactElement } from "react";
import logoAsset from "@/assets/viaair-logo-white.png.asset.json";

export type FeedArtData = {
  backgroundDataUrl: string;
  estado?: string | null;
  destino: string;
  frase: string;
  dataIda: string;
  dataVolta: string;
  noites: number | null;
  origem: string;
  hotel: string;
  estrelas: number | null;
  quantidadePessoas: number;
  apartamento: string;
  parcelas: number;
  valorTotal: number;
  inclusos: {
    aereo: boolean;
    hotel: boolean;
    cafeDaManha: boolean;
    bagagem23kg: boolean;
    transfer: boolean;
    seguroViagem: boolean;
    esimInternacional: boolean;
  };
};

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Ícones (lucide, stroke 2, 24x24). Cor herdada de currentColor. */
const I = {
  mapPin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  ),
  planeTakeoff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22h20"/><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3 7.65-1.87a2 2 0 0 1 2.43 2.43L20.66 17"/></svg>
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
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
};

type IncludeItem = { key: keyof FeedArtData["inclusos"]; label: string; icon: ReactElement };
const INCLUDES: IncludeItem[] = [
  { key: "aereo",             label: "Aéreo",              icon: I.plane },
  { key: "hotel",             label: "Hotel",              icon: I.building },
  { key: "cafeDaManha",       label: "Café da\nmanhã",     icon: I.coffee },
  { key: "bagagem23kg",       label: "Bagagem\n23 kg",     icon: I.briefcase },
  { key: "transfer",          label: "Transfer",           icon: I.bus },
  { key: "seguroViagem",      label: "Seguro\nViagem",     icon: I.shield },
  { key: "esimInternacional", label: "eSIM\nIntl.",        icon: I.wifi },
];

function splitDestino(destino: string) {
  const parts = destino.trim().split(/\s+/);
  if (parts.length === 1) return { top: parts[0].toUpperCase(), bottom: "" };
  // duas ou mais: 1ª palavra em cima, resto embaixo colorido
  return { top: parts[0].toUpperCase(), bottom: parts.slice(1).join(" ").toUpperCase() };
}

export const PackageFeedArt = forwardRef<HTMLDivElement, { data: FeedArtData }>(function PackageFeedArt(
  { data },
  ref,
) {
  const parcelas = data.parcelas || 10;
  const valorParcela = (data.valorTotal || 0) / parcelas;
  const [reais, centavos] = BRL(valorParcela).split(",");
  const includes = INCLUDES.filter((it) => data.inclusos[it.key]);
  const { top, bottom } = splitDestino(data.destino);
  const stars = data.estrelas && data.estrelas > 0 ? Math.max(1, Math.min(5, Math.round(data.estrelas))) : 0;

  return (
    <div ref={ref}>
      <style>{CSS}</style>
      {/* 1080x1440 outer; conteúdo desenhado em 768x1024 e escalado 1.40625x */}
      <div className="vfeed-outer">
        <div className="vfeed-inner">
          {/* Background */}
          <div className="vfeed-bg">
            <img src={data.backgroundDataUrl} alt="" crossOrigin="anonymous" />
            <div className="vfeed-bg-grad" />
          </div>

          {/* Conteúdo */}
          <div className="vfeed-content">
            {/* TOP */}
            <div className="vfeed-top">
              <div className="vfeed-logo-wrap">
                <img src={logoAsset.url} alt="Via Air" crossOrigin="anonymous" />
              </div>

              {data.estado ? (
                <div className="vfeed-tag-wrap">
                  <div className="vfeed-tag">
                    <span className="vfeed-tag-icon">{I.mapPin}</span>
                    <span className="vfeed-tag-text">{data.estado}</span>
                  </div>
                </div>
              ) : null}

              <h2 className="vfeed-dest">
                {bottom ? (
                  <>
                    {top}
                    <br />
                    <span>{bottom}</span>
                  </>
                ) : (
                  <span>{top}</span>
                )}
              </h2>

              <div className="vfeed-sub-wrap">
                <p className="vfeed-sub">{data.frase}</p>
                <svg className="vfeed-swoosh" viewBox="0 0 200 20" preserveAspectRatio="none">
                  <path d="M5,15 Q100,0 195,15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* BOTTOM */}
            <div className="vfeed-bottom">
              {/* Info panel */}
              <div className="vfeed-info glass-panel">
                <div className="vfeed-info-col">
                  <div className="vfeed-info-icon">{I.calendar}</div>
                  <p className="vfeed-info-strong">{data.dataIda}</p>
                  <p className="vfeed-info-mid">até {data.dataVolta}</p>
                  {data.noites ? <p className="vfeed-info-small">{data.noites} noites</p> : null}
                </div>
                <div className="vfeed-info-div" />
                <div className="vfeed-info-col vfeed-info-col-plane">
                  <div className="vfeed-info-icon">{I.plane}</div>
                  <p className="vfeed-info-mid">Saída de</p>
                  <p className="vfeed-info-strong">{data.origem}</p>
                </div>
                <div className="vfeed-info-div" />
                <div className="vfeed-info-col vfeed-info-col-hotel">
                  <div className="vfeed-info-icon">{I.building}</div>
                  <p className="vfeed-info-hotel">{data.hotel}</p>
                  {stars > 0 ? (
                    <div className="vfeed-stars">
                      {Array.from({ length: stars }).map((_, i) => (
                        <span key={i}>{I.star}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Divisor "O pacote inclui" */}
              <div className="vfeed-inc-div">
                <div className="vfeed-inc-line" />
                <h3>O Pacote Inclui</h3>
                <div className="vfeed-inc-line" />
              </div>

              {/* Includes */}
              <div className="vfeed-inc glass-panel">
                {includes.map((it, index) => (
                  <Fragment key={it.key}>
                    {index > 0 ? <div className="vfeed-inc-sep" /> : null}
                    <div className="vfeed-inc-item">
                      <div className="vfeed-inc-icon">{it.icon}</div>
                      <span>{it.label}</span>
                    </div>
                  </Fragment>
                ))}
              </div>

              {/* Pricing row */}
              <div className="vfeed-price-row">
                <div className="vfeed-price glass-panel-dark">
                  <div>
                    <p className="vfeed-price-kicker">A PARTIR DE</p>
                    <div className="vfeed-price-line">
                      <span className="vfeed-price-x">{parcelas}x de</span>
                      <span className="vfeed-price-cur">R$</span>
                      <span className="vfeed-price-num">{reais}</span>
                      <span className="vfeed-price-cents">,{centavos}</span>
                    </div>
                    <div className="vfeed-price-bar" />
                    <p className="vfeed-price-total">
                      Total do pacote: <span>R$ {BRL(data.valorTotal)}</span>
                    </p>
                    <div className="vfeed-price-bar" />
                  </div>
                  <div className="vfeed-price-pay">
                    <div className="vfeed-inc-icon">{I.card}</div>
                    <p>No cartão e boleto bancário sem juros<br/><span style={{opacity:.7,fontSize:'10px'}}>*Boleto sujeito a análise de crédito.</span></p>
                  </div>
                </div>

                <div className="vfeed-side">
                  <div className="vfeed-side-card glass-panel-dark">
                    <div className="vfeed-side-icon">{I.users}</div>
                    <p>
                      Valor para {data.quantidadePessoas} {data.quantidadePessoas === 1 ? "pessoa" : "pessoas"}
                      <br />
                      em apartamento {data.apartamento}
                    </p>
                  </div>
                  <div className="vfeed-side-card glass-panel-dark">
                    <div className="vfeed-side-icon">{I.info}</div>
                    <p className="vfeed-side-small">Sujeito à disponibilidade de vagas e alteração tarifária sem aviso prévio.</p>
                  </div>
                </div>
              </div>

              <p className="vfeed-note">*Imagens meramente ilustrativas.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* CSS 1:1 com o mockup. Todos os valores px são os do mockup 768x1024
   (breakpoint sm ativo, já que o inner é 768px). O outer escala para 1080x1440. */
const CSS = `
.vfeed-outer{width:1080px;height:1440px;position:relative;background:#000;overflow:hidden;--brand-orange:#ff7f00}
.vfeed-outer *{box-sizing:border-box}
.vfeed-inner{width:768px;height:1024px;position:absolute;top:0;left:0;transform:scale(1.40625);transform-origin:top left;background:#000;color:#fff;font-family:'Montserrat',Arial,sans-serif;overflow:hidden;border-radius:0}
.vfeed-bg{position:absolute;inset:0;z-index:0}
.vfeed-bg img{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}
.vfeed-bg-grad{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.60) 0%,rgba(0,0,0,0) 45%,rgba(0,0,0,.95) 100%)}
.vfeed-content{position:relative;z-index:10;width:100%;height:100%;padding:40px;display:flex;flex-direction:column;justify-content:space-between}
.vfeed-top{display:flex;flex-direction:column}
.vfeed-logo-wrap{display:flex;align-items:center;margin-bottom:32px;height:48px}
.vfeed-logo-wrap img{max-height:100%;max-width:200px;object-fit:contain;display:block}
.vfeed-tag-wrap{margin-bottom:8px}
.vfeed-tag{display:inline-flex;align-items:center;border:1px solid var(--brand-orange);border-radius:9999px;padding:6px 16px}
.vfeed-tag-icon{width:18px;height:18px;color:var(--brand-orange);margin-right:8px;display:inline-flex}
.vfeed-tag-icon svg{width:18px;height:18px}
.vfeed-tag-text{color:var(--brand-orange);font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:14px;line-height:1}
.vfeed-dest{font-size:100px;font-weight:900;line-height:.9;letter-spacing:-.04em;margin:0;text-shadow:0 4px 12px rgba(0,0,0,.55), 0 8px 24px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.35);text-transform:uppercase;color:#fff}
.vfeed-dest span{color:var(--brand-orange)}
.vfeed-sub-wrap{position:relative;display:inline-block;align-self:flex-start;margin-top:8px;margin-bottom:40px}
.vfeed-sub{font-family:'Dancing Script','Brush Script MT',cursive;font-size:48px;line-height:1;margin:0;padding-right:16px;position:relative;z-index:10;text-shadow:0 2px 8px rgba(0,0,0,.4)}
.vfeed-swoosh{position:absolute;width:100%;height:16px;bottom:-4px;left:0;color:var(--brand-orange)}
.vfeed-bottom{display:flex;flex-direction:column;gap:16px}
.glass-panel{background:rgba(0,0,0,.30);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.30);border-radius:16px}
.glass-panel-dark{background:rgba(0,0,0,.45);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.18);border-radius:16px}
.vfeed-info{display:inline-flex;align-self:flex-start;padding:20px 24px;align-items:center;gap:20px}
.vfeed-info-col{display:flex;flex-direction:column;align-items:center;text-align:center;flex-shrink:0}
.vfeed-info-col-plane{width:110px}
.vfeed-info-col-hotel{width:170px}
.vfeed-info-icon{width:30px;height:30px;margin-bottom:8px;color:rgba(255,255,255,.9);display:inline-flex}
.vfeed-info-icon svg{width:30px;height:30px}
.vfeed-info-strong{margin:0;font-weight:700;font-size:18px;line-height:1.2}
.vfeed-info-mid{margin:0;font-weight:500;font-size:16px;line-height:1.2;color:rgba(255,255,255,.8)}
.vfeed-info-small{margin:0;font-size:14px;color:rgba(255,255,255,.6);line-height:1.2}
.vfeed-info-hotel{margin:0;font-weight:700;font-size:16px;line-height:1.15;margin-bottom:4px;word-wrap:break-word;hyphens:auto}
.vfeed-info-div{width:1px;height:64px;background:rgba(255,255,255,.20);flex-shrink:0}
.vfeed-stars{display:flex;justify-content:center;gap:4px;color:var(--brand-orange)}
.vfeed-stars svg{width:14px;height:14px}
/* includes divider */
.vfeed-inc-div{display:flex;align-items:center;margin:4px 0}
.vfeed-inc-line{flex:1;height:2px;background:var(--brand-orange)}
.vfeed-inc-div h3{margin:0;padding:0 16px;font-weight:700;letter-spacing:.1em;font-size:16px;text-transform:uppercase;color:rgba(255,255,255,.9)}
/* includes */
.vfeed-inc{align-self:flex-start;padding:16px 12px;display:inline-flex;gap:20px;align-items:center}
.vfeed-inc-item{display:flex;flex-direction:column;align-items:center;text-align:center;width:64px}
.vfeed-inc-item .vfeed-inc-icon{width:30px;height:30px;margin-bottom:8px;color:#fff;display:inline-flex}
.vfeed-inc-item .vfeed-inc-icon svg{width:30px;height:30px}
.vfeed-inc-item span{font-size:14px;line-height:1.15;font-weight:600;white-space:pre-line}
.vfeed-inc-sep{width:1px;height:48px;background:rgba(255,255,255,.20)}
/* pricing */
.vfeed-price-row{display:flex;gap:16px;width:100%}
.vfeed-price{flex:1.4;padding:20px;display:flex;flex-direction:column;justify-content:space-between}
.vfeed-price-kicker{margin:0 0 4px;font-size:14px;font-weight:700;letter-spacing:.15em;color:rgba(255,255,255,.7)}
.vfeed-price-line{display:flex;align-items:baseline;margin-bottom:8px}
.vfeed-price-x{font-size:20px;font-weight:700;margin-right:4px}
.vfeed-price-cur{font-size:24px;font-weight:700;color:var(--brand-orange);margin-right:4px}
.vfeed-price-num{font-size:60px;font-weight:900;color:var(--brand-orange);letter-spacing:-.04em;line-height:1}
.vfeed-price-cents{font-size:30px;font-weight:700;color:var(--brand-orange)}
.vfeed-price-bar{width:100%;height:1px;background:var(--brand-orange);margin:4px 0}
.vfeed-price-total{margin:0;font-size:14px;font-weight:500;text-align:center}
.vfeed-price-total span{color:var(--brand-orange);font-weight:700}
.vfeed-price-pay{display:flex;align-items:center;margin-top:12px;color:rgba(255,255,255,.8)}
.vfeed-price-pay .vfeed-inc-icon{width:26px;height:26px;margin-right:12px;color:rgba(255,255,255,.8);display:inline-flex}
.vfeed-price-pay .vfeed-inc-icon svg{width:26px;height:26px}
.vfeed-price-pay p{margin:0;font-size:12px;line-height:1.2;font-weight:500}
/* side */
.vfeed-side{flex:1;display:flex;flex-direction:column;gap:16px}
.vfeed-side-card{flex:1;padding:12px 16px;display:flex;align-items:center}
.vfeed-side-icon{width:30px;height:30px;margin-right:12px;color:rgba(255,255,255,.9);display:inline-flex;flex-shrink:0}
.vfeed-side-icon svg{width:30px;height:30px}
.vfeed-side-card p{margin:0;font-size:14px;font-weight:500;line-height:1.2}
.vfeed-side-small{font-size:12px !important;color:rgba(255,255,255,.8)}
.vfeed-note{text-align:center;font-size:10px;color:rgba(255,255,255,.4);margin:4px 0 0}
`;
