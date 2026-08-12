import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BedDouble, Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { resetEmbedHeight, resizeEmbedForFloatingElement } from "@/lib/embed-resize";
import { onerHotelDestinations } from "@/lib/onertravel-hotels.functions";

export type DestinationPoint = {
  id: string;
  type: number;
  name: string;
  description: string | null;
};

/**
 * Autocomplete de destino de hospedagem: cidade, ponto de interesse ou nome do hotel.
 */
export function DestinationAutocomplete({
  point,
  onSelect,
  placeholder,
  className,
}: {
  point: DestinationPoint | null;
  onSelect: (p: DestinationPoint | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const search = useServerFn(onerHotelDestinations);
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const embedResizeOwner = useRef({});
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (point) setText(point.name);
  }, [point]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Lista em portal: acompanha a posição do campo e cresce o iframe do widget.
  useEffect(() => {
    if (!open) {
      resetEmbedHeight(embedResizeOwner.current);
      return;
    }
    const update = () => {
      const el = boxRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({
        top: window.scrollY + rect.bottom + 6,
        left: window.scrollX + rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["oner-hotel-points", debounced],
    queryFn: () => search({ data: { query: debounced } }) as Promise<DestinationPoint[]>,
    enabled: debounced.length >= 3 && !point,
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => resizeEmbedForFloatingElement(dropdownRef.current, 24, embedResizeOwner.current), 40);
    return () => window.clearTimeout(t);
  }, [open, options, pos.top]);

  function choose(p: DestinationPoint) {
    onSelect(p);
    setText(p.name);
    setOpen(false);
    resetEmbedHeight(embedResizeOwner.current);
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        className={className}
        value={text}
        placeholder={placeholder ?? "Cidade, região ou nome do hotel"}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (point) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + options.length) % options.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(options[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {isFetching && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open &&
        !point &&
        options.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 288),
            }}
            className="z-[100] max-h-72 overflow-auto rounded-2xl border border-border/60 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl"
          >
            {options.map((o, i) => (
              <button
                key={`${o.type}-${o.id}`}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(o)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  i === highlight ? "bg-primary/15" : "hover:bg-muted/60"
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {o.type === 3 ? <BedDouble className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{o.name}</span>
                  {o.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {o.description}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
