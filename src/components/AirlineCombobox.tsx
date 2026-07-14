import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
  /** Allow user to keep a free-form (not-in-registry) name typed in the search box. */
  allowCustom?: boolean;
};

/**
 * Searchable airline picker (Combobox) with logo + name. Type to filter by IATA
 * code, name, or alias. Selecting sets `onChange(airline.name)`.
 */
export function AirlineCombobox({
  value,
  onChange,
  placeholder = "Selecione a companhia…",
  className,
  triggerClassName,
  disabled,
  allowCustom = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const found = findAirline(value);
  const display = found?.name ?? (value ?? "");

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
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
            {found || value ? (
              <AirlineLogo airline={value} size={22} />
            ) : null}
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
        <PopoverContent
          className="w-[min(360px,90vw)] p-0"
          align="start"
        >
          <Command
            filter={(itemValue, search) => {
              const q = search.trim().toLowerCase();
              if (!q) return 1;
              return itemValue.toLowerCase().includes(q) ? 1 : 0;
            }}
          >
            <CommandInput
              placeholder="Buscar por nome ou código (ex: LA, latam)…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {allowCustom && query.trim() ? (
                  <button
                    type="button"
                    onClick={() => handleSelect(query.trim())}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    Usar “{query.trim()}” assim mesmo
                  </button>
                ) : (
                  "Nenhuma companhia encontrada."
                )}
              </CommandEmpty>
              <CommandGroup>
                {AIRLINES.map((a) => {
                  const selected = found?.iata === a.iata;
                  const searchable = [
                    a.iata,
                    a.name,
                    ...(a.aliases ?? []),
                  ].join(" ");
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
