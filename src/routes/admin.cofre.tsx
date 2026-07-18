import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Vault,
  Copy,
  ExternalLink,
  MessageCircle,
  Trash2,
  Search,
  Package,
  Link2,
  RefreshCw,
  FileText,
  X,
  CreditCard,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  User,
  MapPin,
  FileSignature,
  Hash,
  Pencil,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import {
  splitInstallments,
  whatsappUrl,
  paymentLinkUrl,
} from "@/lib/checkout-config";
import {
  listCofreEntries,
  deleteCofreEntry,
  stashEditEntry,
  type CofreEntry,
} from "@/lib/cofre-storage";
import {
  listCofreOrders,
  updateCofreOrder,
  deleteCofreOrder,
  type CofreOrder,
} from "@/lib/cofre.functions";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";
import { generateAuthorizationPDF, type AuthorizationData, type LivenessData } from "@/lib/authorization-pdf";

import { detectBrand } from "@/components/CardForm";

function cardBrandLabel(card: { brand_hint?: string; full_number?: string; last4?: string } | null | undefined): string {
  if (!card) return "";
  const source = card.full_number || card.brand_hint || "";
  return detectBrand(source) || "";
}


export const Route = createFileRoute("/admin/cofre")({
  component: CofrePage,
});

type Kind = "avulso" | "pedido";
type LinkKind = "card" | "boleto";
type UnifiedItem = {
  id: string;
  kind: Kind;
  linkKind: LinkKind;
  createdAt: number;
  customer: string;
  customerPhone?: string;
  email?: string;
  description: string;
  total: number;
  installments: number;
  firstAmount?: number;
  url: string;
  meta?: string;
  status?: string;
  paymentMethod?: string;
  orderId?: string;
  orderNumber?: string;
  supplier?: string;
  locator?: string;
  route?: string;
  travelDate?: string;
  passengers?: string;
  adults?: number;
  children?: number;
  notes?: string | null;
  order?: CofreOrder;
};

function CofrePage() {
  const [entries, setEntries] = useState<CofreEntry[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "card" | "boleto">("all");
  const [detailsItem, setDetailsItem] = useState<UnifiedItem | null>(null);
  const router = useRouter();

  const fetchOrders = useServerFn(listCofreOrders);
  const updateOrder = useServerFn(updateCofreOrder);
  const deleteOrder = useServerFn(deleteCofreOrder);
  const ordersQuery = useQuery({
    queryKey: ["cofre-orders"],
    queryFn: () => fetchOrders(),
  });

  useEffect(() => {
    setEntries(listCofreEntries());
  }, []);

  function refresh() {
    setEntries(listCofreEntries());
    ordersQuery.refetch();
  }

  function onDelete(id: string) {
    deleteCofreEntry(id);
    setEntries(listCofreEntries());
    toast.success("Link removido do cofre");
  }

  async function onFinalize(orderId: string) {
    try {
      await updateOrder({ data: { id: orderId, status: "paid" } });
      toast.success("Pedido finalizado");
      ordersQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onReject(orderId: string, currentNotes: string | null) {
    const reason = window.prompt(
      "Motivo da rejeição (aparecerá nas observações do pedido):",
      "",
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    const stamp = new Date().toLocaleString("pt-BR");
    const rejectionLine = `[Rejeitado em ${stamp}] ${trimmed || "Sem motivo informado"}`;
    const newNotes = currentNotes
      ? `${currentNotes}\n${rejectionLine}`
      : rejectionLine;
    try {
      await updateOrder({
        data: { id: orderId, status: "rejected", notes: newNotes },
      });
      toast.success("Pedido rejeitado");
      ordersQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onDeleteOrder(orderId: string) {
    if (!window.confirm("Excluir este pedido definitivamente?")) return;
    try {
      await deleteOrder({ data: { id: orderId } });
      toast.success("Pedido excluído");
      ordersQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  const items: UnifiedItem[] = useMemo(() => {
    const avulsos: UnifiedItem[] = entries.map((e) => ({
      id: `avulso:${e.id}`,
      kind: "avulso",
      linkKind: "card",
      createdAt: e.createdAt,
      customer: e.customer || "Sem nome",
      customerPhone: e.customerPhone,
      description: e.description,
      total: e.total,
      installments: e.installments,
      firstAmount: e.firstAmount,
      url: e.url,
      meta: e.orderRef ? `Ref: ${e.orderRef}` : "Link avulso",
      orderNumber: e.orderNumber,
      supplier: e.supplier,
      locator: e.locator,
      route: e.route,
      travelDate: e.travelDate,
      passengers: e.passengers,
    }));

    const pedidos: UnifiedItem[] = (ordersQuery.data ?? [])
      .filter((o: CofreOrder) => {
        const pm = (o.paymentMethod ?? "").toLowerCase();
        if (pm === "pix" || pm === "whatsapp") return false;
        // Só entram no cofre: links gerados pelo "link seguro" convencional
        // (payment_link / payment_link_simple / payment_link_boleto) OU
        // checkouts de pacote pronto (package_id preenchido pelo cliente).
        // Pedidos criados manualmente no admin (snapshot.manual === true) ficam de fora.
        const isLinkOrder = (o.snapshotKind ?? "").startsWith("payment_link");
        const isPackageCheckout = !!o.packageId && !o.isManual && !o.snapshotKind;
        return isLinkOrder || isPackageCheckout;
      })
      .map((o: CofreOrder) => {
        const isLinkOrder = (o.snapshotKind ?? "").startsWith("payment_link");
        const desc = isLinkOrder
          ? (o.linkDescription || "Link de pagamento")
          : o.packageTitle
            ? `Pacote ${o.packageTitle}`
            : "Pedido de pacote";
        const pm = (o.paymentMethod ?? "").toLowerCase();
        const linkKind: LinkKind = pm === "boleto" ? "boleto" : "card";
        const instMatch = pm.match(/(\d+)x/);
        const installments = instMatch ? Number(instMatch[1]) : 1;
        const firstAmount = o.firstAmount && o.firstAmount > 0 ? o.firstAmount : undefined;


        const url = paymentLinkUrl({
          description: desc,
          total: o.totalPrice,
          installments,
          firstAmount,
          orderRef: o.id.slice(0, 8),
          customerName: o.fullName,
        });
        const auth = (o.cardCapture?.authorization ?? {}) as {
          supplier?: string;
          trip_locator?: string;
          trip_route?: string;
          trip_date?: string;
          trip_passengers?: string;
        };
        return {
          id: `pedido:${o.id}`,
          kind: isLinkOrder ? "avulso" : "pedido",
          linkKind,
          createdAt: new Date(o.createdAt).getTime(),
          customer: o.fullName,
          customerPhone: o.phone,
          email: o.email,
          description: desc,
          total: o.totalPrice,
          installments,
          firstAmount,
          url,
          meta: isLinkOrder
            ? `Link avulso · #${o.id.slice(0, 8)}${o.linkReference ? ` · ${o.linkReference}` : ""}`
            : `Pedido #${o.id.slice(0, 8)}${o.packageSlug ? ` · ${o.packageSlug}` : ""}`,
          status: o.status,
          paymentMethod: o.paymentMethod,
          orderId: o.id,
          orderNumber: o.orderNumber ?? undefined,
          supplier: auth.supplier ?? undefined,
          locator: auth.trip_locator ?? undefined,
          route: auth.trip_route ?? undefined,
          travelDate: auth.trip_date ?? undefined,
          passengers: auth.trip_passengers ?? undefined,
          adults: o.adults,
          children: o.children,
          notes: o.notes,
          order: o,
        };
      });


    const merged = [...avulsos, ...pedidos].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    return merged;
  }, [entries, ordersQuery.data]);

  const filtered = items.filter((e) => {
    if (tab !== "all" && e.linkKind !== tab) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      e.customer.toLowerCase().includes(q) ||
      (e.email || "").toLowerCase().includes(q) ||
      (e.customerPhone || "").includes(q) ||
      (e.meta || "").toLowerCase().includes(q)
    );
  });

  const countCard = items.filter((i) => i.linkKind === "card").length;
  const countBoleto = items.filter((i) => i.linkKind === "boleto").length;

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Command Center Header */}
      <div className="flex flex-col gap-1 border-l-4 border-brand-orange pl-6 py-1">
        <div className="flex items-center gap-2 text-[10px] font-bold text-brand-orange uppercase">
          <Vault className="h-4 w-4" /> Cofre VIA AIR
        </div>
        <div className="flex flex-wrap justify-between items-end gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight italic uppercase">
              Links de Pagamento
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Reúne os links avulsos gerados neste navegador e os pedidos de pacotes prontos vindos do banco.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 bg-muted/40 hover:bg-muted px-4 py-2 rounded border border-border text-xs font-bold uppercase tracking-widest transition-all"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-muted/20 p-2 rounded-xl border border-border/60 backdrop-blur">
        <div className="flex flex-wrap gap-1 bg-background/60 p-1 rounded-lg border border-border/60">
          <TabPill active={tab === "all"} onClick={() => setTab("all")}>
            TODOS ({items.length})
          </TabPill>
          <TabPill active={tab === "card"} onClick={() => setTab("card")}>
            <CreditCard className="h-3.5 w-3.5" /> LINK ({countCard})
          </TabPill>
          <TabPill active={tab === "boleto"} onClick={() => setTab("boleto")}>
            <FileText className="h-3.5 w-3.5" /> BOLETO ({countBoleto})
          </TabPill>
        </div>
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="BUSCAR POR CLIENTE, DESCRIÇÃO, E-MAIL, TELEFONE..."
            className="w-full bg-background/60 border border-border rounded-lg py-2.5 pl-10 pr-4 text-xs font-medium tracking-wide focus:outline-none focus:border-brand-orange/50 transition-all placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {ordersQuery.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          Não foi possível carregar os pedidos do banco.
        </div>
      )}

      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {ordersQuery.isLoading ? "Carregando…" : "Nenhum item para exibir."}
          </div>
        )}

        {filtered.map((e) => {
          const split = splitInstallments(e.total, e.installments, e.firstAmount);
          const parcelaLabel = split.equal
            ? `${e.installments}x de ${formatBRL(split.first)} sem juros`
            : `1ª de ${formatBRL(split.first)} + ${split.restCount}x de ${formatBRL(split.rest)}`;
          const whatsMessage = `Olá${e.customer ? ` ${e.customer}` : ""}! Segue seu link de pagamento seguro Via Air:\n\n💳 ${e.description}\n💰 Total: ${formatBRL(e.total)}\n📆 ${parcelaLabel}\n\n🔒 ${e.url}\n\nQualquer dúvida estamos à disposição.`;
          const waHref = e.customerPhone
            ? `https://wa.me/${e.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsMessage)}`
            : whatsappUrl(whatsMessage);

          const isPedido = !!e.order;
          const canFinalize = isPedido && e.status !== "paid";
          const canReject = isPedido && e.status !== "rejected";
          const hasSignature = !!e.order?.cardCapture?.authorization?.signature_data_url;

          return (
            <div
              key={e.id}
              className="group relative bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-brand-orange/30 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-brand-orange/5"
            >
              <div className="flex flex-col lg:flex-row">
                {/* Main content */}
                <div className="flex-1 p-5 sm:p-6 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Badge kind={e.kind} />
                    {e.status && <StatusBadge status={e.status} />}
                    <span className="ml-auto text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                      {new Date(e.createdAt).toLocaleString("pt-BR")} • {e.meta}
                    </span>
                  </div>

                  {e.orderNumber && (
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      Pedido {e.orderNumber}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                    <div className="min-w-0 space-y-1 flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-foreground uppercase tracking-tight truncate">
                        {e.description}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-bold text-foreground uppercase">{e.customer}</span>
                        {e.customerPhone && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            <span className="">{e.customerPhone}</span>
                          </>
                        )}
                        {e.email && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            <span className="italic lowercase">{e.email}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xl sm:text-2xl font-black text-brand-orange tabular-nums tracking-tighter">
                        {formatBRL(e.total)}
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {parcelaLabel}
                        {e.paymentMethod && ` • ${paymentMethodLabel(e.paymentMethod).label}`}
                      </div>
                    </div>
                  </div>

                  {(e.adults != null || e.children != null) && (
                    <div className="mb-3 text-xs text-muted-foreground">
                      {e.adults ?? 0} adulto(s)
                      {(e.children ?? 0) > 0 ? ` · ${e.children} criança(s)` : ""}
                    </div>
                  )}

                  {e.notes && (
                    <div className="mb-3 text-xs text-muted-foreground italic">"{e.notes}"</div>
                  )}

                  {(e.supplier || e.locator || e.route || e.travelDate || e.passengers) && (
                    <div className="mb-3 grid gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                      {e.supplier && (
                        <div><span className="text-muted-foreground">Fornecedor: </span><span className="font-medium text-foreground">{e.supplier}</span></div>
                      )}
                      {e.locator && (
                        <div><span className="text-muted-foreground">Localizador: </span><span className="font-semibold text-foreground">{e.locator}</span></div>
                      )}
                      {e.route && (
                        <div><span className="text-muted-foreground">Rota: </span><span className="whitespace-pre-line text-foreground">{e.route}</span></div>
                      )}
                      {e.travelDate && (
                        <div><span className="text-muted-foreground">Data: </span><span className="text-foreground">{e.travelDate}</span></div>
                      )}
                      {e.passengers && (
                        <div><span className="text-muted-foreground">Passageiros: </span><span className="whitespace-pre-line text-foreground">{e.passengers}</span></div>
                      )}
                    </div>
                  )}

                  {/* Technical URL row */}
                  <div className="flex items-center gap-3 bg-background/60 p-3 rounded-lg border border-border/60">
                    <div className="p-1.5 bg-muted rounded shrink-0">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="flex-1 text-[10px] text-muted-foreground truncate">{e.url}</span>
                  </div>
                </div>

                {/* Action rail */}
                <div className="bg-background/40 lg:w-52 p-4 flex flex-col gap-2 border-t lg:border-t-0 lg:border-l border-border/60">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(e.url);
                      toast.success("Link copiado");
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-brand-orange text-white rounded text-xs font-bold uppercase tracking-widest hover:bg-brand-orange/90 transition-all"
                  >
                    <Copy className="w-4 h-4" /> Copiar Link
                  </button>
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-500/15 text-emerald-500 rounded text-xs font-bold uppercase tracking-widest border border-emerald-500/20 hover:bg-emerald-500/25 transition-all"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 bg-muted/60 text-foreground rounded text-xs font-bold uppercase tracking-widest border border-border hover:bg-muted transition-all"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir cofre
                  </a>

                  {canFinalize && (
                    <button
                      type="button"
                      onClick={() => onFinalize(e.orderId!)}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-green-500/10 text-green-500 rounded text-xs font-bold uppercase tracking-widest border border-green-500/20 hover:bg-green-500/20 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Finalizar
                    </button>
                  )}

                  <TooltipProvider delayDuration={150}>
                    <div className="grid grid-cols-4 gap-2 mt-auto pt-2">
                      {e.order && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setDetailsItem(e)}
                              className="p-2 flex items-center justify-center bg-muted/60 border border-border rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Ver dados</TooltipContent>
                        </Tooltip>
                      )}
                      {isPedido && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => router.navigate({ to: "/admin/pedidos" as never })}
                              className="p-2 flex items-center justify-center bg-muted/60 border border-border rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Package className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Ver pedido</TooltipContent>
                        </Tooltip>
                      )}
                      {hasSignature && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const ord = e.order!;
                                  const rawAuth = ord.cardCapture!.authorization as unknown as AuthorizationData;
                                  const signedAt = rawAuth.signed_at ?? ord.createdAt;
                                  const validUntil =
                                    rawAuth.valid_until ??
                                    new Date(new Date(signedAt).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
                                  const enriched: AuthorizationData = {
                                    ...rawAuth,
                                    holder_name: rawAuth.holder_name ?? ord.fullName,
                                    holder_cpf: rawAuth.holder_cpf ?? ord.cpf ?? undefined,
                                    holder_email: rawAuth.holder_email ?? ord.email,
                                    holder_phone: rawAuth.holder_phone ?? ord.phone,
                                    holder_birth_date: rawAuth.holder_birth_date ?? ord.birthDate ?? undefined,
                                    description: rawAuth.description ?? ord.linkDescription ?? e.description,
                                    reference: rawAuth.reference ?? ord.linkReference ?? null,
                                    order_number: rawAuth.order_number ?? ord.orderNumber ?? null,
                                    supplier: rawAuth.supplier ?? "—",
                                    representative:
                                      rawAuth.representative ??
                                      "Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66)",
                                    installments: rawAuth.installments ?? e.installments,
                                    amount: rawAuth.amount ?? ord.totalPrice,
                                    signed_at: signedAt,
                                    valid_until: validUntil,
                                  };
                                  await generateAuthorizationPDF({
                                    orderId: e.orderId!,
                                    createdAt: ord.createdAt,
                                    authorization: enriched,
                                    liveness: (ord.cardCapture!.liveness ?? null) as unknown as LivenessData | null,
                                  });
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
                                }
                              }}
                              className="p-2 flex items-center justify-center bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 text-blue-500 transition-colors"
                            >
                              <FileSignature className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Autorização de débito</TooltipContent>
                        </Tooltip>
                      )}
                      {!e.order && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                const entry = entries.find((x) => x.id === e.id.replace(/^avulso:/, ""));
                                if (!entry) return toast.error("Entrada não encontrada");
                                stashEditEntry(entry);
                                const isSimples = /[?&]simples=1(?:&|$)/.test(entry.url);
                                router.navigate({
                                  to: isSimples ? "/admin/link-cartao-simples" : "/admin/link-pagamento",
                                });
                              }}
                              className="p-2 flex items-center justify-center bg-brand-orange/10 border border-brand-orange/30 rounded-full hover:bg-brand-orange/20 text-brand-orange transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      )}
                      {canReject && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onReject(e.orderId!, e.notes ?? null)}
                              className="p-2 flex items-center justify-center bg-red-500/10 border border-red-500/20 rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Rejeitar</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              if (e.order && e.orderId) onDeleteOrder(e.orderId);
                              else onDelete(e.id.replace(/^avulso:/, ""));
                            }}
                            className="p-2 flex items-center justify-center bg-muted/60 border border-border rounded-full hover:bg-red-500/10 hover:border-red-500/30 text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {detailsItem && detailsItem.order && (
        <DetailsModal item={detailsItem} onClose={() => setDetailsItem(null)} />
      )}
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all ${
        active
          ? "bg-brand-orange text-white shadow-lg shadow-brand-orange/20"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DetailsModal({
  item,
  onClose,
}: {
  item: UnifiedItem;
  onClose: () => void;
}) {
  const o = item.order!;
  const card = o.cardCapture;
  const [showCard, setShowCard] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const st = statusLabel(o.status);
  const pm = paymentMethodLabel(o.paymentMethod);

  const maskedNumber = card?.full_number
    ? showCard
      ? card.full_number
      : `•••• •••• •••• ${card.last4 || "----"}`
    : card?.last4
      ? `•••• •••• •••• ${card.last4}`
      : "—";

  function copyText(label: string, value: string) {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  }

  function copyAll() {
    const lines: string[] = [];
    lines.push(`Pedido #${o.id.slice(0, 8)}`);
    lines.push(`Data: ${new Date(o.createdAt).toLocaleString("pt-BR")}`);
    lines.push(`Total: ${formatBRL(o.totalPrice)}`);
    lines.push(`Status: ${st.label}`);
    lines.push(`Pagamento: ${pm.label}`);
    lines.push("");
    lines.push("— Cliente —");
    lines.push(`Nome: ${o.fullName}`);
    if (o.cpf) lines.push(`CPF: ${o.cpf}`);
    if (o.birthDate) lines.push(`Nascimento: ${o.birthDate}`);
    lines.push(`E-mail: ${o.email}`);
    lines.push(`Telefone: ${o.phone}`);
    if (card) {
      lines.push("");
      lines.push("— Cartão —");
      const brandLabel = cardBrandLabel(card);
      if (brandLabel) lines.push(`Bandeira: ${brandLabel}`);

      lines.push(`Número: ${card.full_number || card.last4 || "—"}`);
      if (card.expiry) lines.push(`Validade: ${card.expiry}`);
      if (card.cvv) lines.push(`CVV: ${card.cvv}`);
      if (card.holder) lines.push(`Titular: ${card.holder}`);
      if (card.billing) {
        lines.push("");
        lines.push("— Endereço de cobrança —");
        if (card.billing.address) lines.push(`Endereço: ${card.billing.address}`);
        if (card.billing.number) lines.push(`Número: ${card.billing.number}`);
        if (card.billing.zip) lines.push(`CEP: ${card.billing.zip}`);
        if (card.billing.city) lines.push(`Cidade: ${card.billing.city}`);
        if (card.billing.state) lines.push(`Estado: ${card.billing.state}`);
      }
    }
    if (o.notes) {
      lines.push("");
      lines.push("— Observações —");
      lines.push(o.notes);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Tudo copiado");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl my-8 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — dark gradient */}
        <div className="relative bg-gradient-to-br from-brand-orange/20 via-card to-card px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-brand-orange font-semibold">
                <CreditCard className="h-3.5 w-3.5" /> Dados do formulário
              </div>
              <h2 className="mt-1 font-display text-xl font-bold truncate">
                Pedido #{o.id.slice(0, 8)}
              </h2>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(o.createdAt).toLocaleString("pt-BR")}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/50 hover:border-brand-orange transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${st.className}`}
            >
              {st.label}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${pm.className}`}
            >
              {pm.label}
            </span>
            <span className="ml-auto text-lg font-display font-bold text-brand-orange">
              {formatBRL(o.totalPrice)}
            </span>
          </div>

          <button
            type="button"
            onClick={copyAll}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar tudo
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* Cliente */}
          <Section title="Cliente" icon={User}>
            <FieldRow label="Nome" value={o.fullName} onCopy={copyText} />
            {o.cpf && <FieldRow label="CPF" value={o.cpf} onCopy={copyText} />}
            {o.birthDate && (
              <FieldRow label="Nascimento" value={o.birthDate} onCopy={copyText} />
            )}
            <FieldRow label="E-mail" value={o.email} onCopy={copyText} />
            <FieldRow label="Telefone" value={o.phone} onCopy={copyText} />
          </Section>

          {/* Cartão */}
          {card && (
            <Section
              title="Cartão de crédito"
              icon={CreditCard}
              action={
                <div className="flex gap-1.5">
                  {card.full_number && (
                    <IconToggle
                      active={showCard}
                      onClick={() => setShowCard((v) => !v)}
                      label={showCard ? "Ocultar número" : "Mostrar número"}
                    />
                  )}
                </div>
              }
            >
              {(() => {
                const brandLabel = cardBrandLabel(card);
                return brandLabel ? (
                  <FieldRow label="Bandeira" value={brandLabel} onCopy={copyText} />
                ) : null;
              })()}

              <FieldRow
                label="Número"
                value={maskedNumber}
                onCopy={
                  card.full_number
                    ? () => copyText("Número", card.full_number!)
                    : undefined
                }
                mono
              />
              <div className="grid grid-cols-2 gap-3">
                {card.expiry && (
                  <FieldRow label="Validade" value={card.expiry} onCopy={copyText} mono />
                )}
                {card.cvv && (
                  <FieldRow
                    label="CVV"
                    value={showCvv ? card.cvv : "•••"}
                    onCopy={() => copyText("CVV", card.cvv!)}
                    mono
                    trailing={
                      <IconToggle
                        active={showCvv}
                        onClick={() => setShowCvv((v) => !v)}
                        label={showCvv ? "Ocultar CVV" : "Mostrar CVV"}
                      />
                    }
                  />
                )}
              </div>
              {card.holder && (
                <FieldRow label="Titular" value={card.holder} onCopy={copyText} />
              )}
            </Section>
          )}

          {/* Endereço */}
          {card?.billing &&
            (card.billing.address ||
              card.billing.city ||
              card.billing.zip) && (
              <Section title="Endereço de cobrança" icon={MapPin}>
                {card.billing.zip && (
                  <FieldRow label="CEP" value={card.billing.zip} onCopy={copyText} />
                )}
                {card.billing.address && (
                  <FieldRow
                    label="Endereço"
                    value={card.billing.address}
                    onCopy={copyText}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  {card.billing.number && (
                    <FieldRow
                      label="Número"
                      value={card.billing.number}
                      onCopy={copyText}
                    />
                  )}
                  {card.billing.city && (
                    <FieldRow label="Cidade" value={card.billing.city} onCopy={copyText} />
                  )}
                </div>
                {card.billing.state && (
                  <FieldRow label="Estado" value={card.billing.state} onCopy={copyText} />
                )}
              </Section>
            )}

          {/* Observações */}
          {o.notes && (
            <Section title="Observações" icon={FileText}>
              <div className="rounded-xl bg-background border border-border p-3 text-sm whitespace-pre-wrap text-muted-foreground">
                {o.notes}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">
          <Icon className="h-3.5 w-3.5 text-brand-orange" />
          {title}
        </div>
        {action}
      </div>
      <div className="rounded-2xl border border-border bg-background/50 divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onCopy,
  mono,
  trailing,
}: {
  label: string;
  value: string;
  onCopy?: ((label: string, value: string) => void) | (() => void);
  mono?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground w-24 shrink-0">
        {label}
      </div>
      <div
        className={`flex-1 min-w-0 text-sm truncate ${mono ? "" : ""}`}
      >
        {value}
      </div>
      {trailing}
      {onCopy && (
        <button
          type="button"
          onClick={() => {
            if (onCopy.length >= 2) {
              (onCopy as (l: string, v: string) => void)(label, value);
            } else {
              (onCopy as () => void)();
            }
          }}
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-brand-orange/10 hover:text-brand-orange transition"
          aria-label={`Copiar ${label}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function IconToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = active ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-brand-orange/10 hover:text-brand-orange transition"
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition border ${
        active
          ? "bg-brand-orange text-primary-foreground border-brand-orange"
          : "border-border text-muted-foreground hover:border-brand-orange hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ kind }: { kind: Kind }) {
  const isPedido = kind === "pedido";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isPedido
          ? "bg-brand-orange/15 text-brand-orange"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isPedido ? (
        <>
          <Package className="h-3 w-3" /> Pacote pronto
        </>
      ) : (
        <>
          <Link2 className="h-3 w-3" /> Avulso
        </>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = statusLabel(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.className}`}
    >
      {s.label}
    </span>
  );
}
