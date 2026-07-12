import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft, Hotel, Plane, XCircle, FileText, DollarSign, Users, Plus,
  Pencil, Trash2, Ban, RotateCcw, Loader2, Copy, Download, Hash,
  Package, Percent, Mail, Printer, CheckCircle2, MoreHorizontal, Signature,
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

import { formatBRL } from "@/lib/format";
import { paymentMethodLabel, statusLabel, itemStatusBadge } from "@/lib/order-labels";
import {
  getOrderDetail, upsertPassenger, deletePassenger,
  upsertOrderItem, deleteOrderItem, setOrderItemStatus, setOrderStatus, updateOrderMeta,
  upsertItemFinancial, deleteItemFinancial, updateOrderTotalPrice,
  upsertOrderPayment, deleteOrderPayment,
  type OrderDetail, type OrderHeader, type OrderPassenger, type OrderItem, type OrderItemFinancial, type OrderPayment,
} from "@/lib/orders.functions";
import { Slider } from "@/components/ui/slider";


import { generateAuthorizationPDF, type AuthorizationData, type LivenessData } from "@/lib/authorization-pdf";
import { generateReceiptAndContract, generateReceiptOnly, openBlobInNewTab } from "@/lib/contract-pdf";
import { OrderDocuments } from "@/components/OrderDocuments";
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

function OrderDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery(orderDetailQO(id));

  // TODOS os hooks antes de qualquer return condicional — Rules of Hooks.
  const [activeTab, setActiveTab] = useState<string>("hotel");
  const [openCommission, setOpenCommission] = useState(false);

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

  const promptMeta = (label: string, current: string | null, key: "notes" | "travel_reason" | "coupon") => {
    const v = window.prompt(label, current ?? "");
    if (v === null) return;
    metaMut.mutate({ [key]: v.trim() || null });
  };

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
                      total: String(order.totalPrice),
                      orderRef: order.id,
                      orderNumber: order.orderNumber,
                      locator: order.airlineLocator ?? "",
                      supplier: order.supplierName ?? "",
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
                  <DropdownMenuItem onClick={() => toast.info("Anexos: aba Contrato → botão Anexar arquivo")}><FileText className="h-3.5 w-3.5 mr-2" /> Anexo (contrato/voucher)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOpenCommission(true)}><Percent className="h-3.5 w-3.5 mr-2" /> Ajuste de comissão</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => promptMeta("Observação do pedido", order.notes, "notes")}><FileText className="h-3.5 w-3.5 mr-2" /> Observação</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => promptMeta("Motivo da viagem", order.travelReason, "travel_reason")}><FileText className="h-3.5 w-3.5 mr-2" /> Motivo da viagem</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => promptMeta("Cupom aplicado", order.coupon, "coupon")}><Percent className="h-3.5 w-3.5 mr-2" /> Cupom</DropdownMenuItem>
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
                  <DropdownMenuItem onClick={() => toast.info("Docusign — em breve")}><Signature className="h-3.5 w-3.5 mr-2" /> Acionar contrato Docusign</DropdownMenuItem>
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
            />
          </TabsContent>
          <TabsContent value="flight" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={flightItems}
              kind="flight"
              onChange={invalidate}
              passengers={detail.passengers}
            />
          </TabsContent>
          <TabsContent value="service" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={serviceItems}
              kind="other"
              onChange={invalidate}
            />
          </TabsContent>

          <TabsContent value="cancelled" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={cancelledItems}
              kind="cancelled"
              onChange={invalidate}
              passengers={detail.passengers}
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
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
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
      <td className="py-1 px-1 min-w-[300px] align-top">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
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
            {passenger.doc_type === "passport" ? (
              <InlineText
                value={passenger.passport_number ?? ""}
                placeholder="nº passaporte"
                className="text-xs font-mono w-[170px] shrink-0"
                onCommit={(v) => (v || null) !== passenger.passport_number && onPatch({ passport_number: v || null })}
              />
            ) : (
              <InlineText
                value={passenger.cpf ?? ""}
                placeholder="CPF"
                className="text-xs font-mono w-[170px] shrink-0"
                onCommit={(v) => (v || null) !== passenger.cpf && onPatch({ cpf: v || null })}
              />
            )}
          </div>
          {passenger.doc_type === "passport" && (
            <div className="grid grid-cols-2 gap-1.5 max-w-[286px]">
              <InlineText
                type="date"
                value={passenger.passport_issue_date ?? ""}
                placeholder="emissão"
                className="text-xs w-full"
                onCommit={(v) => (v || null) !== passenger.passport_issue_date && onPatch({ passport_issue_date: v || null })}
              />
              <InlineText
                type="date"
                value={passenger.passport_expiry_date ?? ""}
                placeholder="validade"
                className="text-xs w-full"
                onCommit={(v) => (v || null) !== passenger.passport_expiry_date && onPatch({ passport_expiry_date: v || null })}
              />
            </div>
          )}
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
              onSave(form);
            }}
          >Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Items (hotel/flight/other/cancelled) ===========
function ItemsTab({
  orderId, items, kind, onChange, passengers,
}: {
  orderId: string;
  items: OrderItem[];
  kind: "hotel" | "flight" | "other" | "cancelled";
  onChange: () => void;
  passengers?: OrderPassenger[];
}) {

  const upsert = useServerFn(upsertOrderItem);
  const del = useServerFn(deleteOrderItem);
  const setStatus = useServerFn(setOrderItemStatus);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (payload: Parameters<typeof upsert>[0]["data"]) => upsert({ data: payload }),
    onSuccess: () => { toast.success("Item salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (iid: string) => del({ data: { id: iid } }),
    onSuccess: () => { toast.success("Item removido"); onChange(); },
  });
  const cancel = useMutation({
    mutationFn: async (iid: string) => setStatus({ data: { id: iid, status: "cancelled" } }),
    onSuccess: () => { toast.success("Item cancelado"); onChange(); },
  });
  const reactivate = useMutation({
    mutationFn: async (iid: string) => setStatus({ data: { id: iid, status: "confirmed" } }),
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
              passengers={passengers ?? []}
              onEdit={(it) => { setEditing(it); setOpen(true); }}
              onDelete={(it) => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={(it) => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={(it) => reactivate.mutate(it.id)}
            />
          ))}
          {items.filter((i) => i.kind === "hotel").map((it) => (
            <HotelReservationCard
              key={it.id}
              item={it}
              passengers={passengers ?? []}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
            />
          ))}
          {items.filter((i) => i.kind === "other").map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
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
              passengers={passengers ?? []}
              onEdit={(it) => { setEditing(it); setOpen(true); }}
              onDelete={(it) => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={(it) => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={(it) => reactivate.mutate(it.id)}
            />
          ))}
        </div>
      ) : kind === "hotel" ? (
        <div className="space-y-3">
          {items.map((it) => (
            <HotelReservationCard
              key={it.id}
              item={it}
              passengers={passengers ?? []}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
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
            // 1) Salva o item editado (ou cria novo)
            await upsert({ data: { ...payload, order_id: orderId, id: editing?.id } });

            // 2) Para AÉREO: propaga localizador + bilhete pra todos os outros aéreos do pedido,
            //    e também os detalhes editados de cada trecho irmão (ida/volta juntos).
            if (payload.kind === "flight") {
              const newLoc = payload.supplier_locator;
              const newDetails = (payload.details ?? {}) as Record<string, unknown>;
              const newTicket = String(newDetails.ticket_number ?? "").trim();
              const sibMap = new Map<string, Record<string, unknown>>();
              for (const s of payload.siblings ?? []) {
                sibMap.set(s.id, (s.details ?? {}) as Record<string, unknown>);
              }
              const otherFlights = items.filter((i) => i.kind === "flight" && i.id !== editing?.id && i.status !== "cancelled");
              for (const fi of otherFlights) {
                const base = sibMap.get(fi.id) ?? ((fi.details ?? {}) as Record<string, unknown>);
                const fd = { ...base, ticket_number: newTicket };
                const st: "confirmed" | "reserved" | "pending" = newTicket && newLoc
                  ? "confirmed" : newLoc ? "reserved" : "pending";
                await upsert({
                  data: {
                    id: fi.id,
                    order_id: orderId,
                    kind: "flight",
                    title: fi.title,
                    supplier_locator: newLoc,
                    details: fd as Json,
                    sort_order: fi.sort_order,
                    status: st,
                  },
                });
              }
            }

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
  return item.status;
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

function FlightReservationCard({
  locator, segments, passengers, onEdit, onDelete, onCancel, onReactivate,
}: {
  locator: string | null;
  segments: OrderItem[];
  passengers: OrderPassenger[];
  onEdit: (it: OrderItem) => void;
  onDelete: (it: OrderItem) => void;
  onCancel: (it: OrderItem) => void;
  onReactivate: (it: OrderItem) => void;
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
                </li>
              );
            })}

          </ul>
        </div>
      </div>
    </div>
  );
}

function HotelReservationCard({
  item, passengers, onEdit, onDelete, onCancel, onReactivate,
}: {
  item: OrderItem;
  passengers: OrderPassenger[];
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onReactivate: () => void;
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
          <div className="font-semibold">
            {item.title}
            {stars ? <span className="ml-2 text-xs text-brand-orange">{"★".repeat(stars)}</span> : null}
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
                </li>
              );
            })}
          </ul>
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
    siblings?: { id: string; details: Json }[];
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
    return clean;
  });
  // Trechos adicionais (ex.: volta) do mesmo aéreo — editados junto.
  const flightSiblings = kind === "flight" ? (siblings ?? []) : [];
  const cleanDetails = (raw: unknown): Record<string, string | number> => {
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") clean[k] = v;
    }
    return clean;
  };
  const [sibDetails, setSibDetails] = useState<Record<string, string | number>[]>(
    () => flightSiblings.map((s) => cleanDetails(s.details))
  );

  useMemo(() => {
    setTitle(initial?.title ?? "");
    setLocator(initial?.supplier_locator ?? "");
    setStatusVal((initial?.status ?? "confirmed") as "confirmed" | "reserved" | "cancelled" | "pending");
    setDetails(cleanDetails(initial?.details));
    setSibDetails(flightSiblings.map((s) => cleanDetails(s.details)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, siblings]);

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
  const setSibField = (idx: number, k: string, v: string) =>
    setSibDetails((arr) => arr.map((d, i) => (i === idx ? { ...d, [k]: v } : d)));


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
            <div className="col-span-2">
              <Label>{kind === "hotel" ? "Nome do hotel" : kind === "flight" ? "Trecho / rota" : "Serviço"}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "hotel" ? "Ex: Trupial Hotel & Casino" : kind === "flight" ? "Ex: GRU → CUR" : "Ex: Traslado, Passeio, Seguro viagem…"} />
            </div>
            <div className={kind === "other" ? "" : "col-span-2"}>
              <Label>Localizador do fornecedor</Label>
              <Input value={locator} onChange={(e) => setLocator(e.target.value)} placeholder="Ex: JXJDZZ" />
              {kind === "hotel" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Sem localizador = Solicitado. Com localizador = Confirmado.
                </p>
              )}
              {kind === "flight" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Sem localizador nem bilhete = Solicitado. Só localizador = Reservado. Com bilhete = Confirmado.
                </p>
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
                  onChange={(e) => setField("ticket_number", e.target.value)}
                  placeholder="Ex: 957-2149876543"
                />
              </div>
            )}
          </div>

          {kind === "hotel" ? (
            <>
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
            <>
              <div className="rounded-lg border border-border/60 p-3 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {String(details.direction ?? "") === "return" ? "Volta" : String(details.direction ?? "") === "outbound" ? "Ida" : "Trecho"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Origem</Label><Input value={String(details.from_iata ?? details.origin ?? "")} onChange={(e) => setField("from_iata", e.target.value)} placeholder="GRU" /></div>
                  <div><Label>Destino</Label><Input value={String(details.to_iata ?? details.destination ?? "")} onChange={(e) => setField("to_iata", e.target.value)} placeholder="CUR" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cia aérea</Label><Input value={String(details.airline ?? "")} onChange={(e) => setField("airline", e.target.value)} placeholder="LATAM" /></div>
                  <div><Label>Nº do voo</Label><Input value={String(details.flight_number ?? "")} onChange={(e) => setField("flight_number", e.target.value)} placeholder="LA 3331" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Partida</Label><Input type="datetime-local" value={String(details.depart_at ?? details.departure ?? "")} onChange={(e) => setField("depart_at", e.target.value)} /></div>
                  <div><Label>Chegada</Label><Input type="datetime-local" value={String(details.arrive_at ?? details.arrival ?? "")} onChange={(e) => setField("arrive_at", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Classe / Cabine</Label><Input value={String(details.cabin_class ?? details.cabin ?? "")} onChange={(e) => setField("cabin_class", e.target.value)} placeholder="Econômica Light" /></div>
                  <div>
                    <Label>Direção</Label>
                    <Select value={String(details.direction ?? "")} onValueChange={(v) => setField("direction", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">Ida</SelectItem>
                        <SelectItem value="return">Volta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {flightSiblings.map((sib, idx) => {
                const sd = sibDetails[idx] ?? {};
                const dirLabel = String(sd.direction ?? "") === "return" ? "Volta" : String(sd.direction ?? "") === "outbound" ? "Ida" : "Trecho";
                return (
                  <div key={sib.id} className="rounded-lg border border-border/60 p-3 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{dirLabel}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Origem</Label><Input value={String(sd.from_iata ?? sd.origin ?? "")} onChange={(e) => setSibField(idx, "from_iata", e.target.value)} placeholder="GRU" /></div>
                      <div><Label>Destino</Label><Input value={String(sd.to_iata ?? sd.destination ?? "")} onChange={(e) => setSibField(idx, "to_iata", e.target.value)} placeholder="CUR" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Cia aérea</Label><Input value={String(sd.airline ?? "")} onChange={(e) => setSibField(idx, "airline", e.target.value)} placeholder="LATAM" /></div>
                      <div><Label>Nº do voo</Label><Input value={String(sd.flight_number ?? "")} onChange={(e) => setSibField(idx, "flight_number", e.target.value)} placeholder="LA 3332" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Partida</Label><Input type="datetime-local" value={String(sd.depart_at ?? sd.departure ?? "")} onChange={(e) => setSibField(idx, "depart_at", e.target.value)} /></div>
                      <div><Label>Chegada</Label><Input type="datetime-local" value={String(sd.arrive_at ?? sd.arrival ?? "")} onChange={(e) => setSibField(idx, "arrive_at", e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Classe / Cabine</Label><Input value={String(sd.cabin_class ?? sd.cabin ?? "")} onChange={(e) => setSibField(idx, "cabin_class", e.target.value)} placeholder="Econômica Light" /></div>
                      <div>
                        <Label>Direção</Label>
                        <Select value={String(sd.direction ?? "")} onValueChange={(v) => setSibField(idx, "direction", v)}>
                          <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="outbound">Ida</SelectItem>
                            <SelectItem value="return">Volta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={String(details.value ?? "")} onChange={(e) => setField("value", e.target.value)} placeholder="0,00" /></div>
                <div><Label>Quantidade</Label><Input type="number" value={String(details.quantity ?? "")} onChange={(e) => setField("quantity", e.target.value)} placeholder="1" /></div>
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
            if (!title.trim()) { toast.error("Título é obrigatório"); return; }
            const numFields = new Set(["nights", "value", "quantity", "hotel_stars"]);
            const cleanDetails: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(details)) {
              if (v === "" || v === undefined || v === null) continue;
              cleanDetails[k] = numFields.has(k) ? Number(v) : v;
            }
            // Deriva status final (não deixa o usuário salvar um status incoerente)
            let finalStatus = status;
            if (status !== "cancelled") {
              const loc = locator.trim();
              const tkt = String(cleanDetails.ticket_number ?? "").trim();
              if (kind === "hotel") finalStatus = loc ? "confirmed" : "pending";
              else if (kind === "flight") finalStatus = tkt ? "confirmed" : loc ? "reserved" : "pending";
            }
            const siblingsPayload = kind === "flight"
              ? flightSiblings.map((sib, idx) => {
                  const raw = sibDetails[idx] ?? {};
                  const cd: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(raw)) {
                    if (v === "" || v === undefined || v === null) continue;
                    cd[k] = numFields.has(k) ? Number(v) : v;
                  }
                  return { id: sib.id, details: cd as Json };
                })
              : undefined;
            onSave({
              kind,
              title: title.trim(),
              supplier_locator: locator.trim() || null,
              details: cleanDetails as Json,
              status: finalStatus,
              siblings: siblingsPayload,
            });
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Contract ===========
function ContractTab({ detail }: { detail: OrderDetail }) {
  const { order, passengers } = detail;
  const snap = order.packageSnapshot as {
    card_capture?: { authorization?: AuthorizationData; liveness?: LivenessData | null };
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

  async function downloadAuthorization() {
    if (!authorization) { toast.error("Sem dados de autorização de débito para este pedido."); return; }
    try {
      const passengersString = passengers.length > 0
        ? passengers.map((p) => p.full_name).join(", ")
        : undefined;
      const enriched: AuthorizationData = {
        ...authorization,
        order_number: authorization.order_number ?? snap?.order_number,
        trip_locator: authorization.trip_locator ?? snap?.locator ?? null,
        trip_route: authorization.trip_route ?? snap?.route ?? null,
        trip_date: authorization.trip_date ?? snap?.travel_date ?? null,
        trip_passengers: authorization.trip_passengers ?? passengersString ?? null,
        trip_hotel: authorization.trip_hotel ?? snap?.hotel ?? null,
        trip_flights: authorization.trip_flights ?? snap?.flights ?? null,
        trip_checkin: authorization.trip_checkin ?? snap?.checkin ?? null,
        trip_checkout: authorization.trip_checkout ?? snap?.checkout ?? null,
        trip_days: authorization.trip_days ?? snap?.days ?? null,
        trip_nights: authorization.trip_nights ?? snap?.nights ?? null,
      };
      await generateAuthorizationPDF({ orderId: order.id, createdAt: order.createdAt, authorization: enriched, liveness });
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
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <div className="font-medium text-sm">Recibo + Contrato</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Gerado automaticamente com dados do pagador, serviços e forma de pagamento
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const blob = await generateReceiptOnly(detail);
                openBlobInNewTab(blob, `recibo-${order.orderNumber}.pdf`);
              } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar recibo"); }
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Só recibo
            </Button>
            <Button size="sm" onClick={async () => {
              try {
                const blob = await generateReceiptAndContract(detail);
                openBlobInNewTab(blob, `contrato-${order.orderNumber}.pdf`);
              } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar contrato"); }
            }}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Contrato + Recibo
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <div className="font-medium text-sm">Autorização de débito</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {hasAuthorization ? "Gerada com assinatura digital do cliente" : "Sem autorização registrada (pedido sem checkout de cartão)"}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!hasAuthorization} onClick={downloadAuthorization}>
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
  const [editing, setEditing] = useState<OrderItemFinancial | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (payload: Parameters<typeof upsert>[0]["data"]) => upsert({ data: payload }),
    onSuccess: () => { toast.success("Lançamento salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (fid: string) => del({ data: { id: fid } }),
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

  const plannedRows = useMemo<Array<Partial<OrderItemFinancial> & { __planned?: boolean; __itemId?: string | null; __label?: string }>>(() => {
    if (financials.length > 0) return [];
    if (isPackageOrder) {
      return [{
        __planned: true,
        __itemId: null,
        __label: "Pacote pronto",
        supplier_name: null,
        sale_value: packageFareNet,
        tax_value: packageTaxes,
        discount_value: 0,
        commission_pct: PACKAGE_DEFAULT_PCT,
        commission_value: packageDefaultCommission,
        // No padrão 12%, total = tarifa + taxas (comissão já embutida).
        total: Number((packageFareNet + packageTaxes).toFixed(2)),
      }];
    }
    return items.map((it) => ({
      __planned: true,
      __itemId: it.id,
      __label: it.title,
      supplier_name: null,
      sale_value: 0,
      tax_value: 0,
      discount_value: 0,
      commission_pct: defaultCommissionPct(it.kind, false),
      commission_value: 0,
      total: 0,
    }));
  }, [financials.length, isPackageOrder, packageFareNet, packageTaxes, packageDefaultCommission, items]);

  // Para pacote pronto, ignoramos valores gravados nos financials e derivamos tudo do snapshot,
  // aplicando o % de comissão que estiver salvo (ou 12% padrão). Isso corrige dados antigos que
  // foram gravados com convenção diferente.
  let totalSale: number;
  let totalTax: number;
  let commissionBase: number;
  let totalCommission: number;
  let totalNet: number;

  if (isPackageOrder) {
    const currentPct = financials[0]?.commission_pct ?? PACKAGE_DEFAULT_PCT;
    totalSale = packageFareNet;
    totalTax = packageTaxes;
    commissionBase = packageFareNet;
    totalCommission = Number((packageFareNet * (Number(currentPct) / 100)).toFixed(2));
    // Delta sinalizado: pct < 12 reduz o total; pct > 12 aumenta.
    const delta = Number((totalCommission - packageDefaultCommission).toFixed(2));
    totalNet = Number((packageFareNet + packageTaxes + delta).toFixed(2));
  } else {
    const displayRows = financials.length > 0 ? financials : plannedRows;
    totalSale = displayRows.reduce((a, f) => a + Number(f.sale_value || 0), 0);
    totalTax = displayRows.reduce((a, f) => a + Number(f.tax_value || 0), 0);
    commissionBase = Math.max(0, totalSale);
    totalCommission = displayRows.reduce((a, f) => a + Number(f.commission_value || 0), 0);
    totalNet = displayRows.reduce((a, f) => a + Number(f.total || f.sale_value || 0), 0);
  }
  const packageDiscount = isPackageOrder ? Math.max(0, Number((packageDefaultCommission - totalCommission).toFixed(2))) : 0;



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
                // Pacote pronto: uma linha única refletindo o resumo.
                <tr className="border-b border-border/50">
                  <td className="py-2 px-2 text-xs">Pacote pronto</td>
                  <td className="py-2 px-2 text-xs">—</td>
                  <td className="py-2 px-2 text-right text-xs">{formatBRL(totalSale)}</td>
                  <td className="py-2 px-2 text-right text-xs">{formatBRL(totalTax)}</td>
                  <td className="py-2 px-2 text-right text-xs">{formatBRL(packageDiscount)}</td>
                  <td className="py-2 px-2 text-right text-xs">
                    {formatBRL(totalCommission)}
                    <div className="text-[10px] text-muted-foreground">{financials[0]?.commission_pct ?? PACKAGE_DEFAULT_PCT}%</div>
                  </td>
                  <td className="py-2 px-2 text-xs">—</td>
                  <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(totalNet)}</td>
                  <td className="py-2 px-2"></td>
                </tr>
              ) : financials.length > 0 ? (
                financials.map((f) => {
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
                })
              ) : (
                plannedRows.map((p, idx) => (
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
                        // Se for pacote pronto: pré-seleciona o 1º item; senão o item da linha.
                        setSelectedItem(p.__itemId ?? items[0]?.id ?? null);
                        setOpen(true);
                      }}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
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

function defaultCommissionPct(kind: OrderItem["kind"] | undefined, isPackage: boolean): number {
  if (isPackage) return 12; // pacote pronto = 12% sobre a tarifa
  if (kind === "flight") return 10;
  if (kind === "hotel") return 12;
  return 10;
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

  const defaultSale = packageDefaults?.sale_value ?? 0;
  const defaultTax = packageDefaults?.tax_value ?? 0;

  const [form, setForm] = useState({
    supplier_name: initial?.supplier_name ?? "",
    sale_value: initial?.sale_value ?? defaultSale,
    tax_value: initial?.tax_value ?? defaultTax,
    discount_value: initial?.discount_value ?? 0,
    commission_value: initial?.commission_value ?? 0,
    commission_pct: initial?.commission_pct ?? defaultCommissionPct(selectedKind, isPackage),
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
    setForm({
      supplier_name: initial?.supplier_name ?? "",
      sale_value: sale,
      tax_value: tax,
      discount_value: disc,
      commission_value: initial?.commission_value ?? Number(((sale - tax) * (basePct / 100)).toFixed(2)),
      commission_pct: basePct,
      exchange_rate: initial?.exchange_rate ?? 1,
      due_date: initial?.due_date ?? "",
      total: initial?.total ?? Number((sale - disc).toFixed(2)),
      notes: initial?.notes ?? "",
    });
  }, [initial, selectedKind, isPackage, defaultSale, defaultTax]);


  // Recalcula comissão sobre (tarifa − taxas) e total = tarifa − desconto
  const recalc = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    const sale = Number(next.sale_value) || 0;
    const tax = Number(next.tax_value) || 0;
    const disc = Number(next.discount_value) || 0;
    const pct = Number(next.commission_pct) || 0;
    const base = Math.max(0, sale - tax);
    next.commission_value = Number((base * (pct / 100)).toFixed(2));
    next.total = Number((sale - disc).toFixed(2));
    setForm(next);
  };

  const base = Math.max(0, (Number(form.sale_value) || 0) - (Number(form.tax_value) || 0));

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

          {/* Comissão: só % sobre a tarifa (sem reguinha) */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Comissão sobre a tarifa</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" step="0.5" min={0} max={100}
                  value={form.commission_pct}
                  onChange={(e) => recalc({ commission_pct: Number(e.target.value) })}
                  className="w-20 h-8 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Base: {formatBRL(base)} (tarifa − taxas)</span>
              <span>
                Comissão: <span className="font-semibold text-brand-orange">{formatBRL(form.commission_value)}</span>
              </span>
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
  { value: "paid", label: "PAGO", className: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
  { value: "pending", label: "PENDENTE", className: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
  { value: "cancelled", label: "CANCELADO", className: "bg-muted text-muted-foreground" },
  { value: "refunded", label: "ESTORNADO", className: "bg-red-500/20 text-red-600 dark:text-red-400" },
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
  orderId, clientName, payments, onChange,
}: {
  orderId: string;
  clientName: string;
  payments: OrderPayment[];
  onChange: () => void;
}) {
  const upsert = useServerFn(upsertOrderPayment);
  const del = useServerFn(deleteOrderPayment);
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
                      Pagamento{p.cashier_number ? ` – Caixa ${p.cashier_number}` : ""}
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
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 text-sm">
            <span className="text-muted-foreground uppercase tracking-wider text-xs">Total pago</span>
            <span className="font-semibold">{formatBRL(grandTotal)}</span>
          </div>
        </div>
      )}

      <PaymentDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        initial={editing}
        onSave={(data) => upsertMut.mutate({ ...data, order_id: orderId, id: editing?.id })}
      />
    </div>
  );
}

function PaymentDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderPayment | null;
  onSave: (data: Partial<OrderPayment> & { method: string; amount: number }) => void;
}) {
  const [form, setForm] = useState<Partial<OrderPayment>>({});
  useMemo(() => {
    setForm(initial ?? {
      status: "paid",
      method: "pix",
      amount: 0,
      paid_at: new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const method = form.method ?? "pix";
  const showCard = method === "credit_card" || method === "debit_card";
  const showInstallments = method === "credit_card" || method === "financing";

  const setField = <K extends keyof OrderPayment>(k: K, v: OrderPayment[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar pagamento" : "Adicionar pagamento"}</DialogTitle>
        </DialogHeader>
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
            <Label>Autorização (banco)</Label>
            <Input value={form.authorization_code ?? ""} onChange={(e) => setField("authorization_code", e.target.value)} />
          </div>
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
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({
            ...form,
            method: form.method ?? "pix",
            amount: Number(form.amount ?? 0),
          } as Partial<OrderPayment> & { method: string; amount: number })}>Salvar</Button>
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
  const pax = Math.max(1, (order.adults || 0) + (order.children || 0));
  const pkgTotal = isPackage ? Number((snap as { price_per_person?: number }).price_per_person ?? 0) * pax : 0;
  const pkgTaxes = isPackage ? Number((snap as { taxes?: number }).taxes ?? 0) : 0;
  // Tarifa NET = total do pacote − taxas. Comissão padrão (12%) já está embutida nesse preço.
  const pkgFareNet = Math.max(0, pkgTotal - pkgTaxes);
  const PKG_DEFAULT_PCT = 12;
  const pkgDefaultCommission = Number((pkgFareNet * (PKG_DEFAULT_PCT / 100)).toFixed(2));

  const [sale, setSale] = useState(0);
  const [tax, setTax] = useState(0);
  const [pct, setPct] = useState(isPackage ? PKG_DEFAULT_PCT : 10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r2 = (n: number) => Number(n.toFixed(2));
    if (isPackage) {
      // Pacote pronto: força tarifa NET e taxas do snapshot; ignora convenções antigas.
      setSale(r2(pkgFareNet));
      setTax(r2(pkgTaxes));
    } else {
      const relevant = items.map((it) => financials.find((f) => f.order_item_id === it.id)).filter(Boolean) as OrderItemFinancial[];
      const sumSale = relevant.reduce((a, f) => a + Number(f.sale_value || 0), 0);
      const sumTax = relevant.reduce((a, f) => a + Number(f.tax_value || 0), 0);
      setSale(r2(sumSale));
      setTax(r2(sumTax));
    }
    const relevant = items.map((it) => financials.find((f) => f.order_item_id === it.id)).filter(Boolean) as OrderItemFinancial[];
    const firstWithPct = relevant.find((f) => f.commission_pct !== null && f.commission_pct !== undefined);
    setPct(firstWithPct ? Number(firstWithPct.commission_pct) : (isPackage ? PKG_DEFAULT_PCT : 10));
  }, [open, items, financials, pkgFareNet, pkgTaxes, isPackage]);


  // sale = tarifa NET (sem taxas). Comissão incide sobre a tarifa.
  const base = Math.max(0, sale);
  const commission = Number((base * (pct / 100)).toFixed(2));
  // Pacote pronto: total = tarifa + taxas + delta sinalizado (comissão - 12%*tarifa).
  // Se pct < 12, o total DIMINUI; se pct > 12, o total AUMENTA.
  // Manual: total = tarifa + taxas + comissão.
  const total = isPackage
    ? Number((sale + tax + (commission - pkgDefaultCommission)).toFixed(2))
    : Number((sale + tax + commission).toFixed(2));

  const handleSave = async () => {
    if (items.length === 0) { toast.error("Adicione ao menos um item"); return; }
    setSaving(true);
    try {
      // Distribui tarifa e taxas proporcionalmente ao peso atual de cada item.
      // Se nenhum item tem valor gravado, divide igualmente.
      const currents = items.map((it) => {
        const f = financials.find((x) => x.order_item_id === it.id);
        return {
          item: it,
          existing: f,
          curSale: Number(f?.sale_value ?? 0),
          curTax: Number(f?.tax_value ?? 0),
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
                  <div className="text-[10px] text-muted-foreground mt-1 leading-snug break-words">
                    {pct < PKG_DEFAULT_PCT
                      ? `Desconto aplicado: ${formatBRL(Math.max(0, pkgDefaultCommission - commission))}`
                      : pct > PKG_DEFAULT_PCT
                      ? `Acréscimo acima de ${PKG_DEFAULT_PCT}%: ${formatBRL(Math.max(0, commission - pkgDefaultCommission))}`
                      : `Comissão padrão do pacote (${PKG_DEFAULT_PCT}%)`}
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


