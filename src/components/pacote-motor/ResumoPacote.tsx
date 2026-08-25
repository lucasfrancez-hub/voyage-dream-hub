import { nomeCia } from "@/lib/pacote-motor/cia";
import { brl, hora, plural, type HotelPacote, type OcupacaoQuarto, type QuartoPacote } from "@/lib/pacote-motor/mapear";
import { somaOcupacao } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";
import { useParcelamentoPacote } from "@/lib/pacote-motor/parcelamento";

const dataCurta = (iso: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");

function Trecho({ voo, rotulo, companhia }: { voo: PassHubVoo; rotulo: string; companhia: string }) {
  return (
    <div className="sum-trip">
      <div className="sum-head">
        <b>
          {rotulo} · {dataCurta(voo.partida)}
        </b>
        <span>{companhia}</span>
      </div>
      <div className="sum-route">
        <div>
          <strong>{hora(voo.partida)}</strong>
          <small>{voo.origem} · saída</small>
        </div>
        <div className="arrow">→</div>
        <div className="right">
          <strong>{hora(voo.chegada)}</strong>
          <small>{voo.destino} · chegada</small>
        </div>
      </div>
      {voo.escala ? (
        <div style={{ marginTop: 4, color: "#6f8595", fontSize: 9 }}>Conexão em {voo.escala}</div>
      ) : null}
    </div>
  );
}

/** Resumo do pacote — padrão aprovado (pax, ida, volta, hospedagem e total). */
export function ResumoPacote({
  destino,
  quartos,
  noites,
  checkin,
  checkout,
  oferta,
  hotel,
  quarto,
  total,
  diferenca,
  moeda = "BRL",
  servicos = [],
  onServicos,
  acao,
}: {
  destino: string;
  quartos: OcupacaoQuarto[];
  noites: number | null;
  checkin: string;
  checkout: string;
  oferta: PassHubOferta | null;
  hotel: HotelPacote | null;
  quarto: QuartoPacote | null;
  total: number;
  diferenca: number;
  moeda?: string;
  servicos?: { id: string; titulo: string; valor: number | null }[];
  onServicos?: () => void;
  acao?: React.ReactNode;
}) {
  const pax = somaOcupacao(quartos);
  const parcelamento = useParcelamentoPacote();
  const volta = oferta?.voltas?.[0] ?? null;
  const companhia = oferta ? nomeCia(oferta.ida.companhiaIata, oferta.ida.companhia) : "";

  return (
    <aside className="summary package-summary">
      <small className="label2">Resumo do pacote</small>
      <h3>{hotel?.nome || destino || "Pacote VIA AIR"}</h3>

      <div className="summary-meta">
        <span>
          <strong>{pax.adultos}</strong> {pax.adultos === 1 ? "adulto" : "adultos"}
        </span>
        {pax.criancas ? (
          <span>
            <strong>{pax.criancas}</strong> {pax.criancas === 1 ? "criança" : "crianças"}
          </span>
        ) : null}
        {pax.bebes ? (
          <span>
            <strong>{pax.bebes}</strong> {pax.bebes === 1 ? "bebê" : "bebês"}
          </span>
        ) : null}
        <span>
          <strong>{quartos.length}</strong> {quartos.length === 1 ? "quarto" : "quartos"}
        </span>
        {noites ? (
          <span>
            <strong>{noites}</strong> {noites === 1 ? "noite" : "noites"}
          </span>
        ) : null}
      </div>

      {oferta ? <Trecho voo={oferta.ida} rotulo="IDA" companhia={companhia} /> : null}
      {volta ? <Trecho voo={volta} rotulo="VOLTA" companhia={companhia} /> : null}

      {hotel ? (
        <div className="sum-hotel">
          {hotel.fotos[0] ? (
            <div className="sum-hotel-photo-wrap">
              <img className="sum-hotel-photo" src={hotel.fotos[0]} alt={`Foto do hotel ${hotel.nome}`} loading="lazy" />
            </div>
          ) : null}
          <div className="sum-hotel-content">
            <div className="hotel-kicker">
              Hospedagem incluída · {dataCurta(checkin)} → {dataCurta(checkout)}
            </div>
            <b className="hotel-name">{hotel.nome}</b>
            <div className="hotel-rating-line">
              {hotel.categoria ? (
                <span className="hotel-stars">{"★".repeat(hotel.categoria)}</span>
              ) : null}
              {[hotel.avaliacao ? `${hotel.avaliacao}/5` : null, hotel.localizacao]
                .filter(Boolean)
                .join(" · ")}
            </div>

            <div className="hotel-room-line">
              <div>
                <strong>{quarto?.nome ?? "Acomodação conforme o pacote"}</strong>
                <small>
                  {[quarto?.regime ?? hotel.regime, quarto?.politica].filter(Boolean).join(" · ") || "—"}
                </small>
              </div>
              <div className="hotel-room-count">{plural(quartos.length, "quarto", "quartos")}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="sum-svc">
        <div className="sum-svc-title">
          <b>Serviços adicionais</b>
          <div className="sum-svc-bar" />
        </div>
        {servicos.length ? (
          <div className="sum-svc-list">
            {servicos.map((s, i) => {
              const [main, ...rest] = s.titulo.split(" - ");
              const sub = rest.join(" - ");
              return (
                <div key={s.id} className="sum-svc-item">
                  <div className="sum-svc-dot" />
                  <div className="sum-svc-info">
                    <span>{main || s.titulo}</span>
                    {sub ? <em>{sub}</em> : null}
                  </div>
                  <div className="sum-svc-price">
                    <small>+ ADICIONAL</small>
                    <b>+ {brl(s.valor ?? 0, moeda)}</b>
                  </div>
                  {i < servicos.length - 1 ? <div className="sum-svc-sep" /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sum-svc-empty">
            <span className="sum-svc-off">Não incluso</span>
          </div>
        )}
        {onServicos ? (
          <button type="button" className="sum-svc-btn" onClick={onServicos}>
            <span>{servicos.length ? "Alterar serviços" : "Adicionar serviços"}</span>
          </button>
        ) : null}
      </div>

      <div className="total">
        <span>Valor total do pacote</span>
        <strong>{brl(total, moeda)}</strong>
        {/* Parcelamento em destaque + forma de pagamento ao lado (modelo aprovado). */}
        <div className="total-parcela">
          <b>
            em até {parcelamento.max}x de {brl(total / parcelamento.max, moeda)}
          </b>
          <i>
            {parcelamento.completo.includes("boleto")
              ? "no cartão de crédito ou boleto bancário"
              : "no cartão de crédito"}
          </i>
        </div>
      </div>


      {acao ?? (
        <button type="button" className="primary">
          Comprar pacote
        </button>
      )}
    </aside>
  );
}
