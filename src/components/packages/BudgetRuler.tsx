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

export function BudgetRuler({
  mode,
  onModeChange,
  range,
  onRangeChange,
  min = 0,
  max = 15000,
  step = 100,
  className,
}: {
  mode: BudgetMode;
  onModeChange: (mode: BudgetMode) => void;
  range: BudgetRange;
  onRangeChange: (range: BudgetRange) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const currentMin = range?.min ?? min;
  const currentMax = range?.max ?? max;

  const label = (value: number) =>
    mode === "parcela"
      ? `${BUDGET_INSTALLMENTS}x ${compact(Math.round(value / BUDGET_INSTALLMENTS))}`
      : compact(value);

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3">
        <label className="truncate text-xs font-medium text-muted-foreground">
          Quantos você quer pagar?
        </label>
        <div className="flex shrink-0 rounded-full border border-border bg-background/60 p-0.5">
          {(["total", "parcela"] as BudgetMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors",
                mode === m
                  ? "bg-brand-orange text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "total" ? "Total" : "Parcela"}
            </button>
          ))}
        </div>
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
        className="mt-1 w-full"
      />

      <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>{label(currentMin)}</span>
        <span>{label(currentMax)}</span>
      </div>
    </div>
  );
}
