import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";

export const Route = createFileRoute("/admin/pedidos/")({
  component: AdminOrders,
  head: () => ({ meta: [{ title: "Pedidos — Admin" }] }),
});

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Finalizado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function AdminOrders() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin", "orders", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at, status, full_name, email, phone, cpf, payment_method, total_price, package_snapshot, supplier_name, supplier_order_number, airline_locator")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = (orders ?? []).filter((o) => {
    if (statusFilter !== "all") {
      const s = (o.status ?? "").toLowerCase();
      if (statusFilter === "paid" && s !== "paid" && s !== "approved") return false;
      if (statusFilter !== "paid" && s !== statusFilter) return false;
    }
    if (!q) return true;
    const snap = (o.package_snapshot ?? {}) as { order_number?: string; title?: string };
    const orderNumberCol = (o as { order_number?: string | null }).order_number ?? "";
    return (
      (o.full_name ?? "").toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (o.cpf ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").toLowerCase().includes(q) ||
      orderNumberCol.toLowerCase().includes(q) ||
      (snap.order_number ?? "").toString().toLowerCase().includes(q) ||
      (snap.title ?? "").toLowerCase().includes(q) ||
      (o.airline_locator ?? "").toLowerCase().includes(q) ||
      (o.supplier_order_number ?? "").toLowerCase().includes(q) ||
      shortId(o.id).toLowerCase().includes(q)
    );
  });

  const statusCounts = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    const s = (o.status ?? "").toLowerCase();
    const key = s === "approved" ? "paid" : s;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          {orders?.length ?? 0} pedido(s) · resultado da busca: {filtered.length}
        </p>
      </div>

      {/* Search bar (FRT style) */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Id, passageiro, e-mail, CPF, telefone, localizador ou nº do pedido…"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-orange"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            const count = f.value === "all" ? orders?.length ?? 0 : statusCounts[f.value] ?? 0;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition ${
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
      </div>

      {/* Result table */}
      <div className="mt-4 rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          Resultado da busca: {filtered.length} registro(s)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left py-2 px-3 font-normal">Id</th>
                <th className="text-left py-2 px-3 font-normal">Contato</th>
                <th className="text-left py-2 px-3 font-normal">Produto</th>
                <th className="text-left py-2 px-3 font-normal">Tipo / Status</th>
                <th className="text-right py-2 px-3 font-normal">Total</th>
                <th className="text-left py-2 px-3 font-normal">Criação</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum pedido encontrado.
                </td></tr>
              )}
              {filtered.map((o) => {
                const snap = (o.package_snapshot ?? {}) as {
                  order_number?: string;
                  title?: string;
                  destination?: string;
                  reference?: string;
                };
                const pm = paymentMethodLabel(o.payment_method);
                const st = statusLabel(o.status);
                const displayOrderNumber =
                  ((o as { order_number?: string | null }).order_number ?? snap.order_number ?? shortId(o.id));
                return (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 transition">
                    <td className="py-3 px-3 align-top">
                      <div className="font-mono text-sm font-semibold">{displayOrderNumber}</div>
                      {o.airline_locator && (
                        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">LOC {o.airline_locator}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="font-medium">{o.full_name}</div>
                      <div className="text-xs text-muted-foreground">{o.email}</div>
                      <div className="text-xs text-muted-foreground">{o.phone}</div>
                    </td>
                    <td className="py-3 px-3 align-top max-w-md">
                      <div className="text-sm">{snap.title ?? snap.reference ?? "—"}</div>
                      {snap.destination && (
                        <div className="text-xs text-muted-foreground">{snap.destination}</div>
                      )}
                      {o.supplier_name && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">Fornecedor: {o.supplier_name}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${pm.className}`}>{pm.label}</div>
                      <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.className}`}>{st.label}</div>
                    </td>
                    <td className="py-3 px-3 align-top text-right">
                      <div className="font-semibold">{formatBRL(Number(o.total_price))}</div>
                    </td>
                    <td className="py-3 px-3 align-top text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-3 align-top text-right">
                      <Link
                        to="/admin/pedidos/$id"
                        params={{ id: o.id }}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand-orange hover:text-brand-orange transition"
                      >
                        <ExternalLink className="h-3 w-3" /> Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
