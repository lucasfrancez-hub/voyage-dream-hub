import { useState } from "react";
import { Lightbox } from "@/components/pacote-motor/Lightbox";
import { useInfoHotel } from "@/components/pacote-motor/CardHotelSelecionado";
import type { HotelPacote } from "@/lib/pacote-motor/mapear";

/** Modal "Sobre o hotel": descrição, comodidades, políticas e galeria clicável. */
export function SobreHotelModal({ hotel, onFechar }: { hotel: HotelPacote; onFechar: () => void }) {
  const info = useInfoHotel(hotel);
  const extra = info.data;
  const [foto, setFoto] = useState<number | null>(null);

  const estrelas = hotel.categoria ?? extra?.estrelas ?? null;
  const avaliacao = hotel.avaliacao ?? extra?.avaliacao ?? null;
  const endereco = hotel.endereco ?? extra?.endereco ?? hotel.localizacao ?? null;
  const descricao = hotel.descricao ?? extra?.descricao ?? null;
  const comodidades = (hotel.comodidades?.length ? hotel.comodidades : (extra?.comodidades ?? [])).slice(0, 16);
  const fotos = Array.from(new Set([...(hotel.fotos ?? []), ...(extra?.fotos ?? [])]));

  return (
    <div className="mkt-modal" role="dialog" aria-modal="true" aria-label={`Sobre ${hotel.nome}`} onClick={onFechar}>
      <div className="mkt-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mkt-modal-head">
          <div>
            {estrelas ? <div className="stars">{"★".repeat(estrelas)}</div> : null}
            <h3>{hotel.nome}</h3>
            <p>{[endereco, avaliacao ? `avaliação ${avaliacao}/5` : null].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <button type="button" className="mkt-modal-close" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="mkt-modal-body">
          <h4>Sobre o hotel</h4>
          {info.isLoading && !descricao ? (
            <p>Carregando informações do hotel…</p>
          ) : (
            <p>{descricao ?? "Descrição não disponível para esta hospedagem."}</p>
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

          {hotel.politicas?.length ? (
            <>
              <h4 style={{ marginTop: 16 }}>Políticas</h4>
              <ul className="mkt-modal-list">
                {hotel.politicas.map((p, i) => (
                  <li key={`${p}-${i}`}>{p}</li>
                ))}
              </ul>
            </>
          ) : null}

          <h4 style={{ marginTop: 16 }}>Fotos {fotos.length ? `(${fotos.length})` : ""}</h4>
          {fotos.length ? (
            <div className="hotel-gallery">
              {fotos.map((f, i) => (
                <figure key={`${f}-${i}`}>
                  <img
                    src={f}
                    alt={`Foto ${i + 1} do hotel ${hotel.nome}`}
                    loading="lazy"
                    onClick={() => setFoto(i)}
                    style={{ cursor: "zoom-in" }}
                  />
                </figure>
              ))}
            </div>
          ) : (
            <div className="state-box">Nenhuma foto disponível para esta hospedagem.</div>
          )}
        </div>
      </div>

      {foto !== null ? (
        <Lightbox fotos={fotos} indice={foto} titulo={hotel.nome} onIndice={setFoto} onFechar={() => setFoto(null)} />
      ) : null}
    </div>
  );
}
