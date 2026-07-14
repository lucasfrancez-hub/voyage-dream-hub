import { useState } from "react";
import { Plane, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { lookupFlight, type FlightLookupResult } from "@/lib/flight-lookup.functions";

type Props = {
  airline?: string;        // Nome da cia (usado para derivar IATA se `flightNumber` não tiver)
  flightNumber?: string;   // "LA 3331" ou "3331"
  departAt?: string;       // "YYYY-MM-DDTHH:mm" (para pré-preencher a data)
  onApply: (r: FlightLookupResult) => void;
  size?: "sm" | "default";
};

function pickIata(airline?: string, flightNumber?: string): string {
  const s = String(flightNumber ?? "").trim().toUpperCase();
  const m = s.match(/^([A-Z0-9]{2,3})\s*\d/);
  if (m) return m[1]!;
  const a = String(airline ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{2,3}$/.test(a)) return a;
  return "";
}

function pickNumber(flightNumber?: string): string {
  const s = String(flightNumber ?? "").trim().toUpperCase();
  const m = s.match(/^[A-Z0-9]{2,3}\s*(\d+[A-Z]?)$/);
  if (m) return m[1]!;
  const d = s.match(/(\d+[A-Z]?)/);
  return d ? d[1]! : "";
}

export function FlightLookupButton({ airline, flightNumber, departAt, onApply, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [iata, setIata] = useState("");
  const [num, setNum] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState<FlightLookupResult[] | null>(null);
  const lookup = useServerFn(lookupFlight);

  function openDialog() {
    setIata(pickIata(airline, flightNumber));
    setNum(pickNumber(flightNumber));
    setDate((departAt ?? "").slice(0, 10));
    setResults(null);
    setOpen(true);
  }

  async function run() {
    if (!iata || !num || !date) {
      toast.error("Preencha companhia (IATA), número e data.");
      return;
    }
    setLoading(true);
    try {
      const res = await lookup({ data: { flightNumber: `${iata}${num}`, date } });
      if (res.error) {
        toast.error(res.error);
        setResults([]);
        return;
      }
      if (!res.results.length) {
        toast.info("Nenhum voo encontrado para essa data.");
        setResults([]);
        return;
      }
      if (res.results.length === 1) {
        onApply(res.results[0]!);
        toast.success("Voo preenchido!");
        setOpen(false);
        return;
      }
      setResults(res.results);
    } catch (e) {
      toast.error(`Erro na busca: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={openDialog} className="gap-1.5">
        <Plane className="h-3.5 w-3.5" />
        Buscar voo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buscar dados do voo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <div>
                <Label>Cia (IATA)</Label>
                <Input value={iata} onChange={(e) => setIata(e.target.value.toUpperCase())} maxLength={3} placeholder="LA" />
              </div>
              <div>
                <Label>Número</Label>
                <Input value={num} onChange={(e) => setNum(e.target.value.toUpperCase().replace(/\s+/g, ""))} placeholder="3331" />
              </div>
            </div>
            <div>
              <Label>Data do voo (partida)</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {results && results.length > 1 && (
              <div className="space-y-1.5 max-h-56 overflow-auto">
                <div className="text-xs text-muted-foreground">Selecione o trecho:</div>
                {results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onApply(r); setOpen(false); }}
                    className="w-full text-left rounded-md border border-border p-2 text-sm hover:bg-accent"
                  >
                    <div className="font-medium">{r.fromIata} → {r.toIata} · {r.flightNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      Partida {r.departAtLocal.replace("T", " ")} · Chegada {r.arriveAtLocal.replace("T", " ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={run} disabled={loading}>
              {loading ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Buscando…</> : "Buscar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
