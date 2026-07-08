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
import { listCofreOrders, type CofreOrder } from "@/lib/cofre.functions";

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
  const router = useRouter();

  const fetchOrders = useServerFn(listCofreOrders);
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
      const url = paymentLinkUrl({
        description: desc,
        total: o.totalPrice,
        installments: 1,
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
        installments: 1,
        url,
        meta: `Pedido #${o.id.slice(0, 8)}${o.packageSlug ? ` · ${o.packageSlug}` : ""}`,
        status: o.status,
        paymentMethod: o.paymentMethod,
        orderId: o.id,
        adults: o.adults,
        children: o.children,
        notes: o.notes,
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
                  {(e.adults != null || e.children != null) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {e.adults ?? 0} adulto(s)
                      {(e.children ?? 0) > 0 ? ` · ${e.children} criança(s)` : ""}
                      {e.paymentMethod ? ` · Pagamento: ${e.paymentMethod}` : ""}
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
    </div>
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
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-600",
    paid: "bg-green-500/15 text-green-600",
    cancelled: "bg-red-500/15 text-red-600",
    canceled: "bg-red-500/15 text-red-600",
    approved: "bg-green-500/15 text-green-600",
  };
  const cls = map[status] || "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
