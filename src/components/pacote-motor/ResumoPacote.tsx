import { brl } from "@/lib/pacote-motor/mapear";

export type LinhaResumo = { rotulo: string; valor: string };

/** Resumo lateral do pacote — mesma estrutura nas três telas. */
export function ResumoPacote({
  destino,
  periodo,
  pax,
  noites,
  linhas,
  total,
  moeda = "BRL",
  rodape,
  acao,
}: {
  destino: string;
  periodo: string;
  pax: string;
  noites: string | null;
  linhas: LinhaResumo[];
  total: number;
  moeda?: string;
  rodape?: string;
  acao?: React.ReactNode;
}) {
  return (
    <aside className="rounded-2xl border border-border/60 bg-card p-5 shadow-lg lg:sticky lg:top-24">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Resumo do pacote</p>
      <h3 className="mt-1 text-xl font-semibold">{destino}</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        {[noites, pax, periodo].filter(Boolean).join(" · ")}
      </p>

      {linhas.map((l) => (
        <div key={l.rotulo} className="flex justify-between gap-3 border-t border-border/60 py-2.5 text-xs">
          <span className="text-muted-foreground">{l.rotulo}</span>
          <span className="text-right font-medium">{l.valor}</span>
        </div>
      ))}

      <div className="mt-3 rounded-xl bg-muted/50 p-3">
        <small className="block text-[11px] text-muted-foreground">Valor total do pacote</small>
        <strong className="text-2xl text-brand-blue">{brl(total, moeda)}</strong>
        {rodape ? <p className="mt-0.5 text-[11px] text-muted-foreground">{rodape}</p> : null}
      </div>

      {acao}
    </aside>
  );
}
