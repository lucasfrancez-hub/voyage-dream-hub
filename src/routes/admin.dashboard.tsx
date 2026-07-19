import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, TrendingUp, DollarSign, Receipt, ShoppingBag, Plane, CalendarClock, ExternalLink, CheckCircle2, Clock, BarChart3, ArrowUpRight, ArrowDownRight, AlertCircle, Trophy, Crown, Medal } from "lucide-react";
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

const PAID = new Set(["paid", "approved", "confirmed", "awaiting_signature", "completed"]);
const RANGES = [7, 30, 60, 90] as const;
type Range = (typeof RANGES)[number];

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
  const [range, setRange] = useState<Range>(7);
  const { data: isAdmin = false } = useQuery({
    queryKey: ["admin", "dashboard", "is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
    staleTime: 5 * 60 * 1000,
  });

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
        .select("order_item_id, commission_value, sale_value, tax_value, order_items!inner(order_id)");
      if (error) throw error;
      const rows = (data ?? []) as unknown as FinancialRow[];
      return rows.map((r) => {
        const oi = Array.isArray(r.order_items) ? r.order_items[0] : r.order_items;
        return { ...r, order_id: oi?.order_id ?? "" } as FinancialRow & { order_id: string };
      });
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

  const { data: financials } = useQuery({
    queryKey: ["admin", "dashboard", "financial-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("kind, amount, due_date, status");
      if (error) throw error;
      return data as unknown as { kind: "payable" | "receivable"; amount: number; due_date: string | null; status: string }[];
    },
  });

  const finSummary = useMemo(() => {
    const t = new Date().toISOString().slice(0, 10);
    const empty = { total: 0, overdue: 0, overdueCount: 0 };
    const summary = { payable: { ...empty }, receivable: { ...empty } };
    for (const f of financials ?? []) {
      if (f.status !== "pending") continue;
      const bucket = summary[f.kind];
      bucket.total += Number(f.amount);
      if (f.due_date && f.due_date < t) {
        bucket.overdue += Number(f.amount);
        bucket.overdueCount += 1;
      }
    }
    return summary;
  }, [financials]);


  const stats = useMemo(() => {
    const paidOrders = (orders ?? []).filter((o) => PAID.has((o.status ?? "").toLowerCase()));
    const totalSold = paidOrders.reduce((a, o) => a + Number(o.total_price ?? 0), 0);
    const count = paidOrders.length;
    const avgTicket = count > 0 ? totalSold / count : 0;

    const paidIds = new Set(paidOrders.map((o) => o.id));
    const commission = (fins ?? [])
      .filter((f) => paidIds.has(f.order_id))
      .reduce((a, f) => a + Number(f.commission_value ?? 0), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthOrders = paidOrders.filter((o) => new Date(o.created_at) >= monthStart);
    const monthTotal = monthOrders.reduce((a, o) => a + Number(o.total_price ?? 0), 0);
    const monthCommission = (fins ?? [])
      .filter((f) => monthOrders.some((o) => o.id === f.order_id))
      .reduce((a, f) => a + Number(f.commission_value ?? 0), 0);

    const pending = (orders ?? []).filter((o) => (o.status ?? "").toLowerCase() === "pending").length;

    // 6-month trend
    const trend: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const total = paidOrders
        .filter((o) => {
          const c = new Date(o.created_at);
          return c >= d && c < next;
        })
        .reduce((a, o) => a + Number(o.total_price ?? 0), 0);
      trend.push({
        label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        total,
      });
    }

    return { totalSold, count, avgTicket, commission, monthTotal, monthCommission, monthCount: monthOrders.length, pending, trend };
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
        if (days < 0 || days > range) return null;

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
      .slice(0, 50);
  }, [orders, items, range]);

  const topClients = useMemo(() => {
    const paidOrders = (orders ?? []).filter((o) => PAID.has((o.status ?? "").toLowerCase()));
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const o of paidOrders) {
      const name = (o.full_name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = map.get(key) ?? { name, total: 0, count: 0 };
      cur.total += Number(o.total_price ?? 0);
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [orders]);

  const maxTrend = Math.max(1, ...stats.trend.map((t) => t.total));

  if (lo || lf) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-6">
      <WelcomeBanner />
      <div>
        <h1 className="text-2xl font-display font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do negócio</p>
      </div>


      {/* KPIs */}
      <div className={`grid gap-3 grid-cols-2 ${isAdmin ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <Kpi icon={DollarSign} label="Total vendido" value={formatBRL(stats.totalSold)} hint={`${stats.count} pedidos pagos`} accent="text-emerald-500" />
        {isAdmin && (
          <Kpi icon={TrendingUp} label="Lucro / comissão" value={formatBRL(stats.commission)} hint="Somatório do financeiro" accent="text-brand-orange" />
        )}
        <Kpi icon={Receipt} label="Ticket médio" value={formatBRL(stats.avgTicket)} hint="Pagos" />
        <Link to="/admin/pedidos" search={{ status: "pending" }} className="block rounded-2xl transition hover:opacity-90">
          <Kpi icon={ShoppingBag} label="Pendentes" value={String(stats.pending)} hint="Ver aguardando pagamento →" />
        </Link>
      </div>

      {/* Mês atual + trend */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 md:col-span-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Este mês</div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Vendido</div>
              <div className="text-2xl font-semibold">{formatBRL(stats.monthTotal)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div>
                  <div className="text-[11px] text-muted-foreground">Comissão</div>
                  <div className="text-lg font-semibold text-brand-orange">{formatBRL(stats.monthCommission)}</div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-muted-foreground">Pedidos</div>
                <div className="text-lg font-semibold">{stats.monthCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-brand-orange" />
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Vendas — últimos 6 meses</div>
          </div>
          <div className="flex items-end justify-between gap-2 h-32">
            {stats.trend.map((t, i) => {
              const h = (t.total / maxTrend) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition">
                    {formatBRL(t.total)}
                  </div>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-brand-orange/80 to-brand-orange/40 hover:from-brand-orange hover:to-brand-orange/60 transition"
                    style={{ height: `${Math.max(2, h)}%` }}
                  />
                  <div className="text-[10px] text-muted-foreground uppercase">{t.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Check-ins — resumo */}
      <CheckinsOverview />


      {/* Financeiro: a pagar / a receber (admin) */}
      {isAdmin && (
        <div className="grid gap-3 md:grid-cols-2">
          <Link to="/admin/contas-receber" className="rounded-2xl border border-border bg-card p-5 hover:border-emerald-500/40 transition group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" /> Contas a receber
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-500">{formatBRL(finSummary.receivable.total)}</div>
            <div className="text-[11px] text-muted-foreground">Pendente</div>
            {finSummary.receivable.overdueCount > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" />
                {formatBRL(finSummary.receivable.overdue)} vencido ({finSummary.receivable.overdueCount})
              </div>
            )}
          </Link>
          <Link to="/admin/contas-pagar" className="rounded-2xl border border-border bg-card p-5 hover:border-red-500/40 transition group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5 text-red-500" /> Contas a pagar
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-red-500">{formatBRL(finSummary.payable.total)}</div>
            <div className="text-[11px] text-muted-foreground">Pendente</div>
            {finSummary.payable.overdueCount > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" />
                {formatBRL(finSummary.payable.overdue)} vencido ({finSummary.payable.overdueCount})
              </div>
            )}
          </Link>
        </div>
      )}


      {/* Próximas viagens */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <CalendarClock className="h-4 w-4 text-brand-orange" />
          <h2 className="font-semibold">Próximas viagens</h2>
          <div className="ml-auto inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-xs rounded-md transition ${
                  range === r
                    ? "bg-brand-orange text-white font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r} dias
              </button>
            ))}
          </div>
        </div>
        {upcoming.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma viagem nos próximos {range} dias.
          </div>
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



      {/* Ranking de clientes */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <Trophy className="h-4 w-4 text-brand-orange" />
          <h2 className="font-semibold">Top clientes</h2>
          <span className="text-xs text-muted-foreground">por valor total vendido</span>
        </div>
        {topClients.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente pago ainda.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topClients.map((c, i) => {
              const medal =
                i === 0 ? { icon: Crown, cls: "text-yellow-500" } :
                i === 1 ? { icon: Medal, cls: "text-slate-400" } :
                i === 2 ? { icon: Medal, cls: "text-amber-700" } :
                null;
              const MedalIcon = medal?.icon;
              return (
                <Link
                  key={c.name}
                  to="/admin/pedidos"
                  search={{ q: c.name } as never}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3 hover:bg-muted/30 transition"
                >
                  <div className="flex items-center gap-2 min-w-[48px]">
                    <div className="text-sm font-bold text-muted-foreground w-6 text-center">{i + 1}</div>
                    {MedalIcon && <MedalIcon className={`h-4 w-4 ${medal!.cls}`} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.count} {c.count === 1 ? "pedido" : "pedidos"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-500">{formatBRL(c.total)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Ticket médio {formatBRL(c.total / c.count)}
                    </div>
                  </div>
                </Link>
              );
            })}
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
    <div className="rounded-2xl border border-border bg-card p-4 hover:border-brand-orange/40 transition">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent ?? ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function WelcomeBanner() {
  const [name, setName] = useState<string>("");
  const [dismissed, setDismissed] = useState(false);
  useMemo(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const fn = (meta.full_name as string) || (meta.name as string) || (u?.email ? String(u.email).split("@")[0] : "");
      setName(fn);
    });
    return null;
  }, []);
  if (dismissed) return null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-orange/30 bg-gradient-to-br from-brand-orange/15 via-brand-orange/5 to-transparent p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-orange font-semibold mb-1">Bem-vindo à VIA AIR</div>
          <h2 className="text-xl md:text-2xl font-display font-bold">
            {greet}{name ? `, ${name}` : ""} 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Aqui está o resumo do seu dia. Bom trabalho!</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-md hover:bg-muted"
          aria-label="Dispensar"
        >
          Dispensar
        </button>
      </div>
    </div>
  );
}

