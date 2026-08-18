import { useState } from "react";
import { Wallet, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BUDGET_INSTALLMENTS,
  type BudgetMode,
  type BudgetRange,
} from "@/components/packages/BudgetFilter";

function compact(value: number) {
  if (value >= 1000 && value % 1000 === 0) return `R$ ${value / 1000}k`;
  return formatBRL(value);
}

export function BudgetFloating({
  mode,
  onModeChange,
  range,
  onRangeChange,
  min = 0,
  max = 15000,
  step = 100,
}: {
  mode: BudgetMode;
  onModeChange: (mode: BudgetMode) => void;
  range: BudgetRange;
  onRangeChange: (range: BudgetRange) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [open, setOpen] = useState(false);

  const divisor = mode === "parcela" ? BUDGET_INSTALLMENTS : 1;
  const currentMin = range?.min ?? min;
  const currentMax = range?.max ?? max;
  const display = (value: number) => compact(Math.round(value / divisor));

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <div className="w-[min(92vw,22rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-orange">
                Orçamento
              </p>
              <p className="text-sm font-medium text-foreground">
                Quanto você quer pagar na sua viagem?
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar orçamento"
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 inline-flex rounded-lg border border-border bg-background/60 p-1">
            {(["total", "parcela"] as BudgetMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                  mode === m
                    ? "bg-brand-orange text-white shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "total" ? "Total" : `Parcela ${BUDGET_INSTALLMENTS}x`}
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-foreground">
            <span>{display(currentMin)}</span>
            <span>{display(currentMax)}</span>
          </div>
          <Slider
            value={[currentMin, currentMax]}
            min={min}
            max={max}
            step={step}
            onValueChange={([v0, v1]) => {
              if (v0 === min && v1 === max) onRangeChange(null);
              else onRangeChange({ min: v0, max: v1 });
            }}
            className="w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
              Mínimo / Máximo
            </span>
            {range && (
              <button
                type="button"
                onClick={() => onRangeChange(null)}
                className="text-[10px] font-bold uppercase tracking-tight text-brand-orange hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-brand-orange/40 bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-xl transition hover:border-brand-orange"
        >
          <Wallet className="h-4 w-4 text-brand-orange" />
          {range
            ? `${display(currentMin)} — ${display(currentMax)}`
            : "Quanto quer pagar?"}
        </button>
      )}
    </div>
  );
}
