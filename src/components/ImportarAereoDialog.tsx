import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plane, Loader2, ExternalLink, CheckCircle2, AlertCircle, ChevronRight, Radio } from "lucide-react";
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

type Airline = "latam" | "gol" | "azul";

type Props = {
  orderId: string;
  onImported: () => void;
  trigger: React.ReactNode;
};

const AIRLINE_LABEL: Record<Airline, string> = { latam: "LATAM", gol: "GOL", azul: "AZUL" };

function buildAirlineUrl(airline: Airline, f: { locator: string; lastname: string; iata: string }): string {
  const loc = f.locator.trim().toUpperCase();
  const sob = f.lastname.trim();
  const iata = f.iata.trim().toUpperCase();
  if (airline === "latam") {
    return `https://www.latamairlines.com/br/pt/minhas-viagens/second-detail/?orderId=${encodeURIComponent(loc)}&lastName=${encodeURIComponent(sob)}`;
  }
  if (airline === "gol") {
    return `https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem?codigoReserva=${encodeURIComponent(loc)}&origem=${encodeURIComponent(iata)}&sobrenome=${encodeURIComponent(sob)}`;
  }
  return `https://www.voeazul.com.br/br/pt/home/minhas-viagens/confirmacao?pnr=${encodeURIComponent(loc)}&origin=${encodeURIComponent(iata)}`;
}

function sendTokenToExtension(airline: Airline | "any", token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const apiBase = window.location.origin;
    let done = false;
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { __viaair?: string; airline?: string } | null;
      if (!d || d.__viaair !== "set-token-ack") return;
      done = true;
      window.removeEventListener("message", onMsg);
      resolve(true);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ __viaair: "set-token", token, apiBase, airline }, window.location.origin);
    setTimeout(() => {
      if (!done) { window.removeEventListener("message", onMsg); resolve(false); }
    }, 800);
  });
}

export function ImportarAereoDialog({ orderId, onImported, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [airline, setAirline] = useState<Airline>("latam");
  const [locator, setLocator] = useState("");
  const [lastname, setLastname] = useState("");
  const [iata, setIata] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "waiting" | "review">("form");
  const [reservation, setReservation] = useState<ImportedReservation | null>(null);

  const createToken = useServerFn(createImportToken);
  const poll = useServerFn(getImportStaging);
  const consume = useServerFn(consumeImportStaging);
  const saveItem = useServerFn(upsertOrderItem);
  const savePax = useServerFn(upsertPassenger);

  const needsIata = airline === "gol" || airline === "azul";
  const needsLastname = airline === "latam" || airline === "gol";

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
          setPhase("form");
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
    setPhase("form");
    setLocator(""); setLastname(""); setIata("");
  }

  async function abrirPagina() {
    if (!locator || (needsLastname && !lastname) || (needsIata && !iata)) {
      toast.error("Preencha todos os campos.");
      return;
    }
    try {
      const { token: t } = await createToken({ data: { orderId, airlineHint: airline } });
      setToken(t);
      const ok = await sendTokenToExtension(airline, t);
      if (!ok) {
        toast.error("Extensão não detectada. Instale e recarregue a página.");
        return;
      }
      const url = buildAirlineUrl(airline, { locator, lastname, iata });
      window.open(url, "_blank", "noopener,noreferrer");
      setPhase("waiting");
    } catch (e) {
      toast.error("Erro: " + (e as Error).message);
    }
  }

  async function armAny() {
    try {
      const { token: t } = await createToken({ data: { orderId, airlineHint: "any" } });
      setToken(t);
      const ok = await sendTokenToExtension("any", t);
      if (!ok) {
        toast.error("Extensão não detectada. Instale/atualize e recarregue a página.");
        return;
      }
      toast.success("Pronto! Abra LATAM, GOL ou AZUL e clique em 📥 Importar pra Via Air.");
      setPhase("waiting");
    } catch (e) {
      toast.error("Erro: " + (e as Error).message);
    }
  }

  async function confirmar() {
    if (!reservation || !token) return;
    try {
      // 1) Salva passageiros (novos apenas)
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
      // 2) Salva blocos de voo — um order_item por segmento
      let sort = 0;
      for (const block of reservation.flights) {
        for (const seg of block.segments) {
          const title = `${seg.airline ?? block.airline ?? ""} ${seg.flight_number ?? ""} — ${seg.from_iata ?? ""}→${seg.to_iata ?? ""}`.trim();
          await saveItem({ data: {
            order_id: orderId,
            kind: "flight",
            status: "confirmed",
            title,
            supplier_locator: reservation.locator ?? null,
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
              cabin_class: seg.cabin_class,
              fare_class: seg.fare_class,
              aircraft: seg.aircraft,
              status: seg.status,
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
            <DialogTitle>Importar reserva aérea</DialogTitle>
          </DialogHeader>

          {phase === "form" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Escolha a companhia, preencha os dados, e a extensão vai puxar tudo da página oficial.
                Não tem a extensão?{" "}
                <a href="/admin/instalar-extensao" target="_blank" rel="noreferrer" className="text-primary underline">
                  Instalar agora
                </a>.
              </div>
              <div>
                <Label className="mb-2 block">Companhia</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["latam", "gol", "azul"] as Airline[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAirline(a)}
                      className={`rounded-md border p-3 text-sm font-medium transition ${
                        airline === a ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
                      }`}
                    >{AIRLINE_LABEL[a]}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Localizador (PNR / código da reserva)</Label>
                  <Input value={locator} onChange={(e) => setLocator(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={12} />
                </div>
                {needsLastname && (
                  <div>
                    <Label>Sobrenome do titular</Label>
                    <Input value={lastname} onChange={(e) => setLastname(e.target.value)} placeholder="Silva" />
                  </div>
                )}
                {needsIata && (
                  <div>
                    <Label>IATA de origem</Label>
                    <Input value={iata} onChange={(e) => setIata(e.target.value.toUpperCase())} placeholder="GRU" maxLength={3} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={abrirPagina} className="gap-2">
                  <ExternalLink className="h-4 w-4" /> Abrir página da cia
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "waiting" && (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="space-y-1">
                <div className="font-medium">Aguardando a extensão…</div>
                <div className="text-sm text-muted-foreground max-w-sm">
                  Na nova aba, resolva o captcha (se aparecer) e clique no botão
                  <span className="font-medium"> 📥 Importar pra Via Air </span>
                  no canto inferior direito.
                </div>
              </div>
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
      </div>

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
