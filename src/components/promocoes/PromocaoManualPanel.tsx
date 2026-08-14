/**
 * PROMOÇÃO MANUAL — o administrador digita a rota e a data; o motor VIA AIR
 * cota na hora e a promoção entra na curadoria do dia como qualquer outra.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PlusCircle, X, Loader2 } from "lucide-react";
import { salvarOportunidadePassagensBaratas } from "@/lib/airfare-promos.functions";

export function PromocaoManualPanel({
  aberto,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const salvar = useServerFn(salvarOportunidadePassagensBaratas);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [referencia, setReferencia] = useState("");

  const valido = origin.trim().length === 3 && destination.trim().length === 3 && !!ida;

  const mut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          origin: origin.trim().toUpperCase(),
          destination: destination.trim().toUpperCase(),
          departureDate: ida,
          returnDate: volta || null,
          referencePrice: referencia ? Number(referencia.replace(",", ".")) : null,
          originCity: originCity.trim() || null,
          destinationCity: destinationCity.trim() || null,
        },
      }),
    onSuccess: (r) => {
      if (!r || (r as { ok?: boolean }).ok === false) {
        toast.error("O motor VIA AIR não encontrou tarifa para essa rota/data.");
        return;
      }
      const res = r as { created: boolean; totalPrice: number };
      toast.success(res.created ? "Promoção criada na curadoria" : "Promoção atualizada", {
        description: `Valor confirmado pelo motor: ${res.totalPrice.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}`,
      });
      setReferencia("");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!aberto) return null;

  const campo =
    "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

  return (
    <div className="mt-3 rounded-2xl border border-brand-orange/40 bg-card/60">
      <div className="flex w-full items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest">
        <PlusCircle className="h-4 w-4 text-brand-orange" /> Adicionar promoção manualmente
        <button type="button" onClick={onFechar} className="ml-auto rounded-lg p-1 hover:bg-foreground/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-t border-border/50 p-4">
        <p className="mb-3 text-[11px] text-muted-foreground">
          Informe a rota e a data. O preço é sempre confirmado pelo motor VIA AIR no momento do salvamento — o
          valor de referência é apenas comparativo.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className={campo}
            placeholder="Origem (IATA)"
            maxLength={3}
            value={origin}
            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
          />
          <input
            className={campo}
            placeholder="Destino (IATA)"
            maxLength={3}
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
          />
          <input className={campo} type="date" value={ida} onChange={(e) => setIda(e.target.value)} />
          <input className={campo} type="date" value={volta} onChange={(e) => setVolta(e.target.value)} />
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
          <input
            className={campo}
            inputMode="decimal"
            placeholder="Preço de referência (opcional)"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
          <button
            type="button"
            disabled={!valido || mut.isPending}
            onClick={() => mut.mutate()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {mut.isPending ? "Cotando..." : "Salvar promoção"}
          </button>
        </div>
      </div>
    </div>
  );
}
