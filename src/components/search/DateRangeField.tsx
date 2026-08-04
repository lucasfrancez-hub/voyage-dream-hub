import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ArrowRight, X } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { resetEmbedHeight, resizeEmbedForFloatingElement } from "@/lib/embed-resize";
import { cn } from "@/lib/utils";


const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const fromISO = (s: string) => {
  if (!s) return undefined;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
};

/**
 * Ida e volta num único calendário: primeiro clique marca a ida,
 * segundo clique fecha o intervalo e já preenche a volta.
 * Para somente ida, basta confirmar com "Somente ida".
 */
export function DateRangeField({
  departureDate,
  returnDate,
  onChange,
  allowOneWay = true,
  labels = { start: "Ida", end: "Volta (opcional)" },
  className,
}: {
  departureDate: string;
  returnDate: string;
  onChange: (departureDate: string, returnDate: string) => void;
  allowOneWay?: boolean;
  labels?: { start: string; end: string };
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<"start" | "end">("start");
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    try {
      setEmbedded(window.self !== window.top);
    } catch {
      setEmbedded(true);
    }
  }, []);


  const from = fromISO(departureDate);
  const to = fromISO(returnDate);

  // Fecha sozinho quando o intervalo está completo e o usuário pediu volta.
  useEffect(() => {
    if (open && focus === "end" && from && to) {
      const t = setTimeout(() => setOpen(false), 180);
      return () => clearTimeout(t);
    }
  }, [open, focus, from, to]);

  function handleSelect(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) {
      onChange("", "");
      return;
    }
    if (focus === "start") {
      // Primeiro clique: define a ida e já pede a volta no mesmo calendário.
      onChange(toISO(range.from), "");
      setFocus("end");
      return;
    }
    if (range.to && toISO(range.to) !== toISO(range.from)) {
      onChange(toISO(range.from), toISO(range.to));
      return;
    }
    // Clicou antes da ida: reinicia o intervalo a partir dessa data.
    onChange(toISO(range.from), "");
  }

  const trigger = (which: "start" | "end") => {
    const date = which === "start" ? from : to;
    const active = open && focus === which;
    return (
      <button
        type="button"
        onClick={() => {
          setFocus(which);
          setOpen(true);
        }}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-xl border bg-muted/40 px-4 text-left text-sm font-semibold transition-all",
          active
            ? "border-primary ring-2 ring-primary/40"
            : "border-border/40 hover:border-primary/50",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        {date ? (
          <span className="capitalize">{format(date, "dd MMM yyyy", { locale: ptBR })}</span>
        ) : (
          <span className="font-medium text-muted-foreground">
            {which === "start" ? labels.start : labels.end}
          </span>
        )}
        {which === "end" && to && (
          <X
            className="ml-auto h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange(departureDate, "");
            }}
          />
        )}
      </button>
    );
  };

  const panel = (compact: boolean) => (
    <>
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5 text-xs">
        <span
          className={cn(
            "rounded-full px-2 py-1 font-semibold",
            focus === "start" ? "bg-primary/15 text-primary" : "text-muted-foreground",
          )}
        >
          {labels.start}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span
          className={cn(
            "rounded-full px-2 py-1 font-semibold",
            focus === "end" ? "bg-primary/15 text-primary" : "text-muted-foreground",
          )}
        >
          {labels.end}
        </span>
        {compact && (
          <button
            type="button"
            aria-label="Fechar calendário"
            className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Calendar
        mode="range"
        locale={ptBR}
        numberOfMonths={compact ? 1 : 2}
        defaultMonth={from ?? new Date()}
        selected={{ from, to }}
        onSelect={handleSelect}
        disabled={{ before: new Date() }}
        className={cn("pointer-events-auto p-3")}
      />

      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange("", "")}>
          Limpar
        </Button>
        <div className="flex gap-2">
          {allowOneWay && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={!from}
              onClick={() => {
                onChange(departureDate, "");
                setOpen(false);
              }}
            >
              Somente ida
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs" disabled={!from} onClick={() => setOpen(false)}>
            Confirmar
          </Button>
        </div>
      </div>
    </>
  );

  // Dentro de um iframe (widget do site) o popover seria cortado pelas bordas.
  // Nesse caso abrimos um painel fixo na área visível do próprio widget.
  if (embedded) {
    return (
      <>
        <div className={cn("grid grid-cols-2 gap-2", className)}>
          {trigger("start")}
          {trigger("end")}
        </div>
        {open && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-background/80 p-2 backdrop-blur-sm">
            <div
              className="my-auto w-full max-w-[340px] rounded-2xl border border-border/60 bg-popover shadow-2xl"
              role="dialog"
            >
              {panel(true)}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFocus("start");
      }}
    >
      <div className={cn("grid grid-cols-2 gap-2", className)}>
        <PopoverTrigger asChild>{trigger("start")}</PopoverTrigger>
        {trigger("end")}
      </div>

      <PopoverContent
        align="start"
        className="w-auto rounded-2xl border-border/60 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl"
      >
        {panel(false)}
      </PopoverContent>
    </Popover>
  );
}

