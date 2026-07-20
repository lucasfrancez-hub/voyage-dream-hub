import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Loader2,
  Package,
  User,
  Users,
  Ticket,
  Plane,
  Receipt,
  FileText,
  LayoutGrid,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { searchGlobal, type GlobalSearchResult } from "@/lib/global-search.functions";

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
      {open && <SpotlightDialog onClose={() => setOpen(false)} />}
    </>
  );
}

const TYPE_META: Record<
  GlobalSearchResult["type"],
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  pedido: { label: "Pedido", icon: Ticket, color: "text-brand-orange" },
  passageiro: { label: "Passageiro", icon: User, color: "text-sky-400" },
  localizador: { label: "Localizador", icon: Plane, color: "text-emerald-400" },
  pessoa: { label: "Pessoa", icon: Users, color: "text-violet-400" },
  pacote: { label: "Pacote", icon: Package, color: "text-amber-400" },
  financeiro: { label: "Financeiro", icon: Wallet, color: "text-lime-400" },
  nfse: { label: "NFS-e", icon: Receipt, color: "text-pink-400" },
  pagina: { label: "Página", icon: LayoutGrid, color: "text-muted-foreground" },
};

function SpotlightDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const runSearch = useServerFn(searchGlobal);

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
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const grouped = useMemo(() => {
    const map = new Map<GlobalSearchResult["type"], GlobalSearchResult[]>();
    for (const r of results) {
      const list = map.get(r.type) ?? [];
      list.push(r);
      map.set(r.type, list);
    }
    const order: GlobalSearchResult["type"][] = [
      "pagina",
      "pedido",
      "passageiro",
      "localizador",
      "pessoa",
      "pacote",
      "financeiro",
      "nfse",
    ];
    return order.filter((t) => map.has(t)).map((t) => ({ type: t, items: map.get(t)! }));
  }, [results]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  function go(r: GlobalSearchResult) {
    onClose();
    if (r.params) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: r.to as any, params: r.params as any });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: r.to as any });
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[active];
      if (r) go(r);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-md pt-[15vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-neutral-900/95 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de busca — estilo Spotlight */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar em todo o sistema…"
            className="flex-1 bg-transparent outline-none text-lg text-foreground placeholder:text-muted-foreground/60"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground/60 border border-white/10 rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        {/* Resultados */}
        <div className="max-h-[55vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground/70">
              Pesquise por pedidos, passageiros, localizadores, pessoas, pacotes, financeiro, NFS-e ou páginas.
            </div>
          ) : flat.length === 0 && !loading ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground/70">
              Nenhum resultado.
            </div>
          ) : (
            <div className="py-2">
              {grouped.map((group) => {
                const meta = TYPE_META[group.type];
                return (
                  <div key={group.type} className="mb-1">
                    <div className="px-5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      {meta.label}
                    </div>
                    <ul>
                      {group.items.map((r) => {
                        const idx = flat.indexOf(r);
                        const isActive = idx === active;
                        const Icon = TYPE_META[r.type].icon;
                        return (
                          <li key={r.id}>
                            <button
                              onMouseEnter={() => setActive(idx)}
                              onClick={() => go(r)}
                              className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition-colors ${
                                isActive ? "bg-white/5" : "hover:bg-white/[0.03]"
                              }`}
                            >
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${TYPE_META[r.type].color}`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-foreground truncate">{r.title}</div>
                                {r.subtitle && (
                                  <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                                )}
                              </div>
                              {r.badge && (
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border border-white/10 rounded px-1.5 py-0.5">
                                  {r.badge}
                                </span>
                              )}
                              <ArrowRight
                                className={`h-4 w-4 transition-opacity ${
                                  isActive ? "opacity-100 text-brand-orange" : "opacity-0"
                                }`}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé com dicas */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-white/5 text-[10px] text-muted-foreground/60">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="border border-white/10 rounded px-1">↑</kbd>{" "}
              <kbd className="border border-white/10 rounded px-1">↓</kbd> navegar
            </span>
            <span>
              <kbd className="border border-white/10 rounded px-1">↵</kbd> abrir
            </span>
          </div>
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {flat.length > 0 && <span>{flat.length} resultados</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
