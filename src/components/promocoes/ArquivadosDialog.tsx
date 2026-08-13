import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Loader2, X } from "lucide-react";
import { listArchivedPromotions } from "@/lib/airfare-promos.functions";

const brl = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (v?: string | null) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

type Row = Record<string, unknown>;

/**
 * 🗑 Arquivados — somente leitura. Mostra as promoções encerradas nos
 * últimos 30 dias (retenção); depois disso a limpeza automática as remove.
 */
export function ArquivadosDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const listar = useServerFn(listArchivedPromotions);
  const [scope, setScope] = useState<"todos" | "nacional" | "internacional">("todos");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [page, setPage] = useState(0);

  const { data, isFetching } = useQuery({
    queryKey: ["airfare-arquivados", scope, origem, destino, page],
    queryFn: () =>
      listar({
        data: {
          scope,
          origin: origem || null,
          destination: destino || null,
          page,
          pageSize: 50,
        },
      }),
    enabled: aberto,
  });

  if (!aberto) return null;

  const rows = (data?.rows ?? []) as Row[];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-wide">
              <Archive className="h-5 w-5 text-brand-orange" /> Arquivados
            </h2>
            <p className="text-xs text-muted-foreground">
              Histórico dos últimos 30 dias · {total} registro{total === 1 ? "" : "s"} · somente
              consulta (não gera divulgação)
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-5 py-3">
          <select
            value={scope}
            onChange={(e) => {
              setPage(0);
              setScope(e.target.value as typeof scope);
            }}
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
          >
            <option value="todos">Todos os escopos</option>
            <option value="nacional">Nacionais</option>
            <option value="internacional">Internacionais</option>
          </select>
          <input
            value={origem}
            onChange={(e) => {
              setPage(0);
              setOrigem(e.target.value.toUpperCase());
            }}
            placeholder="Origem (IATA)"
            className="w-36 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm uppercase"
          />
          <input
            value={destino}
            onChange={(e) => {
              setPage(0);
              setDestino(e.target.value.toUpperCase());
            }}
            placeholder="Destino (IATA)"
            className="w-36 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm uppercase"
          />
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-brand-orange" /> : null}
        </div>

        <div className="flex-1 overflow-auto">
          {rows.length === 0 && !isFetching ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma promoção arquivada nos últimos 30 dias.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card/95 text-[11px] uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-4 py-2 text-left">Ciclo</th>
                  <th className="px-4 py-2 text-left">Rota</th>
                  <th className="px-4 py-2 text-left">Cia</th>
                  <th className="px-4 py-2 text-left">Ida / Volta</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Por pax</th>
                  <th className="px-4 py-2 text-left">Arquivada em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {dia((r.archived_cycle_day as string) ?? null)}
                    </td>
                    <td className="px-4 py-2 font-semibold">
                      {String(r.origin_iata)} → {String(r.destination_iata)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {String(r.destination_city ?? "")}
                      </span>
                    </td>
                    <td className="px-4 py-2">{String(r.airline_name ?? r.airline_iata ?? "—")}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {dia(r.departure_date as string)} · {dia((r.return_date as string) ?? null)}
                    </td>
                    <td className="px-4 py-2 text-right font-black text-brand-orange">
                      {brl(r.total_price)}
                    </td>
                    <td className="px-4 py-2 text-right">{brl(r.price_per_passenger)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {dataHora(r.archived_at as string)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <span>
            Página {page + 1} de {paginas}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-border/60 px-3 py-1.5 font-bold uppercase tracking-wide disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page + 1 >= paginas}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border/60 px-3 py-1.5 font-bold uppercase tracking-wide disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
