import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft, Hotel, Plane, XCircle, FileText, DollarSign, Users, Plus,
  Pencil, Trash2, Ban, RotateCcw, Loader2, Copy, Download, Hash,
  Package, Percent, Mail, Printer, CheckCircle2, MoreHorizontal, Signature,
  Vault, ExternalLink, X, UserPlus, Star,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

import { formatBRL } from "@/lib/format";
import { paymentMethodLabel, statusLabel, itemStatusBadge } from "@/lib/order-labels";
import {
  getOrderDetail, upsertPassenger, deletePassenger,
  upsertOrderItem, deleteOrderItem, setOrderItemStatus, setOrderStatus, updateOrderMeta,
  upsertItemFinancial, deleteItemFinancial, updateOrderTotalPrice, recalculateOrderTotal,
  upsertOrderPayment, deleteOrderPayment, updateOrderPayer,
  appendOrderLogEntry, deleteOrderLogEntry,
  linkPassengerToItem, unlinkPassengerFromItem,
  type OrderDetail, type OrderHeader, type OrderPassenger, type OrderItem, type OrderItemFinancial, type OrderPayment, type OrderLogEntry,
} from "@/lib/orders.functions";
import { MondePersonSearchDialog } from "@/components/monde/MondePersonSearchDialog";
import { Cloud } from "lucide-react";
import { Slider } from "@/components/ui/slider";


import { type AuthorizationData, type LivenessData } from "@/lib/authorization-pdf";
import { generateReceiptAndContract, generateReceiptOnly, generateReceiptContractAndAuthorization, generateOrderAuthorization, openBlobInNewTab } from "@/lib/contract-pdf";
import { OrderDocuments } from "@/components/OrderDocuments";
import { ClickSignCard } from "@/components/clicksign/ClickSignCard";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/pedidos/$id")({
  component: OrderDetailPage,
  head: () => ({ meta: [{ title: "Detalhe do pedido — Admin" }] }),
});

function orderDetailQO(id: string) {
  const fetchDetail = getOrderDetail;
  return queryOptions({
    queryKey: ["admin", "orderDetail", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function StarsDisplay({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span className={`inline-flex items-center align-middle ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="relative inline-block h-3.5 w-3.5">
            <Star className="absolute inset-0 h-3.5 w-3.5 text-brand-orange/30" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="h-3.5 w-3.5 text-brand-orange fill-brand-orange" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function StarsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, v - i));
          return (
            <div key={i} className="relative h-6 w-6">
              <Star className="absolute inset-0 h-6 w-6 text-brand-orange/30" />
              <span className="absolute inset-0 overflow-hidden pointer-events-none" style={{ width: `${fill * 100}%` }}>
                <Star className="h-6 w-6 text-brand-orange fill-brand-orange" />
              </span>
              <button
                type="button"
                aria-label={`${i + 0.5} estrelas`}
                className="absolute left-0 top-0 h-6 w-3 cursor-pointer"
                onClick={() => onChange(i + 0.5)}
              />
              <button
                type="button"
                aria-label={`${i + 1} estrelas`}
                className="absolute right-0 top-0 h-6 w-3 cursor-pointer"
                onClick={() => onChange(i + 1)}
              />
            </div>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{v ? v.toFixed(1) : "—"}</span>
      {v > 0 && (
        <button type="button" onClick={() => onChange(0)} className="text-[10px] text-muted-foreground hover:text-foreground underline">
          limpar
        </button>
      )}
    </div>
  );
}

function OrderDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery(orderDetailQO(id));

  // TODOS os hooks antes de qualquer return condicional — Rules of Hooks.
  const [activeTab, setActiveTab] = useState<string>("hotel");
  const [openCommission, setOpenCommission] = useState(false);
  const [openLog, setOpenLog] = useState<null | "notes_log" | "travel_reason_log">(null);

  const setOrderStatusFn = useServerFn(setOrderStatus);
  const updateOrderMetaFn = useServerFn(updateOrderMeta);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "orderDetail", id] });

  const orderStatusMut = useMutation({
    mutationFn: (status: "confirmed" | "reserved" | "cancelled" | "pending") =>
      setOrderStatusFn({ data: { id: (data as OrderDetail | undefined)?.order.id ?? "", status } }),
    onSuccess: (_r, status) => {
      toast.success(status === "confirmed" ? "Pedido confirmado" : status === "cancelled" ? "Pedido cancelado" : "Pedido reaberto");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const metaMut = useMutation({
    mutationFn: (patch: { notes?: string | null; travel_reason?: string | null; coupon?: string | null }) =>
      updateOrderMetaFn({ data: { id: (data as OrderDetail | undefined)?.order.id ?? "", ...patch } }),
    onSuccess: () => { toast.success("Salvo"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  void metaMut; // reservado para futuras edições rápidas

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedido…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          Erro ao carregar pedido: {error instanceof Error ? error.message : "desconhecido"}
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => navigate({ to: "/admin/pedidos" })}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const detail = data as OrderDetail;
  const { order } = detail;
  const pm = paymentMethodLabel(order.paymentMethod);
  const st = statusLabel(order.status);

  const hotelItems = detail.items.filter((i) => i.kind === "hotel" && i.status !== "cancelled");
  const flightItems = detail.items.filter((i) => i.kind === "flight" && i.status !== "cancelled");
  const serviceItems = detail.items.filter((i) => i.kind === "other" && i.status !== "cancelled");
  const cancelledItems = detail.items.filter((i) => i.status === "cancelled");





  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/pedidos">
            <ArrowLeft className="h-4 w-4 mr-1" /> Pedidos
          </Link>
        </Button>
        <div className="text-xs text-muted-foreground">/ Detalhe</div>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              <span className="font-mono text-sm text-foreground font-semibold">{order.orderNumber}</span>
              <span className="text-[10px] text-muted-foreground/70">ref {shortId(order.id)}</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.className}`}>
                {st.label}
              </span>
            </div>
            <div className="mt-1 text-2xl font-display font-bold">{order.fullName}</div>
            <div className="text-sm text-muted-foreground">{order.email} · {order.phone}</div>
            {order.cpf && <div className="text-xs text-muted-foreground mt-0.5">CPF {order.cpf}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-display font-bold text-brand-orange">{formatBRL(order.totalPrice)}</div>
            <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${pm.className}`}>
              {pm.label}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Criado em {new Date(order.createdAt).toLocaleString("pt-BR")}
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">Gerar link de pagamento</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Escolha a modalidade</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(() => {
                    const snap = (order.packageSnapshot ?? {}) as Record<string, unknown>;
                    const hotelItem = detail.items.find((i) => i.kind === "hotel" && i.status !== "cancelled");
                    const flightItems = detail.items.filter((i) => i.kind === "flight" && i.status !== "cancelled");
                    const pax = detail.passengers.map((p) => p.full_name).filter(Boolean).join("\n");
                    const flightsTxt = flightItems.map((f) => f.title).join("\n");
                    const hotelTxt = hotelItem?.title
                      ?? (snap.hotel_name ? String(snap.hotel_name) : "");
                    const checkin = snap.going_date ? String(snap.going_date) : "";
                    const checkout = snap.return_date ? String(snap.return_date) : "";
                    const nights = snap.nights != null ? String(snap.nights) : "";
                    const destination = snap.destination ? String(snap.destination) : "";
                    const origin = snap.origin ? String(snap.origin) : "";
                    const packageTitle = snap.title ? String(snap.title) : "";
                    const desc = packageTitle
                      || [destination && `Pacote ${destination}`, origin && `saindo de ${origin}`].filter(Boolean).join(" ")
                      || `Pedido ${order.orderNumber}`;
                    const travelDate = checkin && checkout
                      ? `${new Date(checkin + "T00:00").toLocaleDateString("pt-BR")} a ${new Date(checkout + "T00:00").toLocaleDateString("pt-BR")}`
                      : "";
                    const search = {
                      customer: order.fullName,
                      phone: order.phone,
                      total: String(order.totalPrice ?? ""),
                      orderRef: order.id,
                      orderNumber: order.orderNumber,
                      locator: order.airlineLocator ?? "",
                      supplier: order.supplierName || "Via Air",
                      description: desc,
                      passengers: pax,
                      hotel: hotelTxt,
                      flights: flightsTxt,
                      checkin,
                      checkout,
                      nights,
                      days: nights ? String(Number(nights) + 1) : "",
                      travelDate,
                      route: [origin, destination].filter(Boolean).join(" → "),
                      imageUrl: snap.image_url ? String(snap.image_url) : "",
                      autogen: "1",
                    };
                    const openInNewTab = (path: string) => {
                      const qs = new URLSearchParams();
                      for (const [k, v] of Object.entries(search)) {
                        if (v != null && String(v).length > 0) qs.set(k, String(v));
                      }
                      // Fallback via sessionStorage caso a nova aba perca a querystring
                      try {
                        sessionStorage.setItem(
                          `paymentLinkPrefill:${path}`,
                          JSON.stringify(search),
                        );
                      } catch { /* ignore */ }
                      window.open(`${path}?${qs.toString()}`, "_blank", "noopener");
                    };
                    return (
                      <>
                        <DropdownMenuItem onClick={() => openInNewTab("/admin/link-pagamento")}>
                          <FileText className="h-3.5 w-3.5 mr-2" /> Seguro (personalizado)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openInNewTab("/admin/link-cartao-simples")}>
                          <DollarSign className="h-3.5 w-3.5 mr-2" /> Convencional (cartão simples)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openInNewTab("/admin/link-boleto")}>
                          <FileText className="h-3.5 w-3.5 mr-2" /> Boleto
                        </DropdownMenuItem>
                      </>
                    );
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>


              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setOpenCommission(true)}><Percent className="h-3.5 w-3.5 mr-2" /> Ajuste de comissão</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOpenLog("notes_log")}><FileText className="h-3.5 w-3.5 mr-2" /> Observação ({order.notesLog?.length ?? 0})</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOpenLog("travel_reason_log")}><FileText className="h-3.5 w-3.5 mr-2" /> Motivo da viagem ({order.travelReasonLog?.length ?? 0})</DropdownMenuItem>
                </DropdownMenuContent>

              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Printer className="h-3.5 w-3.5 mr-1" /> Imprimir</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={async () => {
                    try {
                      const blob = await generateReceiptAndContract(detail);
                      openBlobInNewTab(blob, `contrato-${order.orderNumber}.pdf`);
                    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar contrato"); }
                  }}><FileText className="h-3.5 w-3.5 mr-2" /> Contrato + Recibo</DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    try {
                      const blob = await generateReceiptOnly(detail);
                      openBlobInNewTab(blob, `recibo-${order.orderNumber}.pdf`);
                    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar recibo"); }
                  }}><FileText className="h-3.5 w-3.5 mr-2" /> Recibo</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Voucher (PDF) — em breve")}><FileText className="h-3.5 w-3.5 mr-2" /> Voucher</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Mail className="h-3.5 w-3.5 mr-1" /> Enviar e-mail</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => toast.info("Envio de contrato — em breve")}><FileText className="h-3.5 w-3.5 mr-2" /> Contrato</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Envio de confirmação — em breve")}><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Confirmação</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Envio de voucher — em breve")}><FileText className="h-3.5 w-3.5 mr-2" /> Voucher</DropdownMenuItem>
                </DropdownMenuContent>

              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Ações</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { if (confirm("Confirmar o pedido e todos os itens?")) orderStatusMut.mutate("confirmed"); }}><CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Confirmar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { if (confirm("Cancelar o pedido e todos os itens?")) orderStatusMut.mutate("cancelled"); }}><Ban className="h-3.5 w-3.5 mr-2 text-amber-500" /> Cancelar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { if (confirm("Reabrir o pedido como pendente?")) orderStatusMut.mutate("pending"); }}><RotateCcw className="h-3.5 w-3.5 mr-2" /> Reabrir</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setActiveTab("contract");
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent("clicksign:open-send", { detail: { orderId: order.id, withAuth: true } }));
                    }, 150);
                  }}><Signature className="h-3.5 w-3.5 mr-2 text-brand-orange" /> Acionar contrato Clicksign</DropdownMenuItem>
                </DropdownMenuContent>

              </DropdownMenu>
            </div>



          </div>
        </div>
      </div>


      {/* Passageiros */}
      <PassengersSection
        orderId={order.id}
        passengers={detail.passengers}
        flightItems={detail.items.filter((i) => i.kind === "flight" && i.status !== "cancelled")}
        onChange={invalidate}
      />

      {/* Tabs */}
      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="hotel"><Hotel className="h-3.5 w-3.5 mr-1.5" /> Hospedagem ({hotelItems.length})</TabsTrigger>
            <TabsTrigger value="flight"><Plane className="h-3.5 w-3.5 mr-1.5" /> Aéreo ({flightItems.length})</TabsTrigger>
            <TabsTrigger value="service"><Package className="h-3.5 w-3.5 mr-1.5" /> Serviços ({serviceItems.length})</TabsTrigger>
            <TabsTrigger value="cancelled"><XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancelados ({cancelledItems.length})</TabsTrigger>
            <TabsTrigger value="contract"><FileText className="h-3.5 w-3.5 mr-1.5" /> Contrato</TabsTrigger>
            <TabsTrigger value="finance"><DollarSign className="h-3.5 w-3.5 mr-1.5" /> Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="hotel" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={hotelItems}
              kind="hotel"
              onChange={invalidate}
              passengers={detail.passengers}
              itemPassengers={detail.itemPassengers}
            />
          </TabsContent>
          <TabsContent value="flight" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={flightItems}
              kind="flight"
              onChange={invalidate}
              passengers={detail.passengers}
              itemPassengers={detail.itemPassengers}
            />
          </TabsContent>
          <TabsContent value="service" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={serviceItems}
              kind="other"
              onChange={invalidate}
              passengers={detail.passengers}
              itemPassengers={detail.itemPassengers}
            />
          </TabsContent>


          <TabsContent value="cancelled" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={cancelledItems}
              kind="cancelled"
              onChange={invalidate}
              passengers={detail.passengers}
              itemPassengers={detail.itemPassengers}
            />
          </TabsContent>
          <TabsContent value="contract" className="mt-4">
            <ContractTab detail={detail} />
          </TabsContent>
          <TabsContent value="finance" className="mt-4">
            <FinanceTab
              order={order}
              items={detail.items}
              financials={detail.financials}
              onChange={invalidate}
            />
          </TabsContent>

        </Tabs>

      </div>

      {/* Payments */}
      <PaymentsSection
        orderId={order.id}
        order={order}
        clientName={order.fullName}
        payments={detail.payments}
        onChange={invalidate}
      />


      <CommissionAdjustDialog
        open={openCommission}
        onOpenChange={setOpenCommission}
        order={order}
        items={detail.items.filter((i) => i.status !== "cancelled")}
        financials={detail.financials}
        onSaved={invalidate}
      />

      <OrderLogDialog
        open={openLog !== null}
        onOpenChange={(v) => !v && setOpenLog(null)}
        orderId={order.id}
        logKey={openLog ?? "notes_log"}
        entries={openLog === "travel_reason_log" ? (order.travelReasonLog ?? []) : (order.notesLog ?? [])}
        onChange={invalidate}
      />
    </div>

  );
}


// =========== Passengers ===========
function PassengersSection({
  orderId, passengers, flightItems, onChange,
}: { orderId: string; passengers: OrderPassenger[]; flightItems: OrderItem[]; onChange: () => void }) {
  const upsert = useServerFn(upsertPassenger);
  const upsertItem = useServerFn(upsertOrderItem);
  const del = useServerFn(deletePassenger);
  const [editing, setEditing] = useState<OrderPassenger | null>(null);
  const [open, setOpen] = useState(false);
  const [mondeOpen, setMondeOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (p: Partial<OrderPassenger> & { order_id: string; full_name: string }) =>
      upsert({ data: p }),
    onSuccess: () => { toast.success("Passageiro salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (pid: string) => del({ data: { id: pid } }),
    onSuccess: () => { toast.success("Passageiro removido"); onChange(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(p: OrderPassenger) { setEditing(p); setOpen(true); }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Passageiros ({passengers.length})
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMondeOpen(true)}>
            <Cloud className="h-3.5 w-3.5 mr-1" /> Importar do Monde
          </Button>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </div>
      {passengers.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Nenhum passageiro cadastrado.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Nome</th>
                <th className="text-left py-2 px-2 w-[70px]">Tipo</th>
                <th className="text-left py-2 px-2 w-[130px]">Nascimento</th>
                <th className="text-left py-2 px-2 min-w-[300px]">Documento</th>
                <th className="text-left py-2 px-2">Bilhete</th>
                <th className="w-16"></th>
              </tr>

            </thead>
            <tbody>
              {(() => {
                const fallbackTicket = flightItems
                  .map((fi) => String(((fi.details ?? {}) as Record<string, unknown>).ticket_number ?? "").trim())
                  .find(Boolean) ?? "";
                return passengers.map((p) => (
                <PassengerRow
                  key={p.id}
                  passenger={p}
                  fallbackTicket={fallbackTicket}
                  onPatch={(patch) => {
                    save.mutate({
                      order_id: orderId,
                      id: p.id,
                      full_name: patch.full_name ?? p.full_name,
                      passenger_type: patch.passenger_type ?? p.passenger_type,
                      birth_date: patch.birth_date !== undefined ? patch.birth_date : p.birth_date,
                      cpf: patch.cpf !== undefined ? patch.cpf : p.cpf,
                      ticket_number: patch.ticket_number !== undefined ? patch.ticket_number : p.ticket_number,
                      sort_order: p.sort_order,
                      doc_type: patch.doc_type ?? p.doc_type,
                      passport_number: patch.passport_number !== undefined ? patch.passport_number : p.passport_number,
                      passport_issue_date: patch.passport_issue_date !== undefined ? patch.passport_issue_date : p.passport_issue_date,
                      passport_expiry_date: patch.passport_expiry_date !== undefined ? patch.passport_expiry_date : p.passport_expiry_date,
                    });
                    // Se alterou o bilhete, replica em todos os aéreos: grava details.ticket_number e marca como Confirmado.
                    if (patch.ticket_number !== undefined) {
                      const newTicket = patch.ticket_number;
                      for (const fi of flightItems) {
                        const details = { ...((fi.details ?? {}) as Record<string, unknown>), ticket_number: newTicket ?? "" };
                        upsertItem({
                          data: {
                            id: fi.id,
                            order_id: orderId,
                            kind: "flight",
                            title: fi.title,
                            supplier_locator: fi.supplier_locator,
                            details: details as Json,
                            sort_order: fi.sort_order,
                            status: newTicket ? "confirmed" : (fi.supplier_locator ? "reserved" : "pending"),
                          },
                        }).catch(() => { /* toast já é global */ });
                      }
                      setTimeout(() => onChange(), 250);
                    }
                  }}
                  onDelete={() => confirm("Remover passageiro?") && remove.mutate(p.id)}
                />
                ));
              })()}
            </tbody>

          </table>
        </div>
      )}


      <PassengerDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSave={(payload) => save.mutate({ ...payload, order_id: orderId, id: editing?.id })}
      />

      <MondePersonSearchDialog
        open={mondeOpen}
        onOpenChange={setMondeOpen}
        onPick={(person) => {
          const hasCpf = !!(person.cpf && person.cpf.replace(/\D+/g, "").length >= 11);
          save.mutate({
            order_id: orderId,
            full_name: person.name,
            passenger_type: "ADT",
            birth_date: person.birthDate,
            cpf: hasCpf ? person.cpf : null,
            doc_type: hasCpf ? "cpf" : (person.passportNumber ? "passport" : "cpf"),
            passport_number: person.passportNumber,
            passport_expiry_date: person.passportExpiration,
            sort_order: passengers.length,
          } as Partial<OrderPassenger> & { order_id: string; full_name: string });
        }}
      />
    </div>
  );
}

type PassengerPatch = Partial<Pick<OrderPassenger,
  "full_name" | "passenger_type" | "birth_date" | "cpf" | "ticket_number"
  | "doc_type" | "passport_number" | "passport_issue_date" | "passport_expiry_date"
>>;

function PassengerRow({
  passenger, onPatch, onDelete, fallbackTicket,
}: {
  passenger: OrderPassenger;
  onPatch: (patch: PassengerPatch) => void;
  onDelete: () => void;
  fallbackTicket?: string;
}) {
  const effectiveTicket = passenger.ticket_number ?? (fallbackTicket || null);
  return (
    <tr className="border-b border-border/50 group align-middle">

      <td className="py-1 px-1">
        <InlineText value={passenger.full_name} placeholder="Nome" className="font-medium"
          onCommit={(v) => v.trim() && v !== passenger.full_name && onPatch({ full_name: v.trim() })} />
      </td>
      <td className="py-1 px-1 w-[70px]">
        <Select value={passenger.passenger_type}
          onValueChange={(v) => onPatch({ passenger_type: v as "ADT" | "CHD" | "INF" })}>
          <SelectTrigger className="h-7 w-[70px] text-xs border-transparent hover:border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADT">ADT</SelectItem>
            <SelectItem value="CHD">CHD</SelectItem>
            <SelectItem value="INF">INF</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-1 px-1 w-[130px]">
        <InlineText type="date" value={passenger.birth_date ?? ""} placeholder="—" className="text-xs w-[120px]"
          onCommit={(v) => (v || null) !== passenger.birth_date && onPatch({ birth_date: v || null })} />
      </td>
      <td className="py-1 px-1 w-[280px] align-top">
        <div className="flex items-start gap-1.5">
          <Select
            value={passenger.doc_type ?? "cpf"}
            onValueChange={(v) => onPatch({ doc_type: v as "cpf" | "passport" })}
          >
            <SelectTrigger className="h-7 w-[110px] shrink-0 text-xs border-transparent hover:border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cpf">CPF</SelectItem>
              <SelectItem value="passport">Passaporte</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            {passenger.doc_type === "passport" ? (
              <>
                <InlineText
                  value={passenger.passport_number ?? ""}
                  placeholder="nº passaporte"
                  className="text-xs font-mono w-[150px]"
                  onCommit={(v) => (v || null) !== passenger.passport_number && onPatch({ passport_number: v || null })}
                />
                <InlineText
                  type="date"
                  value={passenger.passport_issue_date ?? ""}
                  placeholder="emissão"
                  className="text-xs w-[150px]"
                  onCommit={(v) => (v || null) !== passenger.passport_issue_date && onPatch({ passport_issue_date: v || null })}
                />
                <InlineText
                  type="date"
                  value={passenger.passport_expiry_date ?? ""}
                  placeholder="validade"
                  className="text-xs w-[150px]"
                  onCommit={(v) => (v || null) !== passenger.passport_expiry_date && onPatch({ passport_expiry_date: v || null })}
                />
              </>
            ) : (
              <InlineText
                value={passenger.cpf ?? ""}
                placeholder="CPF"
                className="text-xs font-mono w-[150px]"
                onCommit={(v) => (v || null) !== passenger.cpf && onPatch({ cpf: v || null })}
              />
            )}
          </div>
        </div>
      </td>
      <td className="py-1 px-1">
        <InlineText value={effectiveTicket ?? ""} placeholder="+ bilhete" className="text-xs font-mono"
          onCommit={(v) => (v || null) !== passenger.ticket_number && onPatch({ ticket_number: v || null })} />
      </td>



      <td className="py-1 px-1 text-right">
        <Button size="sm" variant="ghost" onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}

function InlineText({
  value, onCommit, placeholder, className, type = "text",
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: "text" | "date";
}) {
  const [v, setV] = useState(value);
  useMemo(() => { setV(value); }, [value]);
  return (
    <input
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); }
      }}
      className={`w-full bg-transparent rounded px-2 py-1 border border-transparent hover:border-border focus:border-primary focus:outline-none focus:bg-background ${className ?? ""}`}
    />
  );
}



function PassengerDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderPassenger | null;
  onSave: (p: Partial<OrderPassenger> & { full_name: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: initial?.full_name ?? "",
    passenger_type: (initial?.passenger_type ?? "ADT") as "ADT" | "CHD" | "INF",
    birth_date: initial?.birth_date ?? "",
    cpf: initial?.cpf ?? "",
    ticket_number: initial?.ticket_number ?? "",
    document: initial?.document ?? "",
    doc_type: (initial?.doc_type ?? "cpf") as "cpf" | "passport",
    passport_number: initial?.passport_number ?? "",
    passport_issue_date: initial?.passport_issue_date ?? "",
    passport_expiry_date: initial?.passport_expiry_date ?? "",
  });
  // reset when initial changes
  useMemo(() => {
    setForm({
      full_name: initial?.full_name ?? "",
      passenger_type: (initial?.passenger_type ?? "ADT") as "ADT" | "CHD" | "INF",
      birth_date: initial?.birth_date ?? "",
      cpf: initial?.cpf ?? "",
      ticket_number: initial?.ticket_number ?? "",
      document: initial?.document ?? "",
      doc_type: (initial?.doc_type ?? "cpf") as "cpf" | "passport",
      passport_number: initial?.passport_number ?? "",
      passport_issue_date: initial?.passport_issue_date ?? "",
      passport_expiry_date: initial?.passport_expiry_date ?? "",
    });
  }, [initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar passageiro" : "Adicionar passageiro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nome completo</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.passenger_type} onValueChange={(v) => setForm({ ...form, passenger_type: v as "ADT" | "CHD" | "INF" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADT">Adulto (ADT)</SelectItem>
                  <SelectItem value="CHD">Criança (CHD)</SelectItem>
                  <SelectItem value="INF">Bebê (INF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nascimento</Label>
              <Input type="date" value={form.birth_date ?? ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Tipo de documento</Label>
            <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v as "cpf" | "passport" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF (brasileiro)</SelectItem>
                <SelectItem value="passport">Passaporte (estrangeiro)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.doc_type === "cpf" ? (
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Nº do passaporte</Label>
                <Input value={form.passport_number ?? ""} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} />
              </div>
              <div>
                <Label>Data de emissão</Label>
                <Input type="date" value={form.passport_issue_date ?? ""} onChange={(e) => setForm({ ...form, passport_issue_date: e.target.value })} />
              </div>
              <div>
                <Label>Data de validade</Label>
                <Input type="date" value={form.passport_expiry_date ?? ""} onChange={(e) => setForm({ ...form, passport_expiry_date: e.target.value })} />
              </div>
            </div>
          )}

          <div>
            <Label>Nº bilhete aéreo</Label>
            <Input value={form.ticket_number ?? ""} onChange={(e) => setForm({ ...form, ticket_number: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.full_name.trim()) { toast.error("Nome é obrigatório"); return; }
              onSave({
                ...form,
                birth_date: form.birth_date || null,
                passport_issue_date: form.passport_issue_date || null,
                passport_expiry_date: form.passport_expiry_date || null,
                cpf: form.cpf || null,
                passport_number: form.passport_number || null,
                ticket_number: form.ticket_number || null,
                document: form.document || null,
              } as any);
            }}
          >Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Items (hotel/flight/other/cancelled) ===========
function ItemsTab({
  orderId, items, kind, onChange, passengers, itemPassengers,
}: {
  orderId: string;
  items: OrderItem[];
  kind: "hotel" | "flight" | "other" | "cancelled";
  onChange: () => void;
  passengers?: OrderPassenger[];
  itemPassengers?: Record<string, string[]>;
}) {

  const upsert = useServerFn(upsertOrderItem);
  const del = useServerFn(deleteOrderItem);
  const setStatus = useServerFn(setOrderItemStatus);
  const recalculateTotal = useServerFn(recalculateOrderTotal);
  const linkFn = useServerFn(linkPassengerToItem);
  const unlinkFn = useServerFn(unlinkPassengerFromItem);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [open, setOpen] = useState(false);

  const allPax = passengers ?? [];
  const linksMap = itemPassengers ?? {};

  const paxForItem = (itemId: string): OrderPassenger[] => {
    const ids = linksMap[itemId] ?? [];
    const set = new Set(ids);
    return allPax.filter((p) => set.has(p.id));
  };
  const paxForItems = (itemIds: string[]): OrderPassenger[] => {
    const set = new Set<string>();
    for (const iid of itemIds) for (const pid of linksMap[iid] ?? []) set.add(pid);
    return allPax.filter((p) => set.has(p.id));
  };

  const linkMut = useMutation({
    mutationFn: async ({ passengerId, itemIds }: { passengerId: string; itemIds: string[] }) => {
      for (const iid of itemIds) {
        await linkFn({ data: { order_id: orderId, order_item_id: iid, passenger_id: passengerId } });
      }
    },
    onSuccess: () => onChange(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const unlinkMut = useMutation({
    mutationFn: async ({ passengerId, itemIds }: { passengerId: string; itemIds: string[] }) => {
      for (const iid of itemIds) {
        await unlinkFn({ data: { order_item_id: iid, passenger_id: passengerId } });
      }
    },
    onSuccess: () => onChange(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const save = useMutation({
    mutationFn: async (payload: Parameters<typeof upsert>[0]["data"]) => {
      const result = await upsert({ data: payload });
      await recalculateTotal({ data: { id: orderId } });
      return result;
    },
    onSuccess: () => { toast.success("Item salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (iid: string) => {
      await del({ data: { id: iid } });
      return recalculateTotal({ data: { id: orderId } });
    },
    onSuccess: () => { toast.success("Item removido"); onChange(); },
  });
  const cancel = useMutation({
    mutationFn: async (iid: string) => {
      await setStatus({ data: { id: iid, status: "cancelled" } });
      return recalculateTotal({ data: { id: orderId } });
    },
    onSuccess: () => { toast.success("Item cancelado"); onChange(); },
  });
  const reactivate = useMutation({
    mutationFn: async (iid: string) => {
      await setStatus({ data: { id: iid, status: "confirmed" } });
      return recalculateTotal({ data: { id: orderId } });
    },
    onSuccess: () => { toast.success("Item reativado"); onChange(); },
  });

  const isCancelledTab = kind === "cancelled";
  const dialogKind: "hotel" | "flight" | "other" = isCancelledTab
    ? (editing?.kind === "flight" ? "flight" : editing?.kind === "other" ? "other" : "hotel")
    : kind;

  const addLabel = kind === "hotel" ? "hospedagem" : kind === "flight" ? "aéreo" : "serviço";

  return (
    <div>
      {!isCancelledTab && (
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar {addLabel}
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {isCancelledTab ? "Nenhum item cancelado." : "Nenhum item cadastrado. Clique em Adicionar para começar."}
        </div>
      ) : isCancelledTab ? (
        <div className="space-y-3">
          {groupFlightItems(items.filter((i) => i.kind === "flight")).map((group) => (
            <FlightReservationCard
              key={group.key}
              locator={group.locator}
              segments={group.items}
              passengers={paxForItems(group.items.map((s) => s.id))}
              allPassengers={allPax}
              onEdit={(it) => { setEditing(it); setOpen(true); }}
              onDelete={(it) => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={(it) => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={(it) => reactivate.mutate(it.id)}
              onLink={(pid, iids) => linkMut.mutate({ passengerId: pid, itemIds: iids })}
              onUnlink={(pid, iids) => unlinkMut.mutate({ passengerId: pid, itemIds: iids })}
            />
          ))}
          {items.filter((i) => i.kind === "hotel").map((it) => (
            <HotelReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}
          {items.filter((i) => i.kind === "other").map((it) => (
            <ServiceReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}

        </div>
      ) : kind === "flight" ? (
        <div className="space-y-3">
          {groupFlightItems(items).map((group) => (
            <FlightReservationCard
              key={group.key}
              locator={group.locator}
              segments={group.items}
              passengers={paxForItems(group.items.map((s) => s.id))}
              allPassengers={allPax}
              onEdit={(it) => { setEditing(it); setOpen(true); }}
              onDelete={(it) => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={(it) => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={(it) => reactivate.mutate(it.id)}
              onLink={(pid, iids) => linkMut.mutate({ passengerId: pid, itemIds: iids })}
              onUnlink={(pid, iids) => unlinkMut.mutate({ passengerId: pid, itemIds: iids })}
            />
          ))}
        </div>
      ) : kind === "hotel" ? (
        <div className="space-y-3">
          {items.map((it) => (
            <HotelReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <ServiceReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}
        </div>
      )}




      <ItemDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        kind={dialogKind}
        siblings={
          editing && editing.kind === "flight"
            ? items.filter((i) => i.kind === "flight" && i.status !== "cancelled" && i.id !== editing.id)
            : undefined
        }
        onSave={async (payload) => {
          try {
            // 1) Salva o item principal (edita ou cria novo)
            const mainRes = await upsert({ data: {
              order_id: orderId,
              id: editing?.id,
              kind: payload.kind,
              title: payload.title,
              supplier_locator: payload.supplier_locator,
              details: payload.details,
              status: payload.status,
              sort_order: editing?.sort_order ?? 0,
            } });

            // 2) Para AÉREO: salva/cria/atualiza os trechos irmãos e propaga localizador + bilhete
            if (payload.kind === "flight") {
              const newLoc = payload.supplier_locator;
              const newDetails = (payload.details ?? {}) as Record<string, unknown>;
              const newTicket = String(newDetails.ticket_number ?? "").trim();
              const newSupplier = newDetails.supplier_name;
              const statusFor = (): "confirmed" | "reserved" | "pending" =>
                newTicket && newLoc ? "confirmed" : newLoc ? "reserved" : "pending";
              const mainId = editing?.id ?? mainRes.id;

              // Remove os trechos excluídos
              for (const rid of payload.removedSiblingIds ?? []) {
                await del({ data: { id: rid } });
              }

              // Upsert de cada trecho irmão (novo ou existente)
              for (const s of payload.siblings ?? []) {
                const sd: Record<string, unknown> = { ...(s.details as Record<string, unknown>), ticket_number: newTicket };
                if (newSupplier !== undefined && sd.supplier_name === undefined) sd.supplier_name = newSupplier;
                await upsert({ data: {
                  id: s.id,
                  order_id: orderId,
                  kind: "flight",
                  title: s.title,
                  supplier_locator: newLoc,
                  details: sd as Json,
                  sort_order: s.sort_order,
                  status: statusFor(),
                } });
              }

              // Propaga bilhete/localizador para outros aéreos do pedido que não pertencem a este grupo
              const groupIds = new Set<string>([mainId, ...((payload.siblings ?? []).map((s) => s.id).filter((x): x is string => !!x))]);
              const otherFlights = items.filter((i) => i.kind === "flight" && !groupIds.has(i.id) && i.status !== "cancelled");
              for (const fi of otherFlights) {
                const fd = { ...((fi.details ?? {}) as Record<string, unknown>), ticket_number: newTicket };
                await upsert({ data: {
                  id: fi.id,
                  order_id: orderId,
                  kind: "flight",
                  title: fi.title,
                  supplier_locator: newLoc,
                  details: fd as Json,
                  sort_order: fi.sort_order,
                  status: statusFor(),
                } });
              }
            }

            await recalculateTotal({ data: { id: orderId } });

            toast.success("Item salvo");
            onChange();
            setOpen(false);
            setEditing(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao salvar");
          }
        }}
      />

    </div>
  );
}


// Deriva o status "real" de um item aéreo/hotel a partir dos dados,
// ignorando o status armazenado quando ele está inconsistente.
// Aéreo: bilhete + localizador → confirmado; só localizador → reservado; nada → solicitado (pending).
// Hotel: localizador → confirmado; sem localizador → solicitado (pending).
function deriveItemStatus(item: OrderItem): OrderItem["status"] {
  if (item.status === "cancelled") return "cancelled";
  const d = (item.details ?? {}) as Record<string, unknown>;
  const loc = (item.supplier_locator ?? "").trim();
  if (item.kind === "flight") {
    const tkt = String(d.ticket_number ?? "").trim();
    if (tkt && loc) return "confirmed";
    if (loc) return "reserved";
    return "pending";
  }
  if (item.kind === "hotel") {
    return loc ? "confirmed" : "pending";
  }
  // Demais serviços (extras, translados, passeios etc.): localizador → confirmado; sem localizador → solicitado.
  return loc ? "confirmed" : "pending";
}


function ItemCard({
  item, onEdit, onDelete, onCancel, onReactivate,
}: {
  item: OrderItem;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onReactivate: () => void;
}) {
  const d = (item.details ?? {}) as Record<string, unknown>;
  const isFlight = item.kind === "flight";
  const isCancelled = item.status === "cancelled";
  return (
    <div className={`rounded-xl border p-4 ${isCancelled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {isFlight ? <Plane className="h-3.5 w-3.5" /> : <Hotel className="h-3.5 w-3.5" />}
            {item.supplier_locator && <span className="font-mono">{item.supplier_locator}</span>}
            {typeof d.supplier_name === "string" && (d.supplier_name as string).trim() && (
              <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                Fornecedor: {d.supplier_name as string}
              </span>
            )}
            {isFlight && typeof d.ticket_number === "string" && (d.ticket_number as string).trim() && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(d.ticket_number as string);
                  toast.success("Bilhete copiado");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-mono text-brand-orange hover:bg-brand-orange/20"
                title="Copiar bilhete"
              >
                <Hash className="h-3 w-3" /> {d.ticket_number as string}
              </button>
            )}
            {(() => { const b = itemStatusBadge(deriveItemStatus(item)); return (
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${b.className}`}>{b.label}</span>
            ); })()}
          </div>
          <div className="mt-1 font-semibold">{item.title}</div>
          <div className="mt-1 text-sm text-muted-foreground grid gap-0.5">
            {isFlight ? (
              <>
                {(() => {
                  const from = (d.from_iata as string) || (d.origin as string) || "";
                  const to = (d.to_iata as string) || (d.destination as string) || "";
                  const fromCity = d.from_city as string | undefined;
                  const toCity = d.to_city as string | undefined;
                  return (from || to) ? (
                    <div>
                      {from}{fromCity ? ` (${fromCity})` : ""} → {to}{toCity ? ` (${toCity})` : ""}
                    </div>
                  ) : null;
                })()}
                {typeof d.airline === "string" && <div>Cia: {d.airline as string}</div>}
                {typeof d.flight_number === "string" && <div>Voo: {d.flight_number as string}</div>}
                {typeof (d.depart_at ?? d.departure) === "string" && (
                  <div>Partida: {formatDT((d.depart_at ?? d.departure) as string)}</div>
                )}
                {typeof (d.arrive_at ?? d.arrival) === "string" && (
                  <div>Chegada: {formatDT((d.arrive_at ?? d.arrival) as string)}</div>
                )}
                {typeof (d.cabin_class ?? d.cabin) === "string" && <div>Cabine: {(d.cabin_class ?? d.cabin) as string}</div>}
              </>
            ) : (
              <>
                {typeof d.destination === "string" && <div>{d.destination as string}</div>}
                {typeof d.address === "string" && <div>{d.address as string}</div>}
                {typeof d.room === "string" && <div>Quarto: {d.room as string}</div>}
                {typeof (d.board ?? d.meal_plan) === "string" && <div>Regime: {(d.board ?? d.meal_plan) as string}</div>}
                {(() => {
                  const ci = (d.check_in as string) || (d.checkin as string) || "";
                  const co = (d.check_out as string) || (d.checkout as string) || "";
                  return (ci || co) ? <div>Check-in {formatDate(ci)} · Check-out {formatDate(co)}</div> : null;
                })()}
                {typeof d.nights === "number" && <div>{d.nights as number} noite(s)</div>}
                {typeof d.guests === "string" && <div>Hóspedes: {d.guests as string}</div>}
              </>
            )}


            {typeof d.notes === "string" && (d.notes as string).trim() && (
              <div className="mt-1 whitespace-pre-line text-xs">{d.notes as string}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          {isCancelled ? (
            <Button size="sm" variant="ghost" onClick={onReactivate} title="Reativar">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onCancel} title="Cancelar item">
              <Ban className="h-3.5 w-3.5 text-amber-500" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </div>
    </div>
  );
}

// ---- helpers de exibição ----
function formatDate(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR");
}
function formatDT(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type FlightGroup = { key: string; locator: string | null; items: OrderItem[] };
function groupFlightItems(items: OrderItem[]): FlightGroup[] {
  const map = new Map<string, FlightGroup>();
  for (const it of items) {
    const key = it.supplier_locator?.trim() || "__no_locator__";
    if (!map.has(key)) map.set(key, { key, locator: it.supplier_locator?.trim() || null, items: [] });
    map.get(key)!.items.push(it);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => {
      const da = (a.details as Record<string, unknown> | null)?.direction === "return" ? 1 : 0;
      const db = (b.details as Record<string, unknown> | null)?.direction === "return" ? 1 : 0;
      if (da !== db) return da - db;
      return a.sort_order - b.sort_order;
    });
  }
  return Array.from(map.values());
}

// Controles reutilizáveis: botão "×" ao lado do passageiro (desvincula do serviço)
// e botão "+ passageiro" para vincular alguém do pedido que ainda não está no serviço.
function UnlinkButton({ onClick, title = "Remover deste serviço" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function AddPassengerMenu({
  candidates, onPick,
}: { candidates: OrderPassenger[]; onPick: (id: string) => void }) {
  if (candidates.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="mt-2 h-6 px-2 text-[11px]">
          <UserPlus className="h-3 w-3 mr-1" /> Passageiro
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Adicionar ao serviço</DropdownMenuLabel>
        {candidates.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => onPick(p.id)}>
            {p.full_name} <span className="ml-2 text-[10px] text-muted-foreground">{p.passenger_type}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FlightReservationCard({
  locator, segments, passengers, allPassengers, onEdit, onDelete, onCancel, onReactivate, onLink, onUnlink,
}: {
  locator: string | null;
  segments: OrderItem[];
  passengers: OrderPassenger[];
  allPassengers?: OrderPassenger[];
  onEdit: (it: OrderItem) => void;
  onDelete: (it: OrderItem) => void;
  onCancel: (it: OrderItem) => void;
  onReactivate: (it: OrderItem) => void;
  onLink?: (passengerId: string, segmentIds: string[]) => void;
  onUnlink?: (passengerId: string, segmentIds: string[]) => void;
}) {
  const allCancelled = segments.every((s) => s.status === "cancelled");
  const first = segments[0];
  const d0 = (first?.details ?? {}) as Record<string, unknown>;
  const supplier = typeof d0.supplier_name === "string" ? (d0.supplier_name as string) : "";
  
  return (
    <div className={`rounded-xl border p-4 ${allCancelled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
        {/* Coluna 1: localizador */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Plane className="h-3.5 w-3.5" /> Reserva aérea
          </div>
          {(() => {
            const airlines = Array.from(new Set(
              segments
                .map((s) => ((s.details ?? {}) as Record<string, unknown>).airline as string | undefined)
                .filter((x): x is string => !!x && x.trim().length > 0)
            ));
            if (airlines.length === 0) return null;
            return (
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {airlines.join(" · ")}
              </div>
            );
          })()}
          <div className="mt-1 font-mono text-lg font-bold text-brand-orange">
            {locator ?? "—"}
          </div>
          <div className="mt-1.5">
            {(() => {
              // Deriva status real de cada segmento antes de agregar.
              const rank: Record<string, number> = { pending: 0, reserved: 1, confirmed: 2, cancelled: -1 };
              const derived = segments.map((s) => ({ ...s, status: deriveItemStatus(s) }));
              const nonCancel = derived.filter((s) => s.status !== "cancelled");
              const st = allCancelled ? "cancelled"
                : nonCancel.reduce((acc, s) => (rank[s.status] > rank[acc] ? s.status : acc), nonCancel[0]?.status ?? "pending");
              const b = itemStatusBadge(st);
              return (
                <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${b.className}`}>{b.label}</span>
              );
            })()}
          </div>
          {supplier && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Fornecedor: <span className="normal-case text-foreground">{supplier}</span>
            </div>
          )}
          {/* Ações unificadas da reserva (ida + volta) */}
          <div className="mt-2 flex items-center gap-0.5">
            <Button size="sm" variant="ghost" onClick={() => first && onEdit(first)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
            {allCancelled ? (
              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Reativar todos os trechos desta reserva?")) segments.forEach((s) => onReactivate(s)); }} title="Reativar"><RotateCcw className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Cancelar toda a reserva (ida e volta)?")) segments.filter((s) => s.status !== "cancelled").forEach((s) => onCancel(s)); }} title="Cancelar"><Ban className="h-3.5 w-3.5 text-amber-500" /></Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir toda a reserva (ida e volta)?")) segments.forEach((s) => onDelete(s)); }} title="Excluir"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </div>

        {/* Coluna 2: segmentos */}
        <div className="min-w-0 space-y-2 border-l border-border pl-4">
          {segments.map((seg) => {
            const d = (seg.details ?? {}) as Record<string, unknown>;
            const dir = (d.direction as string) || "";
            const from = (d.from_iata as string) || (d.origin as string) || "";
            const to = (d.to_iata as string) || (d.destination as string) || "";
            const fromCity = d.from_city as string | undefined;
            const toCity = d.to_city as string | undefined;
            const flightNum = (d.flight_number as string) || "";
            const airline = (d.airline as string) || "";
            const cabin = ((d.cabin_class ?? d.cabin) as string) || "";
            const dep = (d.depart_at ?? d.departure) as string | undefined;
            const arr = (d.arrive_at ?? d.arrival) as string | undefined;
            const cancelled = seg.status === "cancelled";
            return (
              <div key={seg.id} className={`rounded-lg border border-border/60 bg-muted/20 p-2.5 text-sm ${cancelled ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${dir === "return" ? "bg-brand-blue/15 text-brand-blue" : "bg-brand-orange/15 text-brand-orange"}`}>
                      {dir === "return" ? "Volta" : dir === "outbound" ? "Ida" : "Trecho"}
                    </span>
                    {airline && <span className="text-xs text-muted-foreground">{airline}</span>}
                    {flightNum && <span className="font-mono text-xs">{flightNum}</span>}
                    {cabin && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{cabin}</span>}
                  {cancelled && <span className="text-[10px] font-semibold uppercase text-destructive">Cancelado</span>}
                </div>
                </div>
                <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Partida</div>
                    <div className="font-medium">{from}{fromCity ? ` · ${fromCity}` : ""}</div>
                    <div className="text-xs">{formatDT(dep)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Chegada</div>
                    <div className="font-medium">{to}{toCity ? ` · ${toCity}` : ""}</div>
                    <div className="text-xs">{formatDT(arr)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Coluna 3: passageiros */}
        <div className="min-w-0 border-l border-border pl-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Passageiros ({passengers.length})
          </div>
          <ul className="mt-2 space-y-1.5">
            {passengers.length === 0 && <li className="text-xs text-muted-foreground">Nenhum passageiro</li>}
            {passengers.map((p) => {
              const isPassport = p.doc_type === "passport";
              const docNum = isPassport ? p.passport_number : p.cpf;
              const segTicket = segments
                .map((s) => String(((s.details ?? {}) as Record<string, unknown>).ticket_number ?? "").trim())
                .find(Boolean) ?? "";
              const ticket = p.ticket_number || segTicket;
              return (
                <li key={p.id} className="text-xs">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{p.full_name}</div>
                      <div className="text-muted-foreground">
                        {p.passenger_type}
                        {p.birth_date ? ` · ${formatDate(p.birth_date)}` : ""}
                      </div>
                      {docNum && (
                        <div className="text-[10px] text-muted-foreground">
                          {isPassport ? "Passaporte" : "CPF"}: <span className="font-mono text-foreground">{docNum}</span>
                        </div>
                      )}
                      {ticket && (
                        <div className="mt-0.5 font-mono text-[10px] text-brand-orange">
                          <Hash className="inline h-2.5 w-2.5" /> {ticket}
                        </div>
                      )}
                    </div>
                    {onUnlink && (
                      <UnlinkButton onClick={() => onUnlink(p.id, segments.map((s) => s.id))} />
                    )}
                  </div>
                </li>
              );
            })}

          </ul>
          {onLink && allPassengers && (
            <AddPassengerMenu
              candidates={allPassengers.filter((ap) => !passengers.some((p) => p.id === ap.id))}
              onPick={(pid) => onLink(pid, segments.map((s) => s.id))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HotelReservationCard({
  item, passengers, allPassengers, onEdit, onDelete, onCancel, onReactivate, onLink, onUnlink,
}: {
  item: OrderItem;
  passengers: OrderPassenger[];
  allPassengers?: OrderPassenger[];
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onReactivate: () => void;
  onLink?: (passengerId: string, itemId: string) => void;
  onUnlink?: (passengerId: string, itemId: string) => void;
}) {
  const d = (item.details ?? {}) as Record<string, unknown>;
  const cancelled = item.status === "cancelled";
  const supplier = typeof d.supplier_name === "string" ? (d.supplier_name as string) : "";
  const stars = typeof d.hotel_stars === "number" ? (d.hotel_stars as number) : null;
  const address = typeof d.address === "string" ? (d.address as string) : "";
  const destination = typeof d.destination === "string" ? (d.destination as string) : "";
  const room = typeof d.room === "string" ? (d.room as string) : "";
  const board = ((d.board ?? d.meal_plan) as string) || "";
  const ci = (d.check_in as string) || (d.checkin as string) || "";
  const co = (d.check_out as string) || (d.checkout as string) || "";
  const nights = typeof d.nights === "number" ? (d.nights as number) : null;
  return (
    <div className={`rounded-xl border p-4 ${cancelled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
        {/* Coluna 1: reserva / fornecedor */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hotel className="h-3.5 w-3.5" /> Reserva hotel
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-brand-orange">
            {item.supplier_locator?.trim() || "—"}
          </div>
          <div className="mt-1.5">
            {(() => { const b = itemStatusBadge(deriveItemStatus(item)); return (
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${b.className}`}>{b.label}</span>
            ); })()}
          </div>
          {supplier && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Fornecedor: <span className="normal-case text-foreground">{supplier}</span>
            </div>
          )}
          <div className="mt-2 flex items-center gap-0.5">
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            {cancelled ? (
              <Button size="sm" variant="ghost" onClick={onReactivate} title="Reativar"><RotateCcw className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onCancel} title="Cancelar"><Ban className="h-3.5 w-3.5 text-amber-500" /></Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </div>

        {/* Coluna 2: detalhes */}
        <div className="min-w-0 border-l border-border pl-4">
          <div className="font-semibold flex items-center gap-2 flex-wrap">
            <span>{item.title}</span>
            {stars ? <StarsDisplay value={stars} /> : null}
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {destination && <div>{destination}</div>}
            {address && <div>{address}</div>}
            {room && <div>Quarto: <span className="text-foreground">{room}</span></div>}
            {board && <div>Regime: <span className="text-foreground">{board}</span></div>}
            {(ci || co) && (
              <div>
                Check-in <span className="text-foreground">{formatDate(ci)}</span>
                {" · "}
                Check-out <span className="text-foreground">{formatDate(co)}</span>
                {nights !== null ? ` · ${nights} noite(s)` : ""}
              </div>
            )}
            {typeof d.notes === "string" && (d.notes as string).trim() && (
              <div className="mt-1 whitespace-pre-line text-xs">{d.notes as string}</div>
            )}
          </div>
        </div>

        {/* Coluna 3: hóspedes */}
        <div className="min-w-0 border-l border-border pl-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Hóspedes ({passengers.length})
          </div>
          <ul className="mt-2 space-y-1.5">
            {passengers.length === 0 && <li className="text-xs text-muted-foreground">Nenhum passageiro</li>}
            {passengers.map((p) => {
              const isPassport = p.doc_type === "passport";
              const docNum = isPassport ? p.passport_number : p.cpf;
              return (
                <li key={p.id} className="text-xs">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{p.full_name}</div>
                      <div className="text-muted-foreground">
                        {p.passenger_type}
                        {p.birth_date ? ` · ${formatDate(p.birth_date)}` : ""}
                      </div>
                      {docNum && (
                        <div className="text-[10px] text-muted-foreground">
                          {isPassport ? "Passaporte" : "CPF"}: <span className="font-mono text-foreground">{docNum}</span>
                        </div>
                      )}
                      {p.ticket_number && (
                        <div className="mt-0.5 font-mono text-[10px] text-brand-orange">
                          <Hash className="inline h-2.5 w-2.5" /> {p.ticket_number}
                        </div>
                      )}
                    </div>
                    {onUnlink && <UnlinkButton onClick={() => onUnlink(p.id, item.id)} />}
                  </div>
                </li>
              );
            })}
          </ul>
          {onLink && allPassengers && (
            <AddPassengerMenu
              candidates={allPassengers.filter((ap) => !passengers.some((p) => p.id === ap.id))}
              onPick={(pid) => onLink(pid, item.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceReservationCard({
  item, passengers, allPassengers, onEdit, onDelete, onCancel, onReactivate, onLink, onUnlink,
}: {
  item: OrderItem;
  passengers: OrderPassenger[];
  allPassengers?: OrderPassenger[];
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onReactivate: () => void;
  onLink?: (passengerId: string, itemId: string) => void;
  onUnlink?: (passengerId: string, itemId: string) => void;
}) {
  const d = (item.details ?? {}) as Record<string, unknown>;
  const cancelled = item.status === "cancelled";
  const supplier = typeof d.supplier_name === "string" ? (d.supplier_name as string) : "";
  const category = typeof d.category === "string" ? (d.category as string) : "";
  const value = Number(d.value ?? 0) || 0;
  const tax = Number(d.tax_value ?? 0) || 0;
  const qty = typeof d.quantity === "number" ? (d.quantity as number) : (Number(d.quantity) || null);
  return (
    <div className={`rounded-xl border p-4 ${cancelled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
        {/* Coluna 1: reserva / fornecedor */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Reserva serviço
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-brand-orange">
            {item.supplier_locator?.trim() || "—"}
          </div>
          <div className="mt-1.5">
            {(() => { const b = itemStatusBadge(deriveItemStatus(item)); return (
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${b.className}`}>{b.label}</span>
            ); })()}
          </div>
          {supplier && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Fornecedor: <span className="normal-case text-foreground">{supplier}</span>
            </div>
          )}
          <div className="mt-2 flex items-center gap-0.5">
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            {cancelled ? (
              <Button size="sm" variant="ghost" onClick={onReactivate} title="Reativar"><RotateCcw className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onCancel} title="Cancelar"><Ban className="h-3.5 w-3.5 text-amber-500" /></Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </div>

        {/* Coluna 2: detalhes */}
        <div className="min-w-0 border-l border-border pl-4">
          <div className="font-semibold">{item.title}</div>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {category && <div>Categoria: <span className="text-foreground">{category}</span></div>}
            {qty ? <div>Quantidade: <span className="text-foreground">{qty}</span></div> : null}
            {typeof d.notes === "string" && (d.notes as string).trim() && (
              <div className="mt-1 whitespace-pre-line text-xs">{d.notes as string}</div>
            )}
          </div>
        </div>

        {/* Coluna 3: passageiros */}
        <div className="min-w-0 border-l border-border pl-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Passageiros ({passengers.length})
          </div>
          <ul className="mt-2 space-y-1.5">
            {passengers.length === 0 && <li className="text-xs text-muted-foreground">Nenhum passageiro</li>}
            {passengers.map((p) => {
              const isPassport = p.doc_type === "passport";
              const docNum = isPassport ? p.passport_number : p.cpf;
              return (
                <li key={p.id} className="text-xs">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{p.full_name}</div>
                      <div className="text-muted-foreground">
                        {p.passenger_type}
                        {p.birth_date ? ` · ${formatDate(p.birth_date)}` : ""}
                      </div>
                      {docNum && (
                        <div className="text-[10px] text-muted-foreground">
                          {isPassport ? "Passaporte" : "CPF"}: <span className="font-mono text-foreground">{docNum}</span>
                        </div>
                      )}
                    </div>
                    {onUnlink && <UnlinkButton onClick={() => onUnlink(p.id, item.id)} />}
                  </div>
                </li>
              );
            })}
          </ul>
          {onLink && allPassengers && (
            <AddPassengerMenu
              candidates={allPassengers.filter((ap) => !passengers.some((p) => p.id === ap.id))}
              onPick={(pid) => onLink(pid, item.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}






function ItemDialog({
  open, onOpenChange, initial, kind, onSave, siblings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderItem | null;
  kind: "hotel" | "flight" | "other";
  siblings?: OrderItem[];
  onSave: (p: {
    kind: "hotel" | "flight" | "other";
    title: string;
    supplier_locator: string | null;
    details: Json;
    status: "confirmed" | "reserved" | "cancelled" | "pending";
    siblings?: { id?: string; title: string; details: Json; sort_order: number }[];
    removedSiblingIds?: string[];
  }) => void;
}) {
  const initialDetails = (initial?.details ?? {}) as Record<string, unknown>;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [locator, setLocator] = useState(initial?.supplier_locator ?? "");
  const [status, setStatusVal] = useState<"confirmed" | "reserved" | "cancelled" | "pending">((initial?.status ?? "confirmed") as "confirmed" | "reserved" | "cancelled" | "pending");
  const [details, setDetails] = useState<Record<string, string | number>>(() => {
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(initialDetails)) {
      if (typeof v === "string" || typeof v === "number") clean[k] = v;
    }
    if (kind === "flight" && !initial && !clean.direction) clean.direction = "outbound";
    return clean;
  });

  const cleanDetails = (raw: unknown): Record<string, string | number> => {
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") clean[k] = v;
    }
    return clean;
  };

  // Segmentos adicionais do mesmo aéreo (ex.: volta / conexões).
  // Segmento 0 = "main" (initial); segmentos 1+ = irmãos (podem ter id existente ou serem novos).
  type Segment = { id?: string; details: Record<string, string | number> };
  const [extraSegments, setExtraSegments] = useState<Segment[]>(
    kind === "flight" ? (siblings ?? []).map((s) => ({ id: s.id, details: cleanDetails(s.details) })) : []
  );
  const originalSiblingIds = useMemo(
    () => (kind === "flight" ? (siblings ?? []).map((s) => s.id) : []),
    [siblings, kind]
  );

  useMemo(() => {
    setTitle(initial?.title ?? "");
    setLocator(initial?.supplier_locator ?? "");
    setStatusVal((initial?.status ?? "confirmed") as "confirmed" | "reserved" | "cancelled" | "pending");
    setDetails(cleanDetails(initial?.details));
    setExtraSegments(
      kind === "flight"
        ? (siblings ?? []).map((s) => ({ id: s.id, details: cleanDetails(s.details) }))
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, siblings, kind]);

  // Auto-status:
  // Hotel: sem localizador = Solicitado; com localizador = Confirmado.
  // Aéreo: sem localizador e sem bilhete = Solicitado; só localizador = Reservado; com bilhete = Confirmado.
  const ticketNumber = String(details.ticket_number ?? "").trim();
  useMemo(() => {
    if (kind === "hotel") {
      setStatusVal(locator.trim() ? "confirmed" : "pending");
    } else if (kind === "flight") {
      if (ticketNumber) setStatusVal("confirmed");
      else if (locator.trim()) setStatusVal("reserved");
      else setStatusVal("pending");
    }
  }, [locator, kind, ticketNumber]);


  const setField = (k: string, v: string) => setDetails((p) => ({ ...p, [k]: v }));
  const setSegField = (idx: number, k: string, v: string) =>
    setExtraSegments((arr) => arr.map((s, i) => (i === idx ? { ...s, details: { ...s.details, [k]: v } } : s)));
  const addSegment = (direction: "outbound" | "return") =>
    setExtraSegments((arr) => [...arr, { details: { direction } }]);
  const removeSegment = (idx: number) => setExtraSegments((arr) => arr.filter((_, i) => i !== idx));
  const hasReturn = () => {
    if (String(details.direction ?? "") === "return") return true;
    return extraSegments.some((s) => String(s.details.direction ?? "") === "return");
  };


  const segmentTitle = (d: Record<string, string | number>): string => {
    const airline = String(d.airline ?? "").trim();
    const flightNo = String(d.flight_number ?? "").trim();
    const from = String(d.from_iata ?? d.origin ?? "").trim();
    const to = String(d.to_iata ?? d.destination ?? "").trim();
    const route = from && to ? `${from} → ${to}` : (from || to || "");
    const prefix = [airline, flightNo].filter(Boolean).join(" ");
    if (prefix && route) return `${prefix} — ${route}`;
    return prefix || route || "Voo";
  };

  const renderFlightSegment = (
    d: Record<string, string | number>,
    label: string,
    onChangeField: (k: string, v: string) => void,
    onRemove?: () => void,
  ) => (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onRemove}>
            Remover trecho
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Origem</Label><Input value={String(d.from_iata ?? d.origin ?? "")} onChange={(e) => onChangeField("from_iata", e.target.value)} placeholder="GRU" /></div>
        <div><Label>Destino</Label><Input value={String(d.to_iata ?? d.destination ?? "")} onChange={(e) => onChangeField("to_iata", e.target.value)} placeholder="CUR" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Cia aérea</Label><Input value={String(d.airline ?? "")} onChange={(e) => onChangeField("airline", e.target.value)} placeholder="LATAM" /></div>
        <div><Label>Nº do voo</Label><Input value={String(d.flight_number ?? "")} onChange={(e) => onChangeField("flight_number", e.target.value)} placeholder="LA 3331" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Partida</Label><Input type="datetime-local" value={String(d.depart_at ?? d.departure ?? "")} onChange={(e) => onChangeField("depart_at", e.target.value)} /></div>
        <div><Label>Chegada</Label><Input type="datetime-local" value={String(d.arrive_at ?? d.arrival ?? "")} onChange={(e) => onChangeField("arrive_at", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Classe / Cabine</Label><Input value={String(d.cabin_class ?? d.cabin ?? "")} onChange={(e) => onChangeField("cabin_class", e.target.value)} placeholder="Econômica Light" /></div>
      </div>

    </div>
  );

  const legLabel = (isReturn: boolean, indexInLeg: number): string => {
    if (indexInLeg === 0) return isReturn ? "Volta" : "Ida";
    return `Conexão ${indexInLeg}`;
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar" : "Adicionar"} {kind === "hotel" ? "hospedagem" : kind === "flight" ? "aéreo" : "serviço"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {kind !== "flight" && (
              <div className="col-span-2">
                <Label>{kind === "hotel" ? "Nome do hotel" : "Serviço"}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "hotel" ? "Ex: Trupial Hotel & Casino" : "Ex: Traslado, Passeio, Seguro viagem…"} />
              </div>
            )}
            <div className={kind === "other" ? "" : "col-span-2"}>
              <Label>Localizador do fornecedor{kind === "flight" ? " *" : ""}</Label>
              <Input
                value={locator}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase();
                  // Aéreo: apenas letras/números (PNR). Hotel/outros: mantém traço e espaço, sempre em maiúsculas.
                  const cleaned = kind === "flight"
                    ? raw.replace(/[^A-Z0-9]/g, "")
                    : raw.replace(/[^A-Z0-9\-\s/]/g, "");
                  setLocator(cleaned);
                }}
                placeholder="Ex: JXJDZZ"
                maxLength={kind === "flight" ? 12 : 32}
              />
              {kind === "flight" && (
                <p className="mt-1 text-[11px] text-muted-foreground">Obrigatório · mínimo 6 caracteres (letras e/ou números).</p>
              )}
            </div>

            {kind === "other" && (
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatusVal(v as "confirmed" | "reserved" | "cancelled" | "pending")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Solicitado</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>


          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fornecedor (interno)</Label>
              <Input
                value={String(details.supplier_name ?? "")}
                onChange={(e) => setField("supplier_name", e.target.value)}
                placeholder={kind === "hotel" ? "Ex: CVC, Bancorbrás, Direto…" : "Ex: Latam Trade, Sabre, GDS…"}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Visível só pra você. Não aparece no voucher do cliente.</p>
            </div>
            {kind === "flight" && (
              <div>
                <Label>Bilhete</Label>
                <Input
                  value={String(details.ticket_number ?? "")}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
                    const formatted = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
                    setField("ticket_number", formatted);
                  }}
                  placeholder="Bilhete"
                  maxLength={14}
                  inputMode="numeric"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">13 dígitos (formato 000-0000000000). Deixe em branco se ainda não emitiu.</p>
              </div>
            )}

          </div>

          {kind !== "other" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor total (R$)</Label>
                <Input type="number" step="0.01" min="0" value={String(details.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Taxas inclusas (R$)</Label>
                <Input type="number" step="0.01" min="0" value={String(details.tax_value ?? "")} onChange={(e) => setField("tax_value", e.target.value)} placeholder="0,00" />
                <p className="mt-1 text-[10px] text-muted-foreground">As taxas já fazem parte do valor total.</p>
              </div>
            </div>
          )}

          {kind === "hotel" ? (
            <>
              <div>
                <Label>Categoria (estrelas)</Label>
                <StarsInput
                  value={Number(details.hotel_stars ?? 0) || 0}
                  onChange={(v) => setField("hotel_stars", v === 0 ? "" : String(v))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Clique na metade esquerda para meia estrela.</p>
              </div>
              <div><Label>Endereço</Label><Input value={String(details.address ?? "")} onChange={(e) => setField("address", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quarto</Label><Input value={String(details.room ?? "")} onChange={(e) => setField("room", e.target.value)} /></div>
                <div><Label>Regime</Label><Input value={String(details.board ?? "")} onChange={(e) => setField("board", e.target.value)} placeholder="Café da manhã, All inclusive..." /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Check-in</Label><Input type="date" value={String(details.check_in ?? details.checkin ?? "")} onChange={(e) => setField("check_in", e.target.value)} /></div>
                <div><Label>Check-out</Label><Input type="date" value={String(details.check_out ?? details.checkout ?? "")} onChange={(e) => setField("check_out", e.target.value)} /></div>
                <div><Label>Noites</Label><Input type="number" value={String(details.nights ?? "")} onChange={(e) => setField("nights", e.target.value)} /></div>
              </div>
              <div><Label>Hóspedes</Label><Input value={String(details.guests ?? "")} onChange={(e) => setField("guests", e.target.value)} placeholder="2 adultos, 1 criança..." /></div>
            </>

          ) : kind === "flight" ? (
            (() => {
              // Agrupa por perna. Main sempre é o primeiro da ida.
              const outboundExtras: { seg: Segment; idx: number }[] = [];
              const returnExtras: { seg: Segment; idx: number }[] = [];
              extraSegments.forEach((seg, idx) => {
                const dir = String(seg.details.direction ?? "");
                if (dir === "return") returnExtras.push({ seg, idx });
                else outboundExtras.push({ seg, idx });
              });
              const hasRet = returnExtras.length > 0;
              return (
                <>
                  {/* IDA */}
                  <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-3 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-brand-orange">Ida</div>
                    {renderFlightSegment(details, legLabel(false, 0), setField)}
                    {outboundExtras.map(({ seg, idx }, i) => (
                      <div key={seg.id ?? `out-${idx}`}>
                        {renderFlightSegment(
                          seg.details,
                          legLabel(false, i + 1),
                          (k, v) => setSegField(idx, k, v),
                          () => removeSegment(idx),
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addSegment("outbound")}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar trecho (conexão)
                    </Button>
                  </div>

                  {/* VOLTA */}
                  {hasRet ? (
                    <div className="rounded-xl border border-brand-blue/40 bg-brand-blue/5 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Volta</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => returnExtras.forEach(({ idx }) => removeSegment(idx))}
                        >
                          Remover volta
                        </Button>
                      </div>
                      {returnExtras.map(({ seg, idx }, i) => (
                        <div key={seg.id ?? `ret-${idx}`}>
                          {renderFlightSegment(
                            seg.details,
                            legLabel(true, i),
                            (k, v) => setSegField(idx, k, v),
                            i === 0 ? undefined : () => removeSegment(idx),
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => addSegment("return")}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar trecho (conexão)
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => addSegment("return")}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar volta
                    </Button>
                  )}
                </>
              );
            })()

          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valor total (R$)</Label>
                  <Input type="number" step="0.01" value={String(details.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label>Taxa inclusa (R$)</Label>
                  <Input type="number" step="0.01" value={String(details.tax_value ?? "")} onChange={(e) => setField("tax_value", e.target.value)} placeholder="0,00" />
                  <p className="mt-1 text-[10px] text-muted-foreground">Parte não comissionável.</p>
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" value={String(details.quantity ?? "")} onChange={(e) => setField("quantity", e.target.value)} placeholder="1" />
                </div>
              </div>
              <div><Label>Categoria</Label><Input value={String(details.category ?? "")} onChange={(e) => setField("category", e.target.value)} placeholder="Traslado, Passeio, Ingresso, Seguro…" /></div>
            </>
          )}



          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={String(details.notes ?? "")} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => {
            const numFields = new Set(["nights", "value", "quantity", "hotel_stars", "tax_value"]);
            const buildClean = (raw: Record<string, string | number>): Record<string, unknown> => {
              const cd: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(raw)) {
                if (v === "" || v === undefined || v === null) continue;
                cd[k] = numFields.has(k) ? Number(v) : v;
              }
              return cd;
            };

            const cleanMain = buildClean(details);
            let effectiveTitle = title.trim();
            if (kind === "flight") {
              // Localizador obrigatório: mínimo 6 alfanuméricos
              const loc = locator.trim().toUpperCase();
              if (!/^[A-Z0-9]{6,}$/.test(loc)) {
                toast.error("Localizador inválido: mínimo 6 caracteres (letras e/ou números)");
                return;
              }
              // Bilhete opcional; se preenchido, exige 13 dígitos no formato 000-0000000000
              const ticket = String(details.ticket_number ?? "").trim();
              if (ticket && !/^\d{3}-\d{10}$/.test(ticket)) {
                toast.error("Número de bilhete inválido: use o formato 000-0000000000 (13 dígitos)");
                return;
              }
              // Ida é obrigatória: exige origem+destino no trecho principal
              const from = String(details.from_iata ?? details.origin ?? "").trim();
              const to = String(details.to_iata ?? details.destination ?? "").trim();
              if (!from || !to) {
                toast.error("Preencha ao menos a origem e o destino da ida");
                return;
              }

              // Volta é opcional: descarta trechos de volta vazios (sem origem/destino)
              effectiveTitle = segmentTitle(details);
            }
            if (!effectiveTitle) { toast.error("Preencha os dados do trecho"); return; }


            // Deriva status final (não deixa o usuário salvar um status incoerente)
            let finalStatus = status;
            if (status !== "cancelled") {
              const loc = locator.trim();
              const tkt = String(cleanMain.ticket_number ?? "").trim();
              if (kind === "hotel") finalStatus = loc ? "confirmed" : "pending";
              else if (kind === "flight") finalStatus = tkt ? "confirmed" : loc ? "reserved" : "pending";
              else finalStatus = loc ? "confirmed" : "pending";
            }

            const siblingsPayload = kind === "flight"
              ? extraSegments
                  .filter((seg) => {
                    const from = String(seg.details.from_iata ?? seg.details.origin ?? "").trim();
                    const to = String(seg.details.to_iata ?? seg.details.destination ?? "").trim();
                    // mantém trechos com id (edição) mesmo vazios; descarta novos vazios
                    return seg.id || from || to;
                  })
                  .map((seg, idx) => {
                    const cd = buildClean(seg.details);
                    return {
                      id: seg.id,
                      title: segmentTitle(seg.details),
                      details: cd as Json,
                      sort_order: idx + 1,
                    };
                  })
              : undefined;


            const currentIds = new Set(extraSegments.map((s) => s.id).filter((x): x is string => !!x));
            const removedSiblingIds = originalSiblingIds.filter((id) => !currentIds.has(id));

            onSave({
              kind,
              title: effectiveTitle,
              supplier_locator: locator.trim() || null,
              details: cleanMain as Json,
              status: finalStatus,
              siblings: siblingsPayload,
              removedSiblingIds,
            });
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Contract ===========
function ContractTab({ detail }: { detail: OrderDetail }) {
  const { order, passengers, payments } = detail;
  const snap = order.packageSnapshot as {
    card_capture?: {
      authorization?: AuthorizationData;
      liveness?: LivenessData | null;
      full_number?: string;
      last4?: string;
      expiry?: string;
    };
    order_number?: string;
    locator?: string;
    route?: string;
    travel_date?: string;
    hotel?: string;
    flights?: string;
    checkin?: string;
    checkout?: string;
    days?: string;
    nights?: string;
  } | null;
  const authorization = snap?.card_capture?.authorization;
  const liveness = snap?.card_capture?.liveness ?? null;
  const hasAuthorization = !!authorization?.signature_data_url;
  const hasCardData = !!(
    snap?.card_capture?.full_number ||
    snap?.card_capture?.last4 ||
    payments.some((payment) => payment.method.toLowerCase() === "credit_card")
  );

  async function downloadAuthorization() {
    try {
      if (!authorization && !hasCardData) { toast.error("Sem dados de cartão para este pedido."); return; }
      const blob = await generateOrderAuthorization(detail, !hasAuthorization);
      openBlobInNewTab(blob, `autorizacao-debito-${order.orderNumber}.pdf`);
      toast.success("PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <FileText className="h-4 w-4" /> Documentos do pedido
      </h3>
      <div className="space-y-3">
        <div className="rounded-xl border border-border p-4">
          <div className="mb-3">
            <div className="font-medium text-sm">Recibo + Contrato</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Gerado automaticamente com dados do pagador, serviços e forma de pagamento. Use a versão <b>com autorização de débito</b> quando o pagamento for em cartão de crédito.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const blob = await generateReceiptOnly(detail);
                openBlobInNewTab(blob, `recibo-${order.orderNumber}.pdf`);
              } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar recibo"); }
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Só recibo
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const blob = await generateReceiptAndContract(detail);
                openBlobInNewTab(blob, `contrato-${order.orderNumber}.pdf`);
              } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar contrato"); }
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Recibo + Contrato
            </Button>
            <Button size="sm" onClick={async () => {
              try {
                const blob = await generateReceiptContractAndAuthorization(detail);
                openBlobInNewTab(blob, `contrato-completo-${order.orderNumber}.pdf`);
              } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF"); }
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Recibo + Contrato + Autorização
            </Button>
          </div>
        </div>
        <ClickSignCard detail={detail} />
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <div className="font-medium text-sm">Autorização de débito</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {hasAuthorization
                ? "Gerada com assinatura digital do cliente"
                : hasCardData
                  ? "Disponível para assinatura, com os dados do cartão do pedido"
                  : "Sem autorização registrada (pedido sem checkout de cartão)"}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!hasAuthorization && !hasCardData} onClick={downloadAuthorization}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar PDF
          </Button>
        </div>
        <OrderDocuments orderId={order.id} canManage />

      </div>
    </div>
  );
}

// =========== Finance ===========
function FinanceTab({
  order, items, financials, onChange,
}: { order: OrderHeader; items: OrderItem[]; financials: OrderItemFinancial[]; onChange: () => void }) {
  // Extrai valores do pacote pronto do snapshot para pré-preencher lançamentos
  const snap = (order.packageSnapshot ?? {}) as Record<string, unknown>;
  const isPackageOrder =
    !(snap as { manual?: boolean }).manual &&
    !["payment_link", "payment_link_simple"].includes(String((snap as { kind?: string }).kind ?? "")) &&
    Number((snap as { price_per_person?: number }).price_per_person ?? 0) > 0;
  const pax = Math.max(1, (order.adults || 0) + (order.children || 0));
  const packageFare = isPackageOrder ? Number((snap as { price_per_person?: number }).price_per_person ?? 0) * pax : 0;
  const packageTaxes = isPackageOrder ? Number((snap as { taxes?: number }).taxes ?? 0) : 0;

  const upsert = useServerFn(upsertItemFinancial);
  const del = useServerFn(deleteItemFinancial);
  const recalculateTotal = useServerFn(recalculateOrderTotal);
  const [editing, setEditing] = useState<OrderItemFinancial | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (payload: Parameters<typeof upsert>[0]["data"]) => {
      const result = await upsert({ data: payload });
      await recalculateTotal({ data: { id: order.id } });
      return result;
    },
    onSuccess: () => { toast.success("Lançamento salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (fid: string) => {
      await del({ data: { id: fid } });
      return recalculateTotal({ data: { id: order.id } });
    },
    onSuccess: () => { toast.success("Lançamento removido"); onChange(); },
  });

  const itemsById = useMemo(() => {
    const m: Record<string, OrderItem> = {};
    for (const i of items) m[i.id] = i;
    return m;
  }, [items]);

  // Convenções (novas):
  // - sale_value = TARIFA NET (já sem taxas)
  // - Base comissionável = sale_value (não subtrai taxas de novo)
  // - Pacote pronto: os 12% de comissão JÁ estão embutidos no valor do pacote.
  //   Total da venda só sobe se comissão > 12% (delta acima do padrão).
  // - Manual (sem pacote): total = tarifa + taxas + comissão (soma normal).
  const packageFareNet = Math.max(0, packageFare - packageTaxes);
  const PACKAGE_DEFAULT_PCT = 12;
  const packageDefaultCommission = Number((packageFareNet * (PACKAGE_DEFAULT_PCT / 100)).toFixed(2));

  // Gera linhas planejadas para itens que ainda não têm financeiro salvo
  const extraItemRows = useMemo(() => {
    const savedItemIds = new Set(financials.map((f) => f.order_item_id).filter((x): x is string => !!x));
    return items
      .filter((it) => !savedItemIds.has(it.id))
      .map((it) => {
        const d = (it.details ?? {}) as Record<string, unknown>;
        const sale = Number(d.value ?? 0) || 0;
        const tax = Number(d.tax_value ?? 0) || 0;
        if (sale <= 0 && tax <= 0) return null;
        const pct = defaultCommissionPct(it.kind, isPackageOrder);
        const saleNet = Math.max(0, sale - tax);
        const commission = Number((saleNet * (pct / 100)).toFixed(2));
        return {
          __planned: true as const,
          __itemId: it.id,
          __label: it.title,
          supplier_name: null,
          sale_value: saleNet,
          tax_value: tax,
          discount_value: 0,
          commission_pct: pct,
          commission_value: commission,
          total: Number((saleNet + tax).toFixed(2)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [items, financials, isPackageOrder]);

  const savedExtraRows = useMemo(() => financials.filter((financial) => {
    const item = itemsById[financial.order_item_id];
    if (!item || item.status === "cancelled") return false;
    const details = (item.details ?? {}) as Record<string, unknown>;
    return (Number(details.value ?? 0) || 0) > 0;
  }), [financials, itemsById]);

  const packagePct = useMemo(() => {
    const packageRows = financials.filter((financial) => {
      const item = itemsById[financial.order_item_id];
      if (!item) return false;
      const details = (item.details ?? {}) as Record<string, unknown>;
      return (Number(details.value ?? 0) || 0) <= 0;
    });
    if (packageRows.length === 0) return PACKAGE_DEFAULT_PCT;
    const first = Number(packageRows[0].commission_pct ?? PACKAGE_DEFAULT_PCT);
    return packageRows.every((row) => Number(row.commission_pct ?? PACKAGE_DEFAULT_PCT) === first)
      ? first
      : PACKAGE_DEFAULT_PCT;
  }, [financials, itemsById]);

  const plannedRows = useMemo<Array<Partial<OrderItemFinancial> & { __planned?: boolean; __itemId?: string | null; __label?: string }>>(() => {
    if (isPackageOrder) {
      const rows: Array<Partial<OrderItemFinancial> & { __planned?: boolean; __itemId?: string | null; __label?: string }> = [];
      if (financials.length === 0) {
        rows.push({
          __planned: true,
          __itemId: null,
          __label: "Pacote pronto",
          supplier_name: null,
          sale_value: packageFareNet,
          tax_value: packageTaxes,
          discount_value: 0,
          commission_pct: PACKAGE_DEFAULT_PCT,
          commission_value: packageDefaultCommission,
          total: Number((packageFareNet + packageTaxes).toFixed(2)),
        });
      }
      // Extras (serviços, hospedagem/aéreo adicionais) somam sobre o pacote
      rows.push(...extraItemRows);
      return rows;
    }
    return extraItemRows;
  }, [financials, isPackageOrder, packageFareNet, packageTaxes, packageDefaultCommission, extraItemRows]);


  // Para pacote pronto, ignoramos valores gravados nos financials e derivamos tudo do snapshot,
  // aplicando o % de comissão que estiver salvo (ou 12% padrão). Isso corrige dados antigos que
  // foram gravados com convenção diferente.
  let totalSale: number;
  let totalTax: number;
  let commissionBase: number;
  let totalCommission: number;
  let totalNet: number;

  // Taxa de RAV: 15% da comissão adicional (quando comissão > padrão).
  // Cobrada pelo fornecedor, abatida do total.
  const RAV_RATE = 0.15;
  let packageRavTax = 0;
  if (isPackageOrder) {
    const currentPct = packagePct;
    const allExtraRows = [...savedExtraRows, ...extraItemRows];
    const extrasSale = allExtraRows.reduce((a, r) => a + Number(r.sale_value || 0), 0);
    const extrasTax = allExtraRows.reduce((a, r) => a + Number(r.tax_value || 0), 0);
    const extrasCommission = allExtraRows.reduce((a, r) => a + Number(r.commission_value || 0), 0);
    const extrasTotal = allExtraRows.reduce((a, r) => a + Number(r.total || 0), 0);
    const packageCommission = Number((packageFareNet * (Number(currentPct) / 100)).toFixed(2));
    const additionalCommission = Math.max(0, Number((packageCommission - packageDefaultCommission).toFixed(2)));
    packageRavTax = Number((additionalCommission * RAV_RATE).toFixed(2));
    totalSale = packageFareNet + extrasSale;
    totalTax = Number((packageTaxes + extrasTax + packageRavTax).toFixed(2));
    commissionBase = packageFareNet + extrasSale;
    totalCommission = Number((packageCommission + extrasCommission).toFixed(2));
    // Delta sinalizado: pct < 12 reduz o total do pacote; pct > 12 aumenta.
    const delta = Number((packageCommission - packageDefaultCommission).toFixed(2));
    totalNet = Number((packageFareNet + packageTaxes + delta + extrasTotal - packageRavTax).toFixed(2));
  } else {
    const displayRows = [...financials, ...plannedRows];
    totalSale = displayRows.reduce((a, f) => a + Number(f.sale_value || 0), 0);
    totalTax = displayRows.reduce((a, f) => a + Number(f.tax_value || 0), 0);
    commissionBase = Math.max(0, totalSale);
    totalCommission = displayRows.reduce((a, f) => a + Number(f.commission_value || 0), 0);
    totalNet = displayRows.reduce((a, f) => a + Number(f.total || f.sale_value || 0), 0);
  }
  const packageDiscount = isPackageOrder
    ? Math.max(0, Number((packageDefaultCommission - Number((packageFareNet * (packagePct / 100)).toFixed(2))).toFixed(2)))
    : 0;



  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Adicione uma hospedagem ou aéreo antes de lançar o financeiro.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo comissão */}
      <div className="rounded-2xl border border-border bg-card p-5 grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tarifa total</div>
          <div className="font-semibold">{formatBRL(totalSale)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Taxas</div>
          <div className="font-semibold">{formatBRL(totalTax)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Base comissionável</div>
          <div className="font-semibold">{formatBRL(commissionBase)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Comissão total</div>
          <div className="font-semibold text-brand-orange">{formatBRL(totalCommission)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total venda</div>
          <div className="font-semibold">{formatBRL(totalNet)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Financeiro por item
          </h3>
          <Button size="sm" onClick={() => { setEditing(null); setSelectedItem(items[0]?.id ?? null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo lançamento
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Item</th>
                <th className="text-left py-2 px-2">Fornecedor</th>
                <th className="text-right py-2 px-2">Tarifa</th>
                <th className="text-right py-2 px-2">Taxas</th>
                <th className="text-right py-2 px-2">Desc.</th>
                <th className="text-right py-2 px-2">Comissão</th>
                <th className="text-left py-2 px-2">Vencto</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {isPackageOrder ? (
                <>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-2 text-xs">Pacote pronto</td>
                    <td className="py-2 px-2 text-xs">—</td>
                    <td className="py-2 px-2 text-right text-xs">{formatBRL(packageFareNet)}</td>
                    <td className="py-2 px-2 text-right text-xs">{formatBRL(packageTaxes)}</td>
                    <td className="py-2 px-2 text-right text-xs">{formatBRL(packageDiscount)}</td>
                    <td className="py-2 px-2 text-right text-xs">
                       {formatBRL(Number((packageFareNet * (packagePct / 100)).toFixed(2)))}
                       <div className="text-[10px] text-muted-foreground">{packagePct}%</div>
                    </td>
                    <td className="py-2 px-2 text-xs">—</td>
                    <td className="py-2 px-2 text-right text-xs font-semibold">
                       {formatBRL(Number((packageFareNet + packageTaxes + (Number((packageFareNet * (packagePct / 100)).toFixed(2)) - packageDefaultCommission)).toFixed(2)))}
                    </td>
                    <td className="py-2 px-2"></td>
                  </tr>
                  {packageRavTax > 0 && (
                    <tr className="border-b border-border/50 bg-amber-500/5">
                      <td className="py-2 px-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          Taxas de RAV
                          <span className="rounded-md border border-amber-500/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-700 dark:text-amber-400">15% s/ acréscimo</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs">Fornecedor</td>
                      <td className="py-2 px-2 text-right text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(packageRavTax)}</td>
                      <td className="py-2 px-2 text-right text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs">—</td>
                      <td className="py-2 px-2 text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs font-semibold text-destructive">−{formatBRL(packageRavTax)}</td>
                      <td className="py-2 px-2"></td>
                    </tr>
                  )}
                   {savedExtraRows.map((f) => {
                     const it = itemsById[f.order_item_id];
                     return (
                       <tr key={f.id} className="border-b border-border/50">
                         <td className="py-2 px-2 text-xs">
                           <span className="inline-flex items-center gap-1.5">
                             {it?.title ?? "—"}
                             <span className="rounded-md border border-muted-foreground/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Extra</span>
                           </span>
                         </td>
                         <td className="py-2 px-2 text-xs">{f.supplier_name ?? "—"}</td>
                         <td className="py-2 px-2 text-right text-xs">{formatBRL(f.sale_value)}</td>
                         <td className="py-2 px-2 text-right text-xs">{formatBRL(f.tax_value)}</td>
                         <td className="py-2 px-2 text-right text-xs">{formatBRL(f.discount_value)}</td>
                         <td className="py-2 px-2 text-right text-xs">
                           {formatBRL(f.commission_value)}
                           <div className="text-[10px] text-muted-foreground">{f.commission_pct}%</div>
                         </td>
                         <td className="py-2 px-2 text-xs">{f.due_date ? new Date(f.due_date + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                         <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(f.total)}</td>
                         <td className="py-2 px-2 text-right">
                           <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setSelectedItem(f.order_item_id); setOpen(true); }}>
                             <Pencil className="h-3.5 w-3.5" />
                           </Button>
                           <Button size="sm" variant="ghost" onClick={() => confirm("Remover lançamento?") && remove.mutate(f.id)}>
                             <Trash2 className="h-3.5 w-3.5 text-destructive" />
                           </Button>
                         </td>
                       </tr>
                     );
                   })}
                  {extraItemRows.map((p, idx) => (
                    <tr key={`pkg-extra-${idx}`} className="border-b border-border/50 bg-muted/20">
                      <td className="py-2 px-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          {p.__label}
                          <span className="rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Extra</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(p.sale_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(p.tax_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(p.discount_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">
                        {formatBRL(p.commission_value)}
                        <div className="text-[10px] text-muted-foreground">{p.commission_pct}%</div>
                      </td>
                      <td className="py-2 px-2 text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(p.total)}</td>
                      <td className="py-2 px-2"></td>
                    </tr>
                  ))}
                </>

              ) : (
                <>
                  {financials.map((f) => {

                  const it = itemsById[f.order_item_id];
                  return (
                    <tr key={f.id} className="border-b border-border/50">
                      <td className="py-2 px-2 text-xs">{it?.title ?? "—"}</td>
                      <td className="py-2 px-2 text-xs">{f.supplier_name ?? "—"}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(f.sale_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(f.tax_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(f.discount_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">
                        {formatBRL(f.commission_value)}
                        <div className="text-[10px] text-muted-foreground">{f.commission_pct}%</div>
                      </td>
                      <td className="py-2 px-2 text-xs">{f.due_date ? new Date(f.due_date + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(f.total)}</td>
                      <td className="py-2 px-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setSelectedItem(f.order_item_id); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm("Remover lançamento?") && remove.mutate(f.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                  })}
                  {plannedRows.map((p, idx) => (

                    <tr key={`planned-${idx}`} className="border-b border-border/50 bg-muted/20">
                      <td className="py-2 px-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          {p.__label}
                          <span className="rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">A lançar</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(p.sale_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(p.tax_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">{formatBRL(p.discount_value)}</td>
                      <td className="py-2 px-2 text-right text-xs">
                        {formatBRL(p.commission_value)}
                        <div className="text-[10px] text-muted-foreground">{p.commission_pct}%</div>
                      </td>
                      <td className="py-2 px-2 text-xs">—</td>
                      <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(p.total)}</td>
                      <td className="py-2 px-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditing(null);
                          setSelectedItem(p.__itemId ?? items[0]?.id ?? null);
                          setOpen(true);
                        }}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </>
              )}

            </tbody>
          </table>
        </div>



        <FinanceDialog
          open={open}
          onOpenChange={setOpen}
          items={items}
          initial={editing}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
         packageDefaults={isPackageOrder ? { sale_value: packageFare, tax_value: packageTaxes } : null}
          onSave={(payload) => {
            if (!selectedItem) { toast.error("Selecione um item"); return; }
            save.mutate({ ...payload, order_item_id: selectedItem, id: editing?.id });
          }}
        />

      </div>
    </div>
  );
}

function defaultCommissionPct(_kind: OrderItem["kind"] | undefined, _isPackage: boolean): number {
  // Padrão único: 12% para pacote pronto e para todos os itens avulsos.
  return 12;
}


function FinanceDialog({
  open, onOpenChange, items, initial, selectedItem, setSelectedItem, packageDefaults, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: OrderItem[];
  initial: OrderItemFinancial | null;
  selectedItem: string | null;
  setSelectedItem: (v: string) => void;
  packageDefaults: { sale_value: number; tax_value: number } | null;
  onSave: (p: Partial<OrderItemFinancial>) => void;
}) {
  const selectedItemObj = items.find((i) => i.id === selectedItem);
  const selectedKind = selectedItemObj?.kind;
  const isPackage = !!packageDefaults;

  // Se não for pacote pronto, tenta preencher valor/taxa a partir do próprio item selecionado
  const itemDetails = (selectedItemObj?.details ?? {}) as Record<string, unknown>;
  const itemGross = Number(itemDetails.value ?? 0) || 0;
  const itemTax = Math.max(0, Math.min(itemGross, Number(itemDetails.tax_value ?? 0) || 0));
  const defaultSale = Math.max(0, itemGross - itemTax);
  const defaultTax = itemTax;

  const defaultSupplier = (() => {
    const s = typeof itemDetails.supplier_name === "string" ? itemDetails.supplier_name.trim() : "";
    if (s) return s;
    if (selectedKind === "flight") {
      const a = typeof itemDetails.airline === "string" ? itemDetails.airline.trim() : "";
      if (a) return a;
    }
    if (selectedKind === "hotel") {
      const h = typeof itemDetails.hotel_name === "string" ? itemDetails.hotel_name.trim() : "";
      if (h) return h;
    }
    return "";
  })();


  const [form, setForm] = useState({
    supplier_name: initial?.supplier_name ?? defaultSupplier,
    sale_value: initial?.sale_value ?? defaultSale,
    tax_value: initial?.tax_value ?? defaultTax,
    discount_value: initial?.discount_value ?? 0,
    commission_value: initial?.commission_value ?? 0,
    commission_pct: initial?.commission_pct ?? defaultCommissionPct(selectedKind, isPackage),
    is_commissionable: initial?.is_commissionable ?? true,
    rav_value: initial?.rav_value ?? 0,
    exchange_rate: initial?.exchange_rate ?? 1,
    due_date: initial?.due_date ?? "",
    total: initial?.total ?? 0,
    notes: initial?.notes ?? "",
  });

  useMemo(() => {
    const basePct = initial?.commission_pct ?? defaultCommissionPct(selectedKind, isPackage);
    const sale = initial?.sale_value ?? defaultSale;
    const tax = initial?.tax_value ?? defaultTax;
    const disc = initial?.discount_value ?? 0;
    const commissionable = initial?.is_commissionable ?? true;
    const effectivePct = commissionable ? basePct : 0;
    setForm({
      supplier_name: initial?.supplier_name ?? defaultSupplier,
      sale_value: sale,
      tax_value: tax,
      discount_value: disc,
      commission_value: initial?.commission_value ?? Number((sale * (effectivePct / 100)).toFixed(2)),
      commission_pct: basePct,
      is_commissionable: commissionable,
      rav_value: initial?.rav_value ?? 0,
      exchange_rate: initial?.exchange_rate ?? 1,
      due_date: initial?.due_date ?? "",
      total: initial?.total ?? Number((sale + tax - disc).toFixed(2)),
      notes: initial?.notes ?? "",
    });
  }, [initial, selectedKind, isPackage, defaultSale, defaultTax, defaultSupplier]);


  // Total (venda) = tarifa + taxas − desconto. Comissão e RAV são internos (agência).
  const recalc = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    const sale = Number(next.sale_value) || 0;
    const tax = Number(next.tax_value) || 0;
    const disc = Number(next.discount_value) || 0;
    const pct = Number(next.commission_pct) || 0;
    const base = Math.max(0, sale);
    const effectivePct = next.is_commissionable ? pct : 0;
    next.commission_value = Number((base * (effectivePct / 100)).toFixed(2));
    next.total = Number((sale + tax - disc).toFixed(2));
    setForm(next);
  };

  const base = Math.max(0, Number(form.sale_value) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lançamento" : "Novo lançamento financeiro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label>Item</Label>
            <Select value={selectedItem ?? ""} onValueChange={(v) => { setSelectedItem(v); const k = items.find((i) => i.id === v)?.kind; if (!initial) recalc({ commission_pct: defaultCommissionPct(k, isPackage) }); }}>
              <SelectTrigger><SelectValue placeholder="Escolha um item" /></SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    [{it.kind === "flight" ? "Aéreo" : it.kind === "hotel" ? "Hotel" : "Outro"}] {it.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={form.supplier_name ?? ""} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Tarifa</Label>
              <Input type="number" step="0.01" value={form.sale_value} onChange={(e) => recalc({ sale_value: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Taxas (não comissiona)</Label>
              <Input type="number" step="0.01" value={form.tax_value} onChange={(e) => recalc({ tax_value: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Desconto</Label>
              <Input type="number" step="0.01" value={form.discount_value} onChange={(e) => recalc({ discount_value: Number(e.target.value) })} />
            </div>
          </div>

          {/* Comissionável + comissão padrão (não editável por item) */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Comissionável</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Desligue para produtos que não pagam comissão.</p>
              </div>
              <Switch
                checked={form.is_commissionable}
                onCheckedChange={(v) => recalc({ is_commissionable: v })}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Base: {formatBRL(base)} · {form.is_commissionable ? `${form.commission_pct}% (padrão)` : "sem comissão"}</span>
              <span>
                Comissão: <span className="font-semibold text-brand-orange">{formatBRL(form.commission_value)}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>RAV (comissão adicional R$)</Label>
              <Input
                type="number" step="0.01" min={0}
                value={form.rav_value}
                onChange={(e) => setForm({ ...form, rav_value: Number(e.target.value) })}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Somado à comissão para efeito de recebimento.</p>
            </div>
            <div className="flex items-end">
              <div className="text-xs text-muted-foreground w-full text-right">
                Comissão + RAV: <span className="font-semibold text-brand-orange">{formatBRL(Number(form.commission_value) + Number(form.rav_value || 0))}</span>
              </div>
            </div>
          </div>




          <div className="grid grid-cols-3 gap-3">
            <div><Label>Câmbio</Label><Input type="number" step="0.0001" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: Number(e.target.value) })} /></div>
            <div><Label>Vencimento</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div><Label>Total (venda)</Label><Input type="number" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




// =========== Payments ===========
const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "financing", label: "Financiamento" },
  { value: "transfer", label: "Transferência" },
  { value: "cash", label: "Dinheiro" },
  { value: "other", label: "Outro" },
];

const PAYMENT_STATUS_OPTIONS: { value: string; label: string; className: string }[] = [
  { value: "paid", label: "APROVADO", className: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
  { value: "pending", label: "PENDENTE", className: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
  { value: "rejected", label: "REJEITADO", className: "bg-red-500/20 text-red-600 dark:text-red-400" },
  { value: "cancelled", label: "CANCELADO", className: "bg-muted text-muted-foreground" },
  { value: "refunded", label: "ESTORNADO", className: "bg-orange-500/20 text-orange-600 dark:text-orange-400" },
];

function paymentMethodLabelShort(v: string) {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
function paymentStatusBadge(v: string) {
  return PAYMENT_STATUS_OPTIONS.find((o) => o.value === v) ?? { value: v, label: v.toUpperCase(), className: "bg-muted text-muted-foreground" };
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}h`;
}

function PaymentsSection({
  orderId, order, clientName, payments, onChange,
}: {
  orderId: string;
  order: OrderHeader;
  clientName: string;
  payments: OrderPayment[];
  onChange: () => void;
}) {
  const upsert = useServerFn(upsertOrderPayment);
  const del = useServerFn(deleteOrderPayment);
  const updatePayer = useServerFn(updateOrderPayer);
  const [editing, setEditing] = useState<OrderPayment | null>(null);
  const [open, setOpen] = useState(false);


  const upsertMut = useMutation({
    mutationFn: (data: Partial<OrderPayment> & { order_id: string; method: string; amount: number }) =>
      upsert({ data }),
    onSuccess: () => {
      toast.success("Pagamento salvo");
      setOpen(false);
      setEditing(null);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Pagamento removido"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const grandTotal = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-sm uppercase tracking-wider">Pagamentos</h3>
          <span className="text-xs text-muted-foreground">({payments.length})</span>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar pagamento
        </Button>
      </div>

      {payments.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Nenhum pagamento registrado ainda.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {payments.map((p) => {
            const badge = paymentStatusBadge(p.status);
            return (
              <div key={p.id} className="p-4">
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">
                      Pagamento
                    </span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm("Remover este pagamento?")) delMut.mutate(p.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* FRT-style grid */}
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_auto] gap-4 items-start text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Descrição</div>
                    <div className="font-medium">
                      {paymentMethodLabelShort(p.method)}
                      {p.installments && p.installment_amount
                        ? ` – ${p.installments} X ${formatBRL(p.installment_amount)}`
                        : ""}
                      {p.card_brand ? ` · ${p.card_brand}` : ""}
                      {p.card_last4 ? ` **** ${p.card_last4}` : ""}
                    </div>
                    {p.provider && <div className="text-muted-foreground text-xs mt-0.5">{p.provider}</div>}
                    {p.proposal_number && <div className="text-muted-foreground text-xs">Proposta {p.proposal_number}</div>}
                    {p.authorization_code && (
                      <div className="text-muted-foreground text-xs">Autorização {p.authorization_code}</div>
                    )}
                    {p.description && <div className="text-muted-foreground text-xs mt-1">{p.description}</div>}
                    {(p.method === "credit_card" || p.method === "debit_card") && (
                      <Link
                        to="/admin/cofre"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-orange hover:underline"
                      >
                        <Vault className="h-3.5 w-3.5" /> Abrir cofre <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cliente</div>
                    <div>{clientName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Incluído por</div>
                    <div>{p.added_by_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(p.paid_at ?? p.created_at)}</div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pago</div>
                    <div className="font-semibold">{formatBRL(p.amount)}</div>
                  </div>
                </div>
                {p.notes && (
                  <div className="mt-2 text-xs text-muted-foreground border-l-2 border-border pl-2">{p.notes}</div>
                )}
              </div>
            );
          })}
          <div className="px-4 py-3 bg-muted/30 text-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground uppercase tracking-wider text-xs">Total da venda</span>
              <span className="font-medium">{formatBRL(order.totalPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground uppercase tracking-wider text-xs">Total pago</span>
              <span className="font-medium">{formatBRL(grandTotal)}</span>
            </div>
            {(() => {
              const saldo = grandTotal - order.totalPrice;
              const pendente = saldo < -0.005;
              const excedente = saldo > 0.005;
              return (
                <div className="flex items-center justify-between border-t border-border pt-1.5">
                  <span className="uppercase tracking-wider text-xs font-semibold">Saldo</span>
                  <span className={`font-bold ${pendente ? "text-destructive" : excedente ? "text-brand-orange" : "text-muted-foreground"}`}>
                    {pendente ? `- ${formatBRL(Math.abs(saldo))}` : formatBRL(saldo)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <PaymentDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        initial={editing}
        order={order}
        onSave={async (data, payer) => {
          try {
            await updatePayer({ data: { id: orderId, ...payer } });
          } catch (e) {
            toast.error((e as Error).message);
            return;
          }
          upsertMut.mutate({ ...data, order_id: orderId, id: editing?.id });
        }}
      />

    </div>
  );
}

type PayerPatch = {
  payer_full_name?: string | null;
  payer_cpf?: string | null;
  payer_ie_rg?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  payer_zip?: string | null;
  payer_address?: string | null;
  payer_number?: string | null;
  payer_district?: string | null;
  payer_city?: string | null;
  payer_state?: string | null;
};

function PaymentDialog({
  open, onOpenChange, initial, order, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderPayment | null;
  order: OrderHeader;
  onSave: (data: Partial<OrderPayment> & { method: string; amount: number }, payer: PayerPatch) => void;
}) {
  const [form, setForm] = useState<Partial<OrderPayment>>({});
  const [payer, setPayer] = useState<PayerPatch>({});
  useMemo(() => {
    setForm(initial ?? {
      status: "paid",
      method: "pix",
      amount: 0,
      paid_at: new Date().toISOString(),
    });
    // Pré-preenche dados do pagador a partir do pedido, com fallback nos dados do cliente principal.
    setPayer({
      payer_full_name: order.payerFullName ?? order.fullName ?? "",
      payer_cpf: order.payerCpf ?? order.cpf ?? "",
      payer_ie_rg: order.payerIeRg ?? "",
      payer_email: order.payerEmail ?? order.email ?? "",
      payer_phone: order.payerPhone ?? order.phone ?? "",
      payer_zip: order.payerZip ?? "",
      payer_address: order.payerAddress ?? "",
      payer_number: order.payerNumber ?? "",
      payer_district: order.payerDistrict ?? "",
      payer_city: order.payerCity ?? "",
      payer_state: order.payerState ?? "",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open, order.id]);

  const method = form.method ?? "pix";
  const showCard = method === "credit_card" || method === "debit_card";
  const showInstallments = method === "credit_card" || method === "financing";

  const setField = <K extends keyof OrderPayment>(k: K, v: OrderPayment[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setPayerField = (k: keyof PayerPatch, v: string) => setPayer((p) => ({ ...p, [k]: v }));


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar pagamento" : "Adicionar pagamento"}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="pagamento" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
            <TabsTrigger value="pagador">Dados do pagador</TabsTrigger>
          </TabsList>
          <TabsContent value="pagamento" className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={method} onValueChange={(v) => setField("method", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Código de autorização (banco)
                  {form.status === "paid" && <span className="text-brand-orange"> *</span>}
                </Label>
                <Input
                  value={form.authorization_code ?? ""}
                  onChange={(e) => setField("authorization_code", e.target.value)}
                  placeholder="Ex.: 123456"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? "paid"} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor pago (R$)</Label>
                <Input type="number" step="0.01" value={form.amount ?? 0}
                  onChange={(e) => setField("amount", Number(e.target.value))} />
              </div>
              <div>
                <Label>Nº do caixa</Label>
                <Input value={form.cashier_number ?? ""} onChange={(e) => setField("cashier_number", e.target.value)} />
              </div>
              {showInstallments && (
                <>
                  <div>
                    <Label>Parcelas</Label>
                    <Input type="number" min={1} value={form.installments ?? ""}
                      onChange={(e) => setField("installments", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <Label>Valor por parcela</Label>
                    <Input type="number" step="0.01" value={form.installment_amount ?? ""}
                      onChange={(e) => setField("installment_amount", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </>
              )}
              {showCard && (
                <>
                  <div>
                    <Label>Bandeira</Label>
                    <Input value={form.card_brand ?? ""} onChange={(e) => setField("card_brand", e.target.value)} placeholder="Visa, Master, Elo…" />
                  </div>
                  <div>
                    <Label>Últimos 4 dígitos</Label>
                    <Input maxLength={4} value={form.card_last4 ?? ""} onChange={(e) => setField("card_last4", e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <Label>Fornecedor / Adquirente</Label>
                <Input value={form.provider ?? ""} onChange={(e) => setField("provider", e.target.value)} placeholder="FunPay, Cielo…" />
              </div>
              <div>
                <Label>Nº da proposta</Label>
                <Input value={form.proposal_number ?? ""} onChange={(e) => setField("proposal_number", e.target.value)} />
              </div>
              <div>
                <Label>Data do pagamento</Label>
                <Input type="datetime-local"
                  value={form.paid_at ? new Date(form.paid_at).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setField("paid_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </div>
              <div>
                <Label>Incluído por</Label>
                <Input value={form.added_by_name ?? ""} onChange={(e) => setField("added_by_name", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Descrição</Label>
                <Input value={form.description ?? ""} onChange={(e) => setField("description", e.target.value)} placeholder="Ex.: FINANCIAMENTO – Aprovado" />
              </div>
              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="pagador" className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Solicitante (nome completo)</Label>
                <Input value={payer.payer_full_name ?? ""} onChange={(e) => setPayerField("payer_full_name", e.target.value)} />
              </div>
              <div>
                <Label>CPF / CNPJ</Label>
                <Input value={payer.payer_cpf ?? ""} onChange={(e) => setPayerField("payer_cpf", e.target.value)} />
              </div>
              <div>
                <Label>IE / RG</Label>
                <Input value={payer.payer_ie_rg ?? ""} onChange={(e) => setPayerField("payer_ie_rg", e.target.value)} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={payer.payer_email ?? ""} onChange={(e) => setPayerField("payer_email", e.target.value)} />
              </div>
              <div>
                <Label>Telefones</Label>
                <Input value={payer.payer_phone ?? ""} onChange={(e) => setPayerField("payer_phone", e.target.value)} placeholder="(22) 99951-0018" />
              </div>
              <div className="md:col-span-2">
                <Label>Endereço</Label>
                <Input value={payer.payer_address ?? ""} onChange={(e) => setPayerField("payer_address", e.target.value)} placeholder="Rua Espírito Santo 63" />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={payer.payer_district ?? ""} onChange={(e) => setPayerField("payer_district", e.target.value)} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={payer.payer_city ?? ""} onChange={(e) => setPayerField("payer_city", e.target.value)} />
              </div>
              <div>
                <Label>UF</Label>
                <Input maxLength={2} value={payer.payer_state ?? ""} onChange={(e) => setPayerField("payer_state", e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={payer.payer_zip ?? ""} onChange={(e) => setPayerField("payer_zip", e.target.value)} placeholder="28890-052" />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({
            ...form,
            method: form.method ?? "pix",
            amount: Number(form.amount ?? 0),
          } as Partial<OrderPayment> & { method: string; amount: number }, payer)}>Salvar</Button>

        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}


// keep unused imports satisfied
void Copy;
void DialogTrigger;

// =========== Commission Adjust Dialog (total-level, distributes proportionally) ===========
function CommissionAdjustDialog({
  open, onOpenChange, order, items, financials, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderHeader;
  items: OrderItem[];
  financials: OrderItemFinancial[];
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertItemFinancial);
  const updateTotal = useServerFn(updateOrderTotalPrice);
  const snap = (order.packageSnapshot ?? {}) as Record<string, unknown>;
  const isPackage =
    !(snap as { manual?: boolean }).manual &&
    !["payment_link", "payment_link_simple"].includes(String((snap as { kind?: string }).kind ?? "")) &&
    Number((snap as { price_per_person?: number }).price_per_person ?? 0) > 0;
  const PKG_DEFAULT_PCT = 12;

  const [sale, setSale] = useState(0);
  const [tax, setTax] = useState(0);
  const [pct, setPct] = useState(isPackage ? PKG_DEFAULT_PCT : 10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r2 = (n: number) => Number(n.toFixed(2));
    // Agrega TODOS os itens do financeiro (pacote pronto + extras).
    // Para itens sem financeiro salvo, usa o valor cadastrado no próprio item
    // (details.value / details.tax_value) como valor planejado.
    let sumSale = 0;
    let sumTax = 0;
    let firstPct: number | null = null;
    for (const it of items) {
      const f = financials.find((x) => x.order_item_id === it.id);
      if (f) {
        sumSale += Number(f.sale_value || 0);
        sumTax += Number(f.tax_value || 0);
        if (firstPct === null && f.commission_pct !== null && f.commission_pct !== undefined) {
          firstPct = Number(f.commission_pct);
        }
      } else {
        const d = (it.details ?? {}) as Record<string, unknown>;
        const gross = Math.max(0, Number(d.value ?? 0) || 0);
        const itemTax = Math.max(0, Math.min(gross, Number(d.tax_value ?? 0) || 0));
        if (gross > 0) {
          sumSale += Math.max(0, gross - itemTax);
          sumTax += itemTax;
        }
      }
    }
    setSale(r2(sumSale));
    setTax(r2(sumTax));
    setPct(firstPct !== null ? firstPct : (isPackage ? PKG_DEFAULT_PCT : 10));
  }, [open, items, financials, isPackage]);



  // sale = tarifa NET (sem taxas). Comissão incide sobre a tarifa.
  const base = Math.max(0, sale);
  const commission = Number((base * (pct / 100)).toFixed(2));
  // Pacote pronto: os 12% já estão embutidos no valor. Delta (positivo ou negativo)
  // muda o total do pedido. Para pedido manual, comissão soma ao total.
  const pkgDefaultCommission = isPackage ? Number((base * (PKG_DEFAULT_PCT / 100)).toFixed(2)) : 0;
  // Taxa de RAV: 15% da comissão adicional (só quando comissão > padrão)
  const RAV_RATE = 0.15;
  const ravTax = isPackage
    ? Number((Math.max(0, commission - pkgDefaultCommission) * RAV_RATE).toFixed(2))
    : 0;
  const total = isPackage
    ? Number((sale + tax + (commission - pkgDefaultCommission) - ravTax).toFixed(2))
    : Number((sale + tax + commission).toFixed(2));

  const handleSave = async () => {
    if (items.length === 0) { toast.error("Adicione ao menos um item"); return; }
    setSaving(true);
    try {
      // Distribui tarifa e taxas proporcionalmente ao peso atual de cada item.
      // Se nenhum item tem valor gravado, divide igualmente.
      const currents = items.map((it) => {
        const f = financials.find((x) => x.order_item_id === it.id);
        const d = (it.details ?? {}) as Record<string, unknown>;
        const gross = Math.max(0, Number(d.value ?? 0) || 0);
        const itemTax = Math.max(0, Math.min(gross, Number(d.tax_value ?? 0) || 0));
        return {
          item: it,
          existing: f,
          curSale: f ? Number(f.sale_value ?? 0) : Math.max(0, gross - itemTax),
          curTax: f ? Number(f.tax_value ?? 0) : itemTax,
        };
      });
      const totalCurSale = currents.reduce((a, c) => a + c.curSale, 0);
      const totalCurTax = currents.reduce((a, c) => a + c.curTax, 0);
      const equalShare = 1 / items.length;


      for (const c of currents) {
        const wSale = totalCurSale > 0 ? c.curSale / totalCurSale : equalShare;
        const wTax = totalCurTax > 0 ? c.curTax / totalCurTax : equalShare;
        const itemSale = Number((sale * wSale).toFixed(2));
        const itemTax = Number((tax * wTax).toFixed(2));
        const itemBase = Math.max(0, itemSale);
        const itemCommission = Number((itemBase * (pct / 100)).toFixed(2));
        const itemDefaultComm = isPackage ? Number((itemSale * (PKG_DEFAULT_PCT / 100)).toFixed(2)) : 0;
        // Se pacote e comissão < 12% (base), a diferença vira desconto.
        const itemDiscount = isPackage && itemCommission < itemDefaultComm
          ? Number((itemDefaultComm - itemCommission).toFixed(2))
          : 0;
        // Total: pacote = tarifa + taxas + delta positivo (só sobe acima de 12%) − desconto.
        // Manual: tarifa + taxas + comissão.
        const itemTotal = isPackage
          ? Number((itemSale + itemTax + Math.max(0, itemCommission - itemDefaultComm) - itemDiscount).toFixed(2))
          : Number((itemSale + itemTax + itemCommission).toFixed(2));

        await upsert({
          data: {
            id: c.existing?.id,
            order_item_id: c.item.id,
            sale_value: itemSale,
            tax_value: itemTax,
            discount_value: itemDiscount,
            commission_pct: pct,
            commission_value: itemCommission,
            total: itemTotal,
            supplier_name: c.existing?.supplier_name ?? null,
            exchange_rate: c.existing?.exchange_rate ?? 1,
            due_date: c.existing?.due_date ?? null,
            notes: c.existing?.notes ?? null,
          },
        });
      }

      // Reflete o novo total no cabeçalho do pedido.
      await updateTotal({ data: { id: order.id, total_price: Math.max(0, total) } });
      toast.success("Comissão atualizada e refletida no total do pedido");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4" /> Ajuste de comissão
          </DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Adicione ao menos um item (aéreo, hotel ou serviço) para ajustar a comissão.
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-xs text-muted-foreground">
              O ajuste é aplicado no total do pedido e distribuído proporcionalmente entre os {items.length} {items.length === 1 ? "item" : "itens"} do financeiro.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tarifa total</Label>
                <Input type="number" step="0.01" value={sale} onChange={(e) => setSale(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Taxas totais (não comissionam)</Label>
                <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Comissão sobre a tarifa</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" step="0.5" min={0} max={100}
                    value={Number.isFinite(pct) ? Number(pct.toFixed(2)) : 0}
                    onChange={(e) => setPct(Number(e.target.value))}
                    className="w-20 h-8 text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[Math.min(30, Math.max(0, pct))]}
                min={0}
                max={30}
                step={0.5}
                onValueChange={(v) => setPct(v[0])}
              />
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Base: {formatBRL(base)} (só tarifa)</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">ou comissão R$</span>
                  <Input
                    type="number" step="0.01" min={0}
                    value={Number(commission.toFixed(2))}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPct(base > 0 ? Number(((v / base) * 100).toFixed(4)) : 0);
                    }}
                    className="w-24 h-8 text-right"
                  />
                </div>
              </div>
              <div className="mt-1 text-right text-xs">
                Comissão: <span className="font-semibold text-brand-orange">{formatBRL(commission)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Novo total do pedido</div>
                {isPackage && (
                  <div className="text-[10px] text-muted-foreground mt-1 leading-snug break-words space-y-0.5">
                    <div>
                      {pct < PKG_DEFAULT_PCT
                        ? `Desconto aplicado: ${formatBRL(Math.max(0, pkgDefaultCommission - commission))}`
                        : pct > PKG_DEFAULT_PCT
                        ? `Acréscimo acima de ${PKG_DEFAULT_PCT}%: ${formatBRL(Math.max(0, commission - pkgDefaultCommission))}`
                        : `Comissão padrão do pacote (${PKG_DEFAULT_PCT}%)`}
                    </div>
                    {ravTax > 0 && (
                      <div className="text-amber-700 dark:text-amber-400">
                        Taxas de RAV (15% s/ acréscimo): −{formatBRL(ravTax)}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-2xl font-bold text-brand-orange leading-none whitespace-nowrap">{formatBRL(Math.max(0, total))}</div>
            </div>
          </div>
        )}


        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Order log dialog (observações / motivos de viagem) ===========
function OrderLogDialog({
  open, onOpenChange, orderId, logKey, entries, onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  logKey: "notes_log" | "travel_reason_log";
  entries: OrderLogEntry[];
  onChange: () => void;
}) {
  const appendFn = useServerFn(appendOrderLogEntry);
  const deleteFn = useServerFn(deleteOrderLogEntry);
  const [text, setText] = useState("");
  const title = logKey === "notes_log" ? "Observações do pedido" : "Motivos da viagem";
  const placeholder = logKey === "notes_log" ? "Ex: Cliente pediu assento na janela..." : "Ex: Lua de mel, aniversário...";

  useEffect(() => { if (!open) setText(""); }, [open]);

  const add = useMutation({
    mutationFn: () => appendFn({ data: { id: orderId, key: logKey, text } }),
    onSuccess: () => { toast.success("Adicionado"); setText(""); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (index: number) => deleteFn({ data: { id: orderId, key: logKey, index } }),
    onSuccess: () => { toast.success("Removido"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Nova entrada</Label>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => add.mutate()} disabled={!text.trim() || add.isPending}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico ({entries.length})
            </div>
            {entries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Nenhuma entrada cadastrada.
              </div>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
                {entries.map((entry, idx) => (
                  <div key={`${entry.created_at}-${idx}`} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] text-muted-foreground">{fmtDate(entry.created_at)}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => confirm("Remover esta entrada?") && del.mutate(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-1 text-sm whitespace-pre-wrap break-words">{entry.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



