import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, X, PenLine } from "lucide-react";
import { AIRLINES, findAirline } from "@/lib/airlines";
import { AirlineLogo } from "@/components/AirlineLogo";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type Props = {
  /** Current airline value (name or IATA code). */
  value: string | null | undefined;
  /** Called with the airline display name (e.g. "LATAM"). Empty string clears. */
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  /** Extra pill/input styling classes. */
  triggerClassName?: string;
  disabled?: boolean;
};

/**
 * Searchable airline picker (Combobox) with logo + name.
 * Includes a fixed "Outras" option at the bottom for manual entry.
 */
export function AirlineCombobox({
  value,
  onChange,
  placeholder = "Selecione a companhia…",
  className,
  triggerClassName,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  const found = findAirline(value);
  const display = found?.name ?? (value ?? "");

  useEffect(() => {
    if (manualMode) {
      setManualValue(found ? "" : (value ?? ""));
      // focus after render
      const t = setTimeout(() => manualInputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [manualMode, value, found]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
    setManualMode(false);
  };

  const confirmManual = () => {
    const v = manualValue.trim();
    if (!v) return;
    handleSelect(v);
  };

  return (
    <div className={cn("w-full", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setManualMode(false);
            setQuery("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              triggerClassName,
            )}
          >
            {value ? <AirlineLogo airline={value} size={22} /> : null}
            <span
              className={cn(
                "flex-1 truncate",
                !display && "text-muted-foreground",
              )}
            >
              {display || placeholder}
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
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(360px,90vw)] p-0" align="start">
          {manualMode ? (
            <div className="p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Digite o nome da companhia
              </div>
              <input
                ref={manualInputRef}
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
                placeholder="Ex.: JetBlue"
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
              <p className="text-[11px] text-muted-foreground">
                Você poderá informar a URL da logo depois no formulário.
              </p>
            </div>
          ) : (
            <Command
              filter={(itemValue, search) => {
                const q = search.trim().toLowerCase();
                if (!q) return 1;
                // Sempre manter a opção "outras" visível
                if (itemValue === "__outras__") return 1;
                return itemValue.toLowerCase().includes(q) ? 1 : 0;
              }}
            >
              <CommandInput
                placeholder="Buscar por nome ou código (ex.: LA, latam)…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList
                className="max-h-[320px] overflow-y-auto overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                <CommandEmpty>Nenhuma companhia encontrada.</CommandEmpty>
                <CommandGroup>
                  {AIRLINES.map((a) => {
                    const selected = found?.iata === a.iata;
                    const searchable = [a.iata, a.name, ...(a.aliases ?? [])].join(" ");
                    return (
                      <CommandItem
                        key={a.iata}
                        value={searchable}
                        onSelect={() => handleSelect(a.name)}
                        className="flex items-center gap-2"
                      >
                        <AirlineLogo airline={a.iata} size={24} />
                        <span className="flex-1 truncate">{a.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {a.iata}
                        </span>
                        <Check
                          className={cn(
                            "ml-1 h-4 w-4",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__outras__"
                    onSelect={() => setManualMode(true)}
                    className="flex items-center gap-2"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500">
                      <PenLine className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 truncate">Outras (digitar manualmente)</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
