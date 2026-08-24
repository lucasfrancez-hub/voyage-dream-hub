import { useMemo, useState } from "react";
import { brl, plural, type HotelPacote } from "@/lib/pacote-motor/mapear";

/** Alterar hospedagem — padrão aprovado: filtros | hotéis | resumo. */
export function SeletorHospedagem({
  hoteis,
  carregando,
  erro,
  hotelSelecionadoId,
  quartoSelecionadoId,
  baseTotal,
  qtdQuartos,
  totalPacote,
  onSelecionar,
  resumo,
}: {
  hoteis: HotelPacote[];
  carregando: boolean;
  erro?: string | null;
  hotelSelecionadoId: string | null;
  quartoSelecionadoId: string | null;
  baseTotal: number;
  qtdQuartos: number;
  totalPacote: (hotel: HotelPacote, quartoId: string | null) => number;
  onSelecionar: (hotel: HotelPacote, quartoId: string | null) => void;
  resumo: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [estrelas, setEstrelas] = useState<number[]>([]);
  const [regimes, setRegimes] = useState<string[]>([]);
  const [soReembolsavel, setSoReembolsavel] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const regimesDisponiveis = useMemo(
    () => Array.from(new Set(hoteis.map((h) => h.regime).filter(Boolean) as string[])).slice(0, 8),
    [hoteis],
  );
  const precos = hoteis.map((h) => h.total).filter((v) => v > 0);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return hoteis.filter((h) => {
      if (b && !h.nome.toLowerCase().includes(b) && !(h.localizacao ?? "").toLowerCase().includes(b)) return false;
      if (estrelas.length && !(h.categoria && estrelas.includes(h.categoria))) return false;
      if (regimes.length && !(h.regime && regimes.includes(h.regime))) return false;
      if (soReembolsavel && h.reembolsavel !== true) return false;
      return true;
    });
  }, [hoteis, busca, estrelas, regimes, soReembolsavel]);

  return (
    <section className="screen active">
      <div className="title">
        <div>
          <h2>Escolha a hospedagem</h2>
          <p>Hotel, quarto, regime, política e diferença no pacote.</p>
        </div>
        <span className="pill">{lista.length} hotéis</span>
      </div>

      <div className="market">
        <aside className="filters">
          <div className="filter-head">Filtros de hospedagem</div>
          <div className="filter-body">
            <div className="fb">
              <span className="flabel">Nome do hotel</span>
              <input
                className="finput"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar hotel"
              />
            </div>
            {precos.length ? (
              <div className="fb">
                <span className="flabel">Faixa de preço</span>
                <div className="pricecap">
                  <span>{brl(Math.min(...precos))}</span>
                  <span>{brl(Math.max(...precos))}</span>
                </div>
                <div className="range" />
              </div>
            ) : null}
            <div className="fb">
              <span className="flabel">Categoria</span>
              <div className="chips">
                {[3, 4, 5].map((e) => (
                  <span
                    key={e}
                    className={`chip${estrelas.includes(e) ? " active" : ""}`}
                    onClick={() => setEstrelas((a) => (a.includes(e) ? a.filter((x) => x !== e) : [...a, e]))}
                  >
                    {e} ★
                  </span>
                ))}
              </div>
            </div>
            {regimesDisponiveis.length ? (
              <div className="fb">
                <span className="flabel">Regime</span>
                <div className="chips">
                  {regimesDisponiveis.map((r) => (
                    <span
                      key={r}
                      className={`chip${regimes.includes(r) ? " active" : ""}`}
                      onClick={() => setRegimes((a) => (a.includes(r) ? a.filter((x) => x !== r) : [...a, r]))}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="fb">
              <div className="toggle">
                <span>Somente reembolsáveis</span>
                <i
                  className={`switch${soReembolsavel ? " on" : ""}`}
                  role="switch"
                  aria-checked={soReembolsavel}
                  onClick={() => setSoReembolsavel((v) => !v)}
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="results">
          {carregando && <div className="state-box">Consultando hospedagens disponíveis para a sua ocupação…</div>}
          {!carregando && erro && <div className="state-box err">{erro}</div>}
          {!carregando && !erro && lista.length === 0 && (
            <div className="state-box">Nenhuma hospedagem disponível para este destino, período e ocupação.</div>
          )}

          {lista.map((h) => {
            const sel = h.id === hotelSelecionadoId;
            const expandido = aberto === h.id;
            const quartoAtivo = sel ? (h.quartos.find((q) => q.id === quartoSelecionadoId) ?? h.quartos[0]) : h.quartos[0];
            const dif = Number((h.total - baseTotal).toFixed(2));
            return (
              <article key={h.id} className={`hotel${sel ? " selected" : ""}${expandido ? " open" : ""}`}>
                <div className="hotelgrid">
                  <div
                    className="photo"
                    style={h.fotos[0] ? { backgroundImage: `url('${h.fotos[0]}')` } : undefined}
                    aria-label={`Foto do hotel ${h.nome}`}
                  />
                  <div className="hotelmain">
                    <div className="hotelhead">
                      <div>
                        {h.categoria ? <div className="stars">{"★".repeat(h.categoria)}</div> : null}
                        <h3>{h.nome}</h3>
                        <p>{h.endereco ?? h.localizacao ?? "Localização conforme a operadora"}</p>
                      </div>
                      {h.avaliacao ? (
                        <div className="rating">
                          <b>{h.avaliacao}</b>
                          <span>avaliação</span>
                        </div>
                      ) : null}
                    </div>

                    {h.comodidades.length ? (
                      <div className="amen">
                        {h.comodidades.slice(0, 6).map((a) => (
                          <span key={a}>{a.length > 34 ? `${a.slice(0, 34)}…` : a}</span>
                        ))}
                      </div>
                    ) : null}

                    <div className="roomrow">
                      <div>
                        <b>{quartoAtivo?.nome ?? "Acomodação conforme o pacote"}</b>
                        <span>
                          {[
                            plural(qtdQuartos, "quarto", "quartos"),
                            quartoAtivo?.regime ?? h.regime,
                            quartoAtivo?.politica,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </div>
                      <button type="button" className="more" onClick={() => setAberto(expandido ? null : h.id)}>
                        {expandido ? "Fechar quartos ⌃" : "Alterar quarto ⌄"}
                      </button>
                    </div>
                  </div>

                  <div className="hotelprice">
                    <div className="prow">
                      <span>Diferença</span>
                      <b>
                        {Math.abs(dif) < 0.005 ? "Incluído" : dif > 0 ? `+ ${brl(dif, h.moeda)}` : `- ${brl(Math.abs(dif), h.moeda)}`}
                      </b>
                    </div>
                    <div className="divider" />
                    <span className="plabel">Valor final do pacote</span>
                    <div className="big">{brl(totalPacote(h, quartoAtivo?.id ?? null), h.moeda)}</div>
                    <button type="button" onClick={() => onSelecionar(h, quartoAtivo?.id ?? null)}>
                      {sel ? "Selecionado" : "Selecionar hotel"}
                    </button>
                  </div>
                </div>

                <div className="hotel-detail">
                  <div className="detail-head">
                    <b>Escolha o quarto</b>
                    <span>Opções realmente disponíveis para a ocupação pesquisada</span>
                  </div>
                  <div className="room-grid">
                    {h.quartos.length === 0 && (
                      <div className="state-box">A operadora não devolveu quartos alternativos para esta ocupação.</div>
                    )}
                    {h.quartos.map((q) => {
                      const ativo = sel && q.id === (quartoSelecionadoId ?? h.quartos[0]?.id);
                      return (
                        <div key={q.id} className={`room-card${ativo ? " active" : ""}`}>
                          <div className="room-main">
                            <b>{q.nome}</b>
                            <span>
                              {[q.ocupacao ?? plural(qtdQuartos, "quarto", "quartos"), q.regime].filter(Boolean).join(" · ")}
                              <br />
                              {q.reembolsavel === true
                                ? "Reembolsável"
                                : q.reembolsavel === false
                                  ? "Não reembolsável"
                                  : "Política conforme tarifa"}
                            </span>
                          </div>
                          <div className="room-meta">
                            <strong>Política</strong>
                            {q.politica ?? "Conforme a operadora"}
                          </div>
                          <div className="room-price">
                            <small>Diferença</small>
                            <b>
                              {Math.abs(q.diferenca) < 0.005 ? "Incluído" : `+ ${brl(q.diferenca, h.moeda)}`}
                            </b>
                          </div>
                          <button type="button" className="room-select" onClick={() => onSelecionar(h, q.id)}>
                            {ativo ? "Selecionado" : "Selecionar quarto"}
                          </button>
                        </div>
                      );
                    })}
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
