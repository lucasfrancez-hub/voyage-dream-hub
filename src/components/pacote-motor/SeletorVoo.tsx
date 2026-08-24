import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimelineConexao } from "@/components/pacote-motor/TimelineConexao";
import { brl, diferencaTexto, hora, resumoVoo } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta } from "@/lib/passhub/types";

export type FiltrosVoo = { semEscala: boolean; comBagagem: boolean; companhias: string[] };

/** Marketplace de aéreo: filtros à esquerda, resultados no centro, resumo à direita. */
export function SeletorVoo({
  ofertas,
  carregando,
  erro,
  selecionadaId,
  baseTotal,
  onSelecionar,
  onVoltar,
  resumo,
}: {
  ofertas: PassHubOferta[];
  carregando: boolean;
  erro?: string | null;
  selecionadaId: string | null;
  /** preço da oferta atualmente no pacote, para mostrar a diferença */
  baseTotal: number;
  onSelecionar: (oferta: PassHubOferta) => void;
  onVoltar: () => void;
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
    <div>
      <button onClick={onVoltar} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-white/90">
        <ArrowLeft className="h-4 w-4" /> Voltar ao pacote
      </button>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_310px]">
        <div className="rounded-2xl border border-border/60 bg-card p-4 lg:sticky lg:top-24 lg:self-start">
          <h4 className="mb-2 text-xs font-bold">Filtrar voos</h4>
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
              <h4 className="mb-2 mt-4 text-xs font-bold">Companhias</h4>
              {companhias.map((c) => (
                <Check key={c} label={c} checked={filtros.companhias.includes(c)} onChange={() => alternar(c)} />
              ))}
            </>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Alterar voo</h2>
              <p className="text-xs text-white/70">Escolha outra opção e veja os detalhes da conexão.</p>
            </div>
            <span className="text-xs font-semibold text-white/70">{lista.length} voo(s)</span>
          </div>

          {carregando && (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando o motor aéreo…
            </div>
          )}
          {!carregando && erro && (
            <p className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">{erro}</p>
          )}
          {!carregando && !erro && lista.length === 0 && (
            <p className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
              Nenhum voo retornado para este trecho e período.
            </p>
          )}

          <div className="grid gap-2.5">
            {lista.map((o) => {
              const r = resumoVoo(o.ida);
              const diff = Number((o.precoTotal - baseTotal).toFixed(2));
              const selecionada = o.id === selecionadaId;
              const aberto = aberta === o.id;
              return (
                <article
                  key={o.id}
                  className={`rounded-2xl border bg-card p-3 shadow-sm ${selecionada ? "border-brand-blue ring-2 ring-brand-blue/40" : "border-border/60"}`}
                >
                  <div className="grid items-center gap-3 sm:grid-cols-[95px_1fr_1fr_130px]">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-blue text-[11px] font-black text-white">
                        {o.ida.companhiaIata || <Plane className="h-4 w-4" />}
                      </span>
                      <span className="text-[11px] font-bold">{r.companhia}</span>
                    </div>

                    <div>
                      <strong className="text-sm">{r.horarios}</strong>
                      <small className="block text-[10px] text-muted-foreground">
                        {r.rota} · {r.escalas} · {r.duracao}
                      </small>
                      <small className="block text-[10px] text-muted-foreground">
                        {[o.ida.numeroVoo, o.ida.familiaTarifaria, o.ida.classe, r.bagagem].filter(Boolean).join(" · ")}
                      </small>
                    </div>

                    <div>
                      {o.voltas.map((v) => (
                        <div key={v.numeroVoo + v.partida}>
                          <strong className="text-sm">
                            {hora(v.partida)} → {hora(v.chegada)}
                          </strong>
                          <small className="block text-[10px] text-muted-foreground">
                            {v.origem} → {v.destino} · {v.paradas === 0 ? "Direto" : `${v.paradas} conexão`} · {v.duracao}
                          </small>
                        </div>
                      ))}
                    </div>

                    <div className="text-right">
                      <b className={`text-xs ${diff < 0 ? "text-emerald-600" : "text-foreground"}`}>
                        {diferencaTexto(diff)}
                      </b>
                      <p className="text-[10px] text-muted-foreground">{brl(o.precoTotal)}</p>
                      <Button
                        size="sm"
                        className="mt-1.5 h-8 w-full rounded-lg text-[11px]"
                        variant={selecionada ? "secondary" : "default"}
                        onClick={() => onSelecionar(o)}
                      >
                        {selecionada ? "Selecionado" : "Selecionar aéreo"}
                      </Button>
                      <button
                        onClick={() => setAberta(aberto ? null : o.id)}
                        className="mt-1.5 text-[10px] font-bold text-brand-blue"
                      >
                        {aberto ? "Ocultar conexão" : "Ver detalhes da conexão"}
                      </button>
                    </div>
                  </div>

                  {aberto && (
                    <div className="mt-3 space-y-3">
                      <TimelineConexao titulo="Detalhes da conexão · ida" voo={o.ida} />
                      {o.voltas.map((v, i) => (
                        <TimelineConexao key={i} titulo="Detalhes da conexão · volta" voo={v} />
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {resumo}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand-blue)]" />
      {label}
    </label>
  );
}
