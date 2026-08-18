import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BudgetMode = "total" | "parcela";

export type BudgetRange = { min: number; max: number | null } | null;

export const BUDGET_INSTALLMENTS = 10;

const RANGES: { min: number; max: number | null }[] = [
  { min: 0, max: 2000 },
  { min: 2000, max: 5000 },
  { min: 5000, max: 10000 },
  { min: 10000, max: 15000 },
  { min: 15000, max: null },
];

function compact(value: number) {
  if (value >= 1000 && value % 1000 === 0) return `R$ ${value / 1000}k`;
  return formatBRL(value);
}

export function BudgetFilter({
  mode,
  onModeChange,
  range,
  onRangeChange,
  variant = "default",
  sliderMin = 0,
  sliderMax = 15000,
  sliderStep = 100,
}: {
  mode: BudgetMode;
  onModeChange: (mode: BudgetMode) => void;
  range: BudgetRange;
  onRangeChange: (range: BudgetRange) => void;
  variant?: "default" | "glass";
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
}) {
  if (variant === "glass") {
    return (
      <GlassBudgetFilter
        mode={mode}
        onModeChange={onModeChange}
        range={range}
        onRangeChange={onRangeChange}
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
      />
    );
  }

  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const divisor = mode === "parcela" ? BUDGET_INSTALLMENTS : 1;
  const isActive = (r: { min: number; max: number | null }) =>
    !!range && range.min === r.min && range.max === r.max;

  const applyCustom = () => {
    const digits = customValue.replace(/[^\d]/g, "");
    if (!digits) {
      onRangeChange(null);
      return;
    }
    const value = Number(digits) * divisor;
    onRangeChange({ min: 0, max: value });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-orange">
            Orçamento
          </p>
          <h2 className="text-lg font-medium text-foreground">
            Indique quanto você quer investir{" "}
            <span className="text-base font-normal text-muted-foreground">
              na sua próxima viagem
            </span>
          </h2>
        </div>

        <div className="inline-flex self-start rounded-lg border border-border bg-background/60 p-1 md:self-auto">
          {(["total", "parcela"] as BudgetMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                "rounded-md px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                mode === m
                  ? "bg-brand-orange text-white shadow-lg"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "total" ? "Valor total" : `Valor da parcela`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {RANGES.map((r) => {
          const active = isActive(r);
          const label =
            r.max === null
              ? "Acima de"
              : r.min === 0
                ? "Até"
                : "Faixa";
          const value =
            r.max === null
              ? compact(r.min / divisor)
              : r.min === 0
                ? compact(r.max / divisor)
                : `${compact(r.min / divisor)} — ${compact(r.max / divisor)}`;
          return (
            <button
              key={`${r.min}-${r.max}`}
              type="button"
              onClick={() => {
                setCustomOpen(false);
                setCustomValue("");
                onRangeChange(active ? null : r);
              }}
              className={cn(
                "group flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all",
                active
                  ? "border-brand-orange bg-brand-orange/10 shadow-[0_0_15px_rgba(242,107,31,0.15)]"
                  : "border-border bg-muted/30 hover:border-brand-orange/50",
              )}
            >
              <span
                className={cn(
                  "mb-1 text-[10px] font-bold uppercase",
                  active ? "text-brand-orange" : "text-muted-foreground group-hover:text-brand-orange",
                )}
              >
                {label}
              </span>
              <span className="text-sm font-semibold text-foreground">{value}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {customOpen && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                R$
              </span>
              <input
                inputMode="numeric"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                placeholder={mode === "parcela" ? "800" : "8000"}
                className="w-32 rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-orange"
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-md bg-brand-orange px-3 py-2 text-xs font-bold uppercase tracking-wide text-white"
            >
              Aplicar
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="text-[11px] font-bold uppercase tracking-tight text-brand-orange hover:underline"
        >
          {customOpen ? "Fechar" : "Ou definir valor personalizado"}
        </button>
        {range && (
          <button
            type="button"
            onClick={() => {
              onRangeChange(null);
              setCustomValue("");
            }}
            className="text-[11px] font-bold uppercase tracking-tight text-muted-foreground hover:text-foreground"
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

function GlassBudgetFilter({
  mode,
  onModeChange,
  range,
  onRangeChange,
  min,
  max,
  step,
}: {
  mode: BudgetMode;
  onModeChange: (mode: BudgetMode) => void;
  range: BudgetRange;
  onRangeChange: (range: BudgetRange) => void;
  min: number;
  max: number;
  step: number;
}) {
  const divisor = mode === "parcela" ? BUDGET_INSTALLMENTS : 1;

  const currentMin = range?.min ?? min;
  const currentMax = range?.max ?? max;
  const sliderValues = [currentMin, currentMax];

  const display = (value: number) =>
    compact(mode === "parcela" ? value / divisor : value);

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8 w-full">
      <div className="flex items-center gap-6 shrink-0">
        <div className="hidden sm:block">
          <p className="text-white text-[11px] font-bold mb-0.5">Orçamento</p>
          <p className="text-zinc-500 text-[9px] uppercase tracking-widest font-medium">Tipo de filtro</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
          {(["total", "parcela"] as BudgetMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                "px-5 py-2 text-[10px] font-bold rounded-lg transition-all active:scale-95",
                mode === m
                  ? "bg-brand-orange text-white shadow-lg"
                  : "text-zinc-500 hover:text-white",
              )}
            >
              {m === "total" ? "TOTAL" : "PARCELA"}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:block w-px h-10 bg-white/10 shrink-0" />

      <div className="flex-1 min-w-0 w-full py-2">
        <div className="flex justify-between mb-3">
          <span className="text-[10px] font-bold text-white/80 bg-white/5 px-2 py-0.5 rounded border border-white/5">
            {display(currentMin)}
          </span>
          <span className="text-[10px] font-bold text-white/80 bg-white/5 px-2 py-0.5 rounded border border-white/5">
            {display(currentMax)}
          </span>
        </div>
        <Slider
          value={sliderValues}
          min={min}
          max={max}
          step={step}
          onValueChange={(values) => {
            const [v0, v1] = values;
            if (v0 === min && v1 === max) {
              onRangeChange(null);
            } else {
              onRangeChange({ min: v0, max: v1 });
            }
          }}
          className="w-full"
        />
        <div className="flex justify-between mt-3 px-0.5">
          <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">Mínimo</span>
          <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">Limite máx</span>
        </div>
      </div>
    </div>
  );
}

