import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Sparkles, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  buildDestinationSuggestions,
  type DestinationSuggestion,
} from "@/lib/destinations-catalog";
import { useGlobalCitySearch } from "@/lib/use-destination-search";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export function DestinationInput({
  value,
  onChange,
  placeholder = "Ex.: Lisboa, Portugal",
  className = "",
  inputClassName = "",
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onSelect?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data: destinations = [] } = useQuery({
    queryKey: ["all-destinations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("destination")
        .not("destination", "is", null);
      if (error) throw error;
      return [
        ...new Set((data ?? []).map((r: any) => (r.destination ?? "").trim()).filter(Boolean)),
      ].sort() as string[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: globalCities = [], isFetching } = useGlobalCitySearch(value);

  const suggestions = useMemo(() => {
    const local = buildDestinationSuggestions(value, destinations, 10);
    const seen = new Set(local.map((s) => norm(s.city)));
    const registeredSet = new Set(destinations.map(norm));
    const extra: DestinationSuggestion[] = [];
    for (const g of globalCities) {
      const key = norm(g.city);
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push({ ...g, registered: registeredSet.has(key) });
    }
    return [...local, ...extra].slice(0, 12);
  }, [value, destinations, globalCities]);

  return (
    <div className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 ${inputClassName}`}
      >
        <MapPin className="h-4 w-4 shrink-0 text-brand-orange" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm normal-case outline-none"
        />
        {isFetching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((s) => (
            <button
              key={`${s.city}-${s.country ?? ""}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.value);
                onSelect?.(s.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm normal-case hover:bg-muted"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
              <span className="flex-1 truncate">
                {s.city}
                {s.country ? (
                  <span className="text-muted-foreground">, {s.country}</span>
                ) : null}
              </span>
              {s.registered && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-medium text-brand-orange">
                  <Sparkles className="h-3 w-3" /> disponível
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
