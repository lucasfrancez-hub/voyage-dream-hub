import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plane, CheckCircle2, XCircle, Clock, RefreshCw, Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listCheckins,
  runCheckinGroup,
  detectAirline,
  resendBoardingPass,
  regenerateBoardingPass,
} from "@/lib/checkin/checkin.functions";

type FlightItem = {
  id: string;
  supplier_locator?: string | null;
  details?: {
    airline?: string | null;
    flight_number?: string | null;
    departure_at?: string | null;
    from_iata?: string | null;
    to_iata?: string | null;
  } | null;
};

interface CheckinPanelProps {
  orderId: string;
  flightItems: FlightItem[];
}

type Segment = { item: FlightItem; checkin: any | null };
type ReservationGroup = {
  key: string;
  locator: string | null;
  segments: Segment[];
  firstDep: number | null;
  lastDep: number | null;
};

/**
 * Painel de check-in automático (LATAM) — agrupado por reserva.
 * Uma reserva com conexões vira um card único com todos os trechos.
 * O botão só habilita quando o ÚLTIMO trecho já entrou na janela de 48h,
 * porque só nesse momento a LATAM disponibiliza todos os cartões juntos.
 */
export function CheckinPanel({ orderId, flightItems }: CheckinPanelProps) {
  const qc = useQueryClient();
  const list = useServerFn(listCheckins);
  const runGroup = useServerFn(runCheckinGroup);
  const resend = useServerFn(resendBoardingPass);
  const regen = useServerFn(regenerateBoardingPass);

  const { data: checkins = [] } = useQuery({
    queryKey: ["flight-checkins", orderId],
    queryFn: () => list({ data: { orderId } }),
  });

  const runMut = useMutation({
    mutationFn: async (args: { orderItemIds: string[]; regenCheckinIds?: string[] }) => {
      for (const id of args.regenCheckinIds ?? []) {
        await regen({ data: { checkinId: id } });
      }
      return runGroup({ data: { orderItemIds: args.orderItemIds } });
    },
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["flight-checkins", orderId] });
      if (!result.ok) {
        toast.error(result.error || "Falha no check-in");
        return;
      }
      const okCount = (result.results ?? []).filter((r: any) => r.ok).length;
      const total = (result.results ?? []).length;
      toast.success(`Check-in concluído (${okCount}/${total} cartões).`);
    },
    onError: (e: any) => toast.error(`Falha no check-in: ${e?.message ?? "erro"}`),
  });

  const resendMut = useMutation({
    mutationFn: (checkinId: string) => resend({ data: { checkinId } }),
    onSuccess: (res) => {
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
        return;
      }
      toast.success(
        `Cartão enviado (${r.delivered}/${r.attempted + r.skippedNoPhone.length})${r.usedOrderFallback ? " · usou telefone do pedido" : ""}`,
      );
    },
    onError: (e: any) => toast.error(`Falha ao enviar: ${e?.message ?? "erro"}`),
  });

  // Agrupa voos LATAM da mesma reserva (mesmo supplier_locator). Segmentos
  // sem locator caem em grupos individuais (fallback pelo próprio id).
  const groups = useMemo<ReservationGroup[]>(() => {
    const now = Date.now();
    const WINDOW_MS = 48 * 60 * 60 * 1000;

    const latamItems = flightItems.filter(
      (it) => detectAirline({ airline: it.details?.airline, flight_number: it.details?.flight_number }) === "LATAM",
    );

    const bucket = new Map<string, Segment[]>();
    for (const it of latamItems) {
      const ci = (checkins as any[]).find((c) => c.order_item_id === it.id) ?? null;
      const key = (it.supplier_locator || "").trim().toUpperCase() || `__solo:${it.id}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push({ item: it, checkin: ci });
    }

    const result: ReservationGroup[] = [];
    for (const [key, segsAll] of bucket) {
      segsAll.sort((a, b) => {
        const da = new Date(a.item.details?.depart_at ?? a.item.details?.departure_at || 0).getTime();
        const db = new Date(b.item.details?.depart_at ?? b.item.details?.departure_at || 0).getTime();
        return da - db;
      });

      // Dentro da reserva, oculta trechos que ainda não entraram no prazo de
      // check-in (48h) — a menos que já tenham um check-in iniciado/feito.
      const segs = segsAll.filter((s) => {
        if (s.checkin) return true;
        const dep = new Date(s.item.details?.depart_at ?? s.item.details?.departure_at || 0).getTime();
        if (!Number.isFinite(dep) || dep <= 0) return false;
        return dep - now <= WINDOW_MS && dep - now > -6 * 60 * 60 * 1000;
      });
      if (segs.length === 0) continue;

      const deps = segs
        .map((s) => new Date(s.item.details?.depart_at ?? s.item.details?.departure_at || 0).getTime())
        .filter((n) => Number.isFinite(n) && n > 0);
      const firstDep = deps.length ? Math.min(...deps) : null;
      const lastDep = deps.length ? Math.max(...deps) : null;

      const anyStarted = segs.some((s) => s.checkin);
      const withinWindow =
        lastDep != null && lastDep - now <= WINDOW_MS && lastDep - now > -6 * 60 * 60 * 1000;

      if (!anyStarted && !withinWindow) continue;

      result.push({
        key,
        locator: key.startsWith("__solo:") ? null : key,
        segments: segs,
        firstDep,
        lastDep,
      });
    }
    // Ordena por horário do primeiro trecho de cada reserva
    result.sort((a, b) => (a.firstDep ?? 0) - (b.firstDep ?? 0));
    return result;
  }, [flightItems, checkins]);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Check-in automático LATAM</h3>
        <Badge variant="outline" className="text-[10px]">Beta</Badge>
      </div>
      <div className="space-y-3">
        {groups.map((group) => {
          const now = Date.now();
          const WINDOW_MS = 48 * 60 * 60 * 1000;
          const lastDep = group.lastDep;
          const canRun = lastDep != null
            ? lastDep - now <= WINDOW_MS && lastDep - now > 0
            : false;
          const allSuccess = group.segments.every((s) => s.checkin?.status === "success");
          const anyRunning = group.segments.some((s) => s.checkin?.status === "running");
          const orderItemIds = group.segments.map((s) => s.item.id);
          const regenIds = group.segments
            .filter((s) => s.checkin?.status === "success")
            .map((s) => s.checkin.id as string);
          const isRunning = runMut.isPending &&
            JSON.stringify(runMut.variables?.orderItemIds ?? []) === JSON.stringify(orderItemIds);

          return (
            <div key={group.key} className="rounded-lg border border-border/50 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    Reserva {group.locator ?? "—"}
                    {group.segments.length > 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        · {group.segments.length} trechos
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lastDep
                      ? `Último trecho: ${new Date(lastDep).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                      : "Sem horário"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {allSuccess && group.segments.some((s) => s.checkin?.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resendMut.isPending}
                      onClick={() => {
                        // Reenvia o cartão do primeiro trecho — a entrega já
                        // agrupa todos os PDFs no WhatsApp do passageiro.
                        const firstCi = group.segments.find((s) => s.checkin?.id)?.checkin?.id;
                        if (firstCi) resendMut.mutate(firstCi);
                      }}
                      title="Reenviar cartões pelo WhatsApp dos passageiros"
                    >
                      {resendMut.isPending
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <Send className="h-3.5 w-3.5 mr-1" />}
                      Enviar cartão
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={allSuccess ? "outline" : "default"}
                    disabled={isRunning || anyRunning || (!canRun && !allSuccess)}
                    onClick={() =>
                      runMut.mutate({
                        orderItemIds,
                        regenCheckinIds: allSuccess ? regenIds : undefined,
                      })
                    }
                    title={
                      !canRun && !allSuccess
                        ? "Disponível a partir de 48h antes do último trecho"
                        : ""
                    }
                  >
                    {isRunning
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    {allSuccess ? "Regerar cartões" : "Check-in"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                {group.segments.map(({ item, checkin }) => {
                  const depIso = item.details?.depart_at ?? item.details?.departure_at ?? null;
                  const dep = depIso ? new Date(depIso) : null;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-background/40 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {item.details?.flight_number ?? "Voo"} — {item.details?.from_iata}→{item.details?.to_iata}
                        </div>
                        <div className="text-muted-foreground">
                          {dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={checkin?.status} />
                        {checkin?.id && (checkin?.boarding_pass_url || checkin?.boarding_pass_path) && (
                          <a href={`/api/public/doc/${checkin.id}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" className="h-7">
                              <Download className="h-3.5 w-3.5 mr-1" />PDF
                            </Button>
                          </a>
                        )}
                        {checkin?.id && checkin?.status === "success" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={resendMut.isPending}
                            onClick={() => resendMut.mutate(checkin.id)}
                            title="Reenviar este cartão pelo WhatsApp"
                          >
                            {resendMut.isPending
                              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              : <Send className="h-3.5 w-3.5 mr-1" />}
                            Enviar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        O robô roda automaticamente entre 48h e 1h antes do último trecho e envia todos os cartões da reserva por WhatsApp. Contato de emergência é sempre recusado.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
  if (status === "success") return <Badge className="bg-green-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Feito</Badge>;
  if (status === "running") return <Badge variant="secondary" className="text-[10px]"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Rodando</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}
