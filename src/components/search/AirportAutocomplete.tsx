import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plane } from "lucide-react";
import { Input } from "@/components/ui/input";
import { resetEmbedHeight, resizeEmbedForFloatingElement } from "@/lib/embed-resize";
import { onerAirportSearch } from "@/lib/onertravel.functions";
import { onerAirportSearchPublic } from "@/lib/onertravel-public.functions";


type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
  isCity: boolean;
  cityCode: string | null;
};

/**
 * Campo com autocomplete de aeroportos: digita a cidade/nome e já preenche o IATA.
 */
export function AirportAutocomplete({
  value,
  onSelect,
  placeholder,
  isDeparture = true,
  className,
  publicMode = false,
}: {
  value: string;
  onSelect: (iata: string) => void;
  placeholder?: string;
  isDeparture?: boolean;
  className?: string;
  /** Motor público (sem login): usa a versão aberta da consulta. */
  publicMode?: boolean;
}) {
  const search = useServerFn(publicMode ? onerAirportSearchPublic : onerAirportSearch);
  const [text, setText] = useState(value);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  // Só espelha o valor externo quando o usuário não está digitando,
  // senão cada tecla limparia o texto do campo.
  useEffect(() => {
    if (typingRef.current) return;
    setText(value);
  }, [value]);


  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
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

  // Lista renderizada em portal: precisa acompanhar a posição do campo
  // e fazer o iframe do widget crescer pra não cortar as opções.
  useEffect(() => {
    if (!open) {
      resetEmbedHeight();
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
    queryKey: ["oner-airports", publicMode, debounced, isDeparture],
    queryFn: () => search({ data: { query: debounced, isDeparture } }) as Promise<Airport[]>,
    enabled: debounced.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => resizeEmbedForFloatingElement(dropdownRef.current, 24), 40);
    return () => window.clearTimeout(t);
  }, [open, options, pos.top]);

  function choose(a: Airport) {
    typingRef.current = false;
    onSelect(a.iata.toUpperCase());
    setText(a.iata.toUpperCase());
    setOpen(false);
    resetEmbedHeight();
  }


  return (
    <div ref={boxRef} className="relative">
      <Input
        className={className}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          typingRef.current = true;
          setText(v);
          setOpen(true);
          setHighlight(0);
          const up = v.trim().toUpperCase();
          onSelect(up.length === 3 && /^[A-Z]{3}$/.test(up) ? up : "");
        }}
        onBlur={() => {
          typingRef.current = false;
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
            {options.map((a, i) => (
              <button
                key={`${a.iata}-${a.name}-${i}`}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(a)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                  i === highlight ? "bg-primary/15" : "hover:bg-muted/60"
                } ${!a.isCity && a.cityCode ? "pl-7" : ""}`}
              >
                <span className="grid h-8 w-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                  {a.iata}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {a.isCity ? `${a.city || a.name} (todos os aeroportos)` : a.name || a.city}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {a.isCity ? "Cidade" : a.city}
                    {a.country ? ` • ${a.country}` : ""}
                  </span>
                </span>
                <Plane className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>,
          document.body,
        )}

    </div>
  );
}
