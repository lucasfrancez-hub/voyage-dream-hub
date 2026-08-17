/**
 * Filtros responsivos do motor de busca.
 *
 * Desktop (lg+): o painel continua na lateral, como hoje.
 * Mobile/tablet estreito: os resultados vêm primeiro — aqui aparece só um
 * botão compacto "Filtros (n)" que abre o painel em bottom sheet.
 */
import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FiltersAside({
  count = 0,
  className,
  label = "Filtros",
  children,
}: {
  /** Quantidade de filtros aplicados (mostrada no botão do mobile). */
  count?: number;
  /** Classes do <aside> no desktop. */
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className={cn("hidden lg:block", className)}>{children}</aside>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground shadow-sm backdrop-blur transition active:scale-95"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
          {label}
          {count > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              {count}
            </span>
          )}
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="flex max-h-[88vh] flex-col gap-0 rounded-t-3xl p-0"
          >
            <SheetHeader className="border-b border-border/40 px-4 py-3 text-left">
              <SheetTitle className="text-base">{label}</SheetTitle>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {children}
            </div>

            <div className="border-t border-border/40 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button className="w-full" onClick={() => setOpen(false)}>
                Ver resultados
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
