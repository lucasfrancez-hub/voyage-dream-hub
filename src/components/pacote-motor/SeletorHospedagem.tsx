import { useEffect, useMemo, useState } from "react";
import { FiltrosMkt } from "./FiltrosMkt";
import { brl, plural, type HotelPacote } from "@/lib/pacote-motor/mapear";
import { Chips } from "@/components/pacote-motor/SeletorVoo";
import { Paginacao, ITENS_POR_PAGINA } from "@/components/pacote-motor/Paginacao";
import { SobreHotelModal } from "@/components/pacote-motor/SobreHotelModal";
import { Lightbox } from "@/components/pacote-motor/Lightbox";

type OrdemHotel = "recomendado" | "preco" | "precoDesc" | "estrelas" | "avaliacao";

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
  const [comodidades, setComodidades] = useState<string[]>([]);
  const [notaMinima, setNotaMinima] = useState<number | null>(null);
  const [precoMax, setPrecoMax] = useState<number | null>(null);
  const [soReembolsavel, setSoReembolsavel] = useState(false);
  const [ordem, setOrdem] = useState<OrdemHotel>("recomendado");
  const [aberto, setAberto] = useState<string | null>(null);
  const [sobre, setSobre] = useState<HotelPacote | null>(null);
  const [galeria, setGaleria] = useState<{ hotel: HotelPacote; i: number } | null>(null);

  const opcoes = useMemo(() => {
    const reg = new Set<string>();
    const com = new Map<string, number>();
    for (const h of hoteis) {
      for (const q of h.quartos) if (q.regime) reg.add(q.regime);
      if (h.regime) reg.add(h.regime);
      for (const c of h.comodidades) com.set(c, (com.get(c) ?? 0) + 1);
    }
    return {
      regimes: [...reg].sort(),
      comodidades: [...com.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([c]) => c),
    };
  }, [hoteis]);

  const limites = useMemo(() => {
    const p = hoteis.map((h) => h.total).filter((v) => v > 0);
    return {
      min: p.length ? Math.floor(Math.min(...p)) : 0,
      max: p.length ? Math.ceil(Math.max(...p)) : 0,
    };
  }, [hoteis]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const filtrados = hoteis.filter((h) => {
      if (b && !h.nome.toLowerCase().includes(b) && !(h.localizacao ?? "").toLowerCase().includes(b)) return false;
      if (estrelas.length && !(h.categoria && estrelas.includes(h.categoria))) return false;
      if (regimes.length) {
        const disponiveis = [h.regime, ...h.quartos.map((q) => q.regime)].filter(Boolean) as string[];
        if (!disponiveis.some((r) => regimes.includes(r))) return false;
      }
      if (comodidades.length && !comodidades.every((c) => h.comodidades.includes(c))) return false;
      if (notaMinima != null && !(h.avaliacao != null && h.avaliacao >= notaMinima)) return false;
      if (soReembolsavel && h.reembolsavel !== true && !h.quartos.some((q) => q.reembolsavel === true)) return false;
      if (precoMax != null && h.total > precoMax) return false;
      return true;
    });
    const ordenados = [...filtrados];
    if (ordem === "recomendado")
      ordenados.sort(
        (a, b) => Number(!!b.recomendado) - Number(!!a.recomendado) || a.posicao - b.posicao,
      );
    if (ordem === "preco") ordenados.sort((a, b) => a.total - b.total);
    if (ordem === "precoDesc") ordenados.sort((a, b) => b.total - a.total);
    if (ordem === "estrelas") ordenados.sort((a, b) => (b.categoria ?? 0) - (a.categoria ?? 0));
    if (ordem === "avaliacao") ordenados.sort((a, b) => (b.avaliacao ?? 0) - (a.avaliacao ?? 0));
    return ordenados;
  }, [hoteis, busca, estrelas, regimes, comodidades, notaMinima, soReembolsavel, precoMax, ordem]);

  const limparFiltros = () => {
    setBusca("");
    setEstrelas([]);
    setRegimes([]);
    setComodidades([]);
    setNotaMinima(null);
    setPrecoMax(null);
    setSoReembolsavel(false);
    setOrdem("recomendado");
  };

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
        <FiltrosMkt titulo="Filtros de hospedagem" onLimpar={limparFiltros}>

            <div className="fb">
              <span className="flabel">Ordenar por</span>
              <select className="fselect" value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemHotel)}>
                <option value="recomendado">Recomendado</option>
                <option value="preco">Menor preço</option>
                <option value="precoDesc">Maior preço</option>
                <option value="estrelas">Categoria (estrelas)</option>
                <option value="avaliacao">Melhor avaliação</option>
              </select>
            </div>
            <div className="fb">
              <span className="flabel">Nome do hotel</span>
              <input
                className="finput"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar hotel ou bairro"
              />
            </div>
            {limites.max > 0 ? (
              <div className="fb">
                <span className="flabel">Preço até</span>
                <div className="pricecap">
                  <span>{brl(limites.min)}</span>
                  <span>{brl(precoMax ?? limites.max)}</span>
                </div>
                <input
                  className="frange"
                  type="range"
                  min={limites.min}
                  max={limites.max}
                  step={10}
                  value={precoMax ?? limites.max}
                  onChange={(e) => setPrecoMax(Number(e.target.value))}
                />
              </div>
            ) : null}
            <div className="fb">
              <span className="flabel">Categoria</span>
              <div className="chips">
                {[1, 2, 3, 4, 5].map((e) => (
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
            <div className="fb">
              <span className="flabel">Avaliação mínima</span>
              <div className="chips">
                {[7, 8, 9].map((n) => (
                  <span
                    key={n}
                    className={`chip${notaMinima === n ? " active" : ""}`}
                    onClick={() => setNotaMinima(notaMinima === n ? null : n)}
                  >
                    {n}+
                  </span>
                ))}
              </div>
            </div>
            <Chips
              rotulo="Regime de alimentação"
              opcoes={opcoes.regimes.map((r) => ({ v: r, l: r }))}
              valor={regimes}
              onChange={setRegimes}
            />
            <Chips
              rotulo="Comodidades"
              opcoes={opcoes.comodidades.map((c) => ({ v: c, l: c.length > 22 ? `${c.slice(0, 22)}…` : c }))}
              valor={comodidades}
              onChange={setComodidades}
            />
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
          </FiltrosMkt>

        <div className="results">
          {carregando && <div className="state-box">Consultando hospedagens disponíveis para a sua ocupação…</div>}
          {!carregando && erro && <div className="state-box err">{erro}</div>}
          {!carregando && !erro && lista.length === 0 && (
            <div className="state-box">Nenhuma hospedagem disponível para este destino, período e ocupação.</div>
          )}

          {listaPaginada.map((h) => {
            const sel = h.id === hotelSelecionadoId;
            const expandido = aberto === h.id;
            const quartoAtivo = sel ? (h.quartos.find((q) => q.id === quartoSelecionadoId) ?? h.quartos[0]) : h.quartos[0];
            const dif = Number((h.total - baseTotal).toFixed(2));
            return (
              <article key={h.id} className={`hotel${sel ? " selected" : ""}${expandido ? " open" : ""}`}>
                <div className="hotelgrid">
                  <button
                    type="button"
                    className="photo"
                    style={h.fotos[0] ? { backgroundImage: `url('${h.fotos[0]}')`, cursor: "zoom-in" } : undefined}
                    aria-label={`Ver fotos do hotel ${h.nome}`}
                    onClick={() => h.fotos.length && setGaleria({ hotel: h, i: 0 })}
                  >
                    {h.recomendado ? <span className="selo-rec engine-badge">Recomendado</span> : null}
                  </button>
                  <div className="hotelmain">
                    <div className="hotelhead">
                      <div className="hotel-title-wrap">
                        <div className="hotel-title-line">
                          {h.categoria ? <div className="stars">{"★".repeat(h.categoria)}</div> : null}
                          <h3>{h.nome}</h3>
                        </div>
                        <span className="engine-type">Hospedagem</span>
                        <p>{h.endereco ?? h.localizacao ?? "Localização não informada"}</p>
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

                    <div className="hotel-room-line">
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

                    <div className="hotel-card-foot">
                      <button type="button" className="hotel-foot-link" onClick={() => setSobre(h)}>
                        Sobre o hotel
                      </button>
                      <button
                        type="button"
                        className={`hotel-foot-btn${expandido ? " on" : ""}`}
                        onClick={() => setAberto(expandido ? null : h.id)}
                      >
                        {expandido ? "Fechar quartos" : `Alterar quarto${h.quartos.length > 1 ? ` (${h.quartos.length})` : ""}`}
                      </button>
                    </div>
                  </div>

                  <div className="hotelprice">
                    <div className="prow hotel-diff-row">
                      <span>Diferença</span>
                      <b className={Math.abs(dif) < 0.005 ? "" : dif > 0 ? "diff-pos" : "diff-neg"}>
                        {Math.abs(dif) < 0.005 ? "Incluído" : dif > 0 ? `+ ${brl(dif, h.moeda)}` : `- ${brl(Math.abs(dif), h.moeda)}`}
                      </b>
                    </div>
                    <div className="divider hotel-diff-divider" />
                    <span className="plabel hotel-total-label">Valor final do pacote</span>
                    <div className="big hotel-total-big">{brl(totalPacote(h, quartoAtivo?.id ?? null), h.moeda)}</div>

                    {/* mobile: diferença como destaque */}
                    <span className="plabel hotel-diff-label-mobile">Diferença</span>
                    <div className={`big hotel-diff-big-mobile${Math.abs(dif) < 0.005 ? "" : dif > 0 ? " diff-pos" : " diff-neg"}`}>
                      {Math.abs(dif) < 0.005 ? "Incluído" : dif > 0 ? `+ ${brl(dif, h.moeda)}` : `- ${brl(Math.abs(dif), h.moeda)}`}
                    </div>
                    <span className="hotel-total-sub-mobile">
                      Total: {brl(totalPacote(h, quartoAtivo?.id ?? null), h.moeda)}
                    </span>

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
                      <div className="state-box">Nenhum quarto alternativo disponível para esta ocupação.</div>
                    )}
                    {h.quartos.map((q) => {
                      const ativo = sel && q.id === (quartoSelecionadoId ?? h.quartos[0]?.id);
                      const regime = (q.regime ?? "").trim();
                      const semCafe = /alojament|room only|sem caf/i.test(regime);
                      return (
                        <div key={q.id} className={`room-card${ativo ? " active" : ""}`}>
                          <div className="room-main">
                            <div className="room-head">
                              <b>{q.nome}</b>
                              {regime ? (
                                <span className={`room-tag${semCafe ? " alert" : ""}`} title={semCafe ? "Sem café da manhã incluso" : regime}>
                                  {semCafe ? (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                                        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                                        <line x1="6" y1="1" x2="6" y2="4" />
                                        <line x1="10" y1="1" x2="10" y2="4" />
                                        <line x1="14" y1="1" x2="14" y2="4" />
                                      </svg>
                                      Só alojamento · sem café da manhã
                                    </>
                                  ) : (
                                    regime
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <div className="room-facts">
                              <span className="rf-occ">
                                {q.ocupacao ?? plural(qtdQuartos, "quarto", "quartos")}
                              </span>
                              <span className={q.reembolsavel === true ? "rf-ok" : "rf-mute"}>
                                {q.reembolsavel === true
                                  ? "Reembolsável"
                                  : q.reembolsavel === false
                                    ? "Não reembolsável"
                                    : "Política conforme tarifa"}
                              </span>
                              <span className="rf-pol">{q.politica ?? "Conforme o pacote"}</span>
                            </div>
                          </div>
                          <div className="room-side">
                            <div className="room-price">
                              {Math.abs(q.diferenca) < 0.005 ? null : <small>Diferença no pacote</small>}
                              <b>
                                {Math.abs(q.diferenca) < 0.005 ? "Incluído" : `+ ${brl(q.diferenca, h.moeda)}`}
                              </b>
                            </div>
                            <button type="button" className="room-select" onClick={() => onSelecionar(h, q.id)}>
                              {ativo ? "Selecionado" : "Selecionar quarto"}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  </div>
                </div>
              </article>
            );
          })}

          <Paginacao
            pagina={pagina}
            total={lista.length}
            onChange={setPagina}
            rotulo="hotéis"
          />
        </div>

        {resumo}
      </div>

      {sobre ? <SobreHotelModal hotel={sobre} onFechar={() => setSobre(null)} /> : null}
      {galeria ? (
        <Lightbox
          fotos={galeria.hotel.fotos}
          indice={galeria.i}
          titulo={galeria.hotel.nome}
          onIndice={(i) => setGaleria((g) => (g ? { ...g, i } : g))}
          onFechar={() => setGaleria(null)}
        />
      ) : null}
    </section>
  );
}
