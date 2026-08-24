import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Filtros do motor de pacotes.
 * Desktop: coluna lateral de sempre.
 * Celular: só um botão "Filtros" que abre o painel em bottom sheet,
 * igual ao motor de busca aéreo — a lista de resultados vem primeiro.
 */
export function FiltrosMkt({
  titulo,
  onLimpar,
  children,
}: {
  titulo: string;
  onLimpar: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const painel = (
    <>
      <div className="filter-head">
        {titulo}
        <button type="button" className="fclear" onClick={onLimpar}>
          Limpar
        </button>
      </div>
      <div className="filter-body">{children}</div>
    </>
  );

  return (
    <>
      <aside className="filters hidden md:block">{painel}</aside>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground shadow-sm backdrop-blur transition active:scale-95"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
          Filtros
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="flex max-h-[88vh] flex-col gap-0 rounded-t-3xl p-0">
            <SheetHeader className="border-b border-border/40 px-4 py-3 text-left">
              <SheetTitle className="text-base">{titulo}</SheetTitle>
            </SheetHeader>
            <div className="mkt min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent p-3">
              <div className="filters">{painel}</div>
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
