import { useState } from "react";
import { LogoCia } from "@/components/pacote-motor/LogoCia";
import { IconeBagagem } from "@/components/pacote-motor/IconeBagagem";
import { hora, resumoVoo } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";

const dataCurta = (iso: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");

function Trecho({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const r = resumoVoo(voo);
  return (
    <div className="flight-pane">
      <div className="triptop">
        <span>
          {rotulo} · {dataCurta(voo.partida)}
        </span>
        <span>{r.escalas}</span>
      </div>
      <div className="route">
        <div className="pt">
          <strong>{hora(voo.partida)}</strong>
          <b>{voo.origem}</b>
        </div>
        <div className="mid">
          <span>{[r.duracao, voo.escala].filter(Boolean).join(" · ")}</span>
          <div />
          <small>{voo.familiaTarifaria || voo.classe || "Tarifa conforme companhia"}</small>
        </div>
        <div className="pt r">
          <strong>{hora(voo.chegada)}</strong>
          <b>{voo.destino}</b>
        </div>
      </div>
    </div>
  );
}

function Conexoes({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const trechos: any[] = voo.conexoes?.length ? (voo.conexoes as any[]) : [];
  return (
    <div className="overview-conn-box">
      <h4>
        {rotulo} · {dataCurta(voo.partida)}
      </h4>
      {trechos.length === 0 && (
        <div className="overview-segment">
          <div className="clock">
            {hora(voo.partida)}
            <small>{voo.origem}</small>
          </div>
          <div className="dotline" />
          <div className="segcopy">
            <b>
              {voo.companhiaIata} {voo.numeroVoo} · {voo.origem} → {voo.destino}
            </b>
            <span>Chegada prevista {hora(voo.chegada)}</span>
          </div>
        </div>
      )}
      {trechos.map((c: any, i: number) => (
        <div key={`${c.numeroVoo}-${i}`}>
          {i > 0 ? <div className="overview-layover">Conexão em {trechos[i - 1].destino}</div> : null}
          <div className="overview-segment">
            <div className="clock">
              {hora(c.partida)}
              <small>{c.origem}</small>
            </div>
            <div className="dotline" />
            <div className="segcopy">
              <b>
                {c.companhiaIata} {c.numeroVoo} · {c.origem} → {c.destino}
              </b>
              <span>
                Chegada {hora(c.chegada)}
                {c.duracao ? ` · ${c.duracao}` : ""}
                {c.classe ? ` · ${c.classe}` : ""}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card "Voo selecionado" da visão geral, no padrão aprovado. */
export function CardVooSelecionado({
  oferta,
  onAlterar,
  carregando,
  aviso,
}: {
  oferta: PassHubOferta | null;
  onAlterar: () => void;
  carregando: boolean;
  aviso?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const volta = oferta?.voltas?.[0] ?? null;
  const r = oferta ? resumoVoo(oferta.ida) : null;

  return (
    <article id="selectedFlightCard" className={`sel-card${aberto ? " details-open" : ""}`}>
      <div className="sel-head">
        <div className="sel-main-title">
          <b>Voo selecionado</b>
          <span>Opção combinada de ida e volta já aplicada no pacote</span>
        </div>
        <div className="sel-actions">
          <span className="sel-status">incluído</span>
          <button type="button" className="mini" onClick={onAlterar}>
            Alterar voo
          </button>
        </div>
      </div>
      <div className="sel-body">
        {carregando && <div className="state-box">Consultando aéreos…</div>}
        {!carregando && !oferta && <div className="state-box">{aviso ?? "Nenhum voo selecionado para este trecho."}</div>}
        {oferta && r && (
          <>
            <div className="air-top">
              <div className="air">
                <LogoCia iata={oferta.ida.companhiaIata} nome={r.companhia} size={40} />
                <div>
                  <b>{r.companhia}</b>
                  <small>
                    {oferta.ida.companhiaIata} {oferta.ida.numeroVoo}
                    {volta ? ` / ${volta.companhiaIata} ${volta.numeroVoo}` : ""}
                  </small>
                </div>
              </div>
            </div>

            <div className="flight-stack">
              <Trecho voo={oferta.ida} rotulo="Ida" />
              {volta ? <Trecho voo={volta} rotulo="Volta" /> : null}
            </div>


            <div className="overview-flight-toggle-row">
              <button type="button" className="overview-flight-more" onClick={() => setAberto((v) => !v)}>
                {aberto ? "Ver menos ⌃" : "Ver mais ⌄"}
              </button>
            </div>

            <div className="overview-flight-details">
              <div className="overview-conn-grid">
                <Conexoes voo={oferta.ida} rotulo="Ida" />
                {volta ? <Conexoes voo={volta} rotulo="Volta" /> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
