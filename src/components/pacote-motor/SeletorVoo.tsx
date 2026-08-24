import { useMemo, useState } from "react";
import { LogoCia } from "@/components/pacote-motor/LogoCia";
import { brl, hora, resumoVoo } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";

const dataCurta = (iso: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");

function Perna({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const r = resumoVoo(voo);
  return (
    <div className="leg">
      <div className="side">
        <strong>{hora(voo.partida)}</strong>
        <b>{voo.origem}</b>
        <small>
          {rotulo} · {dataCurta(voo.partida)}
        </small>
      </div>
      <div className="middle">
        <span>{r.duracao}</span>
        <div className="line" />
        <em>{[r.escalas, voo.escala, voo.familiaTarifaria || voo.classe].filter(Boolean).join(" · ")}</em>
      </div>
      <div className="side r">
        <strong>{hora(voo.chegada)}</strong>
        <b>{voo.destino}</b>
        <small>Chegada · {dataCurta(voo.chegada)}</small>
      </div>
    </div>
  );
}

function Detalhe({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const trechos: any[] = voo.conexoes?.length ? voo.conexoes : [];
  return (
    <div className="detailbox">
      <h4>
        {rotulo} · {dataCurta(voo.partida)}
      </h4>
      {(trechos.length ? trechos : [null]).map((c, i) => {
        const origem = c?.origem ?? voo.origem;
        const destino = c?.destino ?? voo.destino;
        const partida = c?.partida ?? voo.partida;
        const chegada = c?.chegada ?? voo.chegada;
        return (
          <div key={`${origem}-${i}`}>
            {i > 0 ? <div className="connect">Conexão em {trechos[i - 1].destino}</div> : null}
            <div className="segment">
              <div className="clock">
                {hora(partida)}
                <small>{origem}</small>
              </div>
              <div className="dots" />
              <div className="segtext">
                <b>
                  {(c?.companhiaIata ?? voo.companhiaIata) || ""} {(c?.numeroVoo ?? voo.numeroVoo) || ""} · {origem} →{" "}
                  {destino}
                </b>
                <span>
                  Chegada {hora(chegada)}
                  {c?.duracao ? ` · ${c.duracao}` : ""}
                  {c?.classe ? ` · ${c.classe}` : ""}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Paradas = "direto" | "ate1" | "todos";

/** Alterar voo — padrão aprovado: filtros | resultados | resumo. */
export function SeletorVoo({
  ofertas,
  carregando,
  erro,
  selecionadaId,
  baseTotal,
  totalPacote,
  onSelecionar,
  resumo,
}: {
  ofertas: PassHubOferta[];
  carregando: boolean;
  erro?: string | null;
  selecionadaId: string | null;
  baseTotal: number;
  totalPacote: (oferta: PassHubOferta) => number;
  onSelecionar: (o: PassHubOferta) => void;
  resumo: React.ReactNode;
}) {
  const [somenteBagagem, setSomenteBagagem] = useState(false);
  const [paradas, setParadas] = useState<Paradas>("todos");
  const [cias, setCias] = useState<string[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);

  const companhias = useMemo(
    () => Array.from(new Set(ofertas.map((o) => o.ida.companhiaIata).filter(Boolean))),
    [ofertas],
  );

  const lista = useMemo(
    () =>
      ofertas.filter((o) => {
        if (somenteBagagem && !o.ida.bagagemDespachada) return false;
        if (paradas === "direto" && o.ida.paradas > 0) return false;
        if (paradas === "ate1" && o.ida.paradas > 1) return false;
        if (cias.length && !cias.includes(o.ida.companhiaIata)) return false;
        return true;
      }),
    [ofertas, somenteBagagem, paradas, cias],
  );

  const precos = ofertas.map((o) => o.precoTotal).filter((v) => v > 0);

  return (
    <section className="screen active">
      <div className="title">
        <div>
          <h2>Escolha o aéreo do pacote</h2>
          <p>Compare a viagem completa em um único card: ida e volta já combinadas.</p>
        </div>
        <span className="pill">{lista.length} combinações</span>
      </div>

      <div className="market">
        <aside className="filters">
          <div className="filter-head">Filtros do aéreo</div>
          <div className="filter-body">
            <div className="fb">
              <div className="toggle">
                <span>Bagagem para despachar</span>
                <i
                  className={`switch${somenteBagagem ? " on" : ""}`}
                  onClick={() => setSomenteBagagem((v) => !v)}
                  role="switch"
                  aria-checked={somenteBagagem}
                />
              </div>
            </div>
            <div className="fb">
              <span className="flabel">Paradas</span>
              <div className="segments">
                {(
                  [
                    ["direto", "Direto"],
                    ["ate1", "Até 1"],
                    ["todos", "Todos"],
                  ] as [Paradas, string][]
                ).map(([v, l]) => (
                  <button key={v} type="button" className={paradas === v ? "active" : ""} onClick={() => setParadas(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {precos.length ? (
              <div className="fb">
                <span className="flabel">Faixa de preço</span>
                <div className="pricecap">
                  <span>{brl(Math.min(...precos))}</span>
                  <span>{brl(Math.max(...precos))}</span>
                </div>
                <div className="range" />
                <div className="rlabels">
                  <span>Mín.</span>
                  <span>Máx.</span>
                </div>
              </div>
            ) : null}
            {companhias.length ? (
              <div className="fb">
                <span className="flabel">Companhia aérea</span>
                <div className="chips">
                  {companhias.map((c) => (
                    <span
                      key={c}
                      className={`chip${cias.includes(c) ? " active" : ""}`}
                      onClick={() => setCias((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="results">
          {carregando && <div className="state-box">Consultando a malha aérea…</div>}
          {!carregando && erro && <div className="state-box err">{erro}</div>}
          {!carregando && !erro && lista.length === 0 && (
            <div className="state-box">Nenhum voo encontrado para este trecho e período.</div>
          )}

          {lista.map((o) => {
            const r = resumoVoo(o.ida);
            const volta = o.voltas?.[0] ?? null;
            const sel = o.id === selecionadaId;
            const dif = Number((o.precoTotal - baseTotal).toFixed(2));
            const expandida = aberta === o.id;
            return (
              <article key={o.id} className={`flight${sel ? " selected" : ""}${expandida ? " open" : ""}`}>
                <div className="flightgrid">
                  <div className="flightmain">
                    <div className="flighthead">
                      <div className="badge">
                        <i />
                        {volta ? "Ida e volta" : "Somente ida"} · {dataCurta(o.ida.partida)}
                        {volta ? ` → ${dataCurta(volta.partida)}` : ""}
                      </div>
                      <div className="airline">
                        <LogoCia iata={o.ida.companhiaIata} nome={r.companhia} size={34} />
                        <div>
                          <b>{r.companhia}</b>
                          <small>
                            {o.ida.companhiaIata} {o.ida.numeroVoo}
                            {volta ? ` / ${volta.companhiaIata} ${volta.numeroVoo}` : ""}
                          </small>
                        </div>
                      </div>
                    </div>

                    <div className="legs">
                      <Perna voo={o.ida} rotulo="Saída" />
                      {volta ? <Perna voo={volta} rotulo="Saída" /> : null}
                    </div>

                    <div className="flightfoot">
                      <span className="bag">{r.bagagem}</span>
                      <button type="button" className="more" onClick={() => setAberta(expandida ? null : o.id)}>
                        {expandida ? "Ver menos ⌃" : "Ver mais ⌄"}
                      </button>
                    </div>
                  </div>

                  <div className="priceside">
                    <div className="prow">
                      <span>Diferença</span>
                      <b>{Math.abs(dif) < 0.005 ? "Incluído" : dif > 0 ? `+ ${brl(dif)}` : `- ${brl(Math.abs(dif))}`}</b>
                    </div>
                    <div className="prow">
                      <span>Taxas</span>
                      <b>{brl(o.ida.taxas)}</b>
                    </div>
                    <div className="divider" />
                    <span className="plabel">Valor final do pacote</span>
                    <div className="big">{brl(totalPacote(o))}</div>
                    <div className="parcel">Parcelamento conforme a condição da operadora</div>
                    <button type="button" className={`select${sel ? " on" : ""}`} onClick={() => onSelecionar(o)}>
                      {sel ? "Selecionado" : "Selecionar"}
                    </button>
                  </div>
                </div>

                <div className="details">
                  <div className="detailgrid">
                    <Detalhe voo={o.ida} rotulo="Ida" />
                    {volta ? <Detalhe voo={volta} rotulo="Volta" /> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {resumo}
      </div>
    </section>
  );
}
