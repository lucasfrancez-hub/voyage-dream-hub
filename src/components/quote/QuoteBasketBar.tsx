/**
 * Barra flutuante da cesta de orçamento do motor interno.
 * Junta vários voos salvos e gera UM orçamento com várias opções.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarOrcamentoManual } from "@/lib/quotes/quotes.functions";
import {
  clearQuoteBasket,
  removeFromQuoteBasket,
  useQuoteBasket,
} from "@/lib/quote-basket";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function QuoteBasketBar() {
  const itens = useQuoteBasket();
  const [aberto, setAberto] = useState(false);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [consultant, setConsultant] = useState("");
  const navigate = useNavigate();
  const criar = useServerFn(criarOrcamentoManual);

  const primeiro = itens[0];
  const tituloPadrao = primeiro
    ? `${primeiro.origin ?? ""} → ${primeiro.destination ?? ""} — ${itens.length} opção(ões) de voo`
    : "";

  const mut = useMutation({
    mutationFn: () =>
      criar({
        data: {
          title: (title.trim() || tituloPadrao).slice(0, 160),
          clientName: clientName.trim() || null,
          clientPhone: clientPhone.trim() || null,
          consultant: consultant.trim() || null,
          origin: primeiro?.origin ?? null,
          destination: primeiro?.destination ?? null,
          startDate: primeiro?.startDate ?? null,
          endDate: primeiro?.endDate ?? null,
          adults: primeiro?.adults ?? 1,
          children: primeiro?.children ?? 0,
          options: itens.map((i, idx) => ({
            label: i.label || `Opção ${idx + 1}`,
            total: i.total,
            services: i.services.slice(0, 20),
            flights: (i.flights ?? []) as unknown as Record<string, unknown>[],
            notes: i.notes,
          })),
        },
      }),
    onSuccess: (r) => {
      const quoteId = (r as { quoteId: string }).quoteId;
      clearQuoteBasket();
      setAberto(false);
      toast.success("Orçamento criado com as opções de voo");
      void navigate({ to: "/admin/orcamentos/$id", params: { id: quoteId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (itens.length === 0) return null;

  return (
    <>
      <div className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-[var(--shadow-card)] backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Cesta de orçamento
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {itens.map((i) => (
              <span
                key={i.id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium"
              >
                {i.label} • {brl(i.total)}
                <button
                  type="button"
                  aria-label={`Remover ${i.label}`}
                  onClick={() => removeFromQuoteBasket(i.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => clearQuoteBasket()}>
          <Trash2 className="h-4 w-4" /> Limpar
        </Button>
        <Button
          className="shrink-0 text-xs font-black uppercase tracking-[0.15em]"
          onClick={() => {
            setTitle((t) => t || tituloPadrao);
            setAberto(true);
          }}
        >
          <FileText className="h-4 w-4" /> Gerar orçamento ({itens.length})
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar orçamento com {itens.length} opção(ões)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Cliente</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Consultor</Label>
              <Input value={consultant} onChange={(e) => setConsultant(e.target.value)} />
            </div>
            <ul className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
              {itens.map((i, idx) => (
                <li key={i.id}>
                  <span className="font-semibold text-foreground">
                    Opção {idx + 1}: {i.label}
                  </span>{" "}
                  — {brl(i.total)}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar orçamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
