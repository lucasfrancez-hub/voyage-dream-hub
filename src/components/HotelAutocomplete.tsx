import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTripAdvisorHotels, getTripAdvisorHotelDetails, type TAHotelSuggestion, type TAHotelDetails } from "@/lib/tripadvisor.functions";

export type HotelSelection = TAHotelDetails;

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (hotel: HotelSelection) => void;
  placeholder?: string;
  photoLimit?: number;
  disabled?: boolean;
};

export function HotelAutocomplete({ value, onChangeText, onSelect, placeholder, photoLimit = 5, disabled }: Props) {
  const search = useServerFn(searchTripAdvisorHotels);
  const details = useServerFn(getTripAdvisorHotelDetails);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TAHotelSuggestion[]>([]);
  const [fetchingId, setFetchingId] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef<string>("");
  const suppressRef = useRef(false);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    const q = (value || "").trim();
    if (q.length < 3) { setItems([]); setOpen(false); return; }
    if (q === lastQueryRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      try {
        const r = await search({ data: { query: q } });
        setItems(r);
        setOpen(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pick(item: TAHotelSuggestion) {
    setFetchingId(item.location_id);
    try {
      const full = await details({ data: { locationId: item.location_id, photoLimit } });
      suppressRef.current = true;
      onChangeText(full.name);
      onSelect(full);
      setOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingId(null);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onChangeText(e.target.value)}
        onFocus={() => { if (items.length > 0) setOpen(true); }}
        placeholder={placeholder ?? "Digite o nome do hotel (busca no TripAdvisor)"}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      )}
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-y-auto">
          {items.map((it) => (
            <button
              type="button"
              key={it.location_id}
              onClick={() => pick(it)}
              disabled={fetchingId === it.location_id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b last:border-b-0 flex items-start gap-2 disabled:opacity-60"
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-orange" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{it.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[it.city, it.country].filter(Boolean).join(" · ") || it.address || "—"}
                </div>
              </div>
              {it.rating ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500">
                  <Star className="h-3 w-3 fill-current" /> {it.rating.toFixed(1)}
                </span>
              ) : null}
              {fetchingId === it.location_id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
            Não encontrou? Continue digitando — o cadastro fica manual.
          </div>
        </div>
      )}
    </div>
  );
}
