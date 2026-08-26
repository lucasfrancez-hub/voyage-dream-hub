import { useEffect, useMemo, useState } from "react";
import { FiltrosMkt } from "./FiltrosMkt";
import { brl } from "@/lib/pacote-motor/mapear";
import type { ServicoDisponivel } from "@/lib/comprefacil/servicos.server";
import { GRUPOS_SERVICO, grupoServico } from "@/lib/pacote-motor/categorias";
import { ServicoModal } from "@/components/pacote-motor/ServicoModal";
import { Paginacao, ITENS_POR_PAGINA } from "@/components/pacote-motor/Paginacao";
import seguroImg from "@/assets/seguro-viagem.jpg";

/** 2027-01-13 -> 13/01/2027 */
function formatarData(iso: string) {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}



/** Adicionar serviços — mesmo padrão: filtros | resultados | resumo. */
export function SeletorServicos({
  servicos,
  carregando,
  erro,
  selecionados,
  onAlternar,
  resumo,
}: {
  servicos: ServicoDisponivel[];
  carregando: boolean;
  erro?: string | null;
  selecionados: string[];
  onAlternar: (servico: ServicoDisponivel) => void;
  resumo: React.ReactNode;
}) {
  const [categoria, setCategoria] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"preco" | "precoDesc">("preco");
  const [detalhe, setDetalhe] = useState<ServicoDisponivel | null>(null);
  /** data/horário escolhidos pelo cliente para cada serviço */
  const [escolhas, setEscolhas] = useState<Record<string, { data: string; hora: string | null }>>({});


  const categorias = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of servicos) {
      const g = grupoServico(s);
      mapa.set(g, (mapa.get(g) ?? 0) + 1);
    }
    return GRUPOS_SERVICO.filter((g) => mapa.has(g)).map((g) => [g, mapa.get(g)!] as const);
  }, [servicos]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const filtrados = servicos.filter((s) => {
      if (categoria !== "todos" && grupoServico(s) !== categoria) return false;

      if (t && !`${s.titulo} ${s.descricao ?? ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
    // serviços sem valor (sob consulta) sempre no fim
    return [...filtrados].sort((a, b) => {
      if (a.valor == null && b.valor == null) return 0;
      if (a.valor == null) return 1;
      if (b.valor == null) return -1;
      return ordem === "preco" ? a.valor - b.valor : b.valor - a.valor;
    });
  }, [servicos, categoria, busca, ordem]);

  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [lista]);
  const listaPaginada = useMemo(
    () => lista.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA),
    [lista, pagina],
  );

  return (
    <section className="screen active">
      <div className="title">
        <div>
          <h2>Adicionar serviços</h2>
          <p>Transfers, passeios e proteção disponíveis para o destino pesquisado.</p>
        </div>
        <span className="pill">{lista.length} serviços</span>
      </div>

      <div className="market">
        <FiltrosMkt
          titulo="Filtros de serviços"
          onLimpar={() => {
            setCategoria("todos");
            setBusca("");
            setOrdem("preco");
          }}
        >


            <div className="fb">
              <span className="flabel">Ordenar por</span>
              <select
                className="fselect"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as "preco" | "precoDesc")}
              >
                <option value="preco">Menor preço</option>
                <option value="precoDesc">Maior preço</option>
              </select>
            </div>
            <div className="fb">
              <span className="flabel">Buscar</span>
              <input
                className="finput"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do serviço"
              />
            </div>
            <div className="fb">
              <span className="flabel">Categoria</span>
              <div className="chips">
                <span
                  className={`chip${categoria === "todos" ? " active" : ""}`}
                  onClick={() => setCategoria("todos")}
                >
                  Todos os serviços
                </span>
                {categorias.map(([c, n]) => (
                  <span
                    key={c}
                    className={`chip${categoria === c ? " active" : ""}`}
                    onClick={() => setCategoria(c)}
                  >
                    {c} ({n})
                  </span>
                ))}
              </div>
            </div>
          </FiltrosMkt>

        <div className="results">
          {carregando && <div className="state-box">Consultando serviços disponíveis para o destino…</div>}
          {!carregando && erro && <div className="state-box err">{erro}</div>}
          {!carregando && !erro && lista.length === 0 && (
            <div className="state-box">Nenhum serviço adicional disponível para este destino e data.</div>
          )}

          {listaPaginada.map((s) => {
            const sel = selecionados.includes(s.id);
            const ehSeguro = /seguro/i.test(grupoServico(s)) || /seguro/i.test(s.titulo);
            const capa = s.imagens?.[0] ?? s.imagem ?? (ehSeguro ? (seguroImg as unknown as string) : null);
            const opcoes = s.opcoes ?? [];
            const datas = Array.from(new Set(opcoes.map((o) => o.data)));
            const escolha = escolhas[s.id];
            const dataAtual = escolha?.data ?? datas[0] ?? null;
            const horarios = opcoes
              .filter((o) => o.data === dataAtual && o.hora)
              .map((o) => o.hora as string);
            const horaAtual = escolha?.hora ?? horarios[0] ?? null;
            const opcaoAtual =
              opcoes.find((o) => o.data === dataAtual && (o.hora ?? null) === (horaAtual ?? null)) ??
              opcoes.find((o) => o.data === dataAtual) ??
              null;
            const valorAtual = opcaoAtual?.valor ?? s.valor;
            const escolher = (data: string | null, hora: string | null) => {
              if (!data) return;
              setEscolhas((a) => ({ ...a, [s.id]: { data, hora } }));
              if (sel) {
                const o = opcoes.find((x) => x.data === data && (x.hora ?? null) === (hora ?? null));
                onAlternar({
                  ...s,
                  dataSelecionada: data,
                  horaSelecionada: hora,
                  valor: o?.valor ?? s.valor,
                  substituir: true,
                } as ServicoDisponivel);
              }
            };
            return (

              <article key={s.id} className={`svc${sel ? " selected" : ""}`}>
                {capa ? (
                  <button
                    type="button"
                    className="svcfoto"
                    style={{ backgroundImage: `url('${capa}')` }}
                    aria-label={`Ver detalhes de ${s.titulo}`}
                    onClick={() => setDetalhe(s)}
                  >
                    {s.recomendado ? <span className="selo-rec engine-badge">Recomendado</span> : null}
                  </button>
                ) : (
                  <div className="engine-media engine-media--empty">
                    {s.recomendado ? <span className="selo-rec engine-badge">Recomendado</span> : null}
                    <span className="engine-type">{grupoServico(s)}</span>
                  </div>
                )}
                <div className="svcmain">
                  <div className="svctopo">
                    <span className="engine-type">{grupoServico(s)}</span>
                    {s.logo ? (
                      <img className="svclogo" src={s.logo} alt={s.fornecedor ?? "Fornecedor"} loading="lazy" />
                    ) : s.fornecedor ? (
                      <span className="svcforn">{s.fornecedor}</span>
                    ) : null}
                  </div>
                  <h3>{s.titulo}</h3>
                  {s.descricao ? (
                    <p>{s.descricao.length > 120 ? `${s.descricao.slice(0, 120)}…` : s.descricao}</p>
                  ) : null}
                  {datas.length ? (
                    <div className="svcdata">
                      <label>
                        <span>Data do serviço</span>
                        <select
                          value={dataAtual ?? ""}
                          onChange={(e) => escolher(e.target.value, null)}
                        >
                          {datas.map((d) => (
                            <option key={d} value={d}>
                              {formatarData(d)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {horarios.length ? (
                        <label>
                          <span>Horário</span>
                          <select
                            value={horaAtual ?? ""}
                            onChange={(e) => escolher(dataAtual, e.target.value)}
                          >
                            {horarios.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="svcacts">
                    <button type="button" className="more solid-btn" onClick={() => setDetalhe(s)}>
                      {s.coberturas?.length ? "Ver coberturas e detalhes" : "Ver detalhes"}
                    </button>
                  </div>
                </div>
                <div className="svcside">
                  <div className="svcval">{valorAtual != null ? `+ ${brl(valorAtual, s.moeda)}` : "Sob consulta"}</div>
                  <button
                    type="button"
                    className={sel ? "ghost" : "primary"}
                    disabled={valorAtual == null}
                    onClick={() =>
                      onAlternar({
                        ...s,
                        valor: valorAtual,
                        dataSelecionada: dataAtual,
                        horaSelecionada: horaAtual,
                      })
                    }
                  >
                    {sel ? "Selecionado" : "Selecionar"}
                  </button>
                </div>

              </article>
            );
          })}

          <Paginacao
            pagina={pagina}
            total={lista.length}
            onChange={setPagina}
            rotulo="serviços"
          />
        </div>

        {resumo}
      </div>

      {detalhe ? (
        <ServicoModal
          servico={detalhe}
          selecionado={selecionados.includes(detalhe.id)}
          onAlternar={onAlternar}
          onFechar={() => setDetalhe(null)}
        />
      ) : null}
    </section>

  );
}
