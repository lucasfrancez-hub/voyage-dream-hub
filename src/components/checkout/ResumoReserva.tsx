/**
 * Resumo da reserva (modelo aprovado) — usado nas duas etapas do checkout.
 * Todos os dados vêm do fornecedor; nada é calculado aqui.
 */
import { useState } from "react";
import { ChevronDown, Plane } from "lucide-react";
import type { ResumoCarrinho } from "@/lib/integrations/oner/checkout.server";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const rotuloTipo: Record<string, string> = {
  ADT: "Adulto",
  CHD: "Criança",
  INF: "Bebê",
};

export function ResumoReserva({
  resumo,
  rodape,
}: {
  resumo: Pick<ResumoCarrinho, "voos" | "precos" | "total" | "taxas" | "tarifa" | "parcelas">;
  rodape?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  const total = resumo.total ?? 0;
  const melhorParcela = resumo.parcelas.filter((p) => !p.hasRate).at(-1) ?? null;

  return (
    <aside className="h-fit space-y-5 rounded-2xl border border-border bg-card p-6">
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
        Resumo da reserva
      </h3>

      <div className="space-y-3">
        {resumo.voos.map((v, i) => (
          <div key={i} className="rounded-xl border border-border/70 bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  {v.rotulo} {v.saida.data ? `· ${v.saida.data}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {v.paradas > 0
                    ? `${v.paradas} ${v.paradas === 1 ? "conexão" : "conexões"}${
                        v.conexoes.length ? ` em ${v.conexoes.join(", ")}` : ""
                      }`
                    : "Voo direto"}
                  {v.duracao ? ` · ${v.duracao}` : ""}
                </div>
              </div>
              {v.logo ? (
                <img src={v.logo} alt={v.cia} className="h-7 w-auto rounded bg-foreground/80 p-1" />
              ) : (
                <Plane className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="text-center">
                <div className="text-lg font-bold leading-none">{v.saida.hora}</div>
                <div className="mt-1 text-xs text-muted-foreground">{v.saida.iata}</div>
              </div>
              <div className="flex-1">
                <div className="h-px w-full bg-border" />
              </div>
              <div className="text-center">
                <div className="text-lg font-bold leading-none">{v.chegada.hora}</div>
                <div className="mt-1 text-xs text-muted-foreground">{v.chegada.iata}</div>
              </div>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              {[v.cia, v.voo ? `Voo ${v.voo}` : null, v.bagagemMao].filter(Boolean).join(" · ")}
            </div>

            <button
              type="button"
              onClick={() => setAberto(aberto === i ? null : i)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              Ver detalhes do voo
              <ChevronDown className={`h-3.5 w-3.5 transition ${aberto === i ? "rotate-180" : ""}`} />
            </button>

            {aberto === i ? (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                {v.segmentos.map((s, j) => (
                  <div key={j} className="text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">
                      {s.saida.iata} → {s.chegada.iata} {s.voo ? `· Voo ${s.voo}` : ""}
                    </div>
                    <div>
                      {s.saida.data} {s.saida.hora} — {s.saida.aeroporto}
                    </div>
                    <div>
                      {s.chegada.data} {s.chegada.hora} — {s.chegada.aeroporto}
                    </div>
                    <div>{s.cia}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-4 text-sm">
        {resumo.precos.map((p, i) => (
          <div key={i} className="flex justify-between text-muted-foreground">
            <span>
              {p.quantidade}x {rotuloTipo[p.tipo] ?? p.tipo}
            </span>
            <span>{brl(p.total)}</span>
          </div>
        ))}
        {resumo.taxas != null ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Taxas e encargos</span>
            <span>{brl(resumo.taxas)}</span>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-2xl font-bold text-primary">{brl(total)}</span>
        </div>
        {melhorParcela ? (
          <div className="mt-1 text-right text-xs text-muted-foreground">
            em até {melhorParcela.installment}x de {brl(melhorParcela.installmentsValue)} sem juros
          </div>
        ) : null}
      </div>

      {rodape}
    </aside>
  );
}
