import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, AlertCircle, ChevronRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  createImportToken, getImportStaging, consumeImportStaging,
  type ImportedReservation, type ImportedFlightSegment, type ImportedPassenger,
} from "@/lib/flight-import.functions";
import { upsertOrderItem, upsertPassenger } from "@/lib/orders.functions";
import { buildAirlineCheckinUrl } from "@/lib/airline-checkin";

type Props = {
  orderId: string;
  onImported: () => void;
  trigger: React.ReactNode;
};

/** Detecta a extensão via ping repetido — bridge responde com "ready". */
function detectExtension(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    function finish(v: boolean) {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      resolve(v);
    }
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { __viaair?: string } | null;
      if (!d) return;
      if (d.__viaair === "ready" || d.__viaair === "set-token-ack") finish(true);
    }
    window.addEventListener("message", onMsg);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (done) { clearInterval(iv); return; }
      if (Date.now() - t0 > timeoutMs) { clearInterval(iv); finish(false); return; }
      try { window.postMessage({ __viaair: "ping" }, window.location.origin); } catch {}
    }, 120);
  });
}

function sendTokenToExtension(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const apiBase = window.location.origin;
    let done = false;
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { __viaair?: string } | null;
      if (!d || d.__viaair !== "set-token-ack") return;
      done = true;
      window.removeEventListener("message", onMsg);
      resolve(true);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ __viaair: "set-token", token, apiBase, airline: "any" }, window.location.origin);
    setTimeout(() => {
      if (!done) { window.removeEventListener("message", onMsg); resolve(false); }
    }, 1500);
  });
}

export function ImportarAereoDialog({ orderId, onImported, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "arming" | "waiting" | "review">("idle");
  const [extPresent, setExtPresent] = useState<boolean | null>(null);
  const [reservation, setReservation] = useState<ImportedReservation | null>(null);
  const readyListenerRef = useRef<((ev: MessageEvent) => void) | null>(null);

  const createToken = useServerFn(createImportToken);
  const poll = useServerFn(getImportStaging);
  const consume = useServerFn(consumeImportStaging);
  const saveItem = useServerFn(upsertOrderItem);
  const savePax = useServerFn(upsertPassenger);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setExtPresent(null);
    detectExtension(1500).then((ok) => { if (!cancelled) setExtPresent(ok); });
    const onReady = (ev: MessageEvent) => {
      const d = ev.data as { __viaair?: string } | null;
      if (d?.__viaair === "ready") setExtPresent(true);
    };
    window.addEventListener("message", onReady);
    readyListenerRef.current = onReady;
    return () => {
      cancelled = true;
      if (readyListenerRef.current) window.removeEventListener("message", readyListenerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (phase !== "waiting" || !token) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const row = await poll({ data: { token } });
        if (cancelled || !row) return;
        if (row.status === "ready" && row.parsed) {
          clearInterval(iv);
          setReservation(row.parsed);
          setPhase("review");
        } else if (row.status === "error") {
          clearInterval(iv);
          toast.error("Falha ao importar: " + (row.error ?? "erro desconhecido"));
          setPhase("idle");
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [phase, token, poll]);

  function reset() {
    setToken(null);
    setReservation(null);
    setPhase("idle");
  }

  async function armAny() {
    setPhase("arming");
    try {
      let present = extPresent;
      if (!present) {
        present = await detectExtension(2000);
        setExtPresent(present);
      }
      if (!present) {
        toast.error("Extensão não detectada. Instale/atualize a extensão e recarregue esta página.");
        setPhase("idle");
        return;
      }
      const { token: t } = await createToken({ data: { orderId, airlineHint: "any" } });
      setToken(t);
      const ok = await sendTokenToExtension(t);
      if (!ok) {
        toast.error("A extensão não confirmou o token. Recarregue esta página e tente de novo.");
        setPhase("idle");
        return;
      }
      toast.success("Pronto! Abra a página da reserva e clique em 📤 Exportar para Via Air.");
      setPhase("waiting");
    } catch (e) {
      toast.error("Erro: " + (e as Error).message);
      setPhase("idle");
    }
  }

  async function confirmar() {
    if (!reservation || !token) return;
    try {
      for (let i = 0; i < reservation.passengers.length; i++) {
        const p = reservation.passengers[i]!;
        const kindMap: Record<string, "ADT" | "CHD" | "INF"> = { adult: "ADT", child: "CHD", infant: "INF" };
        await savePax({ data: {
          order_id: orderId,
          full_name: p.full_name,
          passenger_type: kindMap[p.kind ?? "adult"] ?? "ADT",
          ticket_number: p.ticket_number ?? null,
          sort_order: i,
        } });
      }
      let sort = 0;
      let firstItem = true;
      // Se qualquer passageiro veio com bilhete emitido, a reserva inteira
      // é considerada Emitida (confirmed). Sem bilhete, fica Reservada.
      const anyTicket = reservation.passengers.some((p) => (p.ticket_number ?? "").trim().length > 0);
      const firstTicket = reservation.passengers.find((p) => (p.ticket_number ?? "").trim())?.ticket_number ?? null;
      const itemStatus: "confirmed" | "reserved" = anyTicket ? "confirmed" : "reserved";
      for (const block of reservation.flights) {
        for (const seg of block.segments) {
          const title = `${seg.airline ?? block.airline ?? ""} ${seg.flight_number ?? ""} — ${seg.from_iata ?? ""}→${seg.to_iata ?? ""}`.trim();
          const pricing = firstItem ? {
            currency: reservation.currency,
            total_fare: reservation.total_fare,
            base_fare: reservation.base_fare,
            taxes: reservation.taxes,
            fees: reservation.fees,
            issued_at: reservation.issued_at,
            order_number: reservation.order_number,
          } : undefined;
          firstItem = false;
          await saveItem({ data: {
            order_id: orderId,
            kind: "flight",
            status: itemStatus,
            title,
            supplier_locator: reservation.locator ?? seg.carrier_locator ?? null,
            sort_order: sort++,
            details: {
              direction: block.direction,
              airline: seg.airline ?? block.airline,
              airline_iata: seg.airline_iata,
              flight_number: seg.flight_number,
              from_iata: seg.from_iata,
              from_city: seg.from_city,
              from_airport: seg.from_airport,
              from_terminal: seg.from_terminal,
              to_iata: seg.to_iata,
              to_city: seg.to_city,
              to_airport: seg.to_airport,
              to_terminal: seg.to_terminal,
              depart_at: seg.depart_at,
              arrive_at: seg.arrive_at,
              duration: seg.duration,
              layover: seg.layover,
              layover_airport: seg.layover_airport,
              operating_airline_iata: seg.operating_airline_iata,
              cabin_class: seg.cabin_class,
              fare_class: seg.fare_class,
              fare_basis: seg.fare_basis,
              baggage_allowance: seg.baggage_allowance,
              carrier_locator: seg.carrier_locator,
              aircraft: seg.aircraft,
              status: seg.status,
              ...(firstTicket ? { ticket_number: firstTicket } : {}),
              ...(pricing ? { pricing_summary: pricing } : {}),
            },
          } });
        }
      }
      await consume({ data: { token } });
      toast.success("Reserva importada!");
      setOpen(false);
      reset();
      onImported();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    }
  }

  return (
    <>
      <span onClick={() => { reset(); setOpen(true); }}>{trigger}</span>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar aéreo</DialogTitle>
          </DialogHeader>

          {(phase === "idle" || phase === "arming") && (
            <div className="space-y-4">
              <div className={`rounded-md border p-3 text-xs flex items-start gap-2 ${
                extPresent === false ? "border-destructive/40 bg-destructive/5 text-destructive"
                : extPresent === true ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-border text-muted-foreground"
              }`}>
                {extPresent === true ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  : extPresent === false ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  : <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />}
                <div>
                  {extPresent === true && "Extensão detectada — pronto pra importar."}
                  {extPresent === false && (
                    <>
                      Extensão não detectada.{" "}
                      <a href="/admin/instalar-extensao" target="_blank" rel="noreferrer" className="underline">
                        Instalar / atualizar
                      </a>{" "}
                      e depois recarregue esta página (Ctrl/Cmd + R).
                    </>
                  )}
                  {extPresent === null && "Detectando extensão…"}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={armAny} disabled={phase === "arming"} className="gap-2">
                  {phase === "arming" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                  Aguardar importação
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "waiting" && (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="font-medium">Aguardando importação…</div>
              <Button variant="ghost" size="sm" onClick={reset}>Cancelar</Button>
            </div>
          )}


          {phase === "review" && reservation && (
            <ReviewReservation
              reservation={reservation}
              onChange={setReservation}
              onCancel={reset}
              onConfirm={confirmar}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewReservation({
  reservation, onChange, onCancel, onConfirm,
}: {
  reservation: ImportedReservation;
  onChange: (r: ImportedReservation) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const totalSegs = useMemo(
    () => reservation.flights.reduce((n, b) => n + b.segments.length, 0),
    [reservation],
  );

  function patchPax(i: number, patch: Partial<ImportedPassenger>) {
    const passengers = reservation.passengers.map((p, idx) => idx === i ? { ...p, ...patch } : p);
    onChange({ ...reservation, passengers });
  }
  function removePax(i: number) {
    onChange({ ...reservation, passengers: reservation.passengers.filter((_, idx) => idx !== i) });
  }
  function patchSeg(bi: number, si: number, patch: Partial<ImportedFlightSegment>) {
    const flights = reservation.flights.map((b, x) => x !== bi ? b : {
      ...b, segments: b.segments.map((s, y) => y === si ? { ...s, ...patch } : s),
    });
    onChange({ ...reservation, flights });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
        <div className="text-sm text-emerald-800">
          Dados importados. Confira antes de salvar. Você pode editar qualquer campo.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <Label>Localizador</Label>
          <Input value={reservation.locator ?? ""} onChange={(e) => onChange({ ...reservation, locator: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <Label>Companhia</Label>
          <Input value={reservation.supplier_name ?? ""} onChange={(e) => onChange({ ...reservation, supplier_name: e.target.value })} />
        </div>
        <div>
          <Label>Nº pedido consolidador</Label>
          <Input value={reservation.order_number ?? ""} onChange={(e) => onChange({ ...reservation, order_number: e.target.value })} />
        </div>
        <div>
          <Label>Emissão</Label>
          <Input type="date" value={reservation.issued_at ?? ""} onChange={(e) => onChange({ ...reservation, issued_at: e.target.value })} />
        </div>
      </div>

      {(reservation.total_fare != null || reservation.base_fare != null || reservation.taxes != null) && (
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Valores {reservation.currency ? `(${reservation.currency})` : ""}
          </div>
          <div className="grid grid-cols-4 gap-2 text-sm">
            <div>
              <Label className="text-xs">Tarifa</Label>
              <Input type="number" step="0.01" value={reservation.base_fare ?? ""} onChange={(e) => onChange({ ...reservation, base_fare: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Taxas</Label>
              <Input type="number" step="0.01" value={reservation.taxes ?? ""} onChange={(e) => onChange({ ...reservation, taxes: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Fees</Label>
              <Input type="number" step="0.01" value={reservation.fees ?? ""} onChange={(e) => onChange({ ...reservation, fees: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Total</Label>
              <Input type="number" step="0.01" value={reservation.total_fare ?? ""} onChange={(e) => onChange({ ...reservation, total_fare: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-sm font-semibold mb-2">Passageiros ({reservation.passengers.length})</div>
        <div className="space-y-2">
          {reservation.passengers.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Nenhum passageiro identificado — adicione manualmente depois no pedido.
            </div>
          )}
          {reservation.passengers.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_140px_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Nome completo</Label>
                <Input value={p.full_name} onChange={(e) => patchPax(i, { full_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Bilhete</Label>
                <Input value={p.ticket_number ?? ""} onChange={(e) => patchPax(i, { ticket_number: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Assento</Label>
                <Input value={p.seat ?? ""} onChange={(e) => patchPax(i, { seat: e.target.value })} />
              </div>
              <Button variant="ghost" size="sm" onClick={() => removePax(i)}>Remover</Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Voos ({totalSegs} trecho{totalSegs === 1 ? "" : "s"})</div>
        <div className="space-y-4">
          {reservation.flights.map((block, bi) => (
            <div key={bi} className="rounded-lg border border-border p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {block.direction === "outbound" ? "Ida" : "Volta"}
              </div>
              {block.segments.map((seg, si) => (
                <div key={si} className="grid grid-cols-2 md:grid-cols-4 gap-2 py-2 border-t first:border-t-0 border-border/60">
                  <div>
                    <Label className="text-xs">Cia</Label>
                    <Input value={seg.airline ?? ""} onChange={(e) => patchSeg(bi, si, { airline: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Voo</Label>
                    <Input value={seg.flight_number ?? ""} onChange={(e) => patchSeg(bi, si, { flight_number: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Origem</Label>
                    <Input value={seg.from_iata ?? ""} onChange={(e) => patchSeg(bi, si, { from_iata: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <Label className="text-xs">Destino</Label>
                    <Input value={seg.to_iata ?? ""} onChange={(e) => patchSeg(bi, si, { to_iata: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <Label className="text-xs">Partida</Label>
                    <Input type="datetime-local" value={(seg.depart_at ?? "").slice(0, 16)} onChange={(e) => patchSeg(bi, si, { depart_at: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Chegada</Label>
                    <Input type="datetime-local" value={(seg.arrive_at ?? "").slice(0, 16)} onChange={(e) => patchSeg(bi, si, { arrive_at: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Duração</Label>
                    <Input value={seg.duration ?? ""} onChange={(e) => patchSeg(bi, si, { duration: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Bagagem</Label>
                    <Input value={seg.baggage_allowance ?? ""} onChange={(e) => patchSeg(bi, si, { baggage_allowance: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Loc. da cia</Label>
                    <Input value={seg.carrier_locator ?? ""} onChange={(e) => patchSeg(bi, si, { carrier_locator: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <Label className="text-xs">Classe</Label>
                    <Input value={seg.cabin_class ?? ""} onChange={(e) => patchSeg(bi, si, { cabin_class: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          ))}
          {reservation.flights.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Nenhum voo identificado. Cancele e tente de novo (a página talvez não tenha carregado).
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onConfirm} className="gap-2">
          Confirmar e salvar <ChevronRight className="h-4 w-4" />
        </Button>
      </DialogFooter>
    </div>
  );
}
