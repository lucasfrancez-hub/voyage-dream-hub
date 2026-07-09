import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Mail, Phone, User, CheckCircle2, XCircle, Trash2, CreditCard, Calendar, Hash, ChevronDown, MapPin, Package as PackageIcon, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { splitInstallments } from "@/lib/checkout-config";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";
import { updateCofreOrder, deleteCofreOrder } from "@/lib/cofre.functions";

export const Route = createFileRoute("/admin/pedidos")({
  component: AdminOrders,
});

function AdminOrders() {
  const updateOrder = useServerFn(updateCofreOrder);
  const deleteOrder = useServerFn(deleteCofreOrder);

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function onFinalize(id: string) {
    try {
      await updateOrder({ data: { id, status: "paid" } });
      toast.success("Pedido finalizado");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onReject(id: string, currentNotes: string | null) {
    const reason = window.prompt(
      "Motivo da rejeição (ex.: antifraude barrou, dados inválidos):",
      "",
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    const stamp = new Date().toLocaleString("pt-BR");
    const line = `[Rejeitado em ${stamp}] ${trimmed || "Sem motivo informado"}`;
    const newNotes = currentNotes ? `${currentNotes}\n${line}` : line;
    try {
      await updateOrder({ data: { id, status: "rejected", notes: newNotes } });
      toast.success("Pedido rejeitado");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Excluir este pedido definitivamente?")) return;
    try {
      await deleteOrder({ data: { id } });
      toast.success("Pedido excluído");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-display font-bold">Pedidos</h1>
      <p className="text-sm text-muted-foreground">
        {orders?.length ?? 0} reserva(s) recebida(s)
      </p>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="text-center text-muted-foreground py-8">Carregando…</div>
        )}
        {!isLoading && orders?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Nenhum pedido ainda.
          </div>
        )}
        {orders?.map((o) => {
          const snap = (o.package_snapshot ?? {}) as {
            title?: string;
            destination?: string;
            description?: string;
            reference?: string | null;
            first_amount?: number | null;
          };
          const pm = paymentMethodLabel(o.payment_method);
          const st = statusLabel(o.status);
          const isCard = (o.payment_method ?? "").toLowerCase().startsWith("credit_card");
          const instMatch = (o.payment_method ?? "").match(/(\d+)x/);
          const installments = instMatch ? Number(instMatch[1]) : 1;
          const firstAmount = snap.first_amount && snap.first_amount > 0 ? snap.first_amount : undefined;
          const split = isCard ? splitInstallments(Number(o.total_price), installments, firstAmount) : null;
          const title = snap.title ?? snap.description ?? "Pacote";
          return (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </div>
                  <div className="mt-1 font-semibold">{title}</div>
                  <div className="text-xs text-muted-foreground">
                    {snap.destination ?? snap.reference ?? ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-lg font-display font-bold text-brand-orange">
                    {formatBRL(o.total_price)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 justify-end">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.className}`}>
                      {st.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment method highlight */}
              <div className={`mt-4 rounded-xl border p-4 ${isCard ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-muted/30"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <CreditCard className={`h-4 w-4 ${isCard ? "text-blue-400" : "text-muted-foreground"}`} />
                  <span className={`text-sm font-semibold ${pm.className.includes("text-") ? pm.className.split(" ").find(c => c.startsWith("text-")) : ""}`}>
                    {pm.label}
                  </span>
                  {isCard && (
                    <span className="text-xs text-muted-foreground">· parcelado sem juros</span>
                  )}
                </div>
                {isCard && split && (
                  <div className="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Parcelas</div>
                        <div className="font-semibold">{installments}x</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">1ª parcela</div>
                        <div className="font-semibold text-brand-orange">{formatBRL(split.first)}</div>
                      </div>
                    </div>
                    {!split.equal && split.restCount > 0 && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Demais</div>
                          <div className="font-semibold">{split.restCount}x de {formatBRL(split.rest)}</div>
                        </div>
                      </div>
                    )}
                    {split.equal && (
                      <div className="sm:col-span-2 text-xs text-muted-foreground self-center">
                        {installments}x iguais de <strong className="text-foreground">{formatBRL(split.first)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm border-t border-border pt-4">
                <InfoLine icon={User} value={o.full_name} />
                <InfoLine icon={Mail} value={o.email} />
                <InfoLine icon={Phone} value={o.phone} />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {o.adults} adulto(s){o.children ? ` · ${o.children} criança(s)` : ""}
                {o.cpf ? ` · CPF ${o.cpf}` : ""}
              </div>
              {o.notes && (
                <div className="mt-3 text-sm rounded-lg bg-muted/40 p-3 whitespace-pre-wrap">
                  {o.notes}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                {o.status !== "paid" && (
                  <button
                    type="button"
                    onClick={() => onFinalize(o.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-green-500/40 text-green-500 px-3.5 py-2 text-xs hover:bg-green-500/10 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
                  </button>
                )}
                {o.status !== "rejected" && (
                  <button
                    type="button"
                    onClick={() => onReject(o.id, o.notes ?? null)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/40 text-red-500 px-3.5 py-2 text-xs hover:bg-red-500/10 transition"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Rejeitar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(o.id)}
                  className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoLine({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-brand-orange" />
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}
