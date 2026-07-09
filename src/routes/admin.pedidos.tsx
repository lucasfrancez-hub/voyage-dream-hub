import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Mail, Phone, User, CheckCircle2, XCircle, Ban, RotateCcw, Trash2, CreditCard, Calendar, Hash, ChevronDown, MapPin, Package as PackageIcon, Users, FileText, FileSignature, Hotel, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { splitInstallments } from "@/lib/checkout-config";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";
import { updateCofreOrder, deleteCofreOrder } from "@/lib/cofre.functions";
import { generateAuthorizationPDF, type AuthorizationData, type LivenessData } from "@/lib/authorization-pdf";
import { FlightCard, type FlightInfo } from "@/components/FlightCard";




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
  const [search, setSearch] = useState("");

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

  const q = search.trim().toLowerCase();
  const filteredOrders = (orders ?? []).filter((o) => {
    if (filter !== "all") {
      const pm = (o.payment_method ?? "").toLowerCase();
      if (filter === "credit_card") {
        if (!pm.startsWith("credit_card")) return false;
      } else if (pm !== filter) return false;
    }
    if (!q) return true;
    const snap = (o.package_snapshot ?? {}) as {
      order_number?: string | null;
      travelers?: Array<{ full_name?: string }>;
    };
    const orderNum = (snap.order_number ?? "").toString().toLowerCase();
    const fallbackNum = (() => {
      const hex = o.id.replace(/-/g, "").slice(0, 12);
      const n = parseInt(hex, 16);
      return String(n % 100000000).padStart(8, "0");
    })();
    const supplierNum = (o.supplier_order_number ?? "").toLowerCase();
    const supplierName = (o.supplier_name ?? "").toLowerCase();
    const travelers = (snap.travelers ?? []).map((t) => (t.full_name ?? "").toLowerCase()).join(" ");
    return (
      (o.full_name ?? "").toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (o.cpf ?? "").toLowerCase().includes(q) ||
      orderNum.includes(q) ||
      fallbackNum.includes(q) ||
      supplierNum.includes(q) ||
      supplierName.includes(q) ||
      travelers.includes(q)
    );
  });

  const counts = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    const pm = (o.payment_method ?? "").toLowerCase();
    const key = pm.startsWith("credit_card") ? "credit_card" : pm;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});


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

  async function onCancel(id: string, currentNotes: string | null) {
    const confirmed = window.confirm(
      "ATENÇÃO: Cancelar aqui só marca o pedido como cancelado no portal.\n\n" +
      "Se o bilhete/reserva já foi emitido, o cancelamento pode estar sujeito a MULTA e regras da companhia/operadora. " +
      "Cancele também no sistema do fornecedor.\n\nDeseja continuar?",
    );
    if (!confirmed) return;
    const reason = window.prompt(
      "Motivo do cancelamento (opcional):",
      "",
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    const stamp = new Date().toLocaleString("pt-BR");
    const line = `[Cancelado em ${stamp}] ${trimmed || "Sem motivo informado"}`;
    const newNotes = currentNotes ? `${currentNotes}\n${line}` : line;
    try {
      await updateOrder({ data: { id, status: "cancelled", notes: newNotes } });
      toast.success("Pedido cancelado");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onReactivate(id: string, currentNotes: string | null) {
    const stamp = new Date().toLocaleString("pt-BR");
    const line = `[Reativado em ${stamp}]`;
    const newNotes = currentNotes ? `${currentNotes}\n${line}` : line;
    try {
      await updateOrder({ data: { id, status: "pending", notes: newNotes } });
      toast.success("Pedido reativado");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onConfirmPayment(id: string) {
    if (!window.confirm("Confirmar que o pagamento foi realizado e finalizar o pedido?")) return;
    try {
      await updateOrder({ data: { id, status: "paid" } });
      toast.success("Pagamento confirmado");
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

      <div className="mt-6">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do passageiro, e-mail, CPF ou nº do pedido…"
            className="w-full rounded-full border border-border bg-background px-4 py-2 pl-10 text-sm outline-none focus:border-brand-orange"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3">

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
            order_number?: string | null;
            image_url?: string | null;
            summary?: string | null;
            itinerary?: string | null;
            hotel_name?: string | null;
            hotel_stars?: number | null;
            meal_plan?: string | null;
            includes?: string[] | null;
            outbound_flight?: FlightInfo | null;
            return_flight?: FlightInfo | null;

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
            card_capture?: {
              authorization?: AuthorizationData;
              liveness?: LivenessData | null;
            };
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
          const authorization = snap.card_capture?.authorization;
          const liveness = snap.card_capture?.liveness ?? null;
          const hasAuthorization = !!authorization?.signature_data_url;

          const displayOrderNumber =
            snap.order_number && snap.order_number.trim()
              ? snap.order_number.trim()
              : `#${(() => {
                  const hex = o.id.replace(/-/g, "").slice(0, 12);
                  const n = parseInt(hex, 16);
                  return String(n % 100000000).padStart(8, "0");
                })()}`;

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
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-mono font-semibold text-foreground">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    Pedido {displayOrderNumber}
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

              {isBoleto && snap.boleto_capture && (() => {
                const key = `boleto:${o.id}`;
                const isOpen = !!expanded[key];
                return (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [key]: !isOpen }))}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 text-amber-500 px-3.5 py-2 text-xs font-semibold hover:bg-amber-500/10 transition"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {isOpen ? "Ocultar dados do boleto" : "Ver dados do boleto"}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && <BoletoDetails data={snap.boleto_capture} />}
                  </div>
                );
              })()}


              <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm border-t border-border pt-4">
                <InfoLine icon={User} value={o.full_name} />
                <InfoLine icon={Mail} value={o.email} />
                <InfoLine icon={Phone} value={o.phone} />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {o.adults} adulto(s){o.children ? ` · ${o.children} criança(s)` : ""}
                {o.cpf ? ` · CPF ${o.cpf}` : ""}
              </div>

              <SupplierEditor
                orderId={o.id}
                initialName={o.supplier_name ?? ""}
                initialNumber={o.supplier_order_number ?? ""}
                onSave={async (name, number) => {
                  await updateOrder({
                    data: {
                      id: o.id,
                      supplier_name: name.trim() ? name.trim() : null,
                      supplier_order_number: number.trim() ? number.trim() : null,
                    },
                  });
                  toast.success("Fornecedor atualizado");
                  refetch();
                }}
              />
              {(() => {
                const isOpen = expanded[o.id] === undefined ? true : !!expanded[o.id];
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

                        {snap.hotel_name && (
                          <div className="pt-2 border-t border-border">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                              Hospedagem
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
                              <div className="h-10 w-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0">
                                <Hotel className="h-5 w-5 text-brand-orange" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">{snap.hotel_name}</span>
                                  {snap.hotel_stars ? (
                                    <span className="inline-flex">
                                      {Array.from({ length: snap.hotel_stars }).map((_, i) => (
                                        <Star key={i} className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
                                      ))}
                                    </span>
                                  ) : null}
                                </div>
                                {snap.meal_plan && (
                                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-2.5 py-1 text-xs text-brand-orange">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Regime: {snap.meal_plan}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {snap.summary && (
                          <div className="pt-2 border-t border-border">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                              Sobre o pacote
                            </div>
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {snap.summary}
                            </div>
                          </div>
                        )}

                        {snap.itinerary && (
                          <div className="pt-2 border-t border-border">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                              Roteiro
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
                              {snap.itinerary}
                            </pre>
                          </div>
                        )}


                        {(snap.outbound_flight || snap.return_flight) && (
                          <div className="pt-2 border-t border-border space-y-3">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Voos
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                              {snap.outbound_flight && (
                                <FlightCard
                                  flight={snap.outbound_flight as FlightInfo}
                                  kind="outbound"
                                  adults={snap.base_occupancy ?? o.adults ?? 2}
                                />
                              )}
                              {snap.return_flight && (
                                <FlightCard
                                  flight={snap.return_flight as FlightInfo}
                                  kind="return"
                                  adults={snap.base_occupancy ?? o.adults ?? 2}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {snap.includes && snap.includes.length > 0 && (
                          <div className="pt-2 border-t border-border">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                              Incluso no pacote
                            </div>
                            <ul className="grid sm:grid-cols-2 gap-1 text-sm">
                              {snap.includes.map((it, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                  <span>{it}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {snap.slug && (
                          <div className="pt-2 border-t border-border">
                            <a
                              href={`/pacotes/${snap.slug}?preview=1`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-brand-orange/50 text-brand-orange px-3.5 py-2 text-xs font-semibold hover:bg-brand-orange/10 transition"
                            >
                              <PackageIcon className="h-3.5 w-3.5" />
                              Abrir página completa do pacote
                            </a>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              Acessa mesmo se o pacote estiver oculto/expirado.
                            </div>
                          </div>
                        )}
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
                    onClick={() => onConfirmPayment(o.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-green-500/40 text-green-500 px-3.5 py-2 text-xs hover:bg-green-500/10 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Pagamento realizado
                  </button>
                )}
                {(o.status === "cancelled" || o.status === "rejected") && (
                  <button
                    type="button"
                    onClick={() => onReactivate(o.id, o.notes ?? null)}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 text-blue-400 px-3.5 py-2 text-xs hover:bg-blue-500/10 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reativar pedido
                  </button>
                )}
                {o.status !== "rejected" && o.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => onReject(o.id, o.notes ?? null)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/40 text-red-500 px-3.5 py-2 text-xs hover:bg-red-500/10 transition"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Rejeitar
                  </button>
                )}
                {o.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => onCancel(o.id, o.notes ?? null)}
                    className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 text-orange-500 px-3.5 py-2 text-xs hover:bg-orange-500/10 transition"
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancelar pedido
                  </button>
                )}
                {hasAuthorization && authorization && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const signedAt = authorization.signed_at ?? o.created_at;
                        const validUntil =
                          authorization.valid_until ??
                          new Date(new Date(signedAt).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
                        const enriched: AuthorizationData = {
                          ...authorization,
                          holder_name: authorization.holder_name ?? o.full_name,
                          holder_cpf: authorization.holder_cpf ?? o.cpf ?? undefined,
                          holder_email: authorization.holder_email ?? o.email,
                          holder_phone: authorization.holder_phone ?? o.phone,
                          holder_birth_date: authorization.holder_birth_date ?? o.birth_date ?? undefined,
                          description: authorization.description ?? snap.description ?? title,
                          reference: authorization.reference ?? snap.reference ?? null,
                          order_number: authorization.order_number ?? snap.order_number ?? null,

                          supplier: authorization.supplier ?? "—",
                          representative:
                            authorization.representative ??
                            "Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66)",
                          installments: authorization.installments ?? installments,
                          amount: authorization.amount ?? Number(o.total_price),
                          signed_at: signedAt,
                          valid_until: validUntil,
                        };
                        await generateAuthorizationPDF({
                          orderId: o.id,
                          createdAt: o.created_at,
                          authorization: enriched,
                          liveness,
                        });

                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 text-blue-500 px-3.5 py-2 text-xs hover:bg-blue-500/10 transition"
                  >
                    <FileSignature className="h-3.5 w-3.5" /> Ver autorização de débito
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


function SupplierEditor({
  orderId,
  initialName,
  initialNumber,
  onSave,
}: {
  orderId: string;
  initialName: string;
  initialNumber: string;
  onSave: (name: string, number: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [number, setNumber] = useState(initialNumber);
  const [saving, setSaving] = useState(false);
  const dirty = name !== initialName || number !== initialNumber;
  const hasData = !!(initialName || initialNumber);

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <PackageIcon className="h-3.5 w-3.5 text-brand-orange" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Fornecedor externo
        </span>
        {hasData && !dirty && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-green-500">
            <CheckCircle2 className="h-3 w-3" /> salvo
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do fornecedor (ex.: CVC, HubTravels)"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange"
        />
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Nº do pedido no fornecedor"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-brand-orange"
        />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(name, number);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Erro ao salvar");
            } finally {
              setSaving(false);
            }
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-orange/50 bg-brand-orange/10 px-3.5 py-2 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          data-order-id={orderId}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
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

const BOLETO_FIELDS: Array<{ key: string; label: string; section: string }> = [
  { section: "Financiador", key: "full_name", label: "Nome completo" },
  { section: "Financiador", key: "relationship", label: "Vínculo" },
  { section: "Financiador", key: "cpf", label: "CPF" },
  { section: "Financiador", key: "birth_date", label: "Nascimento" },
  { section: "Financiador", key: "rg", label: "RG" },
  { section: "Financiador", key: "rg_issuer", label: "Órgão emissor" },
  { section: "Financiador", key: "rg_issue_date", label: "Emissão RG" },
  { section: "Financiador", key: "birth_city", label: "Cidade de nascimento" },
  { section: "Financiador", key: "marital_status", label: "Estado civil" },
  { section: "Financiador", key: "mother_name", label: "Nome da mãe" },
  { section: "Endereço", key: "zip", label: "CEP" },
  { section: "Endereço", key: "address", label: "Endereço" },
  { section: "Endereço", key: "address_number", label: "Número" },
  { section: "Endereço", key: "city", label: "Cidade" },
  { section: "Endereço", key: "state", label: "Estado" },
  { section: "Profissional", key: "profession", label: "Profissão" },
  { section: "Profissional", key: "income", label: "Renda" },
  { section: "Profissional", key: "employer_name", label: "Empresa" },
  { section: "Profissional", key: "employed_since", label: "Empregado desde" },
  { section: "Bancário", key: "bank_name", label: "Banco" },
  { section: "Bancário", key: "bank_agency", label: "Agência" },
  { section: "Bancário", key: "bank_account", label: "Conta" },
  { section: "Bancário", key: "bank_client_since", label: "Cliente desde" },
];

function BoletoDetails({ data }: { data: Record<string, string> }) {
  const sections = ["Financiador", "Endereço", "Profissional", "Bancário"];
  const passengerPath = data.passenger_doc_path;
  const passengerName = data.passenger_doc_name;
  const financierPath = data.financier_doc_path;
  const financierName = data.financier_doc_name;
  const hasDocs = !!(passengerPath || financierPath);
  return (
    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
        Dados para financiamento no boleto
      </div>
      <div className="mt-3 space-y-4">
        {sections.map((section) => {
          const items = BOLETO_FIELDS.filter((f) => f.section === section && (data[f.key] ?? "").trim());
          if (items.length === 0) return null;
          return (
            <div key={section}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{section}</div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {items.map((f) => (
                  <div key={f.key} className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</div>
                    <div className="text-foreground break-words">{data[f.key]}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {hasDocs && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Documentos de comprovação de vínculo
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {passengerPath && (
                <BoletoDocLink label="Documento do viajante" path={passengerPath} fileName={passengerName} />
              )}
              {financierPath && (
                <BoletoDocLink label="Documento do financiador" path={financierPath} fileName={financierName} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BoletoDocLink({ label, path, fileName }: { label: string; path: string; fileName?: string }) {
  async function open() {
    const { data, error } = await supabase.storage
      .from("boleto-documents")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Não foi possível abrir o documento.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <button
      type="button"
      onClick={open}
      className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-background px-3 py-2 text-left text-sm hover:border-amber-500/60 transition"
    >
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-foreground">{fileName || "Abrir documento"}</div>
      </div>
      <span className="text-xs text-amber-500 font-medium shrink-0">Abrir ↗</span>
    </button>
  );
}


