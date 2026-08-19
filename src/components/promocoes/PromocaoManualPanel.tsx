/**
 * PROMOÇÃO AÉREA MANUAL — o administrador digita os voos e os valores, igual
 * ao cadastro de um aéreo dentro do pedido. Nada é cotado no motor VIA AIR.
 * O link gerado depois é o NOSSO checkout (orçamento público), já com o
 * parcelamento da companhia aérea e o markup do financeiro.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PlusCircle, X, Loader2, Plane } from "lucide-react";
import { AIRLINES } from "@/lib/airlines";
import { salvarPromocaoAereaManual } from "@/lib/airfare-promos.functions";

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

const legVazia = (): LegState => ({
  date: "",
  fromIata: "",
  toIata: "",
  airlineIata: "",
  flightNumber: "",
  departureTime: "",
  arrivalTime: "",
  duration: "",
  stops: "0",
  checkedBaggage: true,
});

const campo =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

function num(v: string): number {
  return Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        <select
          className={campo}
          value={leg.airlineIata}
          onChange={(e) => set({ airlineIata: e.target.value })}
        >
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
        <input
          className={campo}
          placeholder="Duração (ex.: 2h10)"
          value={leg.duration}
          onChange={(e) => set({ duration: e.target.value })}
        />
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

export function PromocaoManualPanel({
  aberto,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const salvar = useServerFn(salvarPromocaoAereaManual);
  const [ida, setIda] = useState<LegState>(legVazia());
  const [volta, setVolta] = useState<LegState>(legVazia());
  const [temVolta, setTemVolta] = useState(true);
  const [adultos, setAdultos] = useState("1");
  const [tarifa, setTarifa] = useState("");
  const [taxas, setTaxas] = useState("");
  const [classe, setClasse] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");

  const total = num(tarifa) + num(taxas);
  const pax = Math.max(1, Number(adultos) || 1);

  const legValida = (l: LegState) =>
    l.fromIata.length === 3 && l.toIata.length === 3 && !!l.date && !!l.airlineIata;
  const valido = legValida(ida) && (!temVolta || legValida(volta)) && total > 0;

  const mut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          adults: pax,
          farePrice: num(tarifa),
          taxes: num(taxas),
          cabinClass: classe.trim() || null,
          originCity: originCity.trim() || null,
          destinationCity: destinationCity.trim() || null,
          legs: [
            { direction: "OUTBOUND" as const, ...toPayload(ida) },
            ...(temVolta ? [{ direction: "INBOUND" as const, ...toPayload(volta) }] : []),
          ],
        },
      }),
    onSuccess: (r) => {
      const res = r as { totalPrice: number };
      toast.success("Promoção manual salva na curadoria", {
        description: `Total ${brl(res.totalPrice)} • o link será gerado no nosso checkout.`,
      });
      setTarifa("");
      setTaxas("");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!aberto) return null;

  return (
    <div className="mt-3 rounded-2xl border border-brand-orange/40 bg-card/60">
      <div className="flex w-full items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest">
        <PlusCircle className="h-4 w-4 text-brand-orange" /> Cadastrar promoção manualmente
        <button type="button" onClick={onFechar} className="ml-auto rounded-lg p-1 hover:bg-foreground/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3 border-t border-border/50 p-4">
        <p className="text-[11px] text-muted-foreground">
          Você digita os voos e os valores — nada é cotado no motor. O link de venda é gerado no{" "}
          <strong className="text-foreground">nosso checkout</strong>, já com o parcelamento da companhia
          aérea e o markup do financeiro.
        </p>

        <LegForm titulo="Voo de ida" leg={ida} onChange={setIda} />

        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={temVolta} onChange={(e) => setTemVolta(e.target.checked)} />
          Tem voo de volta
        </label>

        {temVolta ? <LegForm titulo="Voo de volta" leg={volta} onChange={setVolta} /> : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className={campo}
            inputMode="numeric"
            placeholder="Passageiros"
            value={adultos}
            onChange={(e) => setAdultos(e.target.value.replace(/\D/g, "").slice(0, 1))}
          />
          <input
            className={campo}
            inputMode="decimal"
            placeholder="Tarifa total (R$)"
            value={tarifa}
            onChange={(e) => setTarifa(e.target.value)}
          />
          <input
            className={campo}
            inputMode="decimal"
            placeholder="Taxas totais (R$)"
            value={taxas}
            onChange={(e) => setTaxas(e.target.value)}
          />
          <input
            className={campo}
            placeholder="Classe (opcional)"
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
          />
          <input
            className={campo}
            placeholder="Cidade de origem (opcional)"
            value={originCity}
            onChange={(e) => setOriginCity(e.target.value)}
          />
          <input
            className={campo}
            placeholder="Cidade de destino (opcional)"
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Total: <strong className="text-foreground">{brl(total)}</strong> • por passageiro{" "}
            <strong className="text-foreground">{brl(total / pax)}</strong>
          </p>
          <button
            type="button"
            disabled={!valido || mut.isPending}
            onClick={() => mut.mutate()}
            className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {mut.isPending ? "Salvando..." : "Salvar promoção"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toPayload(l: LegState) {
  return {
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
  };
}
