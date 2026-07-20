import { useEffect, useRef, useState } from "react";
import { Search, Loader2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { searchOrders } from "@/lib/orders.functions";

export function GlobalSearchButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Pesquisar (⌘K)"
        aria-label="Pesquisar"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand-orange hover:text-brand-orange"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
      {open && <GlobalSearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function GlobalSearchDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const runSearch = useServerFn(searchOrders);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await runSearch({ data: { q: query } });
        setResults(Array.isArray(r) ? r : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  function go(id: string) {
    onClose();
    navigate({ to: "/admin/pedidos/$id", params: { id } });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar por nome, localizador, número do pedido, CPF…"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              Digite ao menos 2 caracteres — nome, localizador, CPF, número do pedido…
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nenhum resultado.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => go(r.id)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
                      <span className="font-mono">#{r.order_number ?? r.id.slice(0, 8).toUpperCase()}</span>
                      {r.supplier_order_number && (
                        <span className="font-mono text-brand-orange">{r.supplier_order_number}</span>
                      )}
                      <span className="ml-auto uppercase tracking-wide text-[10px] text-muted-foreground/70">
                        {r.matched}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-foreground truncate">
                      {r.trip_title || r.full_name || r.payer_full_name || "Pedido"}
                    </div>
                    {r.full_name && r.trip_title && (
                      <div className="text-xs text-muted-foreground truncate">{r.full_name}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
