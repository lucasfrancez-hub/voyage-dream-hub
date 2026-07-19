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
      const dep = r.departure_at ? new Date(r.departure_at).getTime() : r.item?.details?.departure_at ? new Date(r.item.details.departure_at).getTime() : null;
      if (r.status === "success") done.push(r);
      else if (r.status === "running") running.push(r);
      else if (r.status === "failed") failed.push(r);
      else if (dep && dep - now <= 48 * HOUR) imminent.push(r);
      else imminent.push(r); // pending sem horário
    }
    return { imminent, running, done, failed };
  }, [rows]);

  async function handleRun(id: string, regenerate = false) {
    setBusyId(id);
    try {
      if (regenerate) {
        await regen({ data: { checkinId: id } });
      }
      const result = await run({ data: { checkinId: id } });
      if (!result.ok) {
        toast.error(result.error);
        await q.refetch();
        return;
      }
      toast.success(regenerate ? "Cartão regerado e enviado" : "Check-in concluído");
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <PlaneTakeoff className="h-5 w-5 text-brand-orange" />
          <h1 className="text-xl font-semibold">Check-ins de voo</h1>
        </div>
        <Button size="sm" variant="outline" disabled={bulkBusy} onClick={handleRegenAll}>
          {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Regerar todos os cartões
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        O robô roda automaticamente entre 48h e 1h antes do voo (LATAM). Você também pode disparar manualmente aqui.
      </p>

      {/* Mini dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Próximos (30d)" value={upcoming.length} tone="muted" />
        <StatCard icon={<Hourglass className="h-4 w-4" />} label="A realizar (48h)" value={groups.imminent.length} tone="warning" />
        <StatCard icon={<TimerReset className="h-4 w-4" />} label="Em andamento" value={groups.running.length} tone="info" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Realizados" value={groups.done.length} tone="success" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="Falharam" value={groups.failed.length} tone="danger" />
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      <Section
        title="A realizar em breve (dentro de 48h)"
        subtitle="Voos que o robô vai processar automaticamente nas próximas horas."
        empty="Nenhum check-in na janela dos próximos 2 dias."
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
        title="Próximos check-ins (fora da janela de 48h)"
        subtitle="Voos futuros identificados nos pedidos. O robô inicia automaticamente 48h antes."
        empty="Nenhum voo futuro identificado."
        items={upcoming}
        render={(u) => <UpcomingRow u={u} />}
      />
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "muted" | "warning" | "info" | "success" | "danger" }) {
  const toneMap = {
    muted: "text-muted-foreground",
    warning: "text-amber-600",
    info: "text-sky-600",
    success: "text-emerald-600",
    danger: "text-destructive",
  } as const;
  return (
    <Card className="p-3">
      <div className={`flex items-center gap-1.5 text-xs ${toneMap[tone]}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
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
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title} <span className="text-muted-foreground font-normal">· {items.length}</span></h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {items.length === 0 ? (
        empty && <Card className="p-4 text-sm text-muted-foreground">{empty}</Card>
      ) : (
        <div className="space-y-2">{items.map((r) => <div key={r.id}>{render(r)}</div>)}</div>
      )}
    </div>
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
  const depIso = r.departure_at ?? r.item?.details?.departure_at ?? null;
  const dep = depIso ? new Date(depIso) : null;
  const isBusy = busyId === r.id;
  return (
    <Card className="p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-medium">
          {r.cia} {r.flight_number || ""} · Loc {r.locator}
        </div>
        <div className="text-xs text-muted-foreground">
          {dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"} · Passageiro: {r.pnr_surname}
        </div>
        {r.order && (
          <Link to="/admin/pedidos/$id" params={{ id: r.order.id }} className="text-xs text-brand-orange hover:underline">
            Pedido #{r.order.order_number ?? r.order.id.slice(0, 8)} — {r.order.full_name ?? ""}
          </Link>
        )}
        {r.error && <div className="text-xs text-destructive mt-1">Erro: {r.error}</div>}
      </div>
      <StatusBadge status={r.status} />
      {(r.boarding_pass_path || r.boarding_pass_url) && (
        <Button size="sm" variant="outline" disabled={sendingId === r.id} onClick={() => onResend(r.id)}>
          {sendingId === r.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          Enviar cartão de embarque
        </Button>
      )}
      {(r.boarding_pass_path || r.boarding_pass_url) && (
        <a href={`https://pedidos.viaair.tur.br/api/public/doc/${r.id}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </a>
      )}
      {r.status !== "success" && r.locator && r.pnr_surname && (
        <a
          href={`https://www.latamairlines.com/br/pt/check-in/status?orderId=${encodeURIComponent(String(r.locator).toUpperCase())}&lastName=${encodeURIComponent(String(r.pnr_surname).toLowerCase())}`}
          target="_blank"
          rel="noreferrer"
        >
          <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5 mr-1" />Ver cartão(ões) de embarque</Button>
        </a>
      )}
      <Button
        size="sm"
        variant={r.status === "success" ? "outline" : "default"}
        disabled={isBusy}
        onClick={() => onRun(r.id, r.status === "success")}
        title={r.status === "success" ? "Apaga o PDF atual e roda o check-in de novo" : ""}
      >
        {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
        {r.status === "success" ? "Regerar cartão" : "Fazer check-in"}
      </Button>
    </Card>
  );
}

function UpcomingRow({ u }: { u: any }) {
  const dep = u.departure_at ? new Date(u.departure_at) : null;
  const hoursTo = dep ? Math.round((dep.getTime() - Date.now()) / HOUR) : null;
  return (
    <Card className="p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-medium">
          {u.cia} {u.flight_number || ""} {u.locator ? `· Loc ${u.locator}` : ""}
          {u.origin && u.destination && <span className="text-muted-foreground font-normal"> · {u.origin} → {u.destination}</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"}
          {hoursTo !== null && <> · faltam {hoursTo}h</>}
        </div>
        {u.order && (
          <Link to="/admin/pedidos/$id" params={{ id: u.order.id }} className="text-xs text-brand-orange hover:underline">
            Pedido #{u.order.order_number ?? u.order.id.slice(0, 8)} — {u.order.full_name ?? ""}
          </Link>
        )}
      </div>
      <Badge variant="outline" className="bg-muted text-muted-foreground">Aguardando janela</Badge>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: "Concluído", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    running: { label: "Rodando", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    failed: { label: "Falhou", className: "bg-destructive/15 text-destructive border-destructive/30" },
    pending: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status ?? "pending"] ?? map.pending;
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}
