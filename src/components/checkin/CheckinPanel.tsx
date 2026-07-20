import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plane, CheckCircle2, XCircle, Clock, Download, Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import {
  listCheckins,
  runCheckinGroup,
  resendBoardingPass,
} from "@/lib/checkin/checkin.functions";


type FlightItem = {
  id: string;
  supplier_locator?: string | null;
  details?: {
    airline?: string | null;
    flight_number?: string | null;
    departure_at?: string | null;
    depart_at?: string | null;
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

  const { data: checkins = [] } = useQuery({
    queryKey: ["flight-checkins", orderId],
    queryFn: () => list({ data: { orderId } }),
  });

  const runMut = useMutation({
    mutationFn: async (args: { orderItemIds: string[] }) =>
      runGroup({ data: { orderItemIds: args.orderItemIds } }),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["flight-checkins", orderId] });
      if (!result.ok) {
        toast.error(result.error || "Falha no check-in");
        return;
      }
      const okCount = (result.results ?? []).filter((r: any) => r.ok).length;
      const total = (result.results ?? []).length;
      toast.success(`Check-in concluído — ${okCount}/${total} cartões.`);
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

  // Agrupa voos da mesma reserva (mesmo supplier_locator). Segmentos
  // sem locator caem em grupos individuais (fallback pelo próprio id).
  // Janela: 48h para doméstico (BR→BR) e 24h para internacional.
  const groups = useMemo<ReservationGroup[]>(() => {
    const now = Date.now();

    const bucket = new Map<string, Segment[]>();
    for (const it of flightItems) {
      const candidates = (checkins as any[]).filter((c) => c.order_item_id === it.id);
      const ci = candidates.sort((a, b) => checkinScore(b) - checkinScore(a))[0] ?? null;
      const key = (it.supplier_locator || "").trim().toUpperCase() || `__solo:${it.id}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push({ item: it, checkin: ci });
    }

    // Detecta se algum trecho é internacional (fora do Brasil) para escolher a janela.
    // Usa src/lib/iata-cities.json em runtime dinâmico só quando existir.
    const isBRIata = (iata?: string | null) => {
      if (!iata) return true; // sem info, assume doméstico
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const table = require("@/lib/iata-cities.json") as Record<string, { co?: string }>;
        const rec = table[iata.toUpperCase()];
        if (!rec?.co) return true;
        return rec.co.toLowerCase().startsWith("bras");
      } catch {
        return true;
      }
    };

    const result: ReservationGroup[] = [];
    for (const [key, segsAll] of bucket) {
      segsAll.sort((a, b) => {
        const da = new Date((a.item.details?.depart_at ?? a.item.details?.departure_at) || 0).getTime();
        const db = new Date((b.item.details?.depart_at ?? b.item.details?.departure_at) || 0).getTime();
        return da - db;
      });

      const isIntl = segsAll.some(
        (s) => !isBRIata(s.item.details?.from_iata) || !isBRIata(s.item.details?.to_iata),
      );
      const WINDOW_MS = (isIntl ? 24 : 48) * 60 * 60 * 1000;

      // Dentro da reserva, oculta trechos que ainda não entraram na janela — a
      // menos que já tenham um check-in iniciado/feito.
      const segs = segsAll.filter((s) => {
        if (s.checkin) return true;
        const dep = new Date((s.item.details?.depart_at ?? s.item.details?.departure_at) || 0).getTime();
        if (!Number.isFinite(dep) || dep <= 0) return false;
        return dep - now <= WINDOW_MS && dep - now > -6 * 60 * 60 * 1000;
      });
      if (segs.length === 0) continue;

      const deps = segs
        .map((s) => new Date((s.item.details?.depart_at ?? s.item.details?.departure_at) || 0).getTime())
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
        <h3 className="text-sm font-semibold">Check-in pendente</h3>
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
          const hasAttachedCard = group.segments.some((s) => hasBoardingPass(s.checkin));
          const anyRunning = group.segments.some((s) => s.checkin?.status === "running");
          const orderItemIds = group.segments.map((s) => s.item.id);
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
                  {!allSuccess && !hasAttachedCard && (
                    <button
                      type="button"
                      onClick={() => { window.location.href = "/admin/checkins"; }}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      title="Abrir a fila manual de check-in"
                    >
                      Anexar cartão
                    </button>
                  )}



                </div>
              </div>

              <div className="space-y-1">
                {buildJourneys(group.segments).map((journey, jIdx) => {
                  const first = journey[0];
                  const last = journey[journey.length - 1];
                  const depIso = first.item.details?.depart_at ?? first.item.details?.departure_at ?? null;
                  const dep = depIso ? new Date(depIso) : null;
                  const via = journey.length > 1
                    ? journey.slice(0, -1).map((s) => s.item.details?.to_iata).filter(Boolean).join(" · ")
                    : null;
                  const anchorCheckin = journey
                    .map((s) => s.checkin)
                    .filter(Boolean)
                    .sort((a, b) => checkinScore(b) - checkinScore(a))[0] ?? null;
                  const flightLabels = journey
                    .map((s) => s.item.details?.flight_number)
                    .filter(Boolean)
                    .join(" + ");
                  return (
                    <div
                      key={`${group.key}-j${jIdx}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-background/40 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {flightLabels || "Voo"} — {first.item.details?.from_iata}→{last.item.details?.to_iata}
                          {via && (
                            <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                              via {via} · {journey.length - 1} conexão{journey.length - 1 > 1 ? "es" : ""}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          {dep ? dep.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem horário"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={anchorCheckin?.status} />
                        {anchorCheckin?.mode && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-border text-muted-foreground"
                          >
                            <Bot className="h-3 w-3 mr-1" />Piloto
                          </Badge>
                        )}
                        {anchorCheckin?.id && hasBoardingPass(anchorCheckin) && (
                          <a href={`/api/public/bp/${anchorCheckin.id}`} download>
                            <Button size="sm" variant="outline" className="h-7">
                              <Download className="h-3.5 w-3.5 mr-1" />Baixar cartão
                            </Button>
                          </a>
                        )}
                        {anchorCheckin?.id && anchorCheckin?.status === "success" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={resendMut.isPending}
                            onClick={() => resendMut.mutate(anchorCheckin.id)}
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

function hasBoardingPass(checkin: any | null | undefined) {
  return Boolean(
    (Array.isArray(checkin?.boarding_passes) && checkin.boarding_passes.length > 0)
    || checkin?.boarding_pass_url
    || checkin?.boarding_pass_path,
  );
}

function checkinScore(checkin: any) {
  const passCount = Array.isArray(checkin?.boarding_passes) ? checkin.boarding_passes.length : 0;
  const consolidated = checkin?.passenger_id == null ? 1 : 0;
  const hasLegacyPass = checkin?.boarding_pass_url || checkin?.boarding_pass_path ? 1 : 0;
  return consolidated * 1_000_000 + passCount * 10_000 + hasLegacyPass * 1_000
    + new Date(checkin?.updated_at || 0).getTime() / 1e13;
}

const MAX_LAYOVER_MS = 12 * 60 * 60 * 1000;

/**
 * Agrupa segmentos em jornadas encadeadas por rota (destino do anterior =
 * origem do seguinte), com layover < 12h. Espelha a lógica de /admin/checkins
 * para que conexões apareçam como um único trecho (GRU→PTY→CUR = 1 linha).
 */
function buildJourneys(segments: Segment[]): Segment[][] {
  if (segments.length <= 1) return segments.length ? [segments] : [];
  const decorated = segments.map((s) => ({
    seg: s,
    origin: (s.item.details?.from_iata || "").toUpperCase(),
    destination: (s.item.details?.to_iata || "").toUpperCase(),
    dep: new Date(s.item.details?.depart_at ?? s.item.details?.departure_at ?? 0).getTime(),
  }));
  const remaining = [...decorated];
  const journeys: Segment[][] = [];
  while (remaining.length) {
    const remDest = new Set(remaining.map((s) => s.destination));
    let startIdx = remaining.findIndex((s) => !remDest.has(s.origin));
    if (startIdx === -1) startIdx = 0;
    const chain = [remaining.splice(startIdx, 1)[0]];
    while (true) {
      const prev = chain[chain.length - 1];
      const nextIdx = remaining.findIndex((s) => s.origin === prev.destination);
      if (nextIdx === -1) break;
      const cand = remaining[nextIdx];
      const gap = prev.dep && cand.dep ? cand.dep - prev.dep : 0;
      const shortLayover = !prev.dep || !cand.dep ? true : gap >= 0 && gap <= MAX_LAYOVER_MS * 2;
      const origins = new Set(chain.map((x) => x.origin));
      const revisits = origins.has(cand.destination);
      if (!shortLayover || revisits) break;
      chain.push(remaining.splice(nextIdx, 1)[0]);
    }
    journeys.push(chain.map((c) => c.seg));
  }
  return journeys;
}
