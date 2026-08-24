import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { brl, diferencaTexto, type HotelPacote } from "@/lib/pacote-motor/mapear";

type Ordem = "recomendado" | "preco" | "estrelas" | "nome";

/** Alterar hospedagem — marketplace aprovado: filtros | hotéis | resumo. */
export function SeletorHospedagem({
  hoteis,
  carregando,
  hotelSelecionadoId,
  quartoSelecionadoId,
  baseTotal,
  onSelecionar,
  resumo,
}: {
  hoteis: HotelPacote[];
  carregando: boolean;
  hotelSelecionadoId: string | null;
  quartoSelecionadoId: string | null;
  baseTotal: number;
  onSelecionar: (hotel: HotelPacote, quartoId: string | null) => void;
  resumo: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recomendado");
  const [aberto, setAberto] = useState<string | null>(null);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const arr = hoteis.filter(
      (h) => !b || h.nome.toLowerCase().includes(b) || (h.localizacao ?? "").toLowerCase().includes(b),
    );
    return arr.sort((a, z) => {
      if (ordem === "preco") return a.total - z.total;
      if (ordem === "nome") return a.nome.localeCompare(z.nome, "pt-BR");
      if (ordem === "estrelas") return (z.categoria ?? 0) - (a.categoria ?? 0) || a.posicao - z.posicao;
      return a.posicao - z.posicao;
    });
  }, [hoteis, busca, ordem]);

  return (
    <div className="market-wrap">
      <div className="filter-card">
        <h4>Filtrar hospedagens</h4>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Hotel ou região"
        />
        <h4 style={{ marginTop: 16 }}>Ordenar por</h4>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
          <option value="recomendado">Recomendados</option>
          <option value="preco">Menor valor</option>
          <option value="estrelas">Mais estrelas</option>
          <option value="nome">Nome</option>
        </select>
      </div>

      <div>
        <div className="section-head">
          <div>
            <h2>Alterar hospedagem</h2>
            <p>Mesma estrutura do marketplace, só focada em hotel e quarto.</p>
          </div>
          <span className="count">{lista.length} hotéis</span>
        </div>

        {carregando && (
          <div className="summary-card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando hospedagens…
          </div>
        )}
        {!carregando && lista.length === 0 && (
          <div className="summary-card">Nenhuma hospedagem encontrada para este destino e período.</div>
        )}

        <div className="market-list">
          {lista.map((h) => {
            const diff = Number((h.total - baseTotal).toFixed(2));
            const selecionado = h.id === hotelSelecionadoId;
            const expandido = aberto === h.id;
            const quarto = h.quartos.find((q) => q.id === quartoSelecionadoId) ?? h.quartos[0] ?? null;
            return (
              <article key={h.id} className={`market-hotel${selecionado ? " selected" : ""}`}>
                {h.fotos[0] ? (
                  <img className="cover" src={h.fotos[0]} alt={`Foto do hotel ${h.nome}`} loading="lazy" />
                ) : (
                  <div className="noimg">Sem foto</div>
                )}

                <div className="mh-info">
                  {h.categoria ? <p className="stars">{"★".repeat(h.categoria)}</p> : null}
                  <h4>{h.nome}</h4>
                  <p>
                    {[h.localizacao, h.avaliacao ? `${h.avaliacao}/5` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {h.beneficios.length ? (
                    <div className="tags">
                      {h.beneficios.slice(0, 4).map((b) => (
                        <span key={b}>{b.length > 34 ? `${b.slice(0, 34)}…` : b}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mh-room">
                    <span>
                      <b>{quarto?.nome ?? "Acomodação conforme o pacote"}</b>
                      <br />
                      {[
                        quarto?.ocupacao,
                        quarto?.regime ?? h.regime,
                        quarto?.reembolsavel === true
                          ? "reembolsável"
                          : quarto?.reembolsavel === false
                            ? "não reembolsável"
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                    <button type="button" onClick={() => setAberto(expandido ? null : h.id)}>
                      {expandido ? "Ver menos" : "Ver mais"}
                    </button>
                  </div>
                </div>

                <div className="mh-price">
                  <small>{diferencaTexto(diff, h.moeda)}</small>
                  <b>{brl(h.total, h.moeda)}</b>
                  <small>pacote total</small>
                  <button
                    type="button"
                    className={selecionado ? "on" : ""}
                    onClick={() => onSelecionar(h, quarto?.id ?? null)}
                  >
                    {selecionado ? "Selecionado" : "Selecionar hotel"}
                  </button>
                </div>

                {expandido && (
                  <div className="mh-extra">
                    {h.fotos.length > 1 && (
                      <div className="fotos">
                        {h.fotos.slice(0, 8).map((f) => (
                          <img key={f} src={f} alt={`Foto do hotel ${h.nome}`} loading="lazy" />
                        ))}
                      </div>
                    )}
                    {h.quartos.length === 0 ? (
                      <p style={{ fontSize: 11, color: "var(--muted)" }}>Acomodação conforme o pacote da operadora.</p>
                    ) : (
                      h.quartos.map((q) => {
                        const sel = selecionado && q.id === quartoSelecionadoId;
                        return (
                          <div key={q.id} className="quarto-row">
                            <div>
                              <b>{q.nome}</b>
                              <p>
                                {[
                                  q.ocupacao,
                                  q.regime,
                                  q.reembolsavel === true
                                    ? "Reembolsável"
                                    : q.reembolsavel === false
                                      ? "Não reembolsável"
                                      : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </p>
                            </div>
                            <div>
                              <b>{diferencaTexto(q.diferenca, h.moeda)}</b>
                              <button type="button" className={sel ? "on" : ""} onClick={() => onSelecionar(h, q.id)}>
                                {sel ? "Selecionado" : "Selecionar quarto"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {resumo}
    </div>
  );
}
