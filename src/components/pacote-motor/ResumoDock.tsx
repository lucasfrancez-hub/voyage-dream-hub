import { useState, type ReactNode } from "react";
import { ShoppingBag } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Resumo do pacote nas telas de troca (aéreo, hospedagem, serviços).
 * Desktop: coluna fixa de sempre.
 * Celular: botão flutuante (estilo cesta) que abre o resumo em bottom sheet.
 */
export function ResumoDock({ children, total }: { children: ReactNode; total?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="hidden md:contents">{children}</div>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-2xl transition active:scale-95"
        >
          <ShoppingBag className="h-4 w-4" />
          Resumo{total ? ` · ${total}` : ""}
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 rounded-t-3xl p-0">
            <SheetHeader className="border-b border-border/40 px-4 py-3 text-left">
              <SheetTitle className="text-base">Resumo do pacote</SheetTitle>
            </SheetHeader>
            <div className="mkt min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent p-3">
              {children}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
