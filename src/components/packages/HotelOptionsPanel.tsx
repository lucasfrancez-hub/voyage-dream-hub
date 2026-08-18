import { BedDouble, Check, Trash2 } from "lucide-react";
import { HotelStaysList, normalizeStays, type HotelStay } from "./HotelStaysList";

export type HotelOption = {
  opcao?: number | null;
  hotel_name: string;
  stays?: HotelStay[] | null;
  room_type?: string | null;
  room_category?: string | null;
  bed_type?: string | null;
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
 * Clicar em uma opção passa a editá-la nos campos abaixo (hotel, TripAdvisor,
 * estrelas, regime, quarto, categoria e cama).
 */
export function HotelOptionsPanel({
  options,
  occupancy = 2,
  selectedIndex = 0,
  onSelectIndex,
  onChange,
}: {
  options: HotelOption[];
  occupancy?: number;
  selectedIndex?: number;
  onSelectIndex?: (i: number) => void;
  onChange: (next: HotelOption[] | null, base: HotelOption | null) => void;
}) {
  if (!options?.length) return null;

  const unica = options.length === 1;
  const preco = (o: HotelOption) => Number(o.price_per_person) || 0;
  const base = options[0]!;
  const precoBase = preco(base);

  const usarComoBase = (i: number) => {
    if (i === 0) return;
    const next = [options[i]!, ...options.filter((_, idx) => idx !== i)];
    onChange(next, next[0]!);
    onSelectIndex?.(0);
  };

  const remover = (i: number) => {
    const next = options.filter((_, idx) => idx !== i);
    onSelectIndex?.(0);
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
        {unica ? "Hospedagem" : `Opções de hospedagem (${options.length}) · clique para editar`}
      </div>
      <ul className="space-y-2">
        {options.map((o, i) => {
          const dif = preco(o) - precoBase;
          const ehBase = i === 0;
          const selecionado = i === selectedIndex;
          const vinculado = !!o.tripadvisor_location_id;
          return (
            <li key={`${o.hotel_name}-${i}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectIndex?.(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectIndex?.(i);
                  }
                }}
                className={`cursor-pointer rounded-xl border p-2.5 transition ${
                  selecionado
                    ? "border-brand-orange bg-brand-orange/10 ring-1 ring-brand-orange/40"
                    : "border-border bg-card hover:border-brand-orange/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {normalizeStays(o.stays).length > 1 ? (
                      <>
                        <div className="truncate text-sm font-semibold">
                          {normalizeStays(o.stays).map((s) => s.hotel_name).join(" + ")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Roteiro com {normalizeStays(o.stays).length} hospedagens
                        </div>
                        <div className="mt-1.5">
                          <HotelStaysList stays={normalizeStays(o.stays)} compact />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="truncate text-sm font-semibold">{o.hotel_name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[o.room_type, o.bed_type, o.meal_plan || "Regime não informado"].filter(Boolean).join(" · ")}
                        </div>
                      </>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                      {vinculado ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          TripAdvisor vinculado
                          {o.tripadvisor_photos?.length ? ` · ${o.tripadvisor_photos.length} fotos` : ""}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Sem TripAdvisor</span>
                      )}
                      {selecionado && (
                        <span className="text-brand-orange">Editando abaixo</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">{brl(preco(o))}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      por pessoa
                    </div>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[190px] sm:text-right">
                    {unica ? null : ehBase ? (
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
                  <div className={`flex items-center gap-1 ${unica ? "hidden" : ""}`}>
                    {!ehBase && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          usarComoBase(i);
                        }}
                        className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
                      >
                        Usar como base
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        remover(i);
                      }}
                      title="Remover esta hospedagem"
                      className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-2 text-[10px] text-muted-foreground ${unica ? "hidden" : ""}`}>
        O preço do pacote segue a opção base. As demais aparecem para o cliente com a diferença
        somada. Os campos abaixo editam a opção selecionada.
      </p>
    </div>
  );
}

export default HotelOptionsPanel;

