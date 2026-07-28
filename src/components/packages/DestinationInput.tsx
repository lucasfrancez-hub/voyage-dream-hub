import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { buildDestinationSuggestions } from "@/lib/destinations-catalog";

export function DestinationInput({
  value,
  onChange,
  placeholder = "Ex.: Lisboa, Portugal",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
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

  const suggestions = useMemo(
    () => buildDestinationSuggestions(value, destinations, 10),
    [value, destinations],
  );

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
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
