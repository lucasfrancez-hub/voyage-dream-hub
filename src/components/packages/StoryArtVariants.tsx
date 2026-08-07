/**
 * Modelos alternativos de arte 9:16 (1080x1920) para PASSEIO e INGRESSO.
 * Mantém a identidade do Story de pacote (fundo + gradiente + glass blur + laranja),
 * mas reorganiza a informação para produtos avulsos.
 *
 * Regras:
 *  - O título é SEMPRE o nome do passeio/ingresso (sem frase de IA).
 *  - O tamanho do título se ajusta ao comprimento do nome (auto-fit).
 *  - Sem hotel, sem noites, sem origem — campos que só fazem sentido em pacote.
 */
import { forwardRef } from "react";
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
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  ),
  bus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h.01M7 18h.01M20 18v-8a3 3 0 0 0-3-3H7a5 5 0 0 0-5 5v6h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
  ),
  ticket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/><path d="M9 6v2M9 11v2M9 16v2"/></svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5"/></svg>
  ),
};

export type ArtMode = "passeio" | "ingresso";
export type ArtVariant = 1 | 2 | 3;
/** story = 1080x1920 (9:16) | feed = 1080x1440 (3:4) */
export type ArtFormat = "story" | "feed";

/** Deriva o modo (passeio/ingresso) a partir do kind do produto. */
export function artModeFromKind(kind?: string | null): ArtMode {
  return kind === "service" ? "ingresso" : "passeio";
}


/** Auto-fit: nomes longos (passeios) reduzem a fonte sem quebrar a estrutura. */
function titleSize(name: string, base: number) {
  const n = name.trim().length;
  if (n <= 12) return base;
  if (n <= 18) return base * 0.86;
  if (n <= 26) return base * 0.72;
  if (n <= 36) return base * 0.6;
  if (n <= 50) return base * 0.5;
  return base * 0.42;
}

function titleOf(data: FeedArtData, mode: ArtMode) {
  const t = (data.title || "").trim();
  if (t) return t;
  if (mode === "ingresso") return (data.ticketsParks?.[0] || data.destino || "Ingresso").trim();
  return (data.passeiosList?.[0] || data.destino || "Passeio").trim();
}

function dateLabel(data: FeedArtData) {
  if (data.dateMode === "flexible" || data.flexibleDates || !data.dataIda) return "Data flexível";
  if (data.dataVolta && data.dataVolta !== data.dataIda) return `${data.dataIda} a ${data.dataVolta}`;
  return data.dataIda;
}

export const StoryArtVariant = forwardRef<
  HTMLDivElement,
  { data: FeedArtData; mode: ArtMode; variant: ArtVariant; format?: ArtFormat }
>(function StoryArtVariant({ data, mode, variant, format = "story" }, ref) {

  const parcelas = data.parcelas || 10;
  const total = data.valorTotal || 0;
  const [reais, centavos] = BRL(total / parcelas).split(",");
  const title = titleOf(data, mode);
  const isIngresso = mode === "ingresso";
  const kicker = isIngresso ? "Ingresso" : "Passeio";
  const icon = isIngresso ? I.ticket : I.bus;
  const local = (data.estado || data.destino || "").trim();
  const itens = ((isIngresso ? data.ticketsParks : data.passeiosList) ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);

  const priceBlock = (
    <div className="vsv-price glass-dark">
      <p className="vsv-kicker-sm">A PARTIR DE</p>
      <div className="vsv-price-line">
        <span className="vsv-price-x">{parcelas}x</span>
        <span className="vsv-price-cur">R$</span>
        <span className="vsv-price-num">{reais}</span>
        <span className="vsv-price-cents">{`,${centavos ?? "00"}`}</span>
      </div>
      <div className="vsv-price-bar" />
      <p className="vsv-price-total">
        {isIngresso ? "Valor do ingresso: " : "Valor do passeio: "}
        <span>R$ {BRL(total)}</span>
      </p>
    </div>
  );

  const payNote = (
    <div className="vsv-card glass-dark">
      <div className="vsv-card-icon">{I.card}</div>
      <p>
        {data.isCativa ? "15x sem juros no cartão Visa e Amex" : `Cartão em até ${parcelas}x sem juros`}
        <br />
        <span className="vsv-fine">
          {isIngresso ? "*Sem boleto para ingressos." : "*Sujeito à disponibilidade de vagas."}
        </span>
      </p>
    </div>
  );

  const perPerson = (
    <div className="vsv-card glass-dark">
      <div className="vsv-card-icon">{isIngresso ? I.ticket : I.users}</div>
      <p>
        {isIngresso
          ? "Preço por ingresso"
          : "Valor por pessoa"}
      </p>
    </div>
  );

  return (
    <div ref={ref}>
      <style>{CSS}</style>
      <div
        className={`vsv-outer vsv-v${variant} vsv-fmt-${format} ${isIngresso ? "vsv-ingresso" : "vsv-passeio"}`}
      >
        <div className="vsv-inner">
          <div className="vsv-bg">
            {data.backgroundDataUrl ? <img src={data.backgroundDataUrl} alt="" /> : <div className="vsv-bg-fallback" />}
            <div className="vsv-bg-grad" />
          </div>

          <div className="vsv-content">
            {/* ================= TOPO ================= */}
            <div className="vsv-top">
              <div className="vsv-logo">
                <img src={logoAsset.url} alt="Via Air" crossOrigin="anonymous" />
              </div>

              {/* VARIANTE 1 — Etiqueta + título com auto-fit */}
              {variant === 1 ? (
                <>
                  <div className="vsv-tag">
                    <span className="vsv-tag-icon">{icon}</span>
                    <span className="vsv-tag-text">{kicker}</span>
                  </div>
                  <h2 className="vsv-title" style={{ fontSize: titleSize(title, 66) }}>
                    {title}
                  </h2>
                  {local ? (
                    <p className="vsv-local">
                      <span className="vsv-local-icon">{I.mapPin}</span>
                      {local}
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* VARIANTE 2 — Faixa laranja com o tipo, título em bloco */}
              {variant === 2 ? (
                <>
                  <div className="vsv-band">
                    <span>{kicker.toUpperCase()}</span>
                    {local ? <em>{local}</em> : null}
                  </div>
                  <h2 className="vsv-title vsv-title-block" style={{ fontSize: titleSize(title, 60) }}>
                    {title}
                  </h2>
                </>
              ) : null}

              {/* VARIANTE 3 — Título dentro de painel de vidro (nome muito longo cabe) */}
              {variant === 3 ? (
                <div className="vsv-titlecard glass">
                  <div className="vsv-titlecard-head">
                    <span className="vsv-tc-icon">{icon}</span>
                    <span className="vsv-tc-kicker">{kicker.toUpperCase()}</span>
                    {local ? <span className="vsv-tc-local">{local}</span> : null}
                  </div>
                  <h2 className="vsv-title vsv-title-card" style={{ fontSize: titleSize(title, 52) }}>
                    {title}
                  </h2>
                </div>
              ) : null}
            </div>

            {/* ================= BASE ================= */}
            <div className="vsv-bottom">
              {/* Linha de informação: muda por tipo */}
              <div className="vsv-info glass">
                <div className="vsv-info-col">
                  <div className="vsv-info-icon">{I.calendar}</div>
                  <p className="vsv-info-strong">{dateLabel(data)}</p>
                  <p className="vsv-info-small">{isIngresso ? "validade na compra" : "você escolhe"}</p>
                </div>
                <div className="vsv-info-div" />
                <div className="vsv-info-col">
                  <div className="vsv-info-icon">{isIngresso ? I.ticket : I.clock}</div>
                  <p className="vsv-info-small">{isIngresso ? "Tipo" : "Duração"}</p>
                  <p className="vsv-info-strong">
                    {isIngresso ? "Data marcada" : data.noites ? `${data.noites} dia(s)` : "Diária"}
                  </p>
                </div>
                <div className="vsv-info-div" />
                <div className="vsv-info-col">
                  <div className="vsv-info-icon">{isIngresso ? I.mapPin : I.bus}</div>
                  <p className="vsv-info-small">{isIngresso ? "Local" : "Saída"}</p>
                  <p className="vsv-info-strong">{local || "—"}</p>
                </div>
              </div>

              {/* Itens/inclusos do produto */}
              {itens.length ? (
                <div className="vsv-list glass">
                  {itens.map((it) => (
                    <div className="vsv-list-item" key={it}>
                      <span className="vsv-list-icon">{I.check}</span>
                      <span>{it}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {priceBlock}

              <div className="vsv-cards">
                {perPerson}
                {payNote}
              </div>

              <p className="vsv-note">
                *Valores sujeitos a alteração e disponibilidade sem aviso prévio.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const CSS = `
.vsv-outer{width:1080px;height:1920px;position:relative;background:#000;overflow:hidden;--brand-orange:#ff7f00}
.vsv-outer *{box-sizing:border-box}
.vsv-inner{width:540px;height:960px;position:absolute;top:0;left:0;transform:scale(2);transform-origin:top left;background:#000;color:#fff;font-family:'Montserrat',Arial,sans-serif;overflow:hidden}
.vsv-bg{position:absolute;inset:0;z-index:0}
.vsv-bg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;display:block}
.vsv-bg-fallback{position:absolute;inset:0;background:linear-gradient(160deg,#1b2b3a,#0b1118 60%,#000)}
.vsv-bg-grad{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 38%,rgba(0,0,0,.95) 100%)}
.vsv-content{position:relative;z-index:10;width:100%;height:100%;padding:28px 28px 20px;display:flex;flex-direction:column;justify-content:space-between}
.glass{background:rgba(0,0,0,.42);backdrop-filter:blur(28px) saturate(140%);border:1px solid rgba(255,255,255,.30);border-radius:20px}
.glass-dark{background:rgba(15,15,15,.68);backdrop-filter:blur(28px) saturate(140%);border:1px solid rgba(255,255,255,.14);border-radius:20px}

.vsv-top{display:flex;flex-direction:column;margin-top:8px}
.vsv-logo{display:flex;align-items:center;margin-bottom:22px;height:44px}
.vsv-logo img{max-height:100%;max-width:200px;object-fit:contain;display:block}

.vsv-tag{display:inline-flex;align-items:center;align-self:flex-start;border:1px solid var(--brand-orange);border-radius:9999px;padding:5px 18px;margin-bottom:14px}
.vsv-tag-icon{width:16px;height:16px;color:var(--brand-orange);margin-right:8px;display:inline-flex}
.vsv-tag-icon svg{width:16px;height:16px}
.vsv-tag-text{color:var(--brand-orange);font-weight:700;letter-spacing:.18em;text-transform:uppercase;font-size:13px;line-height:1}

.vsv-title{margin:0;font-weight:900;line-height:1.02;letter-spacing:-.02em;color:#fff;text-transform:uppercase;text-shadow:0 4px 12px rgba(0,0,0,.55),0 8px 24px rgba(0,0,0,.45);overflow-wrap:anywhere}
.vsv-ingresso .vsv-title{color:var(--brand-orange)}
.vsv-local{display:flex;align-items:center;gap:6px;margin:12px 0 0;font-size:16px;font-weight:600;color:rgba(255,255,255,.92);text-shadow:0 2px 6px rgba(0,0,0,.6)}
.vsv-local-icon{width:16px;height:16px;color:var(--brand-orange);display:inline-flex}
.vsv-local-icon svg{width:16px;height:16px}

.vsv-band{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;background:var(--brand-orange);border-radius:6px;padding:6px 14px;margin-bottom:14px}
.vsv-band span{font-size:13px;font-weight:900;letter-spacing:.2em;color:#0d0d0d}
.vsv-band em{font-style:normal;font-size:12px;font-weight:700;color:rgba(0,0,0,.65);border-left:1px solid rgba(0,0,0,.35);padding-left:10px}
.vsv-title-block{border-left:4px solid var(--brand-orange);padding-left:14px}

.vsv-titlecard{padding:18px 18px 20px;align-self:stretch}
.vsv-titlecard-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.vsv-tc-icon{width:18px;height:18px;color:var(--brand-orange);display:inline-flex}
.vsv-tc-icon svg{width:18px;height:18px}
.vsv-tc-kicker{font-size:12px;font-weight:800;letter-spacing:.2em;color:var(--brand-orange)}
.vsv-tc-local{margin-left:auto;font-size:12px;font-weight:600;color:rgba(255,255,255,.8)}
.vsv-title-card{text-transform:none;letter-spacing:-.01em;text-shadow:none}

.vsv-bottom{display:flex;flex-direction:column;gap:12px}
.vsv-info{width:100%;padding:18px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.vsv-info-col{display:flex;flex-direction:column;align-items:center;text-align:center;flex:1;min-width:0}
.vsv-info-icon{width:24px;height:24px;margin-bottom:6px;color:rgba(255,255,255,.9);display:inline-flex}
.vsv-info-icon svg{width:24px;height:24px}
.vsv-info-strong{margin:0;font-weight:700;font-size:15px;line-height:1.2;overflow-wrap:anywhere}
.vsv-info-small{margin:0;font-size:12px;color:rgba(255,255,255,.82);line-height:1.25}
.vsv-info-div{width:1px;height:52px;background:rgba(255,255,255,.2);flex-shrink:0}

.vsv-list{width:100%;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.vsv-list-item{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:rgba(255,255,255,.95);line-height:1.2}
.vsv-list-icon{width:16px;height:16px;color:var(--brand-orange);display:inline-flex;flex-shrink:0}
.vsv-list-icon svg{width:16px;height:16px}

.vsv-price{width:100%;padding:20px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.vsv-kicker-sm{margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.18em;color:rgba(255,255,255,.7)}
.vsv-price-line{display:flex;align-items:baseline;justify-content:center;margin-bottom:6px}
.vsv-price-x{font-size:18px;font-weight:700;margin-right:6px}
.vsv-price-cur{font-size:28px;font-weight:700;color:var(--brand-orange);margin-right:6px}
.vsv-price-num{font-size:84px;font-weight:900;color:var(--brand-orange);letter-spacing:-.04em;line-height:1}
.vsv-price-cents{font-size:32px;font-weight:700;color:var(--brand-orange);margin-left:0;white-space:pre}
.vsv-price-bar{width:100%;height:1px;background:var(--brand-orange);opacity:.5;margin:10px 0}
.vsv-price-total{margin:0;font-size:16px;font-weight:500}
.vsv-price-total span{color:var(--brand-orange);font-weight:700}

.vsv-cards{display:flex;flex-direction:column;gap:8px}
.vsv-card{width:100%;padding:14px 16px;display:flex;align-items:center;gap:12px}
.vsv-card-icon{width:24px;height:24px;color:rgba(255,255,255,.9);display:inline-flex;flex-shrink:0}
.vsv-card-icon svg{width:24px;height:24px}
.vsv-card p{margin:0;font-size:13px;font-weight:500;line-height:1.3;color:#fff}
.vsv-fine{opacity:.7;font-size:11px}
.vsv-note{margin:4px 0 0;text-align:center;font-size:12px;color:rgba(255,255,255,.95);line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,.9);font-weight:500}

/* Variante 2: preço mais compacto, lista em 2 colunas */
.vsv-v2 .vsv-list{flex-direction:row;flex-wrap:wrap}
.vsv-v2 .vsv-list-item{width:calc(50% - 8px)}
.vsv-v2 .vsv-price-num{font-size:74px}

/* Variante 3: info em cartões separados e preço alinhado à esquerda */
.vsv-v3 .vsv-info{border-radius:20px;padding:16px 12px}
.vsv-v3 .vsv-price{text-align:left;align-items:flex-start}
.vsv-v3 .vsv-price-line{justify-content:flex-start}
.vsv-v3 .vsv-price-total{text-align:left}
/* Formato FEED 3:4 (1080x1440): mesma identidade, só a altura muda — caixas mantêm respiro */
.vsv-outer.vsv-fmt-feed{height:1440px}
.vsv-fmt-feed .vsv-inner{height:720px}
.vsv-fmt-feed .vsv-content{padding:22px 22px 16px}
.vsv-fmt-feed .vsv-logo{height:36px;margin-bottom:12px}
.vsv-fmt-feed .vsv-band{margin-bottom:12px}
.vsv-fmt-feed .vsv-bottom{gap:11px}
.vsv-fmt-feed .vsv-info{padding:16px 14px}
.vsv-fmt-feed .vsv-info-icon{width:22px;height:22px;margin-bottom:6px}
.vsv-fmt-feed .vsv-info-icon svg{width:22px;height:22px}
.vsv-fmt-feed .vsv-info-strong{font-size:14px}
.vsv-fmt-feed .vsv-info-div{height:48px}
.vsv-fmt-feed .vsv-list{padding:12px 14px;gap:8px}
.vsv-fmt-feed .vsv-price{padding:14px 18px}
.vsv-fmt-feed .vsv-price-num{font-size:58px}
.vsv-fmt-feed .vsv-price-cents{font-size:28px}
.vsv-fmt-feed .vsv-price-cur{font-size:25px}
.vsv-fmt-feed .vsv-price-bar{margin:8px 0}
.vsv-fmt-feed .vsv-price-total{font-size:15px}
.vsv-fmt-feed .vsv-card{padding:11px 14px}
.vsv-fmt-feed .vsv-cards{gap:9px}
.vsv-fmt-feed .vsv-note{margin-top:2px}
`;