/**
 * Orçamento público VIA AIR — AIR_ONLY e TRIP_PACKAGE.
 * Renderiza EXCLUSIVAMENTE o DTO público: nada de comissão, markup,
 * custo, fornecedor interno, margem ou observação interna.
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import heroFallback from "@/assets/hero-destino.jpg.asset.json";
import { airlineLogo } from "@/lib/airlines";
import { brl } from "@/lib/public-quote/payments";
import { quoteHeadline, quoteTagline } from "@/lib/public-quote/headline";
import { agentPhoto } from "@/lib/public-quote/agents";
import { formatRoom } from "@/lib/public-quote/room-label";


import type {
  FlightLeg,
  HotelProduct,
  PublicQuote,
  SimpleProduct,
} from "@/lib/public-quote/types";
import {
  IconActivity,
  IconBack,
  IconBag,
  IconBoleto,
  IconCalendar,
  IconCar,
  IconCard,
  IconCheck,
  IconChevron,
  IconClock,
  IconHotel,
  IconMoney,
  IconPin,
  IconPix,
  IconPlane,
  IconShield,
  IconTicket,
  IconTransfer,
  IconUsers,
  IconWhats,
  SUMMARY_ICONS,
} from "./quote-icons";
import "./public-quote.css";

const WHATSAPP = "5544999514838";

function periodoLabel(q: PublicQuote): string | null {
  const fmt = (s?: string | null) => {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split("-");
    return d && m ? `${d}/${m}/${y}` : s;
  };
  const a = fmt(q.startDate);
  const b = fmt(q.endDate);
  if (a && b) return `${a} a ${b}`;
  return a;
}

/* ───────────────────────── voos ───────────────────────── */

function FlightLegCard({ leg }: { leg: FlightLeg }) {
  const [open, setOpen] = useState(false);
  const logo = airlineLogo(leg.airlineIata ?? leg.airline);
  return (
    <article className="vq-card vq-flight">
      <div className="vq-flight-summary">
        <div className="vq-flight-top">
          <div className="vq-air">
            <span className="vq-airmark">
              {logo ? <img src={logo} alt={leg.airline} /> : (leg.airlineIata ?? "VA")}
            </span>
            <div>
              <div>{leg.airline}</div>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                {leg.label} • {leg.dateLabel}
              </div>
            </div>
          </div>
          <span className="vq-tag">{leg.stopsLabel}</span>
        </div>

        <div className="vq-route">
          <div className="vq-airport">
            <time>{leg.departureTime}</time>
            <b>{leg.fromIata}</b>
            <span>{leg.fromCity}</span>
          </div>
          <div className="vq-path">
            {leg.stopsLabel}
            <div className="vq-line">{leg.stops > 0 ? <span className="vq-stop-dot" /> : null}</div>
            {leg.duration ?? ""}
          </div>
          <div className="vq-airport" style={{ textAlign: "right" }}>
            <time>{leg.arrivalTime}</time>
            <b>{leg.toIata}</b>
            <span>{leg.toCity}</span>
          </div>
        </div>

        <div className="vq-badges">
          {leg.personalItem ? (
            <span className="vq-badge"><IconBag />Item pessoal</span>
          ) : null}
          {leg.carryOn ? <span className="vq-badge"><IconBag />Bagagem de mão 10kg</span> : null}
          {leg.checkedBaggage ? (
            <span className="vq-badge"><IconBag />Bagagem despachada incluída</span>
          ) : null}

          {leg.cabin ? <span className="vq-badge"><IconCheck />{leg.cabin}</span> : null}
          {leg.fareFamily ? <span className="vq-badge"><IconCheck />{leg.fareFamily}</span> : null}
        </div>

        <button className="vq-toggle" data-open={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar detalhes do voo" : "Ver detalhes do voo"}
          <IconChevron />
        </button>
      </div>

      {open ? (
        <div className="vq-flight-details">
          <div className="vq-journey">
            <header className="vq-journey-head">
              <div className="vq-journey-title">
                <span className="vq-journey-mark"><IconPlane /></span>
                <div>
                  <h4>{leg.label ?? `${leg.fromIata} → ${leg.toIata}`}</h4>
                  <p>
                    {[leg.dateLabel, leg.stopsLabel].filter(Boolean).join(" • ")}
                  </p>
                </div>
              </div>
              <span className="vq-journey-count">
                {leg.segments.length > 1 ? `${leg.segments.length} trechos` : "Voo direto"}
              </span>
            </header>

            <div className="vq-journey-body">
              {leg.segments.length > 1 ? <span className="vq-journey-rail" /> : null}

              {leg.segments.map((s, i) => {
                const dataBr = s.departure.slice(0, 10).split("-").reverse().join("/");
                const segLogo = airlineLogo(s.airline ?? leg.airlineIata ?? leg.airline);
                return (
                  <div key={i}>
                    <section className="vq-seg2">
                      <div className="vq-seg2-node">
                        <span className="vq-seg2-logo">
                          {segLogo ? <img src={segLogo} alt={s.airline ?? leg.airline} /> : <IconPlane />}
                        </span>
                      </div>

                      <div className="vq-seg2-main">
                        <div className="vq-seg2-head">
                          <h5>
                            {[s.airline ?? leg.airline, s.flightNumber ? `• Voo ${s.flightNumber}` : ""]
                              .filter(Boolean)
                              .join(" ")}
                          </h5>
                          <p>Operado por {s.airline ?? leg.airline}</p>
                        </div>

                        <div className="vq-seg2-route">
                          <div className="vq-seg2-point">
                            <small>Partida</small>
                            <time>{s.departure.split(" ")[1]}</time>
                            <b>{s.fromIata}</b>
                            <span>{s.fromName}</span>
                          </div>

                          <div className="vq-seg2-path">
                            <span className="vq-seg2-dur">{s.duration ?? leg.duration ?? "—"}</span>
                            <div className="vq-seg2-line">
                              <i />
                              <span className="vq-seg2-plane"><IconPlane /></span>
                              <i />
                            </div>
                          </div>

                          <div className="vq-seg2-point right">
                            <small>Chegada</small>
                            <time>{s.arrival.split(" ")[1]}</time>
                            <b>{s.toIata}</b>
                            <span>{s.toName}</span>
                          </div>
                        </div>

                        <div className="vq-seg2-meta">
                          <div>
                            <small>Classe</small>
                            <strong>{leg.cabin ?? "Econômica"}</strong>
                          </div>
                          <div>
                            <small>Aeronave</small>
                            <strong>{s.aircraft ?? "Conforme confirmação"}</strong>
                          </div>
                          <div>
                            <small>Data</small>
                            <strong>{dataBr}</strong>
                          </div>
                          <div>
                            <small>Bagagem</small>
                            <strong>
                              {leg.checkedBaggage
                                ? "Despachada incluída"
                                : leg.carryOn
                                  ? "Mão 10kg"
                                  : "Somente item pessoal"}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </section>

                    {s.connectionAfter ? (
                      <div className="vq-seg2-connection">
                        <span className="vq-seg2-connection-dot" />
                        <div className="vq-seg2-connection-pill">
                          <IconClock />
                          Conexão: {s.connectionAfter} de espera em {s.toName ?? s.toIata}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {leg.rules?.length ? (
            <div className="vq-fare-note">{leg.rules.join(" • ")}</div>
          ) : null}
        </div>
      ) : null}



    </article>
  );
}

/* ───────────────────────── hotel ───────────────────────── */

/** Extrai "Nome (1,8 km)" do texto do TripAdvisor quando não há POIs do mapa. */
function proximidadesDoTexto(about: string | null | undefined) {
  if (!about) return [] as { name: string; distance: string }[];
  const out: { name: string; distance: string }[] = [];
  const vistos = new Set<string>();
  const re = /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^,.;()]{2,45}?)\s*\((\d+[.,]?\d*)\s*(km|m)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(about))) {
    const name = m[1].replace(/\s+/g, " ").replace(/^(o|a|os|as|do|da|de)\s+/i, "").trim();
    const chave = name.toLowerCase();
    if (!name || vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ name, distance: `${m[2].replace(".", ",")} ${m[3]}` });
  }
  return out.slice(0, 6);
}

function HotelCard({ hotel }: { hotel: HotelProduct }) {
  const [view, setView] = useState<"details" | "location">("details");
  const [galeria, setGaleria] = useState(false);
  const [foto, setFoto] = useState<number | null>(null);
  const [sobre, setSobre] = useState(false);
  // V14: foto principal ocupando duas linhas + quatro fotos menores.
  const fotos = hotel.photos.slice(0, 5);
  const quarto = formatRoom(hotel.roomName ?? hotel.roomDescription);
  const loc = hotel.location;

  const mapSrc = loc?.latitude && loc?.longitude
    ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}&z=15&output=embed`
    : hotel.name
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${hotel.name} ${hotel.place ?? ""}`)}&z=15&output=embed`
      : null;

  const proximos = loc?.nearbyPlaces?.length ? loc.nearbyPlaces : proximidadesDoTexto(hotel.about);
  const total = hotel.photos.length;
  const irPara = (delta: number) =>
    setFoto((atual) => (atual == null ? null : (atual + delta + total) % total));

  return (
    <article className="vq-card vq-hotel">
      {galeria ? (
        <div className="vq-lightbox" role="dialog" onClick={() => setGaleria(false)}>
          <button className="vq-lightbox-close" onClick={() => setGaleria(false)}>Fechar galeria</button>
          <div className="vq-lightbox-grid">
            {hotel.photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`${hotel.name} ${i + 1}`}
                loading="lazy"
                onClick={(e) => { e.stopPropagation(); setFoto(i); }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {foto != null && hotel.photos[foto] ? (
        <div className="vq-viewer" role="dialog" onClick={() => setFoto(null)}>
          <button className="vq-viewer-close" onClick={() => setFoto(null)}>Fechar</button>
          {total > 1 ? (
            <button
              className="vq-viewer-nav prev"
              onClick={(e) => { e.stopPropagation(); irPara(-1); }}
              aria-label="Foto anterior"
            >‹</button>
          ) : null}
          <img
            className="vq-viewer-img"
            src={hotel.photos[foto]}
            alt={`${hotel.name} ${foto + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
          {total > 1 ? (
            <button
              className="vq-viewer-nav next"
              onClick={(e) => { e.stopPropagation(); irPara(1); }}
              aria-label="Próxima foto"
            >›</button>
          ) : null}
          <div className="vq-viewer-count">{foto + 1} / {total}</div>
        </div>
      ) : null}

      {sobre ? (
        <div className="vq-lightbox vq-about-modal" role="dialog" onClick={() => setSobre(false)}>
          <div className="vq-about-box" onClick={(e) => e.stopPropagation()}>
            <div className="vq-about-head">
              <div>
                <h4>{hotel.name}</h4>
                {hotel.rating ? (
                  <span className="vq-about-rating">
                    {hotel.rating.toFixed(1).replace(".", ",")} / 5
                    {hotel.reviewsCount ? ` • ${hotel.reviewsCount} avaliações` : ""}
                  </span>
                ) : null}
              </div>
              <button className="vq-loc-btn" onClick={() => setSobre(false)}>Fechar</button>
            </div>
            {hotel.about ? <p>{hotel.about}</p> : <p>Detalhes indisponíveis no momento.</p>}
          </div>
        </div>
      ) : null}

      <div className="vq-hotel-grid">
        <div className="vq-gallery">
          <div className="vq-gallery-grid">
            {fotos.length ? (
              fotos.map((src, i) => (
                <div
                  key={i}
                  className={`vq-photo clickable${i === 0 ? " main" : ""}`}
                  onClick={() => setFoto(i)}
                >
                  <img src={src} alt={hotel.name} loading="lazy" />
                </div>
              ))
            ) : (
              <>
                <div className="vq-photo main" />
                <div className="vq-photo" />
                <div className="vq-photo" />
                <div className="vq-photo" />
                <div className="vq-photo" />
              </>
            )}
            {total > 1 ? (
              <button className="vq-more" onClick={() => setGaleria(true)}>
                Ver todas as fotos
              </button>
            ) : null}
          </div>
        </div>


        <div className="vq-hotel-info">
          {view === "details" ? (
            <>
              <div className="vq-hotel-head">
                <div>
                  {hotel.stars ? <div className="vq-stars">{"★".repeat(hotel.stars)}</div> : null}
                  <h3>{hotel.name}</h3>
                </div>
                {mapSrc ? (
                  <button className="vq-loc-btn" onClick={() => setView("location")}>
                    <IconPin />Ver localização
                  </button>
                ) : null}
              </div>
              {hotel.place ? <div className="vq-place">{hotel.place}</div> : null}

              <div className="vq-facts">
                <div className="vq-fact"><small>Check-in</small><strong>{hotel.checkIn ?? "—"}</strong></div>
                <div className="vq-fact"><small>Check-out</small><strong>{hotel.checkOut ?? "—"}</strong></div>
                <div className="vq-fact"><small>Ocupação</small><strong>{hotel.occupancy ?? "—"}</strong></div>
                <div className="vq-fact"><small>Regime</small><strong>{hotel.mealPlan ?? "—"}</strong></div>
              </div>

              {hotel.benefits.length ? (
                <div className="vq-benefits">
                  {hotel.benefits.map((b, i) => (
                    <span key={i} className="vq-benefit"><IconCheck />{b}</span>
                  ))}
                </div>
              ) : null}

              {quarto.name || hotel.about || hotel.rating ? (
                <div className="vq-room-row">
                  {quarto.name ? (
                    <div className="vq-room">
                      <strong>{quarto.name}</strong>
                      {quarto.description ? <p>{quarto.description}</p> : null}
                    </div>
                  ) : <span />}

                  {hotel.about || hotel.rating ? (
                    <button className="vq-about-btn" onClick={() => setSobre(true)}>
                      Ver sobre o hotel
                      {hotel.rating ? (
                        <span className="vq-about-tag">
                          ★ {hotel.rating.toFixed(1).replace(".", ",")}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="vq-hotel-head">
                <button className="vq-loc-btn" onClick={() => setView("details")}>
                  <IconBack />Voltar aos detalhes
                </button>
                {hotel.mapsUrl ? (
                  <a className="vq-loc-btn" href={hotel.mapsUrl} target="_blank" rel="noreferrer">
                    Ver no Google Maps
                  </a>
                ) : null}
              </div>
              <div className="vq-loc-grid">
                {mapSrc ? (
                  <div className="vq-map-wrap">
                    <iframe className="vq-map" src={mapSrc} title={`Mapa ${hotel.name}`} loading="lazy" />
                    <div className="vq-map-caption">
                      <strong>{hotel.name}</strong>
                      {loc?.address ? <span>{loc.address}</span> : null}
                    </div>
                  </div>
                ) : null}
                {proximos.length ? (
                  <div className="vq-nearby">
                    <h4>Próximo da hospedagem</h4>
                    {proximos.map((n, i) => (
                      <div key={i} className="vq-nearby-item"><span>{n.name}</span><strong>{n.distance}</strong></div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────── produtos simples ─────────────────── */

const SIMPLE_ICONS = {
  car: IconCar,
  transfer: IconTransfer,
  activity: IconActivity,
  ticket: IconTicket,
  insurance: IconShield,
  service: IconTransfer,
} as const;

function SimpleCard({ item, kind }: { item: SimpleProduct; kind: keyof typeof SIMPLE_ICONS }) {
  const [open, setOpen] = useState(false);
  const Icon = SIMPLE_ICONS[kind];
  const temDetalhes = item.details.length > 0 || !!item.description || !!item.included?.length;
  return (
    <article className="vq-card vq-module">
      <div className="vq-module-summary">
        <div className="vq-module-left">
          <span className="vq-module-icon"><Icon /></span>
          <div>
            <h3>{item.title}</h3>
            {item.summary ? <p>{item.summary}</p> : null}
          </div>
        </div>
      </div>
      {temDetalhes ? (
        <>
          <button className="vq-toggle" data-open={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Ocultar detalhes" : "Ver detalhes"}
            <IconChevron />
          </button>
          {open ? (
            <div className="vq-details">
              {item.details.length ? (
                <div className="vq-details-grid">
                  {item.details.map((d, i) => (
                    <div key={i} className="vq-detail"><small>{d.label}</small><strong>{d.value}</strong></div>
                  ))}
                </div>
              ) : null}
              {item.description ? <div className="vq-description">{item.description}</div> : null}
              {item.included?.length ? (
                <div className="vq-benefits" style={{ marginTop: 12 }}>
                  {item.included.map((b, i) => (
                    <span key={i} className="vq-benefit"><IconCheck />{b}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

/* ───────────────────── pagamento ───────────────────── */

/** Faces das bandeiras conforme o layout aprovado (V14). */
const BRAND_FACES: Record<string, { cls: string; node: React.ReactNode }> = {
  VISA: { cls: "vq-face-visa", node: "VISA" },
  MASTERCARD: { cls: "vq-face-master", node: <><i className="a" /><i className="b" /></> },
  ELO: { cls: "vq-face-elo", node: <><span className="e">e</span><span className="l">l</span><span>o</span></> },
  AMEX: { cls: "vq-face-amex", node: "AMEX" },
  DINERS: { cls: "vq-face-diners", node: "DINERS" },
  HIPERCARD: { cls: "vq-face-hiper", node: "HIPER" },
};

function brandFace(brand: string) {
  const key = brand.trim().toUpperCase();
  return (
    BRAND_FACES[key] ??
    BRAND_FACES[Object.keys(BRAND_FACES).find((k) => key.includes(k) || k.includes(key)) ?? ""] ?? {
      cls: "vq-face-visa",
      node: key.slice(0, 6),
    }
  );
}

function PaymentBox({ quote }: { quote: PublicQuote }) {
  const metodos = quote.payment.methods;
  const [tab, setTab] = useState<"CARD" | "BOLETO" | "PIX">(metodos[0] ?? "CARD");
  const cartao = quote.payment.card;
  const boleto = quote.payment.boleto;
  const pix = quote.payment.pix;
  const [brand, setBrand] = useState(cartao.brands[0] ?? "VISA");
  const [instCartao, setInstCartao] = useState<number | null>(null);
  const [instBoleto, setInstBoleto] = useState<number | null>(null);

  return (
    <div className="vq-card vq-paybox">
      <h3>Simulação de pagamento</h3>
      <div className="vq-pay-tabs">
        {metodos.includes("CARD") ? (
          <button className="vq-pay-tab" data-active={tab === "CARD"} onClick={() => setTab("CARD")}>
            <IconCard />Cartão
          </button>
        ) : null}
        {metodos.includes("BOLETO") ? (
          <button className="vq-pay-tab" data-active={tab === "BOLETO"} onClick={() => setTab("BOLETO")}>
            <IconBoleto />Boleto
          </button>
        ) : null}
        {metodos.includes("PIX") ? (
          <button className="vq-pay-tab" data-active={tab === "PIX"} onClick={() => setTab("PIX")}>
            <IconPix />Pix
          </button>
        ) : null}
      </div>

      {tab === "CARD" ? (
        <div>
          <div className="vq-brands">
            {cartao.brands.map((b) => {
              const face = brandFace(b);
              return (
                <button
                  key={b}
                  type="button"
                  className="vq-brand-btn"
                  aria-pressed={brand === b}
                  aria-label={b}
                  onClick={() => setBrand(b)}
                >
                  <span className={`vq-brand-face ${face.cls}`}>{face.node}</span>
                </button>
              );
            })}
          </div>
          <div className="vq-installments">
            {cartao.installments.map((i) => (
              <div
                key={i.number}
                className={`vq-inst${instCartao === i.number ? " is-selected" : ""}`}
                onClick={() => setInstCartao(i.number)}
              >
                <span>
                  {i.number}x
                  {i.interestFree ? <span className="vq-no-interest">sem juros</span> : null}
                </span>
                <strong>{brl(i.amount)}</strong>
              </div>
            ))}
          </div>
          <p className="vq-payment-note">
            Parcelamento sem juros conforme a política da companhia aérea e sujeito à
            aprovação da operadora do cartão.
          </p>
        </div>
      ) : null}

      {tab === "BOLETO" ? (
        <div className="vq-boleto-box">
          <div className="vq-installments">
            {boleto.installments.map((i) => (
              <div
                key={i.number}
                className={`vq-inst${instBoleto === i.number ? " is-selected" : ""}`}
                onClick={() => setInstBoleto(i.number)}
              >
                <span>{i.number}x<span className="vq-no-interest">sem juros</span></span>
                <strong>{brl(i.amount)}</strong>
              </div>
            ))}
          </div>
          <p className="vq-payment-note">
            {boleto.note ??
              "Parcelamento no boleto sujeito à análise. A confirmação é feita pelo consultor antes da emissão."}
          </p>
        </div>
      ) : null}

      {tab === "PIX" ? (
        <div>
          <div className="vq-pix-box">
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <IconPix />
              Pix à vista{pix.discountPercent ? ` (${pix.discountPercent}% de desconto)` : ""}
            </span>
            <strong>{brl(pix.total)}</strong>
          </div>
          <p className="vq-payment-note">
            O código Pix é enviado pelo consultor no momento da confirmação.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────── página ───────────────────── */

/** Wrapper com seletor de opções quando o orçamento traz mais de uma alternativa. */
export function PublicQuoteView({ quote }: { quote: PublicQuote }) {
  const options = quote.options ?? [];
  const [sel, setSel] = useState(0);
  if (options.length < 2) return <QuoteBody quote={quote} />;

  const opt = options[Math.min(sel, options.length - 1)]!;
  const merged: PublicQuote = {
    ...quote,
    products: opt.products,
    payment: opt.payment,
    totals: opt.totals,
    summary: opt.summary ?? quote.summary,
  };

  return (
    <>
      <QuoteBody quote={merged} />
      <div className="vq-options">
        <div className="vq-options-inner">
          <span className="vq-options-title">Escolha sua opção</span>
          <div className="vq-options-tabs">
            {options.map((o, i) => (
              <button
                key={o.optionId}
                type="button"
                onClick={() => setSel(i)}
                className={`vq-option-tab${i === sel ? " is-active" : ""}`}
              >
                <span>{o.label ?? `Opção ${i + 1}`}</span>
                <strong>{brl(o.totals.total)}</strong>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function QuoteBody({ quote }: { quote: PublicQuote }) {
  const flights = quote.products.flights ?? [];
  const hotels = quote.products.hotels ?? [];
  const periodo = periodoLabel(quote);
  const heroTitle = quoteHeadline({
    type: quote.type,
    destination: quote.destination,
    title: quote.title,
    hasHotel: hotels.length > 0,
  });
  const heroTagline = quoteTagline({
    type: quote.type,
    destination: quote.destination,
    hasHotel: hotels.length > 0,
    seed: quote.publicId,
  });

  const heroImage = useMemo(() => {
    const foto = hotels.map((h) => h.photos?.[0]).find(Boolean);
    return foto || heroFallback.url;
  }, [hotels]);

  const legs = useMemo(() => flights.flatMap((f) => f.legs), [flights]);


  const whatsappHref = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    `Olá! Quero seguir com o orçamento ${quote.publicId} (${quote.title}).`,
  )}`;

  type Secao = { id: string; label: string; Icon: (p: { className?: string }) => ReactElement };
  const secoes: Secao[] = [];
  if (hotels.length) secoes.push({ id: "hospedagem", label: "Hospedagem", Icon: IconHotel });
  if (legs.length) secoes.push({ id: "voos", label: "Voos", Icon: IconPlane });
  if (quote.products.cars?.length) secoes.push({ id: "carro", label: "Carro", Icon: IconCar });
  if (quote.products.activities?.length)
    secoes.push({ id: "passeios", label: "Passeios", Icon: IconActivity });
  if (quote.products.tickets?.length)
    secoes.push({ id: "ingressos", label: "Ingressos", Icon: IconTicket });
  if (quote.products.transfers?.length || quote.products.services?.length)
    secoes.push({ id: "servicos", label: "Serviços", Icon: IconTransfer });
  secoes.push({ id: "valores", label: "Valores", Icon: IconMoney });

  const [ativa, setAtiva] = useState<string>(secoes[0]?.id ?? "");
  const secoesKey = secoes.map((s) => s.id).join(",");
  useEffect(() => {
    const ids = secoesKey.split(",").filter(Boolean);
    const onScroll = () => {
      let atual = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 160) atual = id;
      }
      setAtiva(atual);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [secoesKey]);

  return (
    <div className="vq">
      <header className="vq-topbar">
        <div className="vq-nav">
          <a className="vq-brand" href="#topo">
            <img src={viaAirLogo.url} alt="VIA AIR" />
            <span className="vq-brand-sub">Premium Travel</span>
          </a>
          <nav className="vq-navlinks">
            {secoes.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={ativa === s.id ? "is-active" : undefined}
              >
                <s.Icon />
                <span>{s.label}</span>
              </a>
            ))}
          </nav>
          <span className="vq-tag">
            {quote.type === "AIR_ONLY" ? <IconPlane /> : <IconBag />}
            {quote.type === "AIR_ONLY" ? "Passagens aéreas" : "Pacote completo"}
          </span>
        </div>
      </header>


      <main className="vq-wrap">
        {quote.expired ? (
          <div className="vq-expired">
            Este orçamento expirou. Fale com seu consultor para receber os valores atualizados.
          </div>
        ) : null}

        <section className="vq-hero">
          <div className="vq-hero-media" aria-hidden="true">
            <img src={heroImage} alt="" width={1600} height={912} />
            <span className="vq-hero-fade" />
            <span className="vq-hero-shade" />
          </div>
          <div className="vq-hero-grid">

            <div>
              <div className="vq-eyebrow">PROPOSTA VIA AIR</div>
              <h1>{heroTitle}</h1>
              <p>{heroTagline}</p>
              <div className="vq-chips">
                {periodo ? <div className="vq-chip"><IconCalendar />{periodo}</div> : null}
                <div className="vq-chip"><IconUsers />{quote.passengers.label}</div>
                {quote.tripKind ? <div className="vq-chip"><IconPlane />{quote.tripKind}</div> : null}
                {quote.nights ? <div className="vq-chip"><IconHotel />{quote.nights} noites</div> : null}
              </div>
            </div>
            <div className="vq-pricebox">
              <small>Valor total da proposta</small>
              <div className="vq-price">{brl(quote.totals.total)}</div>
              <small>Tarifa sujeita à disponibilidade até a emissão.</small>
              {quote.payment.pix.enabled ? (
                <div className="vq-pixline">Pix à vista: {brl(quote.payment.pix.total)}</div>
              ) : null}
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                <button className="vq-cta">Quero reservar esta opção</button>
              </a>
            </div>
          </div>
        </section>

        {hotels.length ? (
          <section className="vq-section" id="hospedagem">
            <div className="vq-section-head">
              <div>
                <h2>Hospedagem</h2>
                <p>Galeria, quarto, comodidades e localização da hospedagem.</p>
              </div>
              {quote.nights ? <span className="vq-tag">{quote.nights} noites</span> : null}
            </div>
            {hotels.map((h) => <HotelCard key={h.id} hotel={h} />)}
          </section>
        ) : null}

        {legs.length ? (
          <section className="vq-section" id="voos">
            <div className="vq-section-head">
              <div>
                <h2>Voos</h2>
                <p>Companhia, horários, conexões, duração e bagagem de cada trecho.</p>
              </div>
              <span className="vq-tag">{quote.tripKind ?? "Itinerário"}</span>
            </div>
            {legs.map((leg, i) => <FlightLegCard key={i} leg={leg} />)}
          </section>
        ) : null}

        {quote.products.cars?.length ? (
          <section className="vq-section" id="carro">
            <div className="vq-section-head"><div><h2>Carro</h2><p>Locação incluída na proposta.</p></div></div>
            {quote.products.cars.map((c) => <SimpleCard key={c.id} item={c} kind="car" />)}
          </section>
        ) : null}

        {quote.products.activities?.length ? (
          <section className="vq-section" id="passeios">
            <div className="vq-section-head"><div><h2>Passeios</h2><p>Experiências reservadas para a viagem.</p></div></div>
            {quote.products.activities.map((c) => <SimpleCard key={c.id} item={c} kind="activity" />)}
          </section>
        ) : null}

        {quote.products.tickets?.length ? (
          <section className="vq-section" id="ingressos">
            <div className="vq-section-head"><div><h2>Ingressos</h2><p>Entradas e atrações incluídas.</p></div></div>
            {quote.products.tickets.map((c) => <SimpleCard key={c.id} item={c} kind="ticket" />)}
          </section>
        ) : null}

        {quote.products.transfers?.length || quote.products.services?.length || quote.products.insurance?.length ? (
          <section className="vq-section" id="servicos">
            <div className="vq-section-head"><div><h2>Serviços</h2><p>Traslados, seguros e serviços complementares.</p></div></div>
            {quote.products.transfers?.map((c) => <SimpleCard key={c.id} item={c} kind="transfer" />)}
            {quote.products.insurance?.map((c) => <SimpleCard key={c.id} item={c} kind="insurance" />)}
            {quote.products.services?.map((c) => <SimpleCard key={c.id} item={c} kind="service" />)}
          </section>
        ) : null}

        <section className="vq-section" id="valores">
          <div className="vq-section-head">
            <div>
              <h2>Valores e pagamento</h2>
              <p>Resumo da proposta e simulação das formas de pagamento.</p>
            </div>
          </div>
          <div className="vq-summary-payment">
            <div className="vq-card vq-summary-main">
              {quote.summary.map((s, i) => {
                const Icon = SUMMARY_ICONS[s.icon] ?? IconTicket;
                return (
                  <div key={i} className="vq-sum-row">
                    <div className="vq-sum-left">
                      <span className="vq-sum-icon"><Icon /></span>
                      <span>{s.label}</span>
                    </div>
                    <strong>{s.value}</strong>
                  </div>
                );
              })}
              {quote.totals.taxes > 0 ? (
                <div className="vq-sum-row">
                  <div className="vq-sum-left">
                    <span className="vq-sum-icon"><IconCard /></span>
                    <span>Taxas</span>
                  </div>
                  <strong>{brl(quote.totals.taxes)}</strong>
                </div>
              ) : null}
              <div className="vq-sum-total">
                <span>Total</span>
                <span>{brl(quote.totals.total)}</span>
              </div>
              {quote.publicNotes ? <div className="vq-description">{quote.publicNotes}</div> : null}
            </div>
            <PaymentBox quote={quote} />
          </div>
        </section>

        <section className="vq-card vq-agent">
          {(() => {
            const foto = quote.agent?.photoUrl || agentPhoto(quote.agent?.name);
            return (
              <div className="vq-agent-photo">
                {foto ? (
                  <img
                    src={foto}
                    alt={quote.agent?.name ?? "Consultor VIA AIR"}
                    style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  (quote.agent?.name ?? "VIA AIR").charAt(0)
                )}
              </div>
            );
          })()}

          <div>
            <h3>{quote.agent?.name ?? "Equipe VIA AIR"}</h3>
            <p>Seu consultor de viagens está à disposição para ajustar esta proposta.</p>
          </div>
          <a href={whatsappHref} target="_blank" rel="noreferrer">
            <button className="vq-contact-btn">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconWhats />Falar com o consultor
              </span>
            </button>
          </a>
        </section>

        <div className="vq-footer">
          VIA AIR Turismo • Paranavaí (PR) • atendimento 100% online
          <br />
          Proposta {quote.publicId}
          {quote.validUntil
            ? ` • válida até ${new Date(quote.validUntil).toLocaleDateString("pt-BR")}`
            : ""}
        </div>
      </main>
    </div>
  );
}

export default PublicQuoteView;
