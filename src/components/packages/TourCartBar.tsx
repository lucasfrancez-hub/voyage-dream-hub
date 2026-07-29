import { ShoppingBag, Trash2, X } from "lucide-react";
import { useState } from "react";

import { formatBRL } from "@/lib/format";
import type { CartItem } from "./TourResultCard";

export function TourCartBar({
  items,
  onRemove,
  onCheckout,
}: {
  items: CartItem[];
  onRemove: (key: string) => void;
  onCheckout: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + i.unit * i.qty, 0);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(92vw,22rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-bold">Meu carrinho</h4>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <ul className="max-h-64 space-y-3 overflow-auto">
            {items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {i.date.split("-").reverse().join("/")}
                    {i.modality ? ` · ${i.modality}` : ""} · {i.qty}x
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand-orange">
                  {formatBRL(i.unit * i.qty)}
                </span>
                <button type="button" onClick={() => onRemove(i.key)} aria-label="Remover">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Total</span>
            <span className="font-display text-xl font-black">{formatBRL(total)}</span>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            className="mt-3 w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground"
          >
            Finalizar reserva
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full bg-brand-orange px-5 py-3 text-sm font-bold text-primary-foreground shadow-xl"
      >
        <span className="relative">
          <ShoppingBag className="h-5 w-5" />
          <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-black text-brand-orange">
            {items.length}
          </span>
        </span>
        {formatBRL(total)}
      </button>
    </div>
  );
}
