import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { infoHotelMotor } from "@/lib/pacote-motor/hotel-info.functions";
import { plural, type HotelPacote, type QuartoPacote } from "@/lib/pacote-motor/mapear";

const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

/**
 * Dados reais do hotel: o que a operadora manda na busca (nome, endereço,
 * estrelas, regime, políticas, foto) somado ao enriquecimento já existente
 * no projeto (descrição, comodidades, avaliação e galeria completa).
 */
export function useInfoHotel(hotel: HotelPacote | null) {
  const buscar = useServerFn(infoHotelMotor);
  return useQuery({
    queryKey: ["motor-pacote", "hotel-info", hotel?.nome ?? "", hotel?.localizacao ?? ""],
    enabled: !!hotel?.nome,
    staleTime: 30 * 60_000,
    queryFn: () => buscar({ data: { nome: hotel!.nome, cidade: hotel!.localizacao ?? null } }),
  });
}

/** Card "Hospedagem selecionada" da visão geral, no padrão aprovado. */
export function CardHotelSelecionado({
  hotel,
  quarto,
  qtdQuartos,
  checkin,
  checkout,
  noites,
  carregando,
  onAlterar,
}: {
  hotel: HotelPacote | null;
  quarto: QuartoPacote | null;
  qtdQuartos: number;
  checkin: string;
  checkout: string;
  noites: number | null;
  carregando: boolean;
  onAlterar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const info = useInfoHotel(hotel);
  const extra = info.data;

  const estrelas = hotel?.categoria ?? extra?.estrelas ?? null;
  const avaliacao = hotel?.avaliacao ?? extra?.avaliacao ?? null;
  const endereco = hotel?.endereco ?? extra?.endereco ?? hotel?.localizacao ?? null;
  const descricao = hotel?.descricao ?? extra?.descricao ?? null;
  const comodidades = (hotel?.comodidades?.length ? hotel.comodidades : (extra?.comodidades ?? [])).slice(0, 12);
  const politicas = quarto?.politica ? [quarto.politica] : (hotel?.politicas ?? []);
  const fotos = Array.from(new Set([...(hotel?.fotos ?? []), ...(extra?.fotos ?? [])]));
  const capa = fotos[0] ?? null;

  return (
    <article id="selectedHotelCard" className={`sel-card${aberto ? " hotel-info-open" : ""}`}>
      <div className="sel-head">
        <div className="sel-main-title">
          <b>Hospedagem selecionada</b>
          <span>Hotel e quarto atualmente aplicados ao pacote</span>
        </div>
        <div className="sel-actions">
          <span className="sel-status">incluído</span>
          <button type="button" className="mini" onClick={onAlterar}>
            Alterar hospedagem
          </button>
        </div>
      </div>

      <div className="sel-body">
        {carregando && <div className="state-box">Consultando hospedagens na operadora…</div>}
        {!carregando && !hotel && <div className="state-box">Nenhuma hospedagem selecionada para este período.</div>}

        {hotel && (
          <>
            <div className="hotel-hero-v9">
              {capa ? (
                <img
                  src={capa}
                  alt={`Foto do hotel ${hotel.nome}`}
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="hotel-photo-copy">
                {estrelas ? <div className="stars">{"★".repeat(estrelas)}</div> : null}
                <h3>{hotel.nome}</h3>
                <p>
                  {[hotel.localizacao, avaliacao ? `avaliação ${avaliacao}/5` : null].filter(Boolean).join(" · ") ||
                    "Localização conforme a operadora"}
                </p>
              </div>
              <button type="button" className="hotel-about-toggle" onClick={() => setAberto((v) => !v)}>
                {aberto ? "Ver menos ⌃" : "Sobre o hotel ⌄"}
              </button>
            </div>


            <div className="hotel-selected-content">
              <div className="hotel-value-row">
                <span>
                  {dataBr(checkin)} → {dataBr(checkout)}
                  {noites ? ` · ${plural(noites, "noite", "noites")}` : ""}
                </span>
                <span>{quarto?.regime ?? hotel.regime ?? "Regime conforme tarifa"}</span>
                <span>
                  {quarto?.reembolsavel === true
                    ? "Reembolsável"
                    : quarto?.reembolsavel === false
                      ? "Não reembolsável"
                      : "Política conforme tarifa"}
                </span>
              </div>

              <div className="hotel-room-premium">
                <div className="eyeline">
                  <span>Quarto selecionado</span>
                  <span>{plural(qtdQuartos, "quarto", "quartos")}</span>
                </div>
                <b>{quarto?.nome ?? "Acomodação conforme o pacote"}</b>
                <small>
                  {[quarto?.ocupacao, quarto?.regime ?? hotel.regime].filter(Boolean).join(" · ") || "—"}
                  <br />
                  {quarto?.politica ?? hotel.politicas[0] ?? "Política de cancelamento conforme a operadora"}
                </small>
              </div>

              <div className="overview-flight-toggle-row">
                <button type="button" className="overview-flight-more" onClick={() => setAberto((v) => !v)}>
                  {aberto ? "Ver menos ⌃" : "Sobre o hotel ⌄"}
                </button>
              </div>

              <div className="overview-hotel-details">
                <div className="hotel-about-grid">
                  <div className="hotel-about-copy">
                    <h4>Sobre o hotel</h4>
                    {info.isLoading && !descricao ? (
                      <p>Carregando informações do hotel…</p>
                    ) : (
                      <p>{descricao ?? "A operadora não enviou descrição para esta hospedagem."}</p>
                    )}
                    {comodidades.length ? (
                      <div className="chips" style={{ marginTop: 10 }}>
                        {comodidades.map((c) => (
                          <span key={c} className="chip active">
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="hotel-about-side">
                    <h4>Informações da estadia</h4>
                    <div className="hotel-info-list">
                      <div className="hotel-info-line">
                        <span>Localização</span>
                        <b>{endereco ?? "—"}</b>
                      </div>
                      <div className="hotel-info-line">
                        <span>Categoria</span>
                        <b>{estrelas ? `${estrelas} estrelas` : "—"}</b>
                      </div>
                      <div className="hotel-info-line">
                        <span>Avaliação</span>
                        <b>
                          {avaliacao
                            ? `${avaliacao}/5${extra?.numAvaliacoes ? ` · ${extra.numAvaliacoes} avaliações` : ""}`
                            : "—"}
                        </b>
                      </div>
                      <div className="hotel-info-line">
                        <span>Check-in</span>
                        <b>{dataBr(checkin)}</b>
                      </div>
                      <div className="hotel-info-line">
                        <span>Check-out</span>
                        <b>{dataBr(checkout)}</b>
                      </div>
                      <div className="hotel-info-line">
                        <span>Regime</span>
                        <b>{quarto?.regime ?? hotel.regime ?? "—"}</b>
                      </div>
                      {politicas.map((p, i) => (
                        <div className="hotel-info-line" key={`${p}-${i}`}>
                          <span>Política</span>
                          <b>{p}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="hotel-gallery-title">
                  <b>Fotos do hotel</b>
                  <span>{fotos.length ? `${fotos.length} fotos disponíveis` : "Galeria da hospedagem"}</span>
                </div>
                {fotos.length ? (
                  <div className="hotel-gallery">
                    {fotos.map((f, i) => (
                      <figure key={`${f}-${i}`}>
                        <img src={f} alt={`Foto ${i + 1} do hotel ${hotel.nome}`} loading="lazy" />
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="state-box">Nenhuma foto disponível para esta hospedagem.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
