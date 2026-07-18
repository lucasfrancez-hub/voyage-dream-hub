import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { detectBrand } from "@/components/CardForm";

import {
  ArrowLeft, Hotel, Plane, XCircle, FileText, DollarSign, Users, Plus,
  Pencil, Trash2, Ban, RotateCcw, Loader2, Copy, Download, Hash,
  Package, Percent, Mail, Printer, CheckCircle2, MoreHorizontal, Signature,
  Vault, ExternalLink, X, UserPlus, Star, Backpack, Briefcase, Luggage,
  Phone, CreditCard,
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
  upsertOrderPayment, deleteOrderPayment, updateOrderPayer, revealOrderPaymentCardNumber,
  appendOrderLogEntry, deleteOrderLogEntry,
  linkPassengerToItem, unlinkPassengerFromItem, getMySellerInfo, deleteAllOrderPassengers,
  type OrderDetail, type OrderHeader, type OrderPassenger, type OrderItem, type OrderItemFinancial, type OrderPayment, type OrderLogEntry,
} from "@/lib/orders.functions";
import { MondePersonSearchDialog } from "@/components/monde/MondePersonSearchDialog";
import { AirlineCombobox } from "@/components/AirlineCombobox";
import { AirlineLogo } from "@/components/AirlineLogo";
import { FlightNumberInput } from "@/components/FlightNumberInput";
import { ClassSelect } from "@/components/ClassSelect";

import { iataCity } from "@/lib/iata-lookup";
import { CABIN_CLASSES, fareClassesFor } from "@/lib/airline-fares";
import { Cloud } from "lucide-react";
import { Slider } from "@/components/ui/slider";


import { type AuthorizationData, type LivenessData } from "@/lib/authorization-pdf";
import { generateReceiptAndContract, generateReceiptOnly, generateReceiptContractAndAuthorization, generateOrderAuthorization, openBlobInNewTab } from "@/lib/contract-pdf";
import { OrderDocuments } from "@/components/OrderDocuments";
import { ClickSignCard } from "@/components/clicksign/ClickSignCard";
import { getSignatureStatus } from "@/lib/clicksign.functions";
import type { Json } from "@/integrations/supabase/types";
import { HotelAutocomplete, type HotelSelection } from "@/components/HotelAutocomplete";
import { QuoteDialog } from "@/components/QuoteDialog";
import { FlightLookupButton } from "@/components/FlightLookupButton";
import { ImportarAereoDialog } from "@/components/ImportarAereoDialog";
import { ImportarVoucherDialog } from "@/components/ImportarVoucherDialog";
import { ImportarMultiDialog } from "@/components/ImportarMultiDialog";
import { confirmThen } from "@/lib/confirm";
import { findAirline, airlineLogo } from "@/lib/airlines";
import { searchPeople, upsertPerson, listPersonCards, addPersonCard, revealPersonCardNumber, type PersonCardRow } from "@/lib/people.functions";
import { Search, Save } from "lucide-react";


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
  const [openQuote, setOpenQuote] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  const setOrderStatusFn = useServerFn(setOrderStatus);
  const updateOrderMetaFn = useServerFn(updateOrderMeta);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "orderDetail", id] });

  const orderStatusMut = useMutation({
    mutationFn: (status: "confirmed" | "reserved" | "cancelled" | "pending" | "paid" | "awaiting_signature") =>
      setOrderStatusFn({ data: { id: (data as OrderDetail | undefined)?.order.id ?? "", status } }),
    onSuccess: (_r, status) => {
      toast.success(
        status === "confirmed" ? "Pedido confirmado"
        : status === "paid" ? "Pedido finalizado"
        : status === "cancelled" ? "Pedido cancelado"
        : "Pedido reaberto",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const metaMut = useMutation({
    mutationFn: (patch: {
      notes?: string | null;
      travel_reason?: string | null;
      coupon?: string | null;
      trip_title?: string | null;
      seller_name?: string | null;
      seller_email?: string | null;
      seller_phone?: string | null;
      supplier_logo_url?: string | null;
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      cpf?: string | null;
      birth_date?: string | null;
      adults?: number | null;
      children?: number | null;
      expected_total?: number | null;
    }) =>
      updateOrderMetaFn({ data: { id: (data as OrderDetail | undefined)?.order.id ?? "", ...patch } }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadedDetail = data as OrderDetail | undefined;
  const loadedOrder = loadedDetail?.order;

  // Estes hooks precisam rodar também durante o carregamento. Mantê-los abaixo
  // dos returns condicionais altera a ordem dos hooks quando os dados chegam.
  const sigStatusFn = useServerFn(getSignatureStatus);
  const { data: sigData } = useQuery({
    queryKey: ["clicksign", "status", loadedOrder?.id ?? id] as const,
    queryFn: () => sigStatusFn({ data: { pedidoId: loadedOrder?.id ?? id } }),
    enabled: Boolean(loadedOrder),
    refetchInterval: (q) => (q.state.data?.assinatura?.status === "running" ? 15000 : false),
  });

  const hasPayment = (loadedDetail?.payments ?? []).some(
    (p) => String(p.status ?? "").toLowerCase() !== "cancelled",
  );
  const sigStatus = sigData?.assinatura?.status ?? null;
  const manualStatus = (loadedOrder?.status || "").toLowerCase();
  const derivedStatus: string =
    manualStatus === "cancelled" || manualStatus === "canceled" || manualStatus === "rejected"
      ? manualStatus
      : (sigStatus === "closed" || manualStatus === "paid" || manualStatus === "approved")
        ? "paid"
        : (sigStatus === "running" || sigStatus === "draft")
          ? "awaiting_signature"
          : manualStatus === "confirmed"
            ? "confirmed"
            : hasPayment
              ? "confirmed"
              : "pending";

  const setStatusSilent = useServerFn(setOrderStatus);
  useEffect(() => {
    if (!loadedOrder) return;
    const current = (loadedOrder.status || "").toLowerCase();
    if (!derivedStatus || derivedStatus === current) return;
    const allowed = ["confirmed", "reserved", "cancelled", "pending", "paid", "awaiting_signature"] as const;
    if (!(allowed as readonly string[]).includes(derivedStatus)) return;
    setStatusSilent({ data: { id: loadedOrder.id, status: derivedStatus as (typeof allowed)[number] } })
      .then(() => qc.invalidateQueries({ queryKey: ["admin", "orders"] }))
      .catch(() => {});
  }, [derivedStatus, loadedOrder, qc, setStatusSilent]);

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

  const hotelItems = detail.items.filter((i) => i.kind === "hotel" && i.status !== "cancelled");
  const flightItems = detail.items.filter((i) => i.kind === "flight" && i.status !== "cancelled");
  const serviceItems = detail.items.filter((i) => i.kind === "other" && i.status !== "cancelled");
  const cancelledItems = detail.items.filter((i) => i.status === "cancelled");

  // Deriva o status "visível" no cabeçalho a partir de pagamentos + assinatura,
  // permitindo override manual pelo botão de Ação (paid/confirmed/cancelled/rejected).
  // Regras (ordem de prioridade):
  //   1) manual cancelled/rejected → mantém
  //   2) assinatura fechada OU manual paid → Finalizado (paid)
  //   3) assinatura em andamento/rascunho → Aguardando assinatura
  //   4) manual confirmed → Confirmado
  //   5) tem pagamento (não cancelado) → Confirmado
  //   6) senão → Pendente
  const st = statusLabel(derivedStatus);





  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="flex items-center gap-2 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/pedidos">
            <ArrowLeft className="h-4 w-4 mr-1" /> Pedidos
          </Link>
        </Button>
        <div className="text-xs text-muted-foreground">/ Detalhe</div>
      </div>

      {/* Header — Command center layout */}
      <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Top meta bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-muted/30 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="flex items-center gap-1.5">
              <Hash className="h-3 w-3 opacity-60" />
              <span className="text-foreground font-mono">{order.orderNumber}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="opacity-60">Ref</span>
              <span className="text-foreground/80">{shortId(order.id)}</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 ${st.className}`}>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80"></span>
              <span>{st.label}</span>
            </div>

          </div>
          <div className="text-[10px] normal-case tracking-normal text-muted-foreground">
            <span className="opacity-70 italic">Criado em </span>
            <span className="text-foreground/80">{new Date(order.createdAt).toLocaleString("pt-BR")}</span>
          </div>
        </div>

        {/* Main content — identity + total */}
        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 min-w-0 space-y-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight leading-tight break-words">
                {order.fullName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {order.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 opacity-60" />
                    <span className="break-all">{order.email}</span>
                  </div>
                )}
                {order.phone && (
                  <>
                    <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-border"></span>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-4 w-4 opacity-60" />
                      <span>{order.phone}</span>
                    </div>
                  </>
                )}
                {order.cpf && (
                  <>
                    <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-border"></span>
                    <span className="text-xs">CPF {order.cpf}</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                Título da viagem (voucher)
              </Label>
              <Input
                defaultValue={order.tripTitle ?? ""}
                placeholder="Ex: Pacote para São Paulo"
                className="h-10 text-sm bg-muted/30 border-border/60 focus-visible:border-brand-orange/50 focus-visible:ring-brand-orange/40"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if ((v || null) !== (order.tripTitle ?? null)) metaMut.mutate({ trip_title: v || null });
                }}
              />
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-start lg:items-end">
            <div className="text-left lg:text-right">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Valor total</p>
              <div className="flex items-baseline gap-2 lg:justify-end">
                <span className="text-brand-orange text-base font-medium">BRL</span>
                <span className="text-3xl sm:text-4xl font-display font-bold tabular-nums tracking-tight">
                  {new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(order.totalPrice || 0)}
                </span>
              </div>

              {order.expectedTotal != null && order.expectedTotal > 0 && (() => {
                const diff = order.totalPrice - order.expectedTotal;
                const within = diff <= 0;
                return (
                  <div className="mt-1.5 text-[11px] flex lg:justify-end items-center gap-1 text-muted-foreground">
                    <span>Previsto:</span>
                    <span className="font-medium text-foreground/80">{formatBRL(order.expectedTotal)}</span>
                    <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${within ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                      {within ? "dentro" : `+${formatBRL(diff)}`}
                    </span>
                  </div>
                );
              })()}

              <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border ${pm.className}`}>
                <CreditCard className="h-3 w-3 opacity-70" />
                <span className="text-[10px] font-bold uppercase tracking-wide">{pm.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-background/40 border-t border-border/60 flex flex-wrap items-center justify-between gap-3">
          {/* Utility / secondary actions */}
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" className="h-9 gap-2 text-muted-foreground hover:text-foreground" onClick={() => setOpenQuote(true)}>
              <FileText className="h-4 w-4" /> Orçamento
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9 gap-2 text-muted-foreground hover:text-foreground">
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
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
                <DropdownMenuItem onClick={async () => {
                  const tId = toast.loading("Gerando voucher em português…");
                  try {
                    const { generateVoucher } = await import("@/lib/voucher-pdf");
                    const blob = await generateVoucher(detail, "pt");
                    openBlobInNewTab(blob, `voucher-${order.orderNumber}.pdf`);
                    toast.success("Voucher gerado", { id: tId });
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar voucher", { id: tId }); }
                }}><FileText className="h-3.5 w-3.5 mr-2" /> Voucher (PT)</DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  const tId = toast.loading("Generating voucher in English…");
                  try {
                    const { generateVoucher } = await import("@/lib/voucher-pdf");
                    const blob = await generateVoucher(detail, "en");
                    openBlobInNewTab(blob, `voucher-${order.orderNumber}-en.pdf`);
                    toast.success("Voucher ready", { id: tId });
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Error generating voucher", { id: tId }); }
                }}><FileText className="h-3.5 w-3.5 mr-2" /> Voucher (EN)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9 gap-2 text-muted-foreground hover:text-foreground">
                  <Mail className="h-4 w-4" /> E-mail
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => toast.info("Envio de contrato — em breve")}><FileText className="h-3.5 w-3.5 mr-2" /> Contrato</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Envio de confirmação — em breve")}><CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Confirmação</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Envio de voucher — em breve")}><FileText className="h-3.5 w-3.5 mr-2" /> Voucher</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-6 w-px bg-border/60 mx-1 hidden sm:block"></div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground" title="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setOpenEdit(true)}><Pencil className="h-3.5 w-3.5 mr-2" /> Editar pedido</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenCommission(true)}><Percent className="h-3.5 w-3.5 mr-2" /> Ajuste de comissão</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenLog("notes_log")}><FileText className="h-3.5 w-3.5 mr-2" /> Observação ({order.notesLog?.length ?? 0})</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenLog("travel_reason_log")}><FileText className="h-3.5 w-3.5 mr-2" /> Motivo da viagem ({order.travelReasonLog?.length ?? 0})</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => confirmThen("Confirmar o pedido e todos os itens?", () => orderStatusMut.mutate("confirmed"))}><CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Confirmar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmThen("Marcar o pedido como finalizado?", () => orderStatusMut.mutate("paid"))}><CheckCircle2 className="h-3.5 w-3.5 mr-2 text-green-500" /> Finalizado</DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmThen("Cancelar o pedido e todos os itens?", () => orderStatusMut.mutate("cancelled"))}><Ban className="h-3.5 w-3.5 mr-2 text-amber-500" /> Cancelar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmThen("Reabrir o pedido como pendente?", () => orderStatusMut.mutate("pending"))}><RotateCcw className="h-3.5 w-3.5 mr-2" /> Reabrir</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setActiveTab("contract");
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("clicksign:open-send", { detail: { orderId: order.id, withAuth: true } }));
                  }, 150);
                }}><Signature className="h-3.5 w-3.5 mr-2 text-brand-orange" /> Acionar contrato Clicksign</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Core / primary actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 gap-2">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>

            <ImportarMultiDialog
              orderId={id}
              onImported={invalidate}
              trigger={
                <Button size="sm" variant="outline" className="h-9 gap-2 border-brand-orange/30 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 hover:text-brand-orange">
                  <Download className="h-4 w-4" /> Importar voucher
                </Button>
              }
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9 gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold shadow-[0_10px_20px_-10px_rgba(242,107,31,0.5)]">
                  <DollarSign className="h-4 w-4" /> Gerar link de pagamento
                </Button>
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
          <TabsList className="flex w-full flex-nowrap overflow-x-auto h-auto justify-start sm:flex-wrap">
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
              packageSnapshot={order.packageSnapshot}
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
              packageSnapshot={order.packageSnapshot}
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
              packageSnapshot={order.packageSnapshot}
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
              packageSnapshot={order.packageSnapshot}
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
        detail={detail}
        items={detail.items}
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

      <QuoteDialog
        open={openQuote}
        onOpenChange={setOpenQuote}
        orderId={order.id}
        orderNumber={order.orderNumber}
        customerPhone={order.phone}
      />

      <EditOrderDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        order={order}
        onSave={(patch) => { metaMut.mutate(patch); setOpenEdit(false); }}
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
  const delAll = useServerFn(deleteAllOrderPassengers);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<OrderPassenger | null>(null);
  const [open, setOpen] = useState(false);
  const [mondeOpen, setMondeOpen] = useState(false);

  const patchDetail = (fn: (d: OrderDetail) => OrderDetail) =>
    qc.setQueryData<OrderDetail>(["admin", "orderDetail", orderId], (d) => (d ? fn(d) : d));

  const save = useMutation({
    mutationFn: async (p: Partial<OrderPassenger> & { order_id: string; full_name: string }) =>
      upsert({ data: p }),
    onSuccess: () => { toast.success("Passageiro salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (pid: string) => del({ data: { id: pid } }),
    onMutate: (pid: string) => {
      patchDetail((d) => ({ ...d, passengers: d.passengers.filter((p) => p.id !== pid) }));
    },
    onSuccess: () => { toast.success("Passageiro removido"); onChange(); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Erro"); onChange(); },
  });
  const removeAll = useMutation({
    mutationFn: async () => delAll({ data: { order_id: orderId } }),
    onMutate: () => { patchDetail((d) => ({ ...d, passengers: [] })); },
    onSuccess: () => { toast.success("Passageiros removidos"); onChange(); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Erro"); onChange(); },
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
          {passengers.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => confirmThen(`Excluir todos os ${passengers.length} passageiros?`, () => removeAll.mutate())}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir todos
            </Button>
          )}
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
                    // Se alterou o bilhete: atualiza status dos aéreos (confirmado se algum passageiro tem bilhete).
                    if (patch.ticket_number !== undefined) {
                      const anyTicket =
                        (patch.ticket_number && patch.ticket_number.trim()) ||
                        passengers.some((pp) => pp.id !== p.id && (pp.ticket_number ?? "").trim());
                      for (const fi of flightItems) {
                        const details = { ...((fi.details ?? {}) as Record<string, unknown>) };
                        // Remove ticket_number legado do item (bilhete agora vive só no passageiro)
                        delete (details as Record<string, unknown>).ticket_number;
                        upsertItem({
                          data: {
                            id: fi.id,
                            order_id: orderId,
                            kind: "flight",
                            title: fi.title,
                            supplier_locator: fi.supplier_locator,
                            details: details as Json,
                            sort_order: fi.sort_order,
                            status: anyTicket ? "confirmed" : (fi.supplier_locator ? "reserved" : "pending"),
                          },
                        }).catch(() => { /* toast já é global */ });
                      }
                      setTimeout(() => onChange(), 250);
                    }
                  }}
                  onDelete={() => confirmThen("Remover passageiro?", () => remove.mutate(p.id))}
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
  orderId, items, kind, onChange, passengers, itemPassengers, packageSnapshot,
}: {
  orderId: string;
  items: OrderItem[];
  kind: "hotel" | "flight" | "other" | "cancelled";
  onChange: () => void;
  passengers?: OrderPassenger[];
  itemPassengers?: Record<string, string[]>;
  packageSnapshot?: unknown;
}) {

  const upsert = useServerFn(upsertOrderItem);
  const del = useServerFn(deleteOrderItem);
  const setStatus = useServerFn(setOrderItemStatus);
  const recalculateTotal = useServerFn(recalculateOrderTotal);
  const linkFn = useServerFn(linkPassengerToItem);
  const unlinkFn = useServerFn(unlinkPassengerFromItem);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(() => new Set());

  const allPax = passengers ?? [];
  const linksMap = itemPassengers ?? {};
  const visibleItems = items.filter((item) => !pendingDeleteIds.has(item.id));

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
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (iid: string) => {
      await del({ data: { id: iid } });
      return recalculateTotal({ data: { id: orderId } });
    },
    onMutate: async (iid: string) => {
      await qc.cancelQueries({ queryKey: ["admin", "orderDetail", orderId] });
      qc.setQueryData<OrderDetail>(["admin", "orderDetail", orderId], (d) => d ? ({
        ...d,
        items: d.items.filter((i) => i.id !== iid),
        financials: d.financials.filter((f) => f.order_item_id !== iid),
      }) : d);
    },
    onSuccess: async (_result, iid) => {
      toast.success("Item removido");
      await qc.invalidateQueries({ queryKey: ["admin", "orderDetail", orderId] });
      setPendingDeleteIds((current) => {
        const next = new Set(current);
        next.delete(iid);
        return next;
      });
    },
    onError: (error, iid) => {
      setPendingDeleteIds((current) => {
        const next = new Set(current);
        next.delete(iid);
        return next;
      });
      toast.error(error instanceof Error ? error.message : "Erro ao excluir item");
      onChange();
    },
  });
  const removeImmediately = (iid: string) => {
    setPendingDeleteIds((current) => new Set(current).add(iid));
    remove.mutate(iid);
  };
  const removeManyImmediately = (selectedItems: OrderItem[]) => {
    const ids = selectedItems.map((item) => item.id);
    setPendingDeleteIds((current) => new Set([...current, ...ids]));
    ids.forEach((iid) => remove.mutate(iid));
  };
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
        <div className="flex justify-end mb-3 gap-2">
          {kind === "flight" && (
            <ImportarAereoDialog
              orderId={orderId}
              onImported={onChange}
              trigger={
                <Button size="sm" className="gap-1 bg-orange-500 hover:bg-orange-600 text-white">
                  <Download className="h-3.5 w-3.5" /> Importar reserva
                </Button>
              }

            />
          )}
          {(kind === "hotel" || kind === "other") && (
            <ImportarVoucherDialog
              orderId={orderId}
              kind={kind}
              onImported={onChange}
              trigger={
                <Button size="sm" className="gap-1 bg-orange-500 hover:bg-orange-600 text-white">
                  <Download className="h-3.5 w-3.5" /> Importar voucher
                </Button>
              }
            />
          )}
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar {addLabel}
          </Button>
        </div>
      )}
      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {isCancelledTab ? "Nenhum item cancelado." : "Nenhum item cadastrado. Clique em Adicionar para começar."}
        </div>
      ) : isCancelledTab ? (
        <div className="space-y-3">
          {groupFlightItems(visibleItems.filter((i) => i.kind === "flight")).map((group) => (
            <FlightReservationCard
              key={group.key}
              locator={group.locator}
              segments={group.items}
              passengers={paxForItems(group.items.map((s) => s.id))}
              allPassengers={allPax}
              packageSnapshot={packageSnapshot}
              onEdit={(it) => { setEditing(it); setOpen(true); }}
              onDelete={(it) => confirmThen("Excluir este voo?", () => removeImmediately(it.id))}
              onCancel={(it) => confirmThen("Marcar este voo como cancelado?", () => cancel.mutate(it.id))}
              onReactivate={(it) => reactivate.mutate(it.id)}
              onDeleteMany={(its) => confirmThen(`Excluir toda a reserva (${its.length} ${its.length === 1 ? "trecho" : "trechos"})?`, () => removeManyImmediately(its))}
              onCancelMany={(its) => confirmThen(`Cancelar toda a reserva (${its.length} ${its.length === 1 ? "trecho" : "trechos"})?`, () => its.forEach((it) => cancel.mutate(it.id)))}
              onLink={(pid, iids) => linkMut.mutate({ passengerId: pid, itemIds: iids })}
              onUnlink={(pid, iids) => unlinkMut.mutate({ passengerId: pid, itemIds: iids })}
            />
          ))}
          {visibleItems.filter((i) => i.kind === "hotel").map((it) => (
            <HotelReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirmThen("Excluir item?", () => removeImmediately(it.id))}
              onCancel={() => confirmThen("Marcar como cancelado?", () => cancel.mutate(it.id))}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}
          {visibleItems.filter((i) => i.kind === "other").map((it) => (
            <ServiceReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirmThen("Excluir item?", () => removeImmediately(it.id))}
              onCancel={() => confirmThen("Marcar como cancelado?", () => cancel.mutate(it.id))}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}

        </div>
      ) : kind === "flight" ? (
        <div className="space-y-3">
          {groupFlightItems(visibleItems).map((group) => (
            <FlightReservationCard
              key={group.key}
              locator={group.locator}
              segments={group.items}
              passengers={paxForItems(group.items.map((s) => s.id))}
              allPassengers={allPax}
              packageSnapshot={packageSnapshot}
              onEdit={(it) => { setEditing(it); setOpen(true); }}
              onDelete={(it) => confirmThen("Excluir este voo?", () => removeImmediately(it.id))}
              onCancel={(it) => confirmThen("Marcar este voo como cancelado?", () => cancel.mutate(it.id))}
              onReactivate={(it) => reactivate.mutate(it.id)}
              onDeleteMany={(its) => confirmThen(`Excluir toda a reserva (${its.length} ${its.length === 1 ? "trecho" : "trechos"})?`, () => removeManyImmediately(its))}
              onCancelMany={(its) => confirmThen(`Cancelar toda a reserva (${its.length} ${its.length === 1 ? "trecho" : "trechos"})?`, () => its.forEach((it) => cancel.mutate(it.id)))}
              onLink={(pid, iids) => linkMut.mutate({ passengerId: pid, itemIds: iids })}
              onUnlink={(pid, iids) => unlinkMut.mutate({ passengerId: pid, itemIds: iids })}
            />
          ))}
        </div>
      ) : kind === "hotel" ? (
        <div className="space-y-3">
          {visibleItems.map((it) => (
            <HotelReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirmThen("Excluir item?", () => removeImmediately(it.id))}
              onCancel={() => confirmThen("Marcar como cancelado?", () => cancel.mutate(it.id))}
              onReactivate={() => reactivate.mutate(it.id)}
              onLink={(pid, iid) => linkMut.mutate({ passengerId: pid, itemIds: [iid] })}
              onUnlink={(pid, iid) => unlinkMut.mutate({ passengerId: pid, itemIds: [iid] })}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((it) => (
            <ServiceReservationCard
              key={it.id}
              item={it}
              passengers={paxForItem(it.id)}
              allPassengers={allPax}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirmThen("Excluir item?", () => removeImmediately(it.id))}
              onCancel={() => confirmThen("Marcar como cancelado?", () => cancel.mutate(it.id))}
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
        passengers={allPax}
        siblings={
          editing && editing.kind === "flight"
            ? items.filter((i) =>
                i.kind === "flight" &&
                i.status !== "cancelled" &&
                i.id !== editing.id &&
                flightGroupKey(i) === flightGroupKey(editing),
              )
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

              // Localizador e bilhete pertencem somente a esta reserva. Nunca
              // propagar para outros cartões aéreos do mesmo pedido.
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
function flightGroupKey(item: OrderItem): string {
  const details = (item.details ?? {}) as Record<string, unknown>;
  const carrierLocator = String(details.carrier_locator ?? "").trim();
  const supplierLocator = item.supplier_locator?.trim() ?? "";
  const locator = carrierLocator || supplierLocator;
  if (locator) return `loc:${locator.toUpperCase()}`;
  // Sem localizador: cada item vira seu próprio card pra não misturar
  // reservas diferentes num único bloco "sem localizador".
  return `item:${item.id}`;
}
function groupFlightItems(items: OrderItem[]): FlightGroup[] {
  const map = new Map<string, FlightGroup>();
  for (const it of items) {
    const details = (it.details ?? {}) as Record<string, unknown>;
    const carrierLocator = String(details.carrier_locator ?? "").trim();
    const key = flightGroupKey(it);
    if (!map.has(key)) map.set(key, { key, locator: carrierLocator || it.supplier_locator?.trim() || null, items: [] });
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
  locator, segments, passengers, allPassengers, packageSnapshot, onEdit, onDelete, onCancel, onReactivate, onDeleteMany, onCancelMany, onLink, onUnlink,
}: {
  locator: string | null;
  segments: OrderItem[];
  passengers: OrderPassenger[];
  allPassengers?: OrderPassenger[];
  packageSnapshot?: unknown;
  onEdit: (it: OrderItem) => void;
  onDelete: (it: OrderItem) => void;
  onCancel: (it: OrderItem) => void;
  onReactivate: (it: OrderItem) => void;
  onDeleteMany?: (its: OrderItem[]) => void;
  onCancelMany?: (its: OrderItem[]) => void;
  onLink?: (passengerId: string, segmentIds: string[]) => void;
  onUnlink?: (passengerId: string, segmentIds: string[]) => void;
}) {
  const allCancelled = segments.every((s) => s.status === "cancelled");
  const first = segments[0];
  const d0 = (first?.details ?? {}) as Record<string, unknown>;
  const supplier = typeof d0.supplier_name === "string" ? (d0.supplier_name as string) : "";

  // Bagagens por segmento: usa flags do próprio trecho; se ausentes, cai no packageSnapshot
  // (outbound_flight/return_flight) conforme a direção do trecho.
  const snap = (packageSnapshot && typeof packageSnapshot === "object")
    ? (packageSnapshot as Record<string, unknown>) : null;
  const bagsFor = (seg: OrderItem) => {
    const d = (seg.details ?? {}) as Record<string, unknown>;
    // Padrão: bolsa/mochila e bagagem de mão sempre inclusas, exceto quando
    // o usuário desmarcar (=== false). Despachada continua opt-in.
    let personal = d.personal_item !== false;
    let carry = d.carry_on !== false;
    let checked = !!d.checked_bag;
    if (!checked && snap) {
      const dir = String(d.direction ?? "outbound");
      const src = dir === "return" ? snap.return_flight : snap.outbound_flight;
      if (src && typeof src === "object") {
        const s = src as Record<string, unknown>;
        checked ||= !!s.checked_bag;
      }
    }
    return { personal, carry, checked, any: personal || carry || checked };
  };



  
  return (
    <div className={`rounded-xl border p-4 ${allCancelled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
        {/* Coluna 1: localizador */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Plane className="h-3.5 w-3.5" /> Reserva aérea
          </div>
          {(() => {
            // Resolve airline pelo IATA (do próprio segmento ou prefixo do voo)
            // pra usar o nome curto/registro + logo do nosso catálogo.
            const seen = new Set<string>();
            const airlines: Array<{ name: string; logo?: string; iata?: string }> = [];
            for (const s of segments) {
              const d = (s.details ?? {}) as Record<string, unknown>;
              const iata = typeof d.airline_iata === "string" ? (d.airline_iata as string).toUpperCase() : "";
              const rawName = typeof d.airline === "string" ? (d.airline as string) : "";
              const flightNumber = typeof d.flight_number === "string" ? (d.flight_number as string) : "";
              const prefix = flightNumber.match(/^([A-Z0-9]{2})\s/)?.[1] ?? "";
              const hit = findAirline(prefix) ?? findAirline(iata) ?? findAirline(rawName);
              const name = hit?.name ?? rawName;
              const key = (hit?.iata ?? name).toUpperCase();
              if (!name || seen.has(key)) continue;
              seen.add(key);
              airlines.push({ name, logo: hit?.logo ?? airlineLogo(rawName), iata: hit?.iata });
            }
            if (airlines.length === 0) return null;
            return (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                {airlines.map((a, i) => (
                  <span key={a.iata ?? a.name ?? i} className="inline-flex items-center gap-1">
                    {a.name}
                  </span>
                ))}
              </div>
            );
          })()}

          <div className="mt-1 font-mono text-lg font-bold text-brand-orange">
            {locator ?? "—"}
          </div>
          {(() => {
            // LATAM: mostra o PNR (6 letras) logo abaixo do número de compra.
            const pnrs = new Set<string>();
            for (const s of segments) {
              const d = (s.details ?? {}) as Record<string, unknown>;
              const iata = String(d.airline_iata ?? "").toUpperCase();
              const fn = String(d.flight_number ?? "").toUpperCase();
              const prefix = fn.match(/^([A-Z]{1,2}[0-9]?|[0-9][A-Z])/)?.[1] ?? "";
              if (iata !== "LA" && prefix !== "LA") continue;
              const pnr = String(d.carrier_locator ?? "").toUpperCase().trim();
              if (pnr && pnr !== (locator ?? "").toUpperCase()) pnrs.add(pnr);
            }
            if (pnrs.size === 0) return null;
            return (
              <div className="mt-0.5 font-mono text-sm font-semibold text-brand-orange/80">
                {Array.from(pnrs).join(" · ")}
              </div>
            );
          })()}
          {(() => {
            const ticket = segments
              .map((s) => String(((s.details ?? {}) as Record<string, unknown>).ticket_number ?? "").trim())
              .find((t) => !!t);
            if (!ticket) return null;
            return (
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                E-ticket: <span className="normal-case font-mono text-foreground">{ticket}</span>
              </div>
            );
          })()}
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
              <Button size="sm" variant="ghost" onClick={() => confirmThen("Reativar todos os trechos desta reserva?", () => segments.forEach((s) => onReactivate(s)))} title="Reativar"><RotateCcw className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => {
                const active = segments.filter((s) => s.status !== "cancelled");
                if (!active.length) return;
                if (onCancelMany) onCancelMany(active);
                else active.forEach((s) => onCancel(s));
              }} title="Cancelar reserva"><Ban className="h-3.5 w-3.5 text-amber-500" /></Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => {
              if (onDeleteMany) onDeleteMany(segments);
              else segments.forEach((s) => onDelete(s));
            }} title="Excluir reserva"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>

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
            const rawAirline = (d.airline as string) || "";
            const segIata = typeof d.airline_iata === "string" ? (d.airline_iata as string).toUpperCase() : "";
            const flightPrefix = (flightNum.match(/^([A-Z0-9]{2})\s/)?.[1] ?? "").toUpperCase();
            const airlineHit = findAirline(flightPrefix) ?? findAirline(segIata) ?? findAirline(rawAirline);
            const airline = airlineHit?.name ?? rawAirline;
            const airlineKey = airlineHit?.iata ?? rawAirline;
            const cabin = ((d.cabin_class ?? d.cabin) as string) || "";
            const dep = (d.depart_at ?? d.departure) as string | undefined;
            const arr = (d.arrive_at ?? d.arrival) as string | undefined;
            const cancelled = seg.status === "cancelled";
            const sb = bagsFor(seg);
            return (
              <div key={seg.id} className={`rounded-lg border border-border/60 bg-muted/20 p-2.5 text-sm ${cancelled ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${dir === "return" ? "bg-brand-blue/15 text-brand-blue" : "bg-brand-orange/15 text-brand-orange"}`}>
                      {dir === "return" ? "Volta" : dir === "outbound" ? "Ida" : "Trecho"}
                    </span>
                    {airline && <AirlineLogo airline={airlineKey} size={22} />}
                    {airline && <span className="text-xs text-muted-foreground">{airline}</span>}
                    {flightNum && <span className="font-mono text-xs">{flightNum}</span>}
                    {cabin && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{cabin}</span>}
                  {cancelled && <span className="text-[10px] font-semibold uppercase text-destructive">Cancelado</span>}
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(seg)}
                  title="Excluir apenas este voo"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
                </div>
                <div className="mt-1.5 grid gap-1 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
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
                  {sb.any && (
                    <div className="flex items-center justify-end gap-1.5 sm:pl-2" title="Bagagens deste voo">
                      {sb.personal && <Backpack className="h-4 w-4 text-brand-orange" aria-label="Bolsa/mochila" />}
                      {sb.carry && <Briefcase className="h-4 w-4 text-brand-orange" aria-label="Bagagem de mão" />}
                      {sb.checked && <Luggage className="h-4 w-4 text-brand-orange" aria-label="Bagagem despachada" />}
                    </div>
                  )}
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
  const stars = (() => { const n = Number(d.hotel_stars); return Number.isFinite(n) && n > 0 ? n : null; })();
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
            {(() => {
              const df = typeof d.date_from === "string" ? (d.date_from as string) : "";
              const tf = typeof d.time_from === "string" ? (d.time_from as string) : "";
              const dt = typeof d.date_to === "string" ? (d.date_to as string) : "";
              const tt = typeof d.time_to === "string" ? (d.time_to as string) : "";
              const fmtD = (s: string) => s ? s.split("-").reverse().join("/") : "";
              const dep = [fmtD(df), tf].filter(Boolean).join(" ");
              const arr = [fmtD(dt), tt].filter(Boolean).join(" ");
              if (!dep && !arr) return null;
              return (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {dep && <div>Saída: <span className="text-foreground">{dep}</span></div>}
                  {arr && <div>Chegada: <span className="text-foreground">{arr}</span></div>}
                </div>
              );
            })()}
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
  open, onOpenChange, initial, kind, onSave, siblings, passengers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderItem | null;
  kind: "hotel" | "flight" | "other";
  siblings?: OrderItem[];
  passengers?: OrderPassenger[];
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
  const guestsFromPax = (() => {
    const list = passengers ?? [];
    const adt = list.filter((p) => (p.passenger_type ?? "ADT") === "ADT").length;
    const chd = list.filter((p) => p.passenger_type === "CHD").length;
    const inf = list.filter((p) => p.passenger_type === "INF").length;
    const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
    const parts: string[] = [];
    if (adt > 0) parts.push(plural(adt, "adulto", "adultos"));
    if (chd > 0) parts.push(plural(chd, "criança", "crianças"));
    if (inf > 0) parts.push(plural(inf, "bebê", "bebês"));
    return parts.join(", ");
  })();

  const initialDetails = (initial?.details ?? {}) as Record<string, unknown>;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [locator, setLocator] = useState(initial?.supplier_locator ?? "");
  const [status, setStatusVal] = useState<"confirmed" | "reserved" | "cancelled" | "pending">((initial?.status ?? "confirmed") as "confirmed" | "reserved" | "cancelled" | "pending");
  const [details, setDetails] = useState<Record<string, string | number | boolean>>(() => {
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(initialDetails)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k] = v;
    }
    if (kind === "flight" && !initial && !clean.direction) clean.direction = "outbound";
    if (kind === "hotel" && !clean.guests && guestsFromPax) clean.guests = guestsFromPax;
    return clean;
  });

  const cleanDetails = (raw: unknown): Record<string, string | number | boolean> => {
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k] = v;
    }
    return clean;
  };

  // Segmentos adicionais do mesmo aéreo (ex.: volta / conexões).
  // Segmento 0 = "main" (initial); segmentos 1+ = irmãos (podem ter id existente ou serem novos).
  type Segment = { id?: string; details: Record<string, string | number | boolean> };
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
    const d0 = cleanDetails(initial?.details);
    if (kind === "hotel" && !d0.guests && guestsFromPax) d0.guests = guestsFromPax;
    setDetails(d0);
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


  // Normaliza entrada monetária BRL. Aceita "11.585,85" (ponto milhar + vírgula decimal),
  // "11585,85", "11585.85" e devolve string com ponto decimal parsável por Number().
  const parseMoneyInput = (raw: string): string => {
    if (raw == null) return "";
    const s = String(raw).trim();
    if (!s) return "";
    const hasComma = s.includes(",");
    const hasDot = s.includes(".");
    if (hasComma && hasDot) return s.replace(/\./g, "").replace(",", ".");
    if (hasComma) return s.replace(",", ".");
    return s;
  };
  const setField = (k: string, v: string | boolean) => setDetails((p) => ({ ...p, [k]: v }));
  const setMoneyField = (k: string, v: string) => setDetails((p) => ({ ...p, [k]: parseMoneyInput(v) }));
  const setSegField = (idx: number, k: string, v: string | boolean) =>
    setExtraSegments((arr) => arr.map((s, i) => (i === idx ? { ...s, details: { ...s.details, [k]: v } } : s)));
  const addSegment = (direction: "outbound" | "return") =>
    setExtraSegments((arr) => [...arr, { details: { direction } }]);
  const removeSegment = (idx: number) => setExtraSegments((arr) => arr.filter((_, i) => i !== idx));
  const hasReturn = () => {
    if (String(details.direction ?? "") === "return") return true;
    return extraSegments.some((s) => String(s.details.direction ?? "") === "return");
  };


  const segmentTitle = (d: Record<string, string | number | boolean>): string => {
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
    d: Record<string, string | number | boolean>,
    label: string,
    onChangeField: (k: string, v: string | boolean) => void,
    onRemove?: () => void,
  ) => (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <FlightLookupButton
            airline={String(d.airline ?? "")}
            flightNumber={String(d.flight_number ?? "")}
            departAt={String(d.depart_at ?? d.departure ?? "")}
            onApply={(r) => {
              if (r.airline) onChangeField("airline", r.airline);
              if (r.flightNumber) onChangeField("flight_number", r.flightNumber);
              if (r.fromIata) onChangeField("from_iata", r.fromIata);
              if (r.fromCity) onChangeField("from_city", r.fromCity);
              if (r.toIata) onChangeField("to_iata", r.toIata);
              if (r.toCity) onChangeField("to_city", r.toCity);
              if (r.departAtLocal) onChangeField("depart_at", r.departAtLocal);
              if (r.arriveAtLocal) onChangeField("arrive_at", r.arriveAtLocal);
            }}
          />
          {onRemove && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onRemove}>
              Remover trecho
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Origem (IATA)</Label><Input value={String(d.from_iata ?? d.origin ?? "")} onChange={(e) => {
          const code = e.target.value.toUpperCase();
          onChangeField("from_iata", code);
          const city = iataCity(code);
          if (city) onChangeField("from_city", city);
        }} placeholder="GRU" maxLength={4} /></div>
        <div><Label>Destino (IATA)</Label><Input value={String(d.to_iata ?? d.destination ?? "")} onChange={(e) => {
          const code = e.target.value.toUpperCase();
          onChangeField("to_iata", code);
          const city = iataCity(code);
          if (city) onChangeField("to_city", city);
        }} placeholder="GIG" maxLength={4} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Cidade origem</Label><Input value={String(d.from_city ?? "")} onChange={(e) => onChangeField("from_city", e.target.value)} placeholder="São Paulo" /></div>
        <div><Label>Cidade destino</Label><Input value={String(d.to_city ?? "")} onChange={(e) => onChangeField("to_city", e.target.value)} placeholder="Rio de Janeiro" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cia aérea</Label>
          <AirlineCombobox
            value={String(d.airline ?? "")}
            onChange={(name) => {
              const a = findAirline(name);
              onChangeField("airline", name);
              // Se está no registro, limpa URL manual (o voucher resolve sozinho).
              if (a || !name) onChangeField("airline_logo_url", "");
              // Re-normaliza o nº do voo com o novo prefixo IATA.
              const curr = String(d.flight_number ?? "").trim();
              if (curr) {
                const m = curr.toUpperCase().match(/^[A-Z0-9]{2,3}\s*(.+)$/);
                const suffix = m && /\d/.test(m[1]) ? m[1].trim() : curr.toUpperCase();
                onChangeField("flight_number", a ? `${a.iata} ${suffix}` : suffix);
              }
            }}
          />
        </div>
        <div><Label>Nº do voo</Label><FlightNumberInput airline={String(d.airline ?? "")} value={String(d.flight_number ?? "")} onChange={(v) => onChangeField("flight_number", v)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Partida</Label><Input type="datetime-local" value={String(d.depart_at ?? d.departure ?? "")} onChange={(e) => onChangeField("depart_at", e.target.value)} /></div>
        <div><Label>Chegada</Label><Input type="datetime-local" value={String(d.arrive_at ?? d.arrival ?? "")} onChange={(e) => onChangeField("arrive_at", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Classe (cabine)</Label>
          <ClassSelect
            value={String(d.cabin_class ?? d.cabin ?? "")}
            onChange={(v) => onChangeField("cabin_class", v)}
            options={CABIN_CLASSES}
          />
        </div>
        <div>
          <Label>Classe tarifária</Label>
          <ClassSelect
            value={String(d.fare_class ?? "")}
            onChange={(v) => onChangeField("fare_class", v)}
            options={fareClassesFor(findAirline(String(d.airline ?? ""))?.iata)}
          />
        </div>
      </div>
      {d.airline && !findAirline(String(d.airline)) ? (
        <div>
          <Label>URL da logo da cia</Label>
          <Input value={String(d.airline_logo_url ?? "")} onChange={(e) => onChangeField("airline_logo_url", e.target.value)} placeholder="https://…/logo.png" />
        </div>
      ) : null}
      <div className="rounded-md border border-border p-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Bagagem inclusa</div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={d.personal_item !== false} onChange={(e) => onChangeField("personal_item", e.target.checked)} />
            Bolsa/mochila
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={d.carry_on !== false} onChange={(e) => onChangeField("carry_on", e.target.checked)} />
            Bagagem de mão

          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={!!d.checked_bag} onChange={(e) => onChangeField("checked_bag", e.target.checked)} />
            Bagagem despachada
          </label>
        </div>
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
                {kind === "hotel" ? (
                  <HotelAutocomplete
                    value={title}
                    onChangeText={setTitle}
                    onSelect={(h: HotelSelection) => {
                      setDetails((p) => {
                        const next = { ...p };
                        next.hotel_name = h.name;
                        if (h.address) next.address = h.address;
                        if (h.rating != null) next.hotel_stars = String(Math.round(h.rating));
                        if (h.latitude != null) next.latitude = String(h.latitude);
                        if (h.longitude != null) next.longitude = String(h.longitude);
                        next.tripadvisor_location_id = String(h.location_id);
                        if (h.tripadvisor_url) next.tripadvisor_url = h.tripadvisor_url;
                        if (h.phone) next.phone = h.phone;
                        if (h.website) next.website = h.website;
                        if (h.photos && h.photos.length > 0) next.tripadvisor_photos_json = JSON.stringify(h.photos);
                        if (h.description) next.description = h.description;
                        return next;
                      });
                    }}
                    placeholder="Ex: Copacabana Palace (busca no TripAdvisor)"
                  />
                ) : (
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Traslado, Passeio, Seguro viagem…" />
                )}
              </div>
            )}
            <div className={kind === "other" ? "" : "col-span-2"}>
              <Label>Localizador do fornecedor</Label>
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
                <p className="mt-1 text-[11px] text-muted-foreground">Opcional · se preencher, use no mínimo 6 caracteres (letras e/ou números).</p>
              )}
            </div>

            {kind === "flight" && (() => {
              // Detecta LATAM só pela cia atualmente selecionada / nº do voo.
              // (Ignora airline_iata bruto porque pode ter ficado "LA" de uma
              // importação anterior mesmo depois de trocar a cia no combo.)
              const airlineName = String(details.airline ?? "");
              const iataFromName = findAirline(airlineName)?.iata?.toUpperCase() ?? "";
              const fn = String(details.flight_number ?? "").toUpperCase();
              const prefix = fn.match(/^([A-Z]{2})\s*\d/)?.[1] ?? "";
              const isLatam = iataFromName === "LA" || prefix === "LA";
              if (!isLatam) return null;
              return (
                <div className="col-span-2">
                  <Label>Localizador PNR (6 letras)</Label>
                  <Input
                    value={String(details.carrier_locator ?? "")}
                    onChange={(e) => setField("carrier_locator", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="Ex: JXJDZZ"
                    maxLength={8}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">LATAM · aparece junto do número de compra na reserva.</p>
                </div>
              );
            })()}

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

          </div>

          {kind === "flight" && (
            <div>
              <Label>Link da companhia aérea (check-in / consulta)</Label>
              <Input
                value={String(details.airline_checkin_url ?? "")}
                onChange={(e) => setField("airline_checkin_url", e.target.value)}
                placeholder="https://www.latam.com/pt_br/apps/personas/checkin"
                type="url"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Vira um QR clicável no voucher — o passageiro escaneia e abre direto na companhia aérea.</p>
            </div>
          )}

          {kind !== "other" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor total (R$)</Label>
                <Input inputMode="decimal" value={String(details.value ?? "")} onChange={(e) => setMoneyField("value", e.target.value)} placeholder="11.406,30" />
              </div>
              <div>
                <Label>Taxas inclusas (R$)</Label>
                <Input inputMode="decimal" value={String(details.tax_value ?? "")} onChange={(e) => setMoneyField("tax_value", e.target.value)} placeholder="0,00" />
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
              <div>
                <Label>Políticas do hotel</Label>
                <Textarea
                  rows={3}
                  value={String(details.policies ?? "")}
                  onChange={(e) => setField("policies", e.target.value)}
                  placeholder="Ex: Reserva não reembolsável. Cancelamento até 48h antes sem custo. Taxa de resort de US$ 15/noite paga no hotel."
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Aparece no voucher — reembolso, taxas, fees etc.</p>
              </div>
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
                  <Input inputMode="decimal" value={String(details.value ?? "")} onChange={(e) => setMoneyField("value", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label>Taxa inclusa (R$)</Label>
                  <Input inputMode="decimal" value={String(details.tax_value ?? "")} onChange={(e) => setMoneyField("tax_value", e.target.value)} placeholder="0,00" />
                  <p className="mt-1 text-[10px] text-muted-foreground">Parte não comissionável.</p>
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" value={String(details.quantity ?? "")} onChange={(e) => setField("quantity", e.target.value)} placeholder="1" />
                </div>
              </div>
              <div><Label>Categoria</Label><Input value={String(details.category ?? "")} onChange={(e) => setField("category", e.target.value)} placeholder="Traslado, Passeio, Ingresso, Seguro…" /></div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <Label>Data de partida <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="date" value={String(details.date_from ?? "")} onChange={(e) => setField("date_from", e.target.value)} />
                </div>
                <div>
                  <Label>Horário de saída <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="time" value={String(details.time_from ?? "")} onChange={(e) => setField("time_from", e.target.value)} />
                </div>
                <div>
                  <Label>Data de chegada <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="date" value={String(details.date_to ?? "")} onChange={(e) => setField("date_to", e.target.value)} />
                </div>
                <div>
                  <Label>Horário de chegada <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="time" value={String(details.time_to ?? "")} onChange={(e) => setField("time_to", e.target.value)} />
                </div>
              </div>
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
            const buildClean = (raw: Record<string, string | number | boolean>): Record<string, unknown> => {
              const cd: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(raw)) {
                if (v === "" || v === undefined || v === null) continue;
                if (numFields.has(k)) {
                  const raw = String(v).trim().replace(/\s/g, "").replace(/^R\$/i, "");
                  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
                  const parsed = Number(normalized);
                  if (Number.isFinite(parsed)) cd[k] = parsed;
                } else {
                  cd[k] = v;
                }
              }
              return cd;
            };

            const cleanMain = buildClean(details);
            let effectiveTitle = title.trim();
            if (kind === "flight") {
              // Localizador opcional: se vier, precisa ter ao menos 6 alfanuméricos
              const loc = locator.trim().toUpperCase();
              if (loc && !/^[A-Z0-9]{6,}$/.test(loc)) {
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
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (fid: string) => {
      await del({ data: { id: fid } });
      return recalculateTotal({ data: { id: order.id } });
    },
    onMutate: (fid: string) => {
      qc.setQueryData<OrderDetail>(["admin", "orderDetail", order.id], (d) => d ? ({
        ...d, financials: d.financials.filter((f) => f.id !== fid),
      }) : d);
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
    const extrasCommission = allExtraRows.reduce(
      (a, r) => a + Number(r.commission_value || 0) + Number((r as { rav_value?: number }).rav_value || 0),
      0,
    );
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
    // Comissão total inclui o RAV lançado por item (comissão adicional).
    totalCommission = displayRows.reduce(
      (a, f) => a + Number(f.commission_value || 0) + Number(f.rav_value || 0),
      0,
    );
    // Recalcula do row pra garantir que RAV entre no total, mesmo em lançamentos antigos.
    totalNet = displayRows.reduce((a, f) => {
      const sale = Number(f.sale_value || 0);
      const tax = Number(f.tax_value || 0);
      const disc = Number(f.discount_value || 0);
      const rav = Number(f.rav_value || 0);
      return a + Number((sale + tax - disc + rav).toFixed(2));
    }, 0);
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
                           <Button size="sm" variant="ghost" onClick={() => confirmThen("Remover lançamento?", () => remove.mutate(f.id))}>
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
                        {formatBRL(Number(f.commission_value) + Number(f.rav_value || 0))}
                        <div className="text-[10px] text-muted-foreground">
                          {f.is_commissionable === false ? "não comissionável" : `${f.commission_pct}%`}
                          {Number(f.rav_value || 0) > 0 && <span className="text-brand-orange"> · +RAV {formatBRL(Number(f.rav_value))}</span>}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-xs">{f.due_date ? new Date(f.due_date + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(Number(f.sale_value || 0) + Number(f.tax_value || 0) - Number(f.discount_value || 0) + Number(f.rav_value || 0))}</td>
                      <td className="py-2 px-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setSelectedItem(f.order_item_id); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => confirmThen("Remover lançamento?", () => remove.mutate(f.id))}>
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
    const fallbackPct = defaultCommissionPct(selectedKind, isPackage);
    const rawPct = Number(initial?.commission_pct ?? fallbackPct);
    const commissionable = initial?.is_commissionable ?? true;
    // Se está comissionável mas veio 0%, aplica o padrão (12%) pra usuário ajustar depois.
    const basePct = commissionable && rawPct <= 0 ? fallbackPct : rawPct;
    const sale = initial?.sale_value ?? defaultSale;
    const tax = initial?.tax_value ?? defaultTax;
    const disc = initial?.discount_value ?? 0;
    const effectivePct = commissionable ? basePct : 0;
    setForm({
      supplier_name: initial?.supplier_name ?? defaultSupplier,
      sale_value: sale,
      tax_value: tax,
      discount_value: disc,
      commission_value: Number((Math.max(0, sale) * (effectivePct / 100)).toFixed(2)),
      commission_pct: basePct,
      is_commissionable: commissionable,
      rav_value: initial?.rav_value ?? 0,
      exchange_rate: initial?.exchange_rate ?? 1,
      due_date: initial?.due_date ?? "",
      total: initial?.total ?? 0,
      notes: initial?.notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, selectedItem]);


  // Total (venda) = tarifa + taxas − desconto + RAV. RAV é receita adicional
  // cobrada do cliente, então soma no total do item e no total da venda.
  const recalc = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    // Ao ligar "comissionável" com pct zerado, cai no padrão (12%) pra evitar 0% surpresa.
    if (patch.is_commissionable === true && (!next.commission_pct || Number(next.commission_pct) <= 0)) {
      next.commission_pct = defaultCommissionPct(selectedKind, isPackage);
    }
    const sale = Number(next.sale_value) || 0;
    const tax = Number(next.tax_value) || 0;
    const disc = Number(next.discount_value) || 0;
    const rav = Number(next.rav_value) || 0;
    const pct = Number(next.commission_pct) || 0;
    const base = Math.max(0, sale);
    const effectivePct = next.is_commissionable ? pct : 0;
    next.commission_value = Number((base * (effectivePct / 100)).toFixed(2));
    next.total = Number((sale + tax - disc + rav).toFixed(2));
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
          <div className="grid grid-cols-4 gap-3">
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
            <div>
              <Label className="flex items-center gap-1">
                RAV
                <span className="rounded-md border border-brand-orange/40 bg-brand-orange/10 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-brand-orange">extra</span>
              </Label>
              <Input
                type="number" step="0.01" min={0}
                value={form.rav_value}
                onChange={(e) => recalc({ rav_value: Number(e.target.value) })}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Comissionável + comissão padrão (não editável por item) */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Comissionável</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Desligue para produtos que não pagam comissão. RAV é somado ao total da venda.</p>
              </div>
              <Switch
                checked={form.is_commissionable}
                onCheckedChange={(v) => recalc({ is_commissionable: v })}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Base: {formatBRL(base)} · {form.is_commissionable ? `${form.commission_pct}% (padrão)` : "sem comissão"}</span>
              <span>
                Comissão + RAV: <span className="font-semibold text-brand-orange">{formatBRL(Number(form.commission_value) + Number(form.rav_value || 0))}</span>
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
  orderId, order, detail, items, clientName, payments, onChange,
}: {
  orderId: string;
  order: OrderHeader;
  detail: OrderDetail;
  items: OrderItem[];
  clientName: string;
  payments: OrderPayment[];
  onChange: () => void;
}) {
  // Fornecedor padrão para novos pagamentos: primeiro item com supplier_name preenchido
  const defaultProvider = useMemo(() => {
    for (const it of items) {
      const d = (it.details ?? {}) as { supplier_name?: string };
      const s = (d.supplier_name ?? "").trim();
      if (s) return s;
    }
    return "";
  }, [items]);

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

  const qc = useQueryClient();
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onMutate: (id: string) => {
      qc.setQueryData<OrderDetail>(["admin", "orderDetail", orderId], (d) => d ? ({
        ...d, payments: d.payments.filter((p) => p.id !== id),
      }) : d);
    },
    onSuccess: () => { toast.success("Pagamento removido"); onChange(); },
    onError: (e: Error) => { toast.error(e.message); onChange(); },
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
                      confirmThen("Remover este pagamento?", () => { delMut.mutate(p.id); })
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
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Link
                          to="/admin/cofre"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-orange hover:underline"
                        >
                          <Vault className="h-3.5 w-3.5" /> Abrir cofre <ExternalLink className="h-3 w-3" />
                        </Link>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-orange hover:underline"
                          onClick={async () => {
                            try {
                              const blob = await generateOrderAuthorization(detail, true, p);
                              openBlobInNewTab(blob, `autorizacao-debito-${order.orderNumber}-${p.card_last4 ?? p.id.slice(0, 6)}.pdf`);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Erro ao gerar autorização");
                            }
                          }}
                        >
                          <Download className="h-3.5 w-3.5" /> Autorização deste cartão
                        </button>
                      </div>
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
        items={items}
        itemPassengers={detail.itemPassengers}
        passengers={detail.passengers}
        defaultProvider={defaultProvider}
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
  payer_birth_date?: string | null;
};

function PaymentDialog({
  open, onOpenChange, initial, order, items, itemPassengers, passengers, defaultProvider, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderPayment | null;
  order: OrderHeader;
  items: OrderItem[];
  itemPassengers: Record<string, string[]>;
  passengers: OrderPassenger[];
  defaultProvider?: string;
  onSave: (data: Partial<OrderPayment> & { method: string; amount: number; card_full_number?: string | null; order_item_ids?: string[] | null }, payer: PayerPatch) => void;
}) {
  const [form, setForm] = useState<Partial<OrderPayment>>({});
  const [payer, setPayer] = useState<PayerPatch>({});
  const [cardFullNumber, setCardFullNumber] = useState<string>("");
  const [cardCvv, setCardCvv] = useState<string>("");
  const [installmentTouched, setInstallmentTouched] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Busca/salvamento de pessoas e cartões
  const searchPeopleFn = useServerFn(searchPeople);
  const upsertPersonFn = useServerFn(upsertPerson);
  const listCardsFn = useServerFn(listPersonCards);
  const addCardFn = useServerFn(addPersonCard);
  const revealCardFn = useServerFn(revealPersonCardNumber);
  const revealPaymentCardFn = useServerFn(revealOrderPaymentCardNumber);
  const updatePayerFn = useServerFn(updateOrderPayer);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<Array<{ id: string; name: string; cpf: string | null }>>([]);
  const [showPersonResults, setShowPersonResults] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<PersonCardRow[]>([]);
  const [savingPerson, setSavingPerson] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [rawAmount, setRawAmount] = useState<string>("");
  const [rawInstallment, setRawInstallment] = useState<string>("");
  // Helpers de moeda BR: exibe "16.220,19" e aceita colar nesse mesmo formato.
  const fmtBRLInput = (n?: number | null): string => {
    if (n == null || !Number.isFinite(Number(n))) return "";
    return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const parseBRLInput = (s: string): number | null => {
    if (!s) return null;
    const t = String(s).trim();
    if (!t) return null;
    const hasComma = t.includes(",");
    const hasDot = t.includes(".");
    const norm = hasComma && hasDot ? t.replace(/\./g, "").replace(",", ".") : hasComma ? t.replace(",", ".") : t;
    const n = Number(norm.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  useMemo(() => {
    const isNew = !initial;
    setForm(initial ?? {
      status: "paid",
      method: "pix",
      amount: order.totalPrice ?? 0,
      paid_at: new Date().toISOString(),
      provider: defaultProvider || null,
    });
    setCardFullNumber("");
    setCardCvv("");
    setInstallmentTouched(!isNew);
    setSelectedItemIds(initial?.order_item_ids ?? []);
    const initAmount = initial?.amount ?? order.totalPrice ?? 0;
    setRawAmount(fmtBRLInput(initAmount));
    setRawInstallment(initial?.installment_amount != null ? fmtBRLInput(initial.installment_amount) : "");
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
      payer_birth_date: order.payerBirthDate ?? order.birthDate ?? "",
    });
    // Vincula automaticamente o pagador já cadastrado no pedido (aparecem cartões salvos e a venda no cadastro dele).
    setSelectedPersonId(order.personId ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open, order.id]);

  // Ao editar um pagamento existente com cartão, decifra o número completo
  // e preenche o campo, no mesmo formato mascarado (com espaços a cada 4 dígitos).
  useEffect(() => {
    if (!open || !initial?.id || !initial?.card_last4) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await revealPaymentCardFn({ data: { id: initial.id! } });
        if (cancelled) return;
        const raw = (res?.number ?? "").replace(/\D/g, "");
        if (!raw) return;
        const isAmex = (initial.card_brand ?? "").toLowerCase().includes("amex");
        const formatted = isAmex
          ? raw.replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{6})(\d)/, "$1 $2")
          : raw.replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{4} \d{4})(\d)/, "$1 $2");
        setCardFullNumber(formatted);
      } catch {
        // silencioso — mantém placeholder caso não consiga decifrar
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id, open]);

  const method = form.method ?? "pix";
  const showCard = method === "credit_card" || method === "debit_card";
  const showInstallments = method === "credit_card" || method === "financing";


  const setField = <K extends keyof OrderPayment>(k: K, v: OrderPayment[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setPayerField = (k: keyof PayerPatch, v: string) => setPayer((p) => ({ ...p, [k]: v }));

  // Auto-calcula "valor por parcela" a partir do valor total / nº de parcelas
  // (a menos que o usuário tenha editado manualmente esse campo)
  useEffect(() => {
    if (installmentTouched) return;
    const n = Number(form.installments ?? 0);
    const total = Number(form.amount ?? 0);
    if (n > 0 && total > 0) {
      const per = Math.round((total / n) * 100) / 100;
      setForm((f) => ({ ...f, installment_amount: per }));
      setRawInstallment(fmtBRLInput(per));
    }
  }, [form.installments, form.amount, installmentTouched]);

  // Autofill de endereço via ViaCEP quando o CEP tiver 8 dígitos
  function handleZipChange(v: string) {
    const raw = v.replace(/\D/g, "").slice(0, 8);
    const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
    setPayerField("payer_zip", formatted);
    if (raw.length === 8) {
      fetch(`https://viacep.com.br/ws/${raw}/json/`)
        .then((r) => r.json())
        .then((d) => {
          if (d && !d.erro) {
            setPayer((p) => ({
              ...p,
              payer_address: p.payer_address || d.logradouro || "",
              payer_district: p.payer_district || d.bairro || "",
              payer_city: p.payer_city || d.localidade || "",
              payer_state: p.payer_state || (d.uf || "").toUpperCase(),
            }));
          }
        })
        .catch(() => {});
    }
  }

  // Máscara do número do cartão + derivação automática de bandeira/last4
  function handleCardNumberChange(v: string) {
    const isAmex = (form.card_brand ?? "").toLowerCase().includes("amex");
    const raw = v.replace(/\D/g, "").slice(0, isAmex ? 15 : 16);
    const formatted = isAmex
      ? raw.replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{6})(\d)/, "$1 $2")
      : raw.replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{4} \d{4})(\d)/, "$1 $2");
    setCardFullNumber(formatted);
    const brand = detectBrand(raw);
    setForm((f) => ({
      ...f,
      card_last4: raw.length >= 4 ? raw.slice(-4) : f.card_last4 ?? null,
      card_bin: raw.length >= 6 ? raw.slice(0, 6) : f.card_bin ?? null,
      card_brand: brand || f.card_brand || null,
    }));
  }

  // Debounce da busca de pagador
  useEffect(() => {
    if (!open) return;
    const q = personSearch.trim();
    if (!q) { setPersonResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const rows = await searchPeopleFn({ data: { q } });
        setPersonResults(rows.map((r) => ({ id: r.id, name: r.name, cpf: r.cpf })));
      } catch { /* silencioso */ }
    }, 250);
    return () => clearTimeout(t);
  }, [personSearch, open, searchPeopleFn]);

  // Carrega cartões salvos ao trocar de pessoa
  useEffect(() => {
    if (!selectedPersonId) { setSavedCards([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const cards = await listCardsFn({ data: { person_id: selectedPersonId } });
        if (!cancelled) setSavedCards(cards);
      } catch { if (!cancelled) setSavedCards([]); }
    })();
    return () => { cancelled = true; };
  }, [selectedPersonId, listCardsFn]);

  // Atrela a pessoa selecionada ao pedido para que o cartão/venda apareça no cadastro dela.
  useEffect(() => {
    if (!open || !selectedPersonId || !order.id) return;
    updatePayerFn({ data: { id: order.id, person_id: selectedPersonId } }).catch(() => {});
  }, [selectedPersonId, open, order.id, updatePayerFn]);

  async function handlePickPerson(id: string) {
    try {
      const rows = await searchPeopleFn({ data: { q: personSearch.trim() } });
      const p = rows.find((r) => r.id === id);
      if (!p) return;
      setSelectedPersonId(id);
      setShowPersonResults(false);
      setPersonSearch(p.name);
      setPayer({
        payer_full_name: p.name ?? "",
        payer_cpf: p.cpf ?? p.cnpj ?? "",
        payer_ie_rg: p.rg ?? "",
        payer_email: p.email ?? "",
        payer_phone: p.mobile_phone ?? p.phone ?? "",
        payer_zip: p.zip ?? "",
        payer_address: p.address ?? "",
        payer_number: p.number ?? "",
        payer_district: p.district ?? "",
        payer_city: p.city ?? "",
        payer_state: p.state ?? "",
        payer_birth_date: p.birth_date ?? "",
      });
      toast.success(`Pagador "${p.name}" carregado`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleSavePerson() {
    const name = (payer.payer_full_name ?? "").trim();
    if (!name) { toast.error("Preencha o nome do pagador."); return; }
    setSavingPerson(true);
    try {
      const cpfDigits = (payer.payer_cpf ?? "").replace(/\D/g, "");
      const isPJ = cpfDigits.length > 11;
      const res = await upsertPersonFn({ data: {
        id: selectedPersonId ?? undefined,
        kind: isPJ ? "PJ" : "PF",
        name,
        cpf: !isPJ ? (payer.payer_cpf ?? null) : null,
        cnpj: isPJ ? (payer.payer_cpf ?? null) : null,
        rg: payer.payer_ie_rg ?? null,
        email: payer.payer_email ?? null,
        mobile_phone: payer.payer_phone ?? null,
        birth_date: payer.payer_birth_date || null,
        zip: payer.payer_zip ?? null,
        address: payer.payer_address ?? null,
        number: payer.payer_number ?? null,
        district: payer.payer_district ?? null,
        city: payer.payer_city ?? null,
        state: payer.payer_state ?? null,
        is_foreign: false,
        charge_boleto_fee: false,
      } });
      setSelectedPersonId(res.id);
      toast.success("Cliente salvo no cadastro");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPerson(false);
    }
  }

  async function handleSaveCard() {
    const clean = cardFullNumber.replace(/\D/g, "");
    if (clean.length < 12) { toast.error("Informe o número completo do cartão."); return; }
    setSavingCard(true);
    try {
      // Se ainda não há pagador selecionado, cadastra/atualiza antes.
      let personId = selectedPersonId;
      if (!personId) {
        const name = (payer.payer_full_name ?? "").trim();
        if (!name) { toast.error("Preencha o nome do pagador antes de salvar o cartão."); setSavingCard(false); return; }
        const cpfDigits = (payer.payer_cpf ?? "").replace(/\D/g, "");
        const isPJ = cpfDigits.length > 11;
        const res = await upsertPersonFn({ data: {
          kind: isPJ ? "PJ" : "PF",
          name,
          cpf: !isPJ ? (payer.payer_cpf ?? null) : null,
          cnpj: isPJ ? (payer.payer_cpf ?? null) : null,
          rg: payer.payer_ie_rg ?? null,
          email: payer.payer_email ?? null,
          mobile_phone: payer.payer_phone ?? null,
          birth_date: payer.payer_birth_date || null,
          zip: payer.payer_zip ?? null,
          address: payer.payer_address ?? null,
          number: payer.payer_number ?? null,
          district: payer.payer_district ?? null,
          city: payer.payer_city ?? null,
          state: payer.payer_state ?? null,
          is_foreign: false,
          charge_boleto_fee: false,
        } });
        personId = res.id;
        setSelectedPersonId(res.id);
      }
      await addCardFn({ data: {
        person_id: personId,
        holder_name: payer.payer_full_name ?? null,
        number: clean,
        expiry: form.card_expiry ?? null,
        security_code_hint: cardCvv || null,
        is_travel_card: false,
      } });
      const cards = await listCardsFn({ data: { person_id: personId } });
      setSavedCards(cards);
      toast.success("Cartão salvo no cadastro");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao salvar cartão");
    } finally {
      setSavingCard(false);
    }
  }

  async function handlePickCard(cardId: string) {
    const c = savedCards.find((x) => x.id === cardId);
    if (!c) return;
    try {
      const { number } = await revealCardFn({ data: { id: cardId } });
      const raw = number.replace(/\D/g, "");
      const isAmex = (c.brand ?? "").toLowerCase().includes("amex");
      const formatted = isAmex
        ? raw.replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{6})(\d)/, "$1 $2")
        : raw.replace(/(\d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{4})(\d)/, "$1 $2").replace(/(\d{4} \d{4} \d{4})(\d)/, "$1 $2");
      setCardFullNumber(formatted);
      setForm((f) => ({
        ...f,
        card_brand: c.brand ?? f.card_brand ?? null,
        card_last4: c.last4 ?? f.card_last4 ?? null,
        card_bin: raw.length >= 6 ? raw.slice(0, 6) : f.card_bin ?? null,
        card_expiry: c.expiry ?? f.card_expiry ?? null,
      }));
      toast.success(`Cartão ${c.brand ?? ""} •••• ${c.last4 ?? ""} carregado`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }





  // Opções de "reservas" (grupos de aéreo + hotel/serviços) que este pagamento cobre.
  // Se nenhuma for marcada, o pagamento cobre o pedido inteiro (comportamento antigo).
  const reservationOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string; sub: string | null; itemIds: string[] }> = [];
    const flightItems = items.filter((i) => i.kind === "flight");
    for (const g of groupFlightItems(flightItems)) {
      const first = g.items[0];
      const d = (first?.details ?? {}) as Record<string, unknown>;
      const airline = String(d.airline ?? "").trim();
      const route = g.items
        .map((it) => {
          const dd = (it.details ?? {}) as Record<string, unknown>;
          return `${String(dd.from_iata ?? "").trim()}→${String(dd.to_iata ?? "").trim()}`;
        })
        .filter((s) => s !== "→")
        .join(" · ");
      const label = `✈ ${airline || "Aéreo"} — ${g.locator ?? "sem localizador"}`;
      opts.push({ id: `flight:${g.key}`, label, sub: route || null, itemIds: g.items.map((i) => i.id) });
    }
    for (const it of items.filter((i) => i.kind !== "flight")) {
      const icon = it.kind === "hotel" ? "🏨" : "🎫";
      opts.push({ id: `item:${it.id}`, label: `${icon} ${it.title}`, sub: it.supplier_locator ?? null, itemIds: [it.id] });
    }
    return opts;
  }, [items]);

  const toggleReservation = (itemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const set = new Set(prev);
      const allIn = itemIds.every((id) => set.has(id));
      if (allIn) itemIds.forEach((id) => set.delete(id));
      else itemIds.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  // Passageiros que ficarão vinculados a este pagamento (para preview).
  const coveredPassengerNames = useMemo(() => {
    if (selectedItemIds.length === 0) return null; // pedido inteiro
    const ids = new Set<string>();
    for (const iid of selectedItemIds) for (const pid of (itemPassengers[iid] ?? [])) ids.add(pid);
    return passengers.filter((p) => ids.has(p.id)).map((p) => p.full_name);
  }, [selectedItemIds, itemPassengers, passengers]);

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
            {reservationOptions.length > 0 && (
              <div className="mb-3 rounded-md border bg-muted/40 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs uppercase tracking-wider">Reservas cobertas por este pagamento</Label>
                  {selectedItemIds.length > 0 && (
                    <button type="button" className="text-[11px] text-brand-orange hover:underline" onClick={() => setSelectedItemIds([])}>
                      Limpar (cobrir pedido inteiro)
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {reservationOptions.map((opt) => {
                    const checked = opt.itemIds.every((id) => selectedItemIds.includes(id));
                    return (
                      <label key={opt.id} className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-brand-orange"
                          checked={checked}
                          onChange={() => toggleReservation(opt.itemIds)}
                        />
                        <span className="flex-1">
                          <span className="font-medium">{opt.label}</span>
                          {opt.sub && <span className="text-muted-foreground"> — {opt.sub}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {selectedItemIds.length === 0
                    ? "Nenhuma marcada: a autorização de débito lista todos os passageiros do pedido."
                    : coveredPassengerNames && coveredPassengerNames.length > 0
                      ? `Passageiros na autorização: ${coveredPassengerNames.join(", ")}`
                      : "Nenhum passageiro vinculado às reservas marcadas."}
                </div>
              </div>
            )}
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
                <Input inputMode="decimal" value={rawAmount} placeholder="0,00"
                  onChange={(e) => { setRawAmount(e.target.value); const n = parseBRLInput(e.target.value); setField("amount", (n ?? 0) as OrderPayment["amount"]); }}
                  onBlur={() => { const n = parseBRLInput(rawAmount); if (n != null) setRawAmount(fmtBRLInput(n)); }} />
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
                      onChange={(e) => {
                        setInstallmentTouched(false);
                        setField("installments", e.target.value ? Number(e.target.value) : null);
                      }} />
                  </div>
                  <div>
                    <Label>Valor por parcela</Label>
                    <Input inputMode="decimal" value={rawInstallment} placeholder="0,00"
                      onChange={(e) => {
                        setInstallmentTouched(true);
                        setRawInstallment(e.target.value);
                        const n = parseBRLInput(e.target.value);
                        setField("installment_amount", (n as OrderPayment["installment_amount"]) ?? null);
                      }}
                      onBlur={() => { const n = parseBRLInput(rawInstallment); if (n != null) setRawInstallment(fmtBRLInput(n)); }} />
                  </div>
                </>
              )}
              {showCard && (
                <>
                  {selectedPersonId && savedCards.length > 0 && (
                    <div className="md:col-span-2">
                      <Label>Cartões salvos deste pagador</Label>
                      <Select value="" onValueChange={handlePickCard}>
                        <SelectTrigger><SelectValue placeholder="Selecione para preencher automaticamente…" /></SelectTrigger>
                        <SelectContent>
                          {savedCards.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {(c.brand ?? "Cartão")} •••• {c.last4 ?? "----"}{c.expiry ? ` — ${c.expiry}` : ""}{c.nickname ? ` (${c.nickname})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Número do cartão (completo)</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSaveCard}
                        disabled={savingCard || !(payer.payer_full_name ?? "").trim() || cardFullNumber.replace(/\D/g, "").length < 12}
                      >
                        <Save className="h-3.5 w-3.5 mr-1" />
                        Salvar cartão
                      </Button>
                    </div>
                    <Input
                      value={cardFullNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                      placeholder={initial?.card_last4 ? `Preenchido — só refaça se precisar substituir` : "0000 0000 0000 0000"}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Armazenado criptografado. {selectedPersonId ? "Salve para reutilizar em pedidos futuros." : "Salve o pagador antes para poder gravar o cartão."}
                    </div>
                  </div>
                  <div>
                    <Label>Bandeira</Label>
                    <Input value={form.card_brand ?? ""} onChange={(e) => setField("card_brand", e.target.value)} placeholder="Visa, Master, Elo…" />
                  </div>
                  <div>
                    <Label>Validade do cartão</Label>
                    <Input
                      value={form.card_expiry ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
                        const formatted = raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
                        setField("card_expiry", formatted);
                      }}
                      placeholder="MM/AA"
                      inputMode="numeric"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label>CVV</Label>
                    <Input
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="000"
                      inputMode="numeric"
                      maxLength={4}
                      autoComplete="off"
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Salvo criptografado junto ao cartão no cadastro da pessoa.
                    </div>
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
            <div className="mb-3 rounded-md border bg-muted/40 p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <Label className="text-xs">Buscar cliente cadastrado (nome ou CPF)</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={personSearch}
                      onChange={(e) => { setPersonSearch(e.target.value); setShowPersonResults(true); setSelectedPersonId(null); }}
                      onFocus={() => setShowPersonResults(true)}
                      placeholder="Digite o nome, CPF ou e-mail…"
                    />
                  </div>
                  {showPersonResults && personResults.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-md">
                      {personResults.map((r) => (
                        <button
                          type="button"
                          key={r.id}
                          onClick={() => handlePickPerson(r.id)}
                          className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                        >
                          <span className="font-medium">{r.name}</span>
                          {r.cpf && <span className="text-muted-foreground"> — {r.cpf}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSavePerson}
                  disabled={savingPerson || !(payer.payer_full_name ?? "").trim()}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {selectedPersonId ? "Atualizar cliente" : "Salvar cliente"}
                </Button>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Selecione um cliente para puxar todos os dados automaticamente. O código de autorização é sempre digitado no momento.
              </div>
            </div>
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
              <div>
                <Label>Data de nascimento</Label>
                <Input type="date" value={payer.payer_birth_date ?? ""} onChange={(e) => setPayerField("payer_birth_date", e.target.value)} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input
                  value={payer.payer_zip ?? ""}
                  onChange={(e) => handleZipChange(e.target.value)}
                  placeholder="28890-052"
                  inputMode="numeric"
                />
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
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={async () => {
            // Normaliza strings vazias -> null (evita "invalid input syntax for type date")
            const cleanPayer = Object.fromEntries(
              Object.entries(payer).map(([k, v]) => [k, v === "" ? null : v]),
            ) as PayerPatch;
            const cleanCard = cardFullNumber.replace(/\D/g, "");
            // Se há cartão informado e um pagador vinculado, garante que o
            // cartão também fique gravado no cadastro da pessoa (aba Cartões).
            if (cleanCard.length >= 12 && selectedPersonId) {
              const last4 = cleanCard.slice(-4);
              const already = savedCards.some((c) => (c.last4 ?? "") === last4);
              if (!already) {
                try {
                  await addCardFn({ data: {
                    person_id: selectedPersonId,
                    holder_name: payer.payer_full_name ?? null,
                    number: cleanCard,
                    expiry: form.card_expiry ?? null,
                    security_code_hint: cardCvv || null,
                    is_travel_card: false,
                  } });
                } catch (e) {
                  // Não bloqueia o salvamento do pagamento se a gravação no cadastro falhar
                  console.warn("Falha ao vincular cartão ao pagador:", e);
                }
              }
            }
            onSave({
              ...form,
              method: form.method ?? "pix",
              amount: Number(form.amount ?? 0),
              card_full_number: cleanCard || null,
              order_item_ids: selectedItemIds.length > 0 ? selectedItemIds : null,
            } as Partial<OrderPayment> & { method: string; amount: number; card_full_number?: string | null; order_item_ids?: string[] | null }, cleanPayer);
          }}>Salvar</Button>


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
    // Considera SOMENTE itens marcados como comissionáveis. Itens
    // não-comissionáveis ficam intocados pela régua (tanto na base
    // exibida quanto na hora de salvar).
    let sumSale = 0;
    let sumTax = 0;
    let sumCommVal = 0;
    let sumCommSale = 0;
    for (const it of items) {
      const f = financials.find((x) => x.order_item_id === it.id);
      const commissionable = f ? (f.is_commissionable ?? true) : true;
      if (!commissionable) continue;
      if (f) {
        sumSale += Number(f.sale_value || 0);
        sumTax += Number(f.tax_value || 0);
        sumCommVal += Number(f.commission_value || 0);
        sumCommSale += Number(f.sale_value || 0);
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
    // Percentual efetivo = comissão real / tarifa (só dos comissionáveis).
    // Assim, se todos foram zerados, aparece 0% (não o 12% padrão).
    const effectivePct = sumCommSale > 0
      ? Number(((sumCommVal / sumCommSale) * 100).toFixed(2))
      : (isPackage ? PKG_DEFAULT_PCT : 10);
    setPct(effectivePct);
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
      // A régua só age sobre itens comissionáveis (is_commissionable !== false).
      // Itens não-comissionáveis ficam intocados: mantêm sale/tax/total salvos
      // e comissão = 0. Isso evita "resetar tudo" quando o usuário zera manualmente.
      const commList = items.map((it) => {
        const f = financials.find((x) => x.order_item_id === it.id);
        const commissionable = f ? (f.is_commissionable ?? true) : true;
        const d = (it.details ?? {}) as Record<string, unknown>;
        const gross = Math.max(0, Number(d.value ?? 0) || 0);
        const itemTax = Math.max(0, Math.min(gross, Number(d.tax_value ?? 0) || 0));
        return {
          item: it,
          existing: f,
          commissionable,
          curSale: f ? Number(f.sale_value ?? 0) : Math.max(0, gross - itemTax),
          curTax: f ? Number(f.tax_value ?? 0) : itemTax,
        };
      });
      const commOnly = commList.filter((c) => c.commissionable);
      if (commOnly.length === 0) {
        toast.error("Nenhum item comissionável — marque ao menos um como comissionável.");
        setSaving(false);
        return;
      }
      const totalCurSale = commOnly.reduce((a, c) => a + c.curSale, 0);
      const totalCurTax = commOnly.reduce((a, c) => a + c.curTax, 0);
      const equalShare = 1 / commOnly.length;

      // Soma final do pedido: parte dos comissionáveis (recalculada) + parte
      // dos não-comissionáveis (preservada).
      let rebuiltTotal = 0;

      for (const c of commOnly) {
        const wSale = totalCurSale > 0 ? c.curSale / totalCurSale : equalShare;
        const wTax = totalCurTax > 0 ? c.curTax / totalCurTax : equalShare;
        const itemSale = Number((sale * wSale).toFixed(2));
        const itemTax = Number((tax * wTax).toFixed(2));
        const itemBase = Math.max(0, itemSale);
        const itemCommission = Number((itemBase * (pct / 100)).toFixed(2));
        const itemDefaultComm = isPackage ? Number((itemSale * (PKG_DEFAULT_PCT / 100)).toFixed(2)) : 0;
        const itemDiscount = isPackage && itemCommission < itemDefaultComm
          ? Number((itemDefaultComm - itemCommission).toFixed(2))
          : 0;
        const itemTotal = isPackage
          ? Number((itemSale + itemTax + Math.max(0, itemCommission - itemDefaultComm) - itemDiscount).toFixed(2))
          : Number((itemSale + itemTax + itemCommission).toFixed(2));
        rebuiltTotal += itemTotal;

        await upsert({
          data: {
            id: c.existing?.id,
            order_item_id: c.item.id,
            sale_value: itemSale,
            tax_value: itemTax,
            discount_value: itemDiscount,
            commission_pct: pct,
            commission_value: itemCommission,
            is_commissionable: true,
            rav_value: c.existing?.rav_value ?? 0,
            total: itemTotal,
            supplier_name: c.existing?.supplier_name ?? null,
            exchange_rate: c.existing?.exchange_rate ?? 1,
            due_date: c.existing?.due_date ?? null,
            notes: c.existing?.notes ?? null,
          },
        });
      }

      // Soma os totais preservados dos itens não-comissionáveis (se já existem no financeiro).
      for (const c of commList.filter((x) => !x.commissionable)) {
        if (c.existing) rebuiltTotal += Number(c.existing.total || 0);
      }

      await updateTotal({ data: { id: order.id, total_price: Number(Math.max(0, rebuiltTotal).toFixed(2)) } });
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
                <Label className="text-xs">Tarifa total (só comissionáveis)</Label>
                <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">{formatBRL(sale)}</div>
              </div>
              <div>
                <Label className="text-xs">Taxas totais (não comissionam)</Label>
                <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">{formatBRL(tax)}</div>
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
                        onClick={() => confirmThen("Remover esta entrada?", () => del.mutate(idx))}
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

type EditOrderPatch = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  adults?: number | null;
  children?: number | null;
  expected_total?: number | null;
};

function EditOrderDialog({
  open, onOpenChange, order, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderHeader;
  onSave: (patch: EditOrderPatch) => void;
}) {
  const [form, setForm] = useState({
    full_name: order.fullName ?? "",
    email: order.email ?? "",
    phone: order.phone ?? "",
    cpf: order.cpf ?? "",
    birth_date: order.birthDate ?? "",
    adults: order.adults ?? 1,
    children: order.children ?? 0,
    expected_total: order.expectedTotal ?? 0,
  });
  useEffect(() => {
    if (open) setForm({
      full_name: order.fullName ?? "",
      email: order.email ?? "",
      phone: order.phone ?? "",
      cpf: order.cpf ?? "",
      birth_date: order.birthDate ?? "",
      adults: order.adults ?? 1,
      children: order.children ?? 0,
      expected_total: order.expectedTotal ?? 0,
    });
  }, [open, order]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar pedido</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Nascimento</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
            <div><Label>Adultos</Label><Input type="number" min={0} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} /></div>
            <div><Label>Crianças</Label><Input type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>Orçamento previsto (R$)</Label>
            <Input type="number" step="0.01" value={form.expected_total} onChange={(e) => setForm({ ...form, expected_total: Number(e.target.value) })} />
            <p className="mt-1 text-[11px] text-muted-foreground">Aparece ao lado do Total para você comparar com o orçamento do cliente.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => {
            onSave({
              full_name: form.full_name.trim() || null,
              email: form.email.trim() || null,
              phone: form.phone.trim() || null,
              cpf: form.cpf.trim() || null,
              birth_date: form.birth_date || null,
              adults: Number(form.adults) || 0,
              children: Number(form.children) || 0,
              expected_total: Number(form.expected_total) || null,
            });
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

