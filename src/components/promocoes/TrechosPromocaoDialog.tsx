/**
 * Edição dos VOOS (trechos) de uma promoção já salva.
 * As promoções vindas do motor chegam sem horário, nº do voo e duração — o
 * orçamento público acabava mostrando esses campos zerados. Aqui o consultor
 * completa/corrige os trechos e o link é regerado com os dados certos.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plane } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AIRLINES } from "@/lib/airlines";
import { salvarTrechosPromocao, carregarPromocaoAereaManual } from "@/lib/airfare-promos.functions";

export type PromoTrechos = {
  id: string;
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
  airline_iata: string | null;
  inbound_airline_iata?: string | null;
  stops: number | null;
  has_checked_baggage: boolean | null;
};

type LegState = {
  date: string;
  fromIata: string;
  toIata: string;
  airlineIata: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: string;
  checkedBaggage: boolean;
};

const campo =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

function LegForm({
  titulo,
  leg,
  onChange,
}: {
  titulo: string;
  leg: LegState;
  onChange: (l: LegState) => void;
}) {
  const set = (patch: Partial<LegState>) => onChange({ ...leg, ...patch });
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
        <Plane className="h-3.5 w-3.5 text-brand-orange" /> {titulo}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={campo}
          placeholder="Origem (IATA)"
          maxLength={3}
          value={leg.fromIata}
          onChange={(e) => set({ fromIata: e.target.value.toUpperCase() })}
        />
        <input
          className={campo}
          placeholder="Destino (IATA)"
          maxLength={3}
          value={leg.toIata}
          onChange={(e) => set({ toIata: e.target.value.toUpperCase() })}
        />
        <input className={campo} type="date" value={leg.date} onChange={(e) => set({ date: e.target.value })} />
        <select className={campo} value={leg.airlineIata} onChange={(e) => set({ airlineIata: e.target.value })}>
          <option value="">Companhia aérea</option>
          {AIRLINES.map((a) => (
            <option key={a.iata} value={a.iata}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          className={campo}
          placeholder="Nº do voo (ex.: LA3210)"
          value={leg.flightNumber}
          onChange={(e) => set({ flightNumber: e.target.value.toUpperCase() })}
        />
        <input
          className={campo}
          placeholder="Duração (ex.: 2h10)"
          value={leg.duration}
          onChange={(e) => set({ duration: e.target.value })}
        />
        <input
          className={campo}
          type="time"
          title="Horário de partida"
          value={leg.departureTime}
          onChange={(e) => set({ departureTime: e.target.value })}
        />
        <input
          className={campo}
          type="time"
          title="Horário de chegada"
          value={leg.arrivalTime}
          onChange={(e) => set({ arrivalTime: e.target.value })}
        />
        <select className={campo} value={leg.stops} onChange={(e) => set({ stops: e.target.value })}>
          <option value="0">Direto</option>
          <option value="1">1 conexão</option>
          <option value="2">2 conexões</option>
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={leg.checkedBaggage}
            onChange={(e) => set({ checkedBaggage: e.target.checked })}
          />
          Bagagem despachada
        </label>
      </div>
    </div>
  );
}

export function TrechosPromocaoDialog({
  promo,
  onClose,
  onSaved,
}: {
  promo: PromoTrechos | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const salvar = useServerFn(salvarTrechosPromocao);
  const carregar = useServerFn(carregarPromocaoAereaManual);
  const [ida, setIda] = useState<LegState | null>(null);
  const [volta, setVolta] = useState<LegState | null>(null);
  const [temVolta, setTemVolta] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!promo) return;
    let cancelado = false;
    const base = (dir: "OUTBOUND" | "INBOUND"): LegState => ({
      date: (dir === "OUTBOUND" ? promo.departure_date : promo.return_date) ?? "",
      fromIata: dir === "OUTBOUND" ? promo.origin_iata : promo.destination_iata,
      toIata: dir === "OUTBOUND" ? promo.destination_iata : promo.origin_iata,
      airlineIata:
        (dir === "OUTBOUND" ? promo.airline_iata : promo.inbound_airline_iata ?? promo.airline_iata) ?? "",
      flightNumber: "",
      departureTime: "",
      arrivalTime: "",
      duration: "",
      stops: String(Math.max(0, Number(promo.stops) || 0)),
      checkedBaggage: !!promo.has_checked_baggage,
    });
    setIda(base("OUTBOUND"));
    setVolta(base("INBOUND"));
    setTemVolta(!!promo.return_date);
    setCarregando(true);
    void carregar({ data: { id: promo.id } })
      .then((row) => {
        if (cancelado) return;
        const legs = ((row as { raw?: { manual?: { legs?: unknown[] } } })?.raw?.manual?.legs ?? []) as Array<
          Record<string, unknown>
        >;
        const toState = (l: Record<string, unknown>, dir: "OUTBOUND" | "INBOUND"): LegState => ({
          ...base(dir),
          date: String(l.date ?? base(dir).date),
          fromIata: String(l.fromIata ?? base(dir).fromIata),
          toIata: String(l.toIata ?? base(dir).toIata),
          airlineIata: String(l.airlineIata ?? base(dir).airlineIata),
          flightNumber: String(l.flightNumber ?? ""),
          departureTime: String(l.departureTime ?? ""),
          arrivalTime: String(l.arrivalTime ?? ""),
          duration: String(l.duration ?? ""),
          stops: String(Number(l.stops ?? base(dir).stops) || 0),
          checkedBaggage: !!l.checkedBaggage,
        });
        const o = legs.find((l) => l.direction === "OUTBOUND");
        const i = legs.find((l) => l.direction === "INBOUND");
        if (o) setIda(toState(o, "OUTBOUND"));
        if (i) {
          setVolta(toState(i, "INBOUND"));
          setTemVolta(true);
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo?.id]);

  const payload = (l: LegState, direction: "OUTBOUND" | "INBOUND") => ({
    direction,
    date: l.date,
    fromIata: l.fromIata,
    toIata: l.toIata,
    airlineIata: l.airlineIata,
    flightNumber: l.flightNumber || null,
    departureTime: l.departureTime || null,
    arrivalTime: l.arrivalTime || null,
    duration: l.duration || null,
    stops: Number(l.stops) || 0,
    checkedBaggage: l.checkedBaggage,
  });

  const mut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          id: promo!.id,
          legs: [
            payload(ida!, "OUTBOUND"),
            ...(temVolta && volta ? [payload(volta, "INBOUND")] : []),
          ],
        },
      }),
    onSuccess: () => {
      toast.success("Trechos atualizados", {
        description: "O link da oferta será regerado com os voos corrigidos.",
      });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const legValida = (l: LegState | null) =>
    !!l && l.fromIata.length === 3 && l.toIata.length === 3 && !!l.date && !!l.airlineIata;
  const valido = legValida(ida) && (!temVolta || legValida(volta));

  return (
    <Dialog open={!!promo} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Editar trechos da promoção</DialogTitle>
        </DialogHeader>
        {carregando && !ida ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Carregando voos…</p>
        ) : ida ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Complete horários, nº do voo e duração. Sem esses dados o orçamento público mostra os trechos
              zerados. O preço não muda aqui.
            </p>
            <LegForm titulo="Voo de ida" leg={ida} onChange={setIda} />
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={temVolta} onChange={(e) => setTemVolta(e.target.checked)} />
              Tem voo de volta
            </label>
            {temVolta && volta ? <LegForm titulo="Voo de volta" leg={volta} onChange={setVolta} /> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border/60 px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!valido || mut.isPending}
                onClick={() => mut.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar trechos
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
