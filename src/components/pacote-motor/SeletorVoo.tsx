import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { TimelineConexao } from "@/components/pacote-motor/TimelineConexao";
import { brl, diferencaTexto, hora, resumoVoo } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta } from "@/lib/passhub/types";

export type FiltrosVoo = { semEscala: boolean; comBagagem: boolean; companhias: string[] };

/** Alterar voo — marketplace aprovado: filtros | voos | resumo. */
export function SeletorVoo({
  ofertas,
  carregando,
  erro,
  selecionadaId,
  baseTotal,
  onSelecionar,
  resumo,
}: {
  ofertas: PassHubOferta[];
  carregando: boolean;
  erro?: string | null;
  selecionadaId: string | null;
  baseTotal: number;
  onSelecionar: (oferta: PassHubOferta) => void;
  resumo: React.ReactNode;
}) {
  const [filtros, setFiltros] = useState<FiltrosVoo>({ semEscala: false, comBagagem: false, companhias: [] });
  const [aberta, setAberta] = useState<string | null>(null);

  const companhias = useMemo(
    () => Array.from(new Set(ofertas.map((o) => o.ida.companhia || o.ida.companhiaIata).filter(Boolean))).sort(),
    [ofertas],
  );

  const lista = useMemo(
    () =>
      ofertas.filter((o) => {
        if (filtros.semEscala && o.ida.paradas > 0) return false;
        if (filtros.comBagagem && !o.ida.bagagemDespachada) return false;
        if (filtros.companhias.length && !filtros.companhias.includes(o.ida.companhia || o.ida.companhiaIata))
          return false;
        return true;
      }),
    [ofertas, filtros],
  );

  const alternar = (c: string) =>
    setFiltros((f) => ({
      ...f,
      companhias: f.companhias.includes(c) ? f.companhias.filter((x) => x !== c) : [...f.companhias, c],
    }));

  return (
    <div className="market-wrap">
      <div className="filter-card">
        <h4>Filtrar voos</h4>
        <Check
          label="Somente voos diretos"
          checked={filtros.semEscala}
          onChange={(v) => setFiltros({ ...filtros, semEscala: v })}
        />
        <Check
          label="Somente com bagagem"
          checked={filtros.comBagagem}
          onChange={(v) => setFiltros({ ...filtros, comBagagem: v })}
        />
        {companhias.length > 0 && (
          <>
            <h4 style={{ marginTop: 16 }}>Companhias</h4>
            {companhias.map((c) => (
              <Check key={c} label={c} checked={filtros.companhias.includes(c)} onChange={() => alternar(c)} />
            ))}
          </>
        )}
      </div>

      <div>
        <div className="section-head">
          <div>
            <h2>Alterar voo</h2>
            <p>Mesmo marketplace, com a visualização da conexão logo abaixo do voo.</p>
          </div>
          <span className="count">{lista.length} voo(s) encontrado(s)</span>
        </div>

        {carregando && (
          <div className="summary-card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando o motor aéreo…
          </div>
        )}
        {!carregando && erro && <div className="summary-card">{erro}</div>}
        {!carregando && !erro && lista.length === 0 && (
          <div className="summary-card">Nenhum voo retornado para este trecho e período.</div>
        )}

        <div className="market-list">
          {lista.map((o) => {
            const r = resumoVoo(o.ida);
            const diff = Number((o.precoTotal - baseTotal).toFixed(2));
            const selecionada = o.id === selecionadaId;
            const aberto = aberta === o.id;
            return (
              <div key={o.id}>
                <article className={`market-flight${selecionada ? " selected" : ""}`}>
                  <div className="mf-air">
                    <span className="airlogo">{o.ida.companhiaIata || "VA"}</span>
                    {r.companhia}
                  </div>

                  <div className="mf-route">
                    <strong>{r.horarios}</strong>
                    <small>
                      {r.rota} · {r.escalas} · {r.duracao}
                    </small>
                    <small>
                      {[o.ida.numeroVoo, o.ida.familiaTarifaria, o.ida.classe, r.bagagem].filter(Boolean).join(" · ")}
                    </small>
                  </div>

                  <div className="mf-route volta">
                    {o.voltas.map((v) => (
                      <div key={v.numeroVoo + v.partida}>
                        <strong>
                          {hora(v.partida)} → {hora(v.chegada)}
                        </strong>
                        <small>
                          {v.origem} → {v.destino} · {v.paradas === 0 ? "Direto" : `${v.paradas} conexão`} · {v.duracao}
                        </small>
                      </div>
                    ))}
                  </div>

                  <div className="mf-price">
                    <b>{diferencaTexto(diff)}</b>
                    <span className="val">{brl(o.precoTotal)}</span>
                    <button
                      type="button"
                      className={selecionada ? "on" : ""}
                      onClick={() => onSelecionar(o)}
                    >
                      {selecionada ? "Selecionado" : "Selecionar"}
                    </button>
                    <button type="button" className="detail-toggle" onClick={() => setAberta(aberto ? null : o.id)}>
                      {aberto ? "Ver menos" : "Ver mais"}
                    </button>
                  </div>
                </article>

                {aberto && (
                  <div className="connection-box">
                    <TimelineConexao titulo="Detalhes da conexão · ida" voo={o.ida} />
                    {o.voltas.map((v, i) => (
                      <TimelineConexao key={i} titulo="Detalhes da conexão · volta" voo={v} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {resumo}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
