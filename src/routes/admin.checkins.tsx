import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllCheckins,
  listUpcomingFlights,
  runCheckin,
  resendBoardingPass,
  regenerateBoardingPass,
  regenerateAllBoardingPasses,
} from "@/lib/checkin/checkin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  Hourglass,
  Loader2,
  PlaneTakeoff,
  RefreshCw,
  Send,
  TimerReset,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";

export const Route = createFileRoute("/admin/checkins")({
  head: () => ({ meta: [{ title: "Check-ins — VIA AIR" }] }),
  component: CheckinsPage,
});

const HOUR = 3600 * 1000;

function CheckinsPage() {
  const load = useServerFn(listAllCheckins);
  const loadUpcoming = useServerFn(listUpcomingFlights);
  const run = useServerFn(runCheckin);
  const resend = useServerFn(resendBoardingPass);
  const regen = useServerFn(regenerateBoardingPass);
  const regenAll = useServerFn(regenerateAllBoardingPasses);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const q = useQuery({
    queryKey: ["all-checkins"],
    queryFn: () => load(),
    refetchInterval: 15_000,
  });
  const qUp = useQuery({
    queryKey: ["upcoming-flights"],
    queryFn: () => loadUpcoming(),
    refetchInterval: 60_000,
  });

  const rows = (q.data ?? []) as Array<any>;
  const upcoming = (qUp.data ?? []) as Array<any>;

  const groups = useMemo(() => {
    const now = Date.now();
    const imminent: any[] = []; // pending/failed dentro de 48h
    const running: any[] = [];
    const done: any[] = [];
    const failed: any[] = [];
    for (const r of rows) {
      const depIso = r.departure_at ?? r.item?.details?.depart_at ?? r.item?.details?.departure_at ?? r.scheduled_for ?? null;
      const dep = depIso ? new Date(depIso).getTime() : null;
      if (r.status === "success") done.push(r);
      else if (r.status === "running") running.push(r);
      else if (r.status === "failed") failed.push(r);
      else if (dep && dep - now <= 48 * HOUR) imminent.push(r);
      else imminent.push(r); // pending sem horário
    }
    return { imminent, running, done, failed };
  }, [rows]);

  const upcoming7d = useMemo(() => {
    const now = Date.now();
    const in7 = now + 7 * 24 * HOUR;
    return upcoming.filter((u: any) => {
      const dep = u.departure_at ? new Date(u.departure_at).getTime() : null;
      return dep && dep >= now && dep <= in7;
    });
  }, [upcoming]);

  async function handleRun(id: string, regenerate = false, mode: "code" | "vision" = "code") {
    setBusyId(id);
    try {
      if (regenerate) {
        await regen({ data: { checkinId: id } });
      }
      const result = await run({ data: { checkinId: id, mode } });
      if (!result.ok) {
        toast.error(result.error);
        await q.refetch();
        return;
      }
      const modeLabel = mode === "vision" ? "Visão IA" : "Código";
      toast.success(
        regenerate
          ? `Cartão regerado (${modeLabel}) e enviado`
          : `Check-in (${modeLabel}) concluído`,
      );
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRegenAll() {
    const ok = await confirm({
      title: "Regerar todos os cartões?",
      description:
        "Vai apagar os PDFs atuais e rodar o check-in de novo para todos os voos com status Concluído. Útil quando os cartões saíram em branco.",
      confirmText: "Regerar todos",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await regenAll();
      toast.success(`${(res as any).count ?? 0} cartões marcados para regerar. O robô vai processar em segundos.`);
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleResend(id: string) {
    setSendingId(id);
    try {
      const res = await resend({ data: { checkinId: id } });
      const r = (res as any).report as {
        attempted: number; delivered: number;
        skippedNoPhone: Array<{ name: string }>; failed: Array<{ name: string; error: string }>;
        usedOrderFallback: boolean;
      } | undefined;
      if (!r || r.delivered === 0) {
        const noPhone = r?.skippedNoPhone.map((p) => p.name).join(", ");
        const failed = r?.failed.map((p) => `${p.name}: ${p.error}`).join(" · ");
        toast.error(
          noPhone
            ? `Nenhum passageiro tem WhatsApp cadastrado (${noPhone}). Adicione o número em "Passageiros".`
            : failed || "Envio falhou",
        );
      } else {
        toast.success(
          `Cartão enviado (${r.delivered}/${r.attempted + r.skippedNoPhone.length})${r.usedOrderFallback ? " · usou telefone do pedido" : ""}`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-2 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <PlaneTakeoff className="h-6 w-6 text-brand-orange" />
          <h1 className="text-2xl font-bold tracking-tight">Check-ins de voo</h1>
        </div>
        <Button size="sm" variant="outline" disabled={bulkBusy} onClick={handleRegenAll}>
          {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Regerar todos os cartões
        </Button>
      </header>

      <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
        O robô roda automaticamente entre 48h e 1h antes do voo (LATAM). Você também pode disparar manualmente aqui.
      </p>

      {/* Mini dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Próximos (7d)" value={upcoming7d.length} tone="muted" />
        <StatCard icon={<Hourglass className="h-4 w-4" />} label="A realizar (48h)" value={groups.imminent.length} tone="warning" />
        <StatCard icon={<TimerReset className="h-4 w-4" />} label="Em andamento" value={groups.running.length} tone="info" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Realizados" value={groups.done.length} tone="success" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="Falharam" value={groups.failed.length} tone="danger" />
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      <div className="space-y-10">
        <Section
          title="A realizar em breve (dentro de 48h)"
          subtitle="Voos já dentro do prazo de check-in automático."
          empty="Nenhum check-in na janela das próximas 48h."
          items={groups.imminent}
          render={(r) => (
            <CheckinRow r={r} busyId={busyId} sendingId={sendingId} onRun={handleRun} onResend={handleResend} />
          )}
        />

        <Section
          title="Em andamento"
          empty="Nenhum check-in rodando agora."
          items={groups.running}
          render={(r) => (
            <CheckinRow r={r} busyId={busyId} sendingId={sendingId} onRun={handleRun} onResend={handleResend} />
          )}
        />

        <Section
          title="Realizados"
          subtitle="Cartões de embarque já baixados e disponíveis para reenvio."
          empty="Ainda não há check-ins concluídos."
          items={groups.done}
          render={(r) => (
            <CheckinRow r={r} busyId={busyId} sendingId={sendingId} onRun={handleRun} onResend={handleResend} />
          )}
        />

        {groups.failed.length > 0 && (
          <Section
            title="Falharam"
            subtitle="Voos que precisam de retry manual."
            empty=""
            items={groups.failed}
            render={(r) => (
              <CheckinRow r={r} busyId={busyId} sendingId={sendingId} onRun={handleRun} onResend={handleResend} />
            )}
          />
        )}

        <Section
          title="Próximos check-ins (dentro de 7 dias)"
          subtitle="Voos futuros identificados nos pedidos. O robô inicia automaticamente 48h antes."
          empty="Nenhum voo nos próximos 7 dias."
          items={upcoming7d}
          render={(u) => <UpcomingRow u={u} />}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "muted" | "warning" | "info" | "success" | "danger" }) {
  const toneMap = {
    muted: "text-muted-foreground",
    warning: "text-brand-orange font-semibold",
    info: "text-sky-500",
    success: "text-emerald-500",
    danger: "text-rose-500",
  } as const;
  return (
    <Card className="p-4 bg-card/40 border-border/60 rounded-xl">
      <div className={`flex items-center gap-2 text-[11px] uppercase tracking-wider ${toneMap[tone]}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </Card>
  );
}

function Section({
  title, subtitle, empty, items, render,
}: {
  title: string;
  subtitle?: string;
  empty: string;
  items: any[];
  render: (r: any) => React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground font-mono">{items.length}</span>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {items.length === 0 ? (
        empty && (
          <div className="p-6 rounded-xl border border-dashed border-border/60 bg-card/20 text-center text-sm text-muted-foreground">
            {empty}
          </div>
        )
      ) : (
        <div className="space-y-3">{items.map((r) => <div key={r.id}>{render(r)}</div>)}</div>
      )}
    </section>
  );
}

function CheckinRow({
  r, busyId, sendingId, onRun, onResend,
}: {
  r: any;
  busyId: string | null;
  sendingId: string | null;
  onRun: (id: string, regenerate?: boolean) => void;
  onResend: (id: string) => void;
}) {
  const depIso = r.departure_at ?? r.item?.details?.depart_at ?? r.item?.details?.departure_at ?? r.scheduled_for ?? null;
  const dep = depIso ? new Date(depIso) : null;
  const isBusy = busyId === r.id;
  const isSending = sendingId === r.id;
  const hasPdf = !!(r.boarding_pass_path || r.boarding_pass_url);
  const passengerLabel = r.passenger?.full_name || r.pnr_surname || null;
  return (
    <Card className="p-5 bg-card/30 border-border/60 rounded-xl hover:border-brand-orange/40 transition-colors flex flex-wrap items-center justify-between gap-4">
      <div className="flex-1 min-w-[260px]">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="font-bold">{r.cia} {r.flight_number || ""}</span>
          {r.locator && (
            <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-mono rounded uppercase tracking-wider">
              Loc {r.locator}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"}</span>
          {passengerLabel && <span>Passageiro: {passengerLabel}</span>}
        </div>
        {r.order && (
          <div className="mt-2 text-[11px]">
            <Link to="/admin/pedidos/$id" params={{ id: r.order.id }} className="text-brand-orange/80 hover:text-brand-orange hover:underline font-medium">
              Pedido #{r.order.order_number ?? r.order.id.slice(0, 8)} — {r.order.full_name ?? ""}
            </Link>
          </div>
        )}
        {r.error && <div className="text-xs text-destructive mt-1">Erro: {r.error}</div>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={r.status} />

        {hasPdf && (
          <Button
            size="sm" variant="ghost" className="h-9 w-9 p-0"
            disabled={isSending} onClick={() => onResend(r.id)}
            title="Enviar cartão de embarque"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
        {hasPdf && (
          <a href={`/api/public/bp/${r.id}`} target="_blank" rel="noreferrer" title="PDF">
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0"><Download className="h-4 w-4" /></Button>
          </a>
        )}
        {r.status !== "success" && r.locator && r.pnr_surname && (
          <a
            href={`https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(String(r.locator).toUpperCase())}&lastName=${encodeURIComponent(String(r.pnr_surname).toLowerCase())}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" variant="outline" className="h-9"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Ver cartão(ões)</Button>
          </a>
        )}
        <Button
          size="sm"
          variant={r.status === "success" ? "outline" : "default"}
          className={r.status === "success" ? "h-9" : "h-9 bg-brand-orange hover:bg-brand-orange/90 text-white shadow-lg shadow-brand-orange/10"}
          disabled={isBusy}
          onClick={() => onRun(r.id, r.status === "success")}
          title={r.status === "success" ? "Apaga o PDF atual e roda o check-in de novo" : ""}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          {r.status === "success" ? "Regerar cartão" : "Fazer check-in"}
        </Button>
      </div>
    </Card>
  );
}

function UpcomingRow({ u }: { u: any }) {
  const dep = u.departure_at ? new Date(u.departure_at) : null;
  const hoursTo = dep ? Math.round((dep.getTime() - Date.now()) / HOUR) : null;
  return (
    <Card className="p-5 bg-card/30 border-border/60 rounded-xl flex flex-wrap items-center justify-between gap-4">
      <div className="flex-1 min-w-[260px]">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="font-bold">{u.cia} {u.flight_number || ""}</span>
          {u.locator && (
            <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-mono rounded uppercase tracking-wider">
              Loc {u.locator}
            </span>
          )}
          {u.origin && u.destination && (
            <span className="text-xs text-muted-foreground">{u.origin} → {u.destination}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"}
          {hoursTo !== null && <> · faltam {hoursTo}h</>}
        </div>
        {u.order && (
          <div className="mt-2 text-[11px]">
            <Link to="/admin/pedidos/$id" params={{ id: u.order.id }} className="text-brand-orange/80 hover:text-brand-orange hover:underline font-medium">
              Pedido #{u.order.order_number ?? u.order.id.slice(0, 8)} — {u.order.full_name ?? ""}
            </Link>
          </div>
        )}
      </div>
      <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border/60">Aguardando janela</Badge>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; className: string; dot?: boolean }> = {
    success: { label: "Concluído", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    running: { label: "Rodando", className: "bg-amber-500/10 text-amber-500 border-amber-500/30", dot: true },
    failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30" },
    pending: { label: "Pendente", className: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status ?? "pending"] ?? map.pending;
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${s.className}`}>
      {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {s.label}
    </div>
  );
}
