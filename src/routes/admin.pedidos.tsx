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

const PAYMENT_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "credit_card", label: "Cartão" },
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto bancário" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;
type PaymentFilter = (typeof PAYMENT_FILTERS)[number]["value"];

function AdminOrders() {
  const updateOrder = useServerFn(updateCofreOrder);
  const deleteOrder = useServerFn(deleteCofreOrder);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<PaymentFilter>("all");

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

  const filteredOrders = (orders ?? []).filter((o) => {
    if (filter === "all") return true;
    const pm = (o.payment_method ?? "").toLowerCase();
    if (filter === "credit_card") return pm.startsWith("credit_card");
    return pm === filter;
  });

  const counts = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    const pm = (o.payment_method ?? "").toLowerCase();
    const key = pm.startsWith("credit_card") ? "credit_card" : pm;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

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

      <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {PAYMENT_FILTERS.map((f) => {
          const active = filter === f.value;
          const count = f.value === "all" ? orders?.length ?? 0 : counts[f.value] ?? 0;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-brand-orange text-primary-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-muted"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="text-center text-muted-foreground py-8">Carregando…</div>
        )}
        {!isLoading && filteredOrders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            {filter === "all" ? "Nenhum pedido ainda." : "Nenhum pedido nesta forma de pagamento."}
          </div>
        )}
        {filteredOrders.map((o) => {
          const snap = (o.package_snapshot ?? {}) as {
            slug?: string;
            title?: string;
            destination?: string;
            origin?: string;
            going_date?: string | null;
            return_date?: string | null;
            nights?: number | null;
            price_per_person?: number | null;
            taxes?: number | null;
            base_occupancy?: number | null;
            description?: string;
            reference?: string | null;
            first_amount?: number | null;
            travelers?: Array<{
              index?: number;
              kind?: string;
              full_name?: string;
              cpf?: string | null;
              birth_date?: string | null;
              email?: string;
              phone?: string;
            }>;
            boleto_capture?: Record<string, string>;
          };
          const pm = paymentMethodLabel(o.payment_method);
          const st = statusLabel(o.status);
          const isCard = (o.payment_method ?? "").toLowerCase().startsWith("credit_card");
          const isBoleto = (o.payment_method ?? "").toLowerCase() === "boleto";
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
              {(() => {
                const isOpen = !!expanded[o.id];
                const hasSnap = !!(snap.title || snap.destination || snap.travelers?.length);
                if (!hasSnap) return null;
                return (
                  <div className="mt-4 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [o.id]: !isOpen }))}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-brand-orange hover:opacity-80 transition"
                    >
                      <PackageIcon className="h-3.5 w-3.5" />
                      {isOpen ? "Ocultar detalhes do pacote" : "Ver detalhes do pacote"}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          {snap.title && (
                            <DetailRow icon={PackageIcon} label="Pacote" value={snap.title} />
                          )}
                          {snap.destination && (
                            <DetailRow icon={MapPin} label="Destino" value={snap.destination} />
                          )}
                          {snap.origin && (
                            <DetailRow icon={MapPin} label="Origem" value={snap.origin} />
                          )}
                          {(snap.going_date || snap.return_date) && (
                            <DetailRow
                              icon={Calendar}
                              label={snap.nights ? `Datas · ${snap.nights} noites` : "Datas"}
                              value={formatDateRange(snap.going_date, snap.return_date)}
                            />
                          )}
                          {snap.price_per_person != null && (
                            <DetailRow
                              icon={CreditCard}
                              label="Preço por pessoa"
                              value={formatBRL(snap.price_per_person)}
                            />
                          )}
                          {snap.base_occupancy != null && (
                            <DetailRow
                              icon={Users}
                              label="Ocupação base"
                              value={`${snap.base_occupancy} adulto(s)`}
                            />
                          )}
                          {snap.slug && (
                            <DetailRow icon={Hash} label="Slug" value={snap.slug} />
                          )}
                          {snap.reference && (
                            <DetailRow icon={Hash} label="Referência" value={snap.reference} />
                          )}
                        </div>
                        {snap.travelers && snap.travelers.length > 0 && (
                          <div className="pt-2 border-t border-border">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                              Passageiros
                            </div>
                            <ul className="space-y-1.5 text-sm">
                              {snap.travelers.map((t, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange text-[10px] font-semibold px-1.5">
                                    {t.index ?? i + 1}
                                  </span>
                                  <span className="font-medium">{t.full_name ?? "—"}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {t.kind === "child" ? "criança" : "adulto"}
                                    {t.cpf ? ` · CPF ${t.cpf}` : ""}
                                    {t.birth_date ? ` · nasc. ${t.birth_date}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-brand-orange mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm text-foreground break-words">{value}</div>
      </div>
    </div>
  );
}
