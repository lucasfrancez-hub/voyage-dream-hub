import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Package, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { listarReservasFRT } from "@/lib/comprefacil/reservas-lista.functions";
import { cancelarReservaFRTFn, consultarReservaFRTFn } from "@/lib/comprefacil/cancelamento.functions";
import { confirmThen } from "@/lib/confirm";

const dataHora = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const rotulo: Record<string, { texto: string; classe: string }> = {
  reservado: { texto: "Reservado", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  pendente: { texto: "Pendente", classe: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  cancelado: { texto: "Cancelado", classe: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  cancelado_parcial: { texto: "Cancelado parcial", classe: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

/** Reservas feitas no motor de pacotes (operadora FRT/CompreFácil). */
export function ReservasFrtPainel() {
  const qc = useQueryClient();
  const listar = useServerFn(listarReservasFRT);
  const cancelarFn = useServerFn(cancelarReservaFRTFn);

  const { data, isLoading } = useQuery({
    queryKey: ["frt-reservas"],
    queryFn: () => listar({ data: undefined as never }),
  });

  const cancelar = useMutation({
    mutationFn: (orcamentoId: number) => cancelarFn({ data: { orcamentoId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Reserva ${r.orcamentoId} cancelada na operadora`);
      else toast.error(r.passos?.find((p) => !p.ok)?.detalhe ?? "A operadora não concluiu o cancelamento");
      qc.invalidateQueries({ queryKey: ["frt-reservas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar"),
  });

  const reservas = data && "reservas" in data ? data.reservas : [];
  if (!isLoading && reservas.length === 0) return null;

  const copiar = (v: string) => {
    void navigator.clipboard.writeText(v);
    toast.success("Copiado");
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Package className="h-4 w-4 text-brand-orange" />
        <span className="text-sm font-semibold">Reservas de pacote na operadora (FRT)</span>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="divide-y divide-border/50">
        {reservas.map((r) => {
          const st = rotulo[r.status] ?? { texto: r.status, classe: "border-border text-muted-foreground" };
          const cancelavel = r.status !== "cancelado";
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copiar(String(r.orcamentoId))}
                    title="Copiar ID da FRT"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-sm font-bold tabular-nums tracking-tight hover:bg-muted/70"
                  >
                    ID FRT {r.orcamentoId}
                    <Copy className="h-3 w-3 opacity-60" />
                  </button>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.classe}`}>
                    {st.texto}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {r.localizadorAereo && (
                    <span>
                      Aéreo: <strong className="text-foreground">{r.localizadorAereo}</strong>
                    </span>
                  )}
                  {r.localizadorHotel && (
                    <span>
                      Hotel: <strong className="text-foreground">{r.localizadorHotel}</strong>
                    </span>
                  )}
                  {r.limiteEmissao && <span>Limite emissão: {dataHora(r.limiteEmissao)}</span>}
                  {r.prazoPagamento && <span>Prazo pagamento: {dataHora(r.prazoPagamento)}</span>}
                  <span>Criada em {dataHora(r.criadaEm)}</span>
                </div>

                {r.passageiros.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">{r.passageiros.join(" · ")}</div>
                )}

                <ItensReserva orcamentoId={r.orcamentoId} />
              </div>


              {cancelavel && (
                <button
                  type="button"
                  disabled={cancelar.isPending}
                  onClick={() =>
                    confirmThen(
                      `Cancelar na operadora a reserva ${r.orcamentoId}?`,
                      () => cancelar.mutate(r.orcamentoId),
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {cancelar.isPending && cancelar.variables === r.orcamentoId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  Cancelar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ICONE: Record<string, string> = { aereo: "Aéreo", hotel: "Hospedagem", servico: "Serviço", seguro: "Seguro" };

/** Itens do orçamento na operadora, cada um com seu botão de excluir (cancelar). */
function ItensReserva({ orcamentoId }: { orcamentoId: number }) {
  const qc = useQueryClient();
  const consultar = useServerFn(consultarReservaFRTFn);
  const cancelarFn = useServerFn(cancelarReservaFRTFn);

  const { data, isLoading } = useQuery({
    queryKey: ["frt-itens", orcamentoId],
    queryFn: () => consultar({ data: { orcamentoId } }),
    staleTime: 30_000,
  });

  const cancelarItem = useMutation({
    mutationFn: (item: { tipo: "aereo" | "hotel" | "servico" | "seguro"; id: number }) =>
      cancelarFn({ data: { orcamentoId, itens: [item] } }),
    onSuccess: (r) => {
      const falha = r.passos?.find((p) => !p.ok);
      if (falha) toast.error(falha.detalhe ?? "A operadora recusou o cancelamento");
      else toast.success("Item cancelado na operadora");
      qc.invalidateQueries({ queryKey: ["frt-itens", orcamentoId] });
      qc.invalidateQueries({ queryKey: ["frt-reservas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar item"),
  });

  const removerItem = useMutation({
    mutationFn: (item: { tipo: "aereo" | "hotel" | "servico" | "seguro"; id: number }) =>
      removerFn({ data: { orcamentoId, item } }),
    onSuccess: (r) => {
      const falha = r.passos?.find((p) => !p.ok);
      if (falha) toast.error(falha.detalhe ?? "A operadora não removeu o serviço");
      else toast.success("Serviço removido do orçamento");
      qc.invalidateQueries({ queryKey: ["frt-itens", orcamentoId] });
      qc.invalidateQueries({ queryKey: ["frt-reservas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover serviço"),
  });

  const itens = data?.itens ?? [];
  if (isLoading) return <div className="mt-2 text-[11px] text-muted-foreground">Carregando serviços…</div>;
  if (!itens.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {itens.map((it) => (
        <div
          key={`${it.tipo}:${it.id}`}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px]"
        >
          <span className="rounded bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide text-[9px]">
            {ICONE[it.tipo] ?? it.tipo}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {it.descricao}
            {it.localizador ? <span className="text-muted-foreground"> · {it.localizador}</span> : null}
          </span>
          {it.cancelado ? <span className="text-rose-400">Cancelado</span> : null}
          {!it.cancelado && (
            <button
              type="button"
              disabled={cancelarItem.isPending}
              title="Cancelar a reserva deste serviço na operadora"
              onClick={() =>
                confirmThen(`Cancelar na operadora "${it.descricao}"?`, () =>
                  cancelarItem.mutate({ tipo: it.tipo, id: it.id }),
                )
              }
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              {cancelarItem.isPending && cancelarItem.variables?.id === it.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              Cancelar
            </button>
          )}
          <button
            type="button"
            disabled={removerItem.isPending}
            title="Remover este serviço do orçamento na operadora"
            onClick={() =>
              confirmThen(`Remover do orçamento "${it.descricao}"?`, () =>
                removerItem.mutate({ tipo: it.tipo, id: it.id }),
              )
            }
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {removerItem.isPending && removerItem.variables?.id === it.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Excluir
          </button>
        </div>
      ))}
    </div>
  );
}

        </div>
      ))}
    </div>
  );
}
