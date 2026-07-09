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
} from "lucide-react";
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
  type CofreEntry,
} from "@/lib/cofre-storage";
import {
  listCofreOrders,
  updateCofreOrder,
  deleteCofreOrder,
  type CofreOrder,
} from "@/lib/cofre.functions";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";
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
type UnifiedItem = {
  id: string;
  kind: Kind;
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
  adults?: number;
  children?: number;
  notes?: string | null;
  order?: CofreOrder;
};

function CofrePage() {
  const [entries, setEntries] = useState<CofreEntry[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "avulso" | "pedido">("all");
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
      createdAt: e.createdAt,
      customer: e.customer || "Sem nome",
      customerPhone: e.customerPhone,
      description: e.description,
      total: e.total,
      installments: e.installments,
      firstAmount: e.firstAmount,
      url: e.url,
      meta: e.orderRef ? `Ref: ${e.orderRef}` : "Link avulso",
    }));

    const pedidos: UnifiedItem[] = (ordersQuery.data ?? []).map((o: CofreOrder) => {
      const desc = o.packageTitle
        ? `Pacote ${o.packageTitle}`
        : "Pedido de pacote";
      const pm = (o.paymentMethod ?? "").toLowerCase();
      const instMatch = pm.match(/(\d+)x/);
      const installments = instMatch ? Number(instMatch[1]) : 1;
      const snap = (o as unknown as { packageSnapshot?: Record<string, unknown> }).packageSnapshot;
      void snap;
      const firstAmount = o.firstAmount && o.firstAmount > 0 ? o.firstAmount : undefined;

      const url = paymentLinkUrl({
        description: desc,
        total: o.totalPrice,
        installments,
        firstAmount,
        orderRef: o.id.slice(0, 8),
        customerName: o.fullName,
      });
      return {
        id: `pedido:${o.id}`,
        kind: "pedido",
        createdAt: new Date(o.createdAt).getTime(),
        customer: o.fullName,
        customerPhone: o.phone,
        email: o.email,
        description: desc,
        total: o.totalPrice,
        installments,
        firstAmount,
        url,
        meta: `Pedido #${o.id.slice(0, 8)}${o.packageSlug ? ` · ${o.packageSlug}` : ""}`,
        status: o.status,
        paymentMethod: o.paymentMethod,
        orderId: o.id,
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
    if (tab !== "all" && e.kind !== tab) return false;
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

  const countAvulso = items.filter((i) => i.kind === "avulso").length;
  const countPedido = items.filter((i) => i.kind === "pedido").length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
            <Vault className="h-4 w-4" /> Cofre Via Air
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">
            Links de pagamento
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reúne os links avulsos gerados neste navegador e os pedidos de
            pacotes prontos vindos do banco.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
          Todos ({items.length})
        </TabBtn>
        <TabBtn active={tab === "pedido"} onClick={() => setTab("pedido")}>
          <Package className="h-3.5 w-3.5" /> Pacotes prontos ({countPedido})
        </TabBtn>
        <TabBtn active={tab === "avulso"} onClick={() => setTab("avulso")}>
          <Link2 className="h-3.5 w-3.5" /> Avulsos ({countAvulso})
        </TabBtn>
      </div>

      <div className="mt-4 relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por cliente, descrição, e-mail, telefone…"
          className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
        />
      </div>

      {ordersQuery.isError && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          Não foi possível carregar os pedidos do banco.
        </div>
      )}

      <div className="mt-6 space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {ordersQuery.isLoading
              ? "Carregando…"
              : "Nenhum item para exibir."}
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

          return (
            <div key={e.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge kind={e.kind} />
                    {e.status && <StatusBadge status={e.status} />}
                    <span className="text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString("pt-BR")}
                    </span>
                    <span className="text-muted-foreground">· {e.meta}</span>
                  </div>
                  <div className="mt-1 font-semibold truncate">{e.description}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{e.customer}</span>
                    {e.customerPhone ? ` · ${e.customerPhone}` : ""}
                    {e.email ? ` · ${e.email}` : ""}
                  </div>
                  {(e.adults != null || e.children != null || e.paymentMethod) && (
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
                      <span>
                        {e.adults ?? 0} adulto(s)
                        {(e.children ?? 0) > 0 ? ` · ${e.children} criança(s)` : ""}
                      </span>
                      {e.paymentMethod && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${paymentMethodLabel(e.paymentMethod).className}`}
                        >
                          {paymentMethodLabel(e.paymentMethod).label}
                        </span>
                      )}
                    </div>
                  )}
                  {e.notes && (
                    <div className="text-xs text-muted-foreground mt-1 italic">
                      "{e.notes}"
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xl font-display font-bold text-brand-orange">
                    {formatBRL(e.total)}
                  </div>
                  <div className="text-xs text-muted-foreground">{parcelaLabel}</div>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-background border border-border px-3 py-2 font-mono text-xs break-all">
                {e.url}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(e.url);
                    toast.success("Link copiado");
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </button>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir cofre
                </a>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
                {e.kind === "pedido" && e.order && (
                  <button
                    type="button"
                    onClick={() => setDetailsItem(e)}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
                  >
                    <FileText className="h-3.5 w-3.5" /> Ver dados
                  </button>
                )}
                {e.kind === "pedido" && e.orderId && (
                  <button
                    type="button"
                    onClick={() =>
                      router.navigate({ to: "/admin/pedidos" as never })
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
                  >
                    <Package className="h-3.5 w-3.5" /> Ver pedido
                  </button>
                )}
                {e.kind === "pedido" && e.orderId && e.status !== "paid" && (
                  <button
                    type="button"
                    onClick={() => onFinalize(e.orderId!)}
                    className="inline-flex items-center gap-2 rounded-full border border-green-500/40 text-green-500 px-3.5 py-2 text-xs hover:bg-green-500/10 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
                  </button>
                )}
                {e.kind === "pedido" && e.orderId && e.status !== "rejected" && (
                  <button
                    type="button"
                    onClick={() => onReject(e.orderId!, e.notes ?? null)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/40 text-red-500 px-3.5 py-2 text-xs hover:bg-red-500/10 transition"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Rejeitar
                  </button>
                )}
                {e.kind === "pedido" && e.orderId && (
                  <button
                    type="button"
                    onClick={() => onDeleteOrder(e.orderId!)}
                    className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                )}
                {e.kind === "avulso" && (
                  <button
                    type="button"
                    onClick={() => onDelete(e.id.replace(/^avulso:/, ""))}
                    className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detailsItem && detailsItem.order && (
        <DetailsModal
          item={detailsItem}
          onClose={() => setDetailsItem(null)}
        />
      )}
    </div>
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
        className={`flex-1 min-w-0 text-sm truncate ${mono ? "font-mono" : ""}`}
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
