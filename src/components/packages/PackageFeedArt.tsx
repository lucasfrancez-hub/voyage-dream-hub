/**
 * Arte 3:4 (1080x1440) para post de pacote pronto.
 * HTML/CSS 1:1 com o mockup aprovado — NÃO ALTERAR ESTRUTURA.
 * Todos os campos vêm do cadastro; a frase (tagline) é gerada por IA.
 */
import { forwardRef, type ReactElement } from "react";
import logoAsset from "@/assets/viaair-logo.png.asset.json";

export type FeedArtData = {
  backgroundDataUrl: string; // data:image/...;base64,...
  estado?: string | null;
  destino: string;
  frase: string;
  dataIda: string; // dd/mm/aaaa
  dataVolta: string;
  noites: number | null;
  origem: string;
  hotel: string;
  estrelas: number | null;
  quantidadePessoas: number;
  apartamento: string; // "individual" | "duplo" | "triplo" | "quádruplo" | "quíntuplo"
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

const ICONS: Record<string, JSX.Element> = {
  aereo: (
    <svg className="icon" viewBox="0 0 24 24"><path d="M2 16.5 22 8l-4.5-2-5.5 3-5-3-2 1 3.5 4-4 2z"/></svg>
  ),
  hotel: (
    <svg className="icon" viewBox="0 0 24 24"><path d="M4 21V3h12v18M16 8h4v13M7 6h2M11 6h2M7 10h2M11 10h2M7 14h2M11 14h2M7 18h2M11 18h2"/></svg>
  ),
  cafe: (
    <svg className="icon" viewBox="0 0 24 24"><path d="M3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8zM16 10h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2M15 3v2"/></svg>
  ),
  bagagem: (
    <svg className="icon" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 7V4h6v3M8 11v6M12 11v6M16 11v6"/></svg>
  ),
  transfer: (
    <svg className="icon" viewBox="0 0 24 24"><path d="M3 17h1.5M19.5 17H21M4 17V9a2 2 0 0 1 2-2h9l4 4v6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
  ),
  seguro: (
    <svg className="icon" viewBox="0 0 24 24"><path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>
  ),
  esim: (
    <svg className="icon" viewBox="0 0 24 24"><path d="M2 12a15 15 0 0 1 20 0"/><path d="M5 15a10 10 0 0 1 14 0"/><path d="M8.5 18a5 5 0 0 1 7 0"/><circle cx="12" cy="20.5" r="1"/></svg>
  ),
};

const INCLUDE_ITEMS: Array<{ key: keyof FeedArtData["inclusos"]; label: string; icon: string }> = [
  { key: "aereo", label: "Aéreo", icon: "aereo" },
  { key: "hotel", label: "Hotel", icon: "hotel" },
  { key: "cafeDaManha", label: "Café da manhã", icon: "cafe" },
  { key: "bagagem23kg", label: "Bagagem despachada de 23kg", icon: "bagagem" },
  { key: "transfer", label: "Transfer", icon: "transfer" },
  { key: "seguroViagem", label: "Seguro viagem", icon: "seguro" },
  { key: "esimInternacional", label: "eSIM internacional", icon: "esim" },
];

export const PackageFeedArt = forwardRef<HTMLDivElement, { data: FeedArtData }>(function PackageFeedArt(
  { data },
  ref,
) {
  const parcelas = data.parcelas || 10;
  const valorParcela = (data.valorTotal || 0) / parcelas;
  const [reais, centavos] = BRL(valorParcela).split(",");
  const includes = INCLUDE_ITEMS.filter((it) => data.inclusos[it.key]);
  const stars = data.estrelas && data.estrelas > 0 ? "★".repeat(Math.round(data.estrelas)) : "";

  return (
    <div ref={ref}>
      <style>{CSS}</style>
      <div className="stage" id="poster">
        <div
          className="bg"
          style={{ backgroundImage: `url(${data.backgroundDataUrl})` }}
        />
        <div className="overlay" />
        <div className="content">
          <img className="logo" src={logoAsset.url} alt="Via Air" crossOrigin="anonymous" />
          {data.estado ? (
            <div className="state">
              <span>⌖</span>
              <span>{data.estado.toUpperCase()}</span>
            </div>
          ) : null}
          <div className="hero">
            <div className="destination">{data.destino}</div>
            <div className="tagline">{data.frase}</div>
          </div>

          <div className="info glass light">
            <div className="info-item">
              <svg className="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
              <div>
                <strong>
                  {data.dataIda}<br />até {data.dataVolta}
                </strong>
                {data.noites ? <small>{data.noites} noites</small> : null}
              </div>
            </div>
            <div className="info-item">
              <svg className="icon" viewBox="0 0 24 24"><path d="M2 16.5 22 8l-4.5-2-5.5 3-5-3-2 1 3.5 4-4 2z"/><path d="M13 10.5 10.5 17l2 1 4-5"/></svg>
              <div>
                <small>Saída de</small>
                <strong>{data.origem}</strong>
              </div>
            </div>
            <div className="info-item">
              <svg className="icon" viewBox="0 0 24 24"><path d="M4 21V3h12v18M16 8h4v13M7 6h2M11 6h2M7 10h2M11 10h2M7 14h2M11 14h2M7 18h2M11 18h2"/></svg>
              <div>
                <strong>{data.hotel}</strong>
                {stars ? <div className="stars">{stars}</div> : null}
              </div>
            </div>
          </div>

          <div className="section-title">O PACOTE INCLUI</div>
          <div
            className="includes glass light"
            style={{ ["--n" as string]: String(includes.length) }}
          >
            {includes.map((it) => (
              <div className="include" key={it.key}>
                {ICONS[it.icon]}
                <span>{it.label}</span>
              </div>
            ))}
          </div>

          <div className="bottom">
            <div className="price glass dark">
              <div className="kicker">A PARTIR DE</div>
              <div className="price-row">
                <div className="installments"><strong>{parcelas}</strong>x de</div>
                <div className="currency">R$</div>
                <div className="amount">
                  <span>{reais}</span>
                  <span className="cents">,{centavos}</span>
                </div>
              </div>
              <div className="total">
                Total do pacote: <strong>R$ {BRL(data.valorTotal)}</strong>
              </div>
              <div className="payment">
                <svg className="icon" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/></svg>
                <span>No cartão e boleto bancário sem juros</span>
              </div>
            </div>
            <div className="side-cards">
              <div className="side-card glass dark">
                <svg className="icon" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 3.5a4 4 0 0 1 0 7M22 21v-2a7 7 0 0 0-5-6.7"/></svg>
                <span>
                  Valor para <strong>{data.quantidadePessoas}</strong>{" "}
                  {data.quantidadePessoas === 1 ? "pessoa" : "pessoas"} em apartamento{" "}
                  <strong>{data.apartamento}</strong>
                </span>
              </div>
              <div className="side-card glass dark">
                <svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span>Sujeito à disponibilidade de vagas e alteração tarifária sem aviso prévio.</span>
              </div>
            </div>
          </div>
          <div className="note">*Imagens meramente ilustrativas.</div>
        </div>
      </div>
    </div>
  );
});

const CSS = `
.stage *{box-sizing:border-box}
.stage{width:1080px;height:1440px;position:relative;overflow:hidden;background:#0a1a22;color:#f8fbff;font-family:Inter,Arial,sans-serif}
.stage .bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.01)}
.stage .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,15,28,.12) 0%,rgba(0,13,24,.18) 43%,rgba(0,10,18,.64) 100%)}
.stage .content{position:absolute;inset:0;padding:50px 54px 44px;display:flex;flex-direction:column}
.stage .logo{width:310px;height:auto;object-fit:contain;object-position:left center;filter:drop-shadow(0 3px 8px rgba(0,0,0,.35))}
.stage .state{margin-top:38px;display:inline-flex;align-items:center;gap:12px;width:max-content;padding:10px 20px;border:2px solid #ff8a1f;border-radius:999px;color:#ff8a1f;font-weight:800;font-size:28px;letter-spacing:.5px;background:rgba(0,20,28,.18);backdrop-filter:blur(12px)}
.stage .hero{margin-top:18px}
.stage .destination{font-size:100px;line-height:.88;font-weight:900;letter-spacing:-3px;text-transform:uppercase;text-shadow:0 7px 18px rgba(0,0,0,.35)}
.stage .destination span{display:block;color:#ff8a1f}
.stage .tagline{margin-top:14px;font-family:Georgia,serif;font-style:italic;font-size:48px;line-height:1;color:#fff;text-shadow:0 5px 12px rgba(0,0,0,.5)}
.stage .tagline:after{content:"";display:block;width:290px;height:4px;background:#ff8a1f;border-radius:9px;margin:10px 0 0 18px;transform:rotate(-2deg)}
.stage .glass{border:1.5px solid rgba(255,255,255,.46);box-shadow:0 16px 42px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.2);backdrop-filter:blur(20px) saturate(125%)}
.stage .glass.light{background:linear-gradient(135deg,rgba(245,248,250,.25),rgba(222,233,238,.14))}
.stage .glass.dark{background:linear-gradient(135deg,rgba(2,18,27,.88),rgba(8,17,21,.70));border-color:rgba(255,255,255,.27)}
.stage .info{margin-top:38px;border-radius:28px;padding:26px 26px;display:grid;grid-template-columns:1.08fr .82fr 1.25fr;align-items:stretch}
.stage .info-item{display:grid;grid-template-columns:54px 1fr;gap:16px;align-items:center;padding:0 18px;min-height:120px}
.stage .info-item+.info-item{border-left:2px solid #ff8a1f}
.stage .icon{width:48px;height:48px;stroke:#fff;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.stage .info strong{display:block;font-size:29px;line-height:1.12}
.stage .info small{display:block;font-size:22px;line-height:1.22;margin-top:7px}
.stage .stars{color:#ff8a1f;font-size:28px;letter-spacing:4px;margin-top:6px}
.stage .section-title{margin:24px 0 12px;display:flex;align-items:center;gap:16px;font-size:29px;font-weight:800;text-align:center}
.stage .section-title:before,.stage .section-title:after{content:"";height:3px;background:#ff8a1f;flex:1;border-radius:4px}
.stage .includes{border-radius:28px;padding:18px 20px;display:grid;grid-template-columns:repeat(var(--n,1),minmax(0,1fr));justify-content:center;align-items:stretch;width:max-content;max-width:100%;margin:0 auto}
.stage .include{min-width:120px;max-width:170px;min-height:126px;padding:8px 12px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:8px;font-size:20px;line-height:1.08}
.stage .include+.include{border-left:2px solid #ff8a1f}
.stage .include .icon{width:46px;height:46px}
.stage .bottom{margin-top:auto;display:grid;grid-template-columns:1.05fr .95fr;gap:28px;align-items:stretch}
.stage .price{border-radius:28px;padding:28px 30px 26px}
.stage .kicker{font-size:27px;letter-spacing:1px}
.stage .price-row{display:flex;align-items:flex-end;gap:12px;margin:10px 0 4px}
.stage .installments{font-size:34px;line-height:1.05}
.stage .currency{font-size:34px;font-weight:800;color:#ff8a1f;margin-bottom:15px}
.stage .amount{font-size:98px;line-height:.8;font-weight:900;color:#ff8a1f;letter-spacing:-4px}
.stage .cents{font-size:42px;letter-spacing:-1px}
.stage .total{font-size:26px;border-top:2px solid #ff8a1f;border-bottom:2px solid #ff8a1f;padding:13px 0;margin-top:18px;text-align:center}
.stage .total strong{color:#ff8a1f}
.stage .payment{margin-top:18px;display:flex;align-items:center;gap:16px;font-size:25px;line-height:1.22}
.stage .payment .icon{width:46px;height:46px}
.stage .side-cards{display:flex;flex-direction:column;gap:20px;justify-content:flex-end}
.stage .side-card{border-radius:24px;padding:23px 24px;display:grid;grid-template-columns:58px 1fr;gap:15px;align-items:center;font-size:24px;line-height:1.25;min-height:126px}
.stage .side-card .icon{width:52px;height:52px}
.stage .note{text-align:center;margin-top:20px;font-size:19px;color:rgba(255,255,255,.78)}
`;
