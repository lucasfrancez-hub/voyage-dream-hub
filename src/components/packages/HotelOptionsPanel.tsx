import { useState } from "react";
import { BedDouble, Check, Link2, Trash2 } from "lucide-react";
import { HotelAutocomplete } from "@/components/HotelAutocomplete";

export type HotelOption = {
  opcao?: number | null;
  hotel_name: string;
  room_type?: string | null;
  meal_plan?: string | null;
  price_per_person?: number | null;
  total?: number | null;
  hotel_stars?: number | null;
  tripadvisor_location_id?: string | null;
  tripadvisor_url?: string | null;
  tripadvisor_address?: string | null;
  tripadvisor_photos?: string[] | null;
};


const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Lista as hospedagens alternativas do pacote (mesmos voos/datas).
 * A primeira (mais barata) é o valor base; as demais mostram a diferença.
 */
export function HotelOptionsPanel({
  options,
  occupancy = 2,
  onChange,
}: {
  options: HotelOption[];
  occupancy?: number;
  onChange: (next: HotelOption[] | null, base: HotelOption | null) => void;
}) {
  const [vinculando, setVinculando] = useState<number | null>(null);
  if (!options?.length) return null;

  const preco = (o: HotelOption) => Number(o.price_per_person) || 0;
  const base = options[0]!;
  const precoBase = preco(base);

  const usarComoBase = (i: number) => {
    if (i === 0) return;
    const next = [options[i]!, ...options.filter((_, idx) => idx !== i)];
    onChange(next, next[0]!);
  };

  const patch = (i: number, p: Partial<HotelOption>) => {
    const next = options.map((o, idx) => (idx === i ? { ...o, ...p } : o));
    onChange(next, next[0]!);
  };

  const remover = (i: number) => {
    const next = options.filter((_, idx) => idx !== i);
    if (next.length < 2) {
      onChange(null, next[0] ?? null);
      return;
    }
    onChange(next, next[0]!);
  };


  return (
    <div className="sm:col-span-2 rounded-2xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <BedDouble className="h-3.5 w-3.5 text-brand-orange" />
        Opções de hospedagem ({options.length}) · o cliente escolhe no site
      </div>
      <ul className="space-y-2">
        {options.map((o, i) => {
          const dif = preco(o) - precoBase;
          const ehBase = i === 0;
          const vinculado = !!o.tripadvisor_location_id;
          const aberto = vinculando === i;
          return (
            <li
              key={`${o.hotel_name}-${i}`}
              className={`rounded-xl border p-2.5 ${
                ehBase ? "border-brand-orange/60 bg-brand-orange/5" : "border-border bg-card"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{o.hotel_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[o.room_type, o.meal_plan].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {vinculado ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        TripAdvisor vinculado
                        {o.tripadvisor_photos?.length ? ` · ${o.tripadvisor_photos.length} fotos` : ""}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Sem TripAdvisor</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{brl(preco(o))}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">por pessoa</div>
                </div>
                <div className="w-full sm:w-auto sm:min-w-[190px] sm:text-right">
                  {ehBase ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      <Check className="h-3 w-3" /> Valor base (mais barato)
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      + {brl(dif)} por pessoa
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        + {brl(dif * (occupancy || 2))} no valor final
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setVinculando(aberto ? null : i)}
                    title="Vincular esta hospedagem ao TripAdvisor"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                      aberto
                        ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Link2 className="h-3 w-3" /> TripAdvisor
                  </button>
                  {!ehBase && (
                    <button
                      type="button"
                      onClick={() => usarComoBase(i)}
                      className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
                    >
                      Usar como base
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remover(i)}
                    title="Remover esta hospedagem"
                    className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {aberto && (
                <div className="mt-2 rounded-lg border border-border bg-background p-2">
                  <HotelAutocomplete
                    value={o.hotel_name}
                    initialMode="live"
                    onChangeText={(v) => patch(i, { hotel_name: v })}
                    onSelect={(h) => {
                      patch(i, {
                        hotel_name: h.name,
                        hotel_stars:
                          h.rating != null
                            ? Math.min(5, Math.max(1, Math.round(h.rating)))
                            : h.hotel_class != null
                              ? Math.min(5, Math.max(1, Math.round(h.hotel_class)))
                              : (o.hotel_stars ?? null),
                        tripadvisor_location_id: String(h.location_id),
                        tripadvisor_url: h.tripadvisor_url ?? null,
                        tripadvisor_address: h.address ?? null,
                        tripadvisor_photos: h.photos && h.photos.length > 0 ? h.photos : null,
                      });
                      setVinculando(null);
                    }}
                  />
                  {vinculado && (
                    <button
                      type="button"
                      onClick={() =>
                        patch(i, {
                          tripadvisor_location_id: null,
                          tripadvisor_url: null,
                          tripadvisor_address: null,
                          tripadvisor_photos: null,
                        })
                      }
                      className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive"
                    >
                      Desvincular
                    </button>
                  )}
                </div>
              )}
            </li>
          );

        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        O preço do pacote segue a opção base. As demais aparecem para o cliente com a diferença somada.
      </p>
    </div>
  );
}

export default HotelOptionsPanel;
