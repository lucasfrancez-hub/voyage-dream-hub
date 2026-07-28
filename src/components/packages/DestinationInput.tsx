import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

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

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return destinations.slice(0, 8);
    return destinations.filter((d) => d.toLowerCase().includes(q)).slice(0, 8);
  }, [value, destinations]);

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
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((d) => (
            <button
              key={d}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(d);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm normal-case hover:bg-muted"
            >
              <MapPin className="h-3.5 w-3.5 text-brand-orange" /> {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
