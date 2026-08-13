import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resetEmbedHeight, resizeEmbedForFloatingElement } from "@/lib/embed-resize";
import { cn } from "@/lib/utils";

const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const fromISO = (s: string) => {
  if (!s) return undefined;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
};

/** Campo de data única — usado por cada trecho do modo Multi-trecho. */
export function SingleDateField({
  value,
  onChange,
  label = "Data",
  min,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  /** Data mínima permitida (ISO) — garante a ordem cronológica dos trechos. */
  min?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const embedOwner = useRef({});

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const before = fromISO(min ?? "") ?? today;
  const selected = fromISO(value);

  useEffect(() => {
    if (!open) {
      resetEmbedHeight(embedOwner.current);
      return;
    }
    const raf = window.requestAnimationFrame(() =>
      resizeEmbedForFloatingElement(panelRef.current, 32, embedOwner.current),
    );
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center gap-3 rounded-xl border border-border/40 bg-muted/40 px-4 text-left transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <span
            className={cn(
              "truncate text-base font-semibold",
              selected ? "" : "font-medium text-muted-foreground",
            )}
          >
            {selected ? format(selected, "dd MMM yyyy", { locale: ptBR }) : label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div ref={panelRef}>
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selected}
            defaultMonth={selected ?? before}
            disabled={{ before }}
            onSelect={(d) => {
              if (!d) return;
              onChange(toISO(d));
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
