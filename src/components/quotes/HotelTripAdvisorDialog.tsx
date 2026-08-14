import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Star, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  buscarHotelTripAdvisor, vincularHotelTripAdvisor, obterVinculoHotel,
} from "@/lib/public-quote/hotel-link.functions";

type Candidate = {
  id: number;
  name: string;
  address: string | null;
  stars: number | null;
  web_url: string | null;
};

export function HotelTripAdvisorDialog({
  open,
  onOpenChange,
  hotelName,
  city,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hotelName: string;
  city?: string | null;
  onLinked?: () => void;
}) {
  const buscar = useServerFn(buscarHotelTripAdvisor);
  const vincular = useServerFn(vincularHotelTripAdvisor);
  const obter = useServerFn(obterVinculoHotel);

  const [termo, setTermo] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [atual, setAtual] = useState<{ locationId: number | null; locationName: string | null }>({
    locationId: null,
    locationName: null,
  });

  useEffect(() => {
    if (!open) return;
    setTermo([hotelName, city].filter(Boolean).join(" "));
    setResults([]);
    obter({ data: { hotelName, city: city ?? null } })
      .then(setAtual)
      .catch(() => setAtual({ locationId: null, locationName: null }));
  }, [open, hotelName, city, obter]);

  const search = useMutation({
    mutationFn: async () => await buscar({ data: { query: termo.trim() } }),
    onSuccess: (r) => {
      setResults(r.results as Candidate[]);
      if (!r.results.length) toast.info("Nenhuma propriedade encontrada no TripAdvisor para esse termo.");
    },
    onError: () => toast.error("Não foi possível consultar o TripAdvisor agora."),
  });

  const link = useMutation({
    mutationFn: async (c: Candidate) =>
      await vincular({
        data: { hotelName, city: city ?? null, locationId: c.id, locationName: c.name },
      }),
    onSuccess: (r) => {
      if (r.status === "MATCH_FAILED") {
        toast.warning("Vinculado, mas o TripAdvisor não devolveu dados agora. Tente novamente em instantes.");
      } else {
        toast.success(`Hotel vinculado — ${r.photos} foto(s) carregadas do TripAdvisor.`);
      }
      onLinked?.();
      onOpenChange(false);
    },
    onError: () => toast.error("Não foi possível vincular o hotel."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular ao TripAdvisor</DialogTitle>
          <DialogDescription>
            Escolha a ficha oficial de <strong>{hotelName}</strong>. As fotos, endereço, estrelas, comodidades e
            avaliações do orçamento passam a vir dessa propriedade.
          </DialogDescription>
        </DialogHeader>

        {atual.locationId && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <CheckCircle2 className="h-4 w-4 text-brand-orange" />
            Vinculado hoje a <strong>{atual.locationName ?? `#${atual.locationId}`}</strong>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search.mutate();
            }}
            placeholder="Nome do hotel + cidade"
          />
          <Button onClick={() => search.mutate()} disabled={search.isPending || termo.trim().length < 3}>
            {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2">Buscar</span>
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {results.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold">
                  {c.name}
                  {c.stars ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-brand-orange">
                      {c.stars} <Star className="h-3 w-3" />
                    </span>
                  ) : null}
                </div>
                {c.address && <div className="mt-0.5 text-[11px] text-muted-foreground">{c.address}</div>}
                {c.web_url && (
                  <a
                    href={c.web_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-orange"
                  >
                    Ver no TripAdvisor <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <Button size="sm" onClick={() => link.mutate(c)} disabled={link.isPending}>
                {link.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vincular"}
              </Button>
            </div>
          ))}
          {!results.length && !search.isPending && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Busque pelo nome do hotel para ver as propriedades disponíveis.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
