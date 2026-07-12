import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Loader2, TrendingUp, DollarSign, Receipt, ShoppingBag, Plane, CalendarClock, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — Admin" }] }),
});

type OrderRow = {
  id: string;
  order_number: string | null;
  created_at: string;
  status: string | null;
  full_name: string | null;
  total_price: number | null;
  package_snapshot: Record<string, unknown> | null;
  airline_locator: string | null;
};

type FinancialRow = {
  order_item_id: string;
  commission_value: number | null;
  sale_value: number | null;
  tax_value: number | null;
  order_items: { order_id: string } | { order_id: string }[] | null;
};

type ItemRow = {
  order_id: string;
  kind: string;
  status: string;
  supplier_locator: string | null;
  details: Record<string, unknown> | null;
};

const PAID = new Set(["paid", "approved"]);

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(d: Date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function DashboardPage() {
  const { data: orders, isLoading: lo } = useQuery({
    queryKey: ["admin", "dashboard", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at, status, full_name, total_price, package_snapshot, airline_locator")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as OrderRow[];
    },
  });

  const { data: fins, isLoading: lf } = useQuery({
    queryKey: ["admin", "dashboard", "financials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_item_financials")
        .select("order_id, commission_value, sale_value, tax_value");
      if (error) throw error;
      return data as unknown as FinancialRow[];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["admin", "dashboard", "items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, kind, status, supplier_locator, details");
      if (error) throw error;
      return data as unknown as ItemRow[];
    },
  });

  const stats = useMemo(() => {
    const paidOrders = (orders ?? []).filter((o) => PAID.has((o.status ?? "").toLowerCase()));
    const totalSold = paidOrders.reduce((a, o) => a + Number(o.total_price ?? 0), 0);
    const count = paidOrders.length;
    const avgTicket = count > 0 ? totalSold / count : 0;

    const paidIds = new Set(paidOrders.map((o) => o.id));
    const commission = (fins ?? [])
      .filter((f) => paidIds.has(f.order_id))
      .reduce((a, f) => a + Number(f.commission_value ?? 0), 0);

    // Este mês
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthOrders = paidOrders.filter((o) => new Date(o.created_at) >= monthStart);
    const monthTotal = monthOrders.reduce((a, o) => a + Number(o.total_price ?? 0), 0);
    const monthCommission = (fins ?? [])
      .filter((f) => monthOrders.some((o) => o.id === f.order_id))
      .reduce((a, f) => a + Number(f.commission_value ?? 0), 0);

    const pending = (orders ?? []).filter((o) => (o.status ?? "").toLowerCase() === "pending").length;

    return { totalSold, count, avgTicket, commission, monthTotal, monthCommission, monthCount: monthOrders.length, pending };
  }, [orders, fins]);

  const upcoming = useMemo(() => {
    if (!orders) return [];
    const itemsByOrder = new Map<string, ItemRow[]>();
    for (const it of items ?? []) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    }

    return orders
      .filter((o) => PAID.has((o.status ?? "").toLowerCase()))
      .map((o) => {
        const snap = (o.package_snapshot ?? {}) as Record<string, unknown>;
        const its = itemsByOrder.get(o.id) ?? [];
        // travel date: package snapshot going_date, or earliest flight depart, or hotel check-in
        let travel: Date | null = toDate(snap.going_date);
        if (!travel) {
          for (const it of its) {
            const d = (it.details ?? {}) as Record<string, unknown>;
            const cand = toDate(d.depart_at ?? d.departure ?? d.check_in ?? d.checkin);
            if (cand && (!travel || cand < travel)) travel = cand;
          }
        }
        if (!travel) return null;
        const days = daysUntil(travel);
        if (days < 0 || days > 60) return null;

        const flights = its.filter((it) => it.kind === "flight");
        const flightEmitted = flights.length > 0 && flights.every((f) => f.status === "confirmed");
        const flightLocator =
          o.airline_locator ||
          flights.map((f) => f.supplier_locator).find((x) => !!x) ||
          null;

        return {
          id: o.id,
          order_number: o.order_number,
          name: o.full_name,
          travel,
          days,
          flightEmitted,
          flightLocator,
          hasFlights: flights.length > 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.travel.getTime() - b.travel.getTime())
      .slice(0, 30);
  }, [orders, items]);

  if (lo || lf) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do negócio</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi icon={DollarSign} label="Total vendido" value={formatBRL(stats.totalSold)} hint={`${stats.count} pedidos pagos`} accent="text-emerald-500" />
        <Kpi icon={TrendingUp} label="Lucro / comissão" value={formatBRL(stats.commission)} hint="Somatório do financeiro" accent="text-brand-orange" />
        <Kpi icon={Receipt} label="Ticket médio" value={formatBRL(stats.avgTicket)} hint="Pagos" />
        <Kpi icon={ShoppingBag} label="Pendentes" value={String(stats.pending)} hint="Aguardando pagamento" />
      </div>

      {/* Mês atual */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Este mês</div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Vendido</div>
            <div className="text-xl font-semibold">{formatBRL(stats.monthTotal)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Comissão</div>
            <div className="text-xl font-semibold text-brand-orange">{formatBRL(stats.monthCommission)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Pedidos</div>
            <div className="text-xl font-semibold">{stats.monthCount}</div>
          </div>
        </div>
      </div>

      {/* Próximas viagens */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-brand-orange" />
          <h2 className="font-semibold">Próximas viagens</h2>
          <span className="text-xs text-muted-foreground ml-2">Próximos 60 dias</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma viagem próxima.</div>
        ) : (
          <div className="divide-y divide-border">
            {upcoming.map((u) => (
              <Link
                key={u.id}
                to="/admin/pedidos/$id"
                params={{ id: u.id }}
                className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3 hover:bg-muted/30 transition"
              >
                <div className="flex flex-col items-center min-w-[64px]">
                  <div className={`text-lg font-bold ${u.days <= 7 ? "text-red-500" : u.days <= 15 ? "text-brand-orange" : "text-foreground"}`}>
                    {u.days === 0 ? "Hoje" : `${u.days}d`}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {u.travel.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                    <span>#{u.order_number ?? u.id.slice(0, 8).toUpperCase()}</span>
                    {u.flightLocator && (
                      <span className="inline-flex items-center gap-1">
                        <Plane className="h-3 w-3" /> {u.flightLocator}
                      </span>
                    )}
                    {u.hasFlights && (
                      u.flightEmitted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="h-3 w-3" /> Aéreo emitido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-500">
                          <Clock className="h-3 w-3" /> Aéreo pendente
                        </span>
                      )
                    )}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, hint, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint?: string; accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent ?? ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
