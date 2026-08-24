import { useMemo, useState } from "react";
import { FiltrosMkt } from "./FiltrosMkt";
import { brl } from "@/lib/pacote-motor/mapear";
import type { ServicoDisponivel } from "@/lib/comprefacil/servicos.server";
import { GRUPOS_SERVICO, grupoServico } from "@/lib/pacote-motor/categorias";
import { ServicoModal } from "@/components/pacote-motor/ServicoModal";
import seguroImg from "@/assets/seguro-viagem.jpg";



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

          {lista.map((s) => {
            const sel = selecionados.includes(s.id);
            const ehSeguro = /seguro/i.test(grupoServico(s)) || /seguro/i.test(s.titulo);
            const capa = s.imagens?.[0] ?? s.imagem ?? (ehSeguro ? (seguroImg as unknown as string) : null);
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
                  <div className="svcacts">
                    <button type="button" className="more solid-btn" onClick={() => setDetalhe(s)}>
                      {s.coberturas?.length ? "Ver coberturas e detalhes" : "Ver detalhes"}
                    </button>
                  </div>
                </div>
                <div className="svcside">
                  <div className="svcval">{s.valor != null ? `+ ${brl(s.valor, s.moeda)}` : "Sob consulta"}</div>
                  <button
                    type="button"
                    className={sel ? "ghost" : "primary"}
                    disabled={s.valor == null}
                    onClick={() => onAlternar(s)}
                  >
                    {sel ? "Selecionado" : "Selecionar"}
                  </button>
                </div>
              </article>
            );
          })}

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
