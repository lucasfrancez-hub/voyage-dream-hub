import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Bloco colapsável usado nos formulários de "Cofre" (link seguro, convencional, boleto).
 * Recolhe campos avançados por padrão para reduzir a carga cognitiva.
 */
export function CollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  filledCount,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  filledCount?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {typeof filledCount === "number" && filledCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-brand-orange/15 text-brand-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                {filledCount} preenchidos
              </span>
            )}
          </div>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3 bg-background/40">{children}</div>}
    </div>
  );
}

/** Cabeçalho do bloco "Essencial" — sempre visível. */
export function EssentialGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pl-3 border-l-2 border-brand-orange">
        <span className="text-[11px] font-bold uppercase tracking-widest text-brand-orange">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
