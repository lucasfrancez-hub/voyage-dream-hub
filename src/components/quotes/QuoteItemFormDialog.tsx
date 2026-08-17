/**
 * Formulário manual de item de orçamento (hospedagem, aéreo ou serviço).
 * Usado tanto para adicionar quanto para editar um item já existente.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { salvarItemOrcamento } from "@/lib/quotes/items.functions";
import type { NormalizedFlight, NormalizedGenericItem, NormalizedHotel } from "@/lib/quotes/types";

export type QuoteItemKind = "hotel" | "flight" | "service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  optionNumber: number;
  kind: QuoteItemKind;
  /** Índice do item quando estiver editando; null = novo. */
  index?: number | null;
  hotel?: NormalizedHotel | null;
  flight?: NormalizedFlight | null;
  service?: NormalizedGenericItem | null;
  onSaved: () => void;
};

type SegmentForm = {
  airline: string; flightNumber: string; fromIata: string; toIata: string;
  departure: string; arrival: string; duration: string; cabin: string; baggage: string;
};

const segVazio: SegmentForm = {
  airline: "", flightNumber: "", fromIata: "", toIata: "",
  departure: "", arrival: "", duration: "", cabin: "", baggage: "",
};

function txt(v: unknown): string {
  return v == null ? "" : String(v);
}
function numOrNull(v: string): number | null {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
}
/** Corta o "Z"/segundos pra caber no input datetime-local. */
function paraInputDateTime(v?: string | null): string {
  if (!v) return "";
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
}

export function QuoteItemFormDialog(props: Props) {
  const { open, onOpenChange, quoteId, optionNumber, kind, index = null, onSaved } = props;
  const salvar = useServerFn(salvarItemOrcamento);

  // Hospedagem
  const [hName, setHName] = useState("");
  const [hCity, setHCity] = useState("");
  const [hAddress, setHAddress] = useState("");
  const [hCheckin, setHCheckin] = useState("");
  const [hCheckout, setHCheckout] = useState("");
  const [hNights, setHNights] = useState("");
  const [hRoom, setHRoom] = useState("");
  const [hBoard, setHBoard] = useState("");
  const [hTotal, setHTotal] = useState("");

  // Aéreo
  const [fDirection, setFDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [fAirline, setFAirline] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fDeparture, setFDeparture] = useState("");
  const [fArrival, setFArrival] = useState("");
  const [fDuration, setFDuration] = useState("");
  const [fTotal, setFTotal] = useState("");
  const [segments, setSegments] = useState<SegmentForm[]>([]);

  // Serviço
  const [sName, setSName] = useState("");
  const [sDescription, setSDescription] = useState("");
  const [sDate, setSDate] = useState("");
  const [sQuantity, setSQuantity] = useState("");
  const [sTotal, setSTotal] = useState("");

  useEffect(() => {
    if (!open) return;
    const h = props.hotel;
    setHName(txt(h?.name)); setHCity(txt(h?.city)); setHAddress(txt(h?.address));
    setHCheckin(txt(h?.checkin)); setHCheckout(txt(h?.checkout)); setHNights(txt(h?.nights));
    setHRoom(txt(h?.roomDescription)); setHBoard(txt(h?.board)); setHTotal(txt(h?.total));

    const f = props.flight;
    setFDirection(f?.direction === "INBOUND" ? "INBOUND" : "OUTBOUND");
    setFAirline(txt(f?.airline)); setFFrom(txt(f?.fromIata)); setFTo(txt(f?.toIata));
    setFDeparture(paraInputDateTime(f?.departure)); setFArrival(paraInputDateTime(f?.arrival));
    setFDuration(txt(f?.duration)); setFTotal(txt(f?.total));
    setSegments(
      (f?.segments ?? []).map((s) => ({
        airline: txt(s.airline), flightNumber: txt(s.flightNumber),
        fromIata: txt(s.fromIata), toIata: txt(s.toIata),
        departure: paraInputDateTime(s.departure), arrival: paraInputDateTime(s.arrival),
        duration: txt(s.duration), cabin: txt(s.cabin), baggage: txt(s.baggage),
      })),
    );

    const s = props.service;
    setSName(txt(s?.name)); setSDescription(txt(s?.description)); setSDate(txt(s?.date));
    setSQuantity(txt(s?.quantity)); setSTotal(txt(s?.total));
  }, [open, props.hotel, props.flight, props.service]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === "hotel") {
        if (!hName.trim()) throw new Error("Informe o nome do hotel");
        return salvar({
          data: {
            quoteId, optionNumber, kind, index,
            hotel: {
              name: hName.trim(),
              city: hCity.trim() || null,
              address: hAddress.trim() || null,
              checkin: hCheckin || null,
              checkout: hCheckout || null,
              nights: numOrNull(hNights),
              roomDescription: hRoom.trim() || null,
              board: hBoard.trim() || null,
              photos: props.hotel?.photos ?? undefined,
              total: numOrNull(hTotal),
            },
          },
        });
      }
      if (kind === "flight") {
        const segs = segments
          .filter((s) => s.fromIata.trim() || s.toIata.trim() || s.flightNumber.trim())
          .map((s) => ({
            airline: s.airline.trim() || fAirline.trim() || null,
            flightNumber: s.flightNumber.trim() || null,
            fromIata: s.fromIata.trim().toUpperCase() || null,
            toIata: s.toIata.trim().toUpperCase() || null,
            departure: s.departure || null,
            arrival: s.arrival || null,
            duration: s.duration.trim() || null,
            cabin: s.cabin.trim() || null,
            baggage: s.baggage.trim() || null,
          }));
        return salvar({
          data: {
            quoteId, optionNumber, kind, index,
            flight: {
              direction: fDirection,
              airline: fAirline.trim() || null,
              fromIata: fFrom.trim().toUpperCase() || segs[0]?.fromIata || null,
              toIata: fTo.trim().toUpperCase() || segs[segs.length - 1]?.toIata || null,
              departure: fDeparture || segs[0]?.departure || null,
              arrival: fArrival || segs[segs.length - 1]?.arrival || null,
              duration: fDuration.trim() || null,
              stops: segs.length > 1 ? segs.length - 1 : 0,
              segments: segs,
              total: numOrNull(fTotal),
            },
          },
        });
      }
      if (!sName.trim()) throw new Error("Informe o nome do serviço");
      return salvar({
        data: {
          quoteId, optionNumber, kind, index,
          service: {
            name: sName.trim(),
            description: sDescription.trim() || null,
            date: sDate || null,
            quantity: numOrNull(sQuantity),
            total: numOrNull(sTotal),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(index == null ? "Item adicionado" : "Item atualizado");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const titulo =
    kind === "hotel" ? "hospedagem" : kind === "flight" ? "voo" : "serviço";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {index == null ? `Adicionar ${titulo}` : `Editar ${titulo}`}
          </DialogTitle>
        </DialogHeader>

        {kind === "hotel" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Hotel *</Label>
              <Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Ex.: Hotel Pestana Rio" />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={hCity} onChange={(e) => setHCity(e.target.value)} />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={hAddress} onChange={(e) => setHAddress(e.target.value)} />
            </div>
            <div>
              <Label>Check-in</Label>
              <Input type="date" value={hCheckin} onChange={(e) => setHCheckin(e.target.value)} />
            </div>
            <div>
              <Label>Check-out</Label>
              <Input type="date" value={hCheckout} onChange={(e) => setHCheckout(e.target.value)} />
            </div>
            <div>
              <Label>Noites</Label>
              <Input inputMode="numeric" value={hNights} onChange={(e) => setHNights(e.target.value)} />
            </div>
            <div>
              <Label>Categoria do quarto</Label>
              <Input value={hRoom} onChange={(e) => setHRoom(e.target.value)} />
            </div>
            <div>
              <Label>Regime</Label>
              <Input value={hBoard} onChange={(e) => setHBoard(e.target.value)} placeholder="Café da manhã" />
            </div>
            <div>
              <Label>Valor total (BRL)</Label>
              <Input inputMode="decimal" value={hTotal} onChange={(e) => setHTotal(e.target.value)} />
            </div>
          </div>
        )}

        {kind === "flight" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Sentido</Label>
                <select
                  value={fDirection}
                  onChange={(e) => setFDirection(e.target.value as "OUTBOUND" | "INBOUND")}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="OUTBOUND">Ida</option>
                  <option value="INBOUND">Volta</option>
                </select>
              </div>
              <div>
                <Label>Companhia</Label>
                <Input value={fAirline} onChange={(e) => setFAirline(e.target.value)} placeholder="LATAM" />
              </div>
              <div>
                <Label>Origem (IATA)</Label>
                <Input maxLength={4} value={fFrom} onChange={(e) => setFFrom(e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Destino (IATA)</Label>
                <Input maxLength={4} value={fTo} onChange={(e) => setFTo(e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Partida</Label>
                <Input type="datetime-local" value={fDeparture} onChange={(e) => setFDeparture(e.target.value)} />
              </div>
              <div>
                <Label>Chegada</Label>
                <Input type="datetime-local" value={fArrival} onChange={(e) => setFArrival(e.target.value)} />
              </div>
              <div>
                <Label>Duração</Label>
                <Input value={fDuration} onChange={(e) => setFDuration(e.target.value)} placeholder="8h20" />
              </div>
              <div>
                <Label>Valor total (BRL)</Label>
                <Input inputMode="decimal" value={fTotal} onChange={(e) => setFTotal(e.target.value)} />
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Trechos ({segments.length})
                </div>
                <Button
                  type="button" size="sm" variant="outline" className="gap-1"
                  onClick={() => setSegments((s) => [...s, { ...segVazio }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Trecho
                </Button>
              </div>
              {segments.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sem trechos detalhados — o voo usa origem/destino acima.
                </p>
              )}
              <div className="mt-3 space-y-3">
                {segments.map((s, i) => (
                  <div key={i} className="grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-6">
                    <Input className="sm:col-span-2" placeholder="Cia" value={s.airline}
                      onChange={(e) => setSegments((arr) => arr.map((x, xi) => xi === i ? { ...x, airline: e.target.value } : x))} />
                    <Input placeholder="Voo" value={s.flightNumber}
                      onChange={(e) => setSegments((arr) => arr.map((x, xi) => xi === i ? { ...x, flightNumber: e.target.value } : x))} />
                    <Input placeholder="De" maxLength={4} value={s.fromIata}
                      onChange={(e) => setSegments((arr) => arr.map((x, xi) => xi === i ? { ...x, fromIata: e.target.value.toUpperCase() } : x))} />
                    <Input placeholder="Para" maxLength={4} value={s.toIata}
                      onChange={(e) => setSegments((arr) => arr.map((x, xi) => xi === i ? { ...x, toIata: e.target.value.toUpperCase() } : x))} />
                    <Button type="button" size="icon" variant="ghost"
                      onClick={() => setSegments((arr) => arr.filter((_, xi) => xi !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Input className="sm:col-span-3" type="datetime-local" value={s.departure}
                      onChange={(e) => setSegments((arr) => arr.map((x, xi) => xi === i ? { ...x, departure: e.target.value } : x))} />
                    <Input className="sm:col-span-3" type="datetime-local" value={s.arrival}
                      onChange={(e) => setSegments((arr) => arr.map((x, xi) => xi === i ? { ...x, arrival: e.target.value } : x))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {kind === "service" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Serviço *</Label>
              <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Traslado aeroporto → hotel" />
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={sDescription} onChange={(e) => setSDescription(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input inputMode="numeric" value={sQuantity} onChange={(e) => setSQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Valor total (BRL)</Label>
              <Input inputMode="decimal" value={sTotal} onChange={(e) => setSTotal(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
