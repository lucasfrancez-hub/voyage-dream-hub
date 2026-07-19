import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plane, CheckCircle2, XCircle, Clock, RefreshCw, Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listCheckins, runCheckin, detectAirline, resendBoardingPass, regenerateBoardingPass } from "@/lib/checkin/checkin.functions";

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

/**
 * Painel de check-in automático (LATAM).
 * Mostra status por voo e botão de check-in manual.
 */
export function CheckinPanel({ orderId, flightItems }: CheckinPanelProps) {
  const qc = useQueryClient();
  const list = useServerFn(listCheckins);
  const run = useServerFn(runCheckin);
  const resend = useServerFn(resendBoardingPass);
  const regen = useServerFn(regenerateBoardingPass);

  const { data: checkins = [] } = useQuery({
    queryKey: ["flight-checkins", orderId],
    queryFn: () => list({ data: { orderId } }),
  });

  const runMut = useMutation({
    mutationFn: async (args: { orderItemId: string; regenCheckinId?: string }) => {
      if (args.regenCheckinId) {
        await regen({ data: { checkinId: args.regenCheckinId } });
      }
      return run({ data: { orderItemId: args.orderItemId } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        qc.invalidateQueries({ queryKey: ["flight-checkins", orderId] });
        return;
      }
      toast.success("Check-in feito! Cartão de embarque enviado.");
      qc.invalidateQueries({ queryKey: ["flight-checkins", orderId] });
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

  // Só mostra voos LATAM
  const rows = useMemo(() => {
    return flightItems
      .filter((it) => detectAirline({ airline: it.details?.airline, flight_number: it.details?.flight_number }) === "LATAM")
      .map((it) => {
        const ci = (checkins as any[]).find((c) => c.order_item_id === it.id);
        return { item: it, checkin: ci };
      });
  }, [flightItems, checkins]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Check-in automático LATAM</h3>
        <Badge variant="outline" className="text-[10px]">Beta</Badge>
      </div>
      <div className="space-y-2">
        {rows.map(({ item, checkin }) => {
          const dep = item.details?.departure_at ? new Date(item.details.departure_at) : null;
          const canRun = dep ? dep.getTime() - Date.now() < 48 * 60 * 60 * 1000 && dep.getTime() > Date.now() : true;
          const isRunning = runMut.isPending && runMut.variables?.orderItemId === item.id;
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {item.details?.flight_number ?? "Voo"} — {item.details?.from_iata}→{item.details?.to_iata}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"} · Loc: {item.supplier_locator || "—"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={checkin?.status} />
                {checkin?.boarding_pass_url && (
                  <a href={checkin.boarding_pass_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" />PDF</Button>
                  </a>
                )}
                {checkin?.status === "success" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resendMut.isPending && resendMut.variables === checkin.id}
                    onClick={() => resendMut.mutate(checkin.id)}
                    title="Reenviar cartão pelo WhatsApp dos passageiros"
                  >
                    {resendMut.isPending && resendMut.variables === checkin.id
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <Send className="h-3.5 w-3.5 mr-1" />}
                    Enviar cartão
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={checkin?.status === "success" ? "outline" : "default"}
                  disabled={isRunning || !canRun}
                  onClick={() => runMut.mutate(item.id)}
                  title={!canRun ? "Disponível a partir de 48h antes do voo" : ""}
                >
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  {checkin?.status === "success" ? "Refazer" : "Check-in"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        O robô roda automaticamente entre 48h e 1h antes do voo e envia o cartão de embarque por WhatsApp e e-mail. Contato de emergência é sempre recusado.
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
