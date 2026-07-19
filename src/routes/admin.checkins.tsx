import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllCheckins, runCheckin } from "@/lib/checkin/checkin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Loader2, PlaneTakeoff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/checkins")({
  head: () => ({ meta: [{ title: "Check-ins — VIA AIR" }] }),
  component: CheckinsPage,
});

function CheckinsPage() {
  const load = useServerFn(listAllCheckins);
  const run = useServerFn(runCheckin);
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["all-checkins"],
    queryFn: () => load(),
    refetchInterval: 15_000,
  });

  const rows = (q.data ?? []) as Array<any>;

  async function handleRun(id: string) {
    setBusyId(id);
    try {
      const result = await run({ data: { checkinId: id } });
      if (!result.ok) {
        toast.error(result.error);
        await q.refetch();
        return;
      }
      toast.success("Check-in concluído");
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <PlaneTakeoff className="h-5 w-5 text-brand-orange" />
        <h1 className="text-xl font-semibold">Check-ins de voo</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        O robô roda automaticamente entre 48h e 1h antes do voo (LATAM). Você também pode disparar manualmente aqui.
      </p>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {!q.isLoading && rows.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum check-in registrado ainda.</Card>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const dep = r.departure_at ? new Date(r.departure_at) : null;
          const isBusy = busyId === r.id;
          return (
            <Card key={r.id} className="p-3 flex flex-wrap items-center gap-3">
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
                <a href={`/api/public/doc/${r.id}`} target="_blank" rel="noreferrer">
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
                onClick={() => handleRun(r.id)}
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                {r.status === "success" ? "Refazer" : "Fazer check-in"}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
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
