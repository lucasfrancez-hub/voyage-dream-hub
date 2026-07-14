import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, PenLine, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: readonly string[] | string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Small dropdown that shows a fixed list + a permanent "Outras (digitar)"
 * option. Used for cabin class and fare class where we want a curated list
 * but the operator may occasionally need a free-form value.
 */
export function ClassSelect({
  value,
  onChange,
  options,
  placeholder = "Selecione…",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isCustom = !!value && !options.includes(value);

  useEffect(() => {
    if (manualMode) {
      setManualValue(isCustom ? (value ?? "") : "");
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [manualMode, isCustom, value]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setManualMode(false);
  };

  const confirmManual = () => {
    const v = manualValue.trim();
    if (!v) return;
    pick(v);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setManualMode(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(280px,90vw)] p-1" align="start">
        {manualMode ? (
          <div className="p-2 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Digite manualmente
            </div>
            <input
              ref={inputRef}
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmManual();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setManualMode(false);
                }
              }}
              placeholder="Ex.: Saver Deluxe"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setManualMode(false)}
                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmManual}
                disabled={!manualValue.trim()}
                className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                Usar
              </button>
            </div>
          </div>
        ) : (
          <ul className="max-h-72 overflow-auto">
            {options.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => pick(opt)}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                    value === opt && "bg-accent font-medium",
                  )}
                >
                  {opt}
                </button>
              </li>
            ))}
            {isCustom ? (
              <li>
                <div className="flex w-full items-center rounded-sm bg-accent/50 px-2 py-1.5 text-left text-sm font-medium">
                  {value}
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                    manual
                  </span>
                </div>
              </li>
            ) : null}
            <li className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PenLine className="h-3.5 w-3.5" />
                Outras (digitar manualmente)
              </button>
            </li>
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
