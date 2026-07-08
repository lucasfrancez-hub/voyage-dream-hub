import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Vault, Copy, ExternalLink, MessageCircle, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { splitInstallments, whatsappUrl } from "@/lib/checkout-config";
import {
  listCofreEntries,
  deleteCofreEntry,
  type CofreEntry,
} from "@/lib/cofre-storage";

export const Route = createFileRoute("/admin/cofre")({
  component: CofrePage,
});

function CofrePage() {
  const [entries, setEntries] = useState<CofreEntry[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setEntries(listCofreEntries());
  }, []);

  const filtered = entries.filter((e) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      (e.customer || "").toLowerCase().includes(q) ||
      (e.orderRef || "").toLowerCase().includes(q) ||
      (e.customerPhone || "").includes(q)
    );
  });

  function refresh() {
    setEntries(listCofreEntries());
  }

  function onDelete(id: string) {
    deleteCofreEntry(id);
    refresh();
    toast.success("Link removido do cofre");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
        <Vault className="h-4 w-4" /> Cofre Via Air
      </div>
      <h1 className="mt-1 font-display text-3xl font-bold">Links de pagamento gerados</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Histórico dos links criados neste navegador. Copie, reenvie ou abra novamente
        quando precisar.
      </p>

      <div className="mt-6 relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por cliente, descrição ou referência…"
          className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
        />
      </div>

      <div className="mt-6 space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum link no cofre ainda. Gere um em <code>/admin/link-pagamento</code>.
          </div>
        )}

        {filtered.map((e) => {
          const split = splitInstallments(e.total, e.installments, e.firstAmount);
          const parcelaLabel = split.equal
            ? `${e.installments}x de ${formatBRL(split.first)} sem juros`
            : `1ª de ${formatBRL(split.first)} + ${split.restCount}x de ${formatBRL(split.rest)}`;
          const whatsMessage = `Olá${e.customer ? ` ${e.customer}` : ""}! Segue seu link de pagamento seguro Via Air:\n\n💳 ${e.description}\n💰 Total: ${formatBRL(e.total)}\n📆 ${parcelaLabel}\n\n🔒 ${e.url}\n\nQualquer dúvida estamos à disposição.`;
          const waHref = e.customerPhone
            ? `https://wa.me/${e.customerPhone}?text=${encodeURIComponent(whatsMessage)}`
            : whatsappUrl(whatsMessage);

          return (
            <div key={e.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("pt-BR")}
                    {e.orderRef ? ` · Ref: ${e.orderRef}` : ""}
                  </div>
                  <div className="mt-1 font-semibold truncate">{e.description}</div>
                  <div className="text-sm text-muted-foreground">
                    {e.customer || "Sem cliente"}
                    {e.customerPhone ? ` · ${e.customerPhone}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-display font-bold text-brand-orange">
                    {formatBRL(e.total)}
                  </div>
                  <div className="text-xs text-muted-foreground">{parcelaLabel}</div>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-background border border-border px-3 py-2 font-mono text-xs break-all">
                {e.url}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(e.url);
                    toast.success("Link copiado");
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </button>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir cofre
                </a>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs hover:border-brand-orange transition"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => onDelete(e.id)}
                  className="ml-auto inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
