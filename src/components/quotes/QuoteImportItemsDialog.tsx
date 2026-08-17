/**
 * Importação de itens do orçamento a partir de um arquivo (PDF ou imagem):
 * a IA lê o documento, mostra o que encontrou e o consultor confirma o que
 * deve entrar no orçamento.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Hotel, Loader2, Package, Plane, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import { aplicarItensExtraidos, lerArquivoOrcamento, type ExtractedQuoteItems } from "@/lib/quotes/items.functions";
import type { QuoteItemKind } from "./QuoteItemFormDialog";

const MAX_BYTES = 12 * 1024 * 1024;

async function toBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  optionNumber: number;
  foco: QuoteItemKind;
  onSaved: () => void;
};

export function QuoteImportItemsDialog({ open, onOpenChange, quoteId, optionNumber, foco, onSaved }: Props) {
  const ler = useServerFn(lerArquivoOrcamento);
  const aplicar = useServerFn(aplicarItensExtraidos);

  const [dragging, setDragging] = useState(false);
  const [resultado, setResultado] = useState<ExtractedQuoteItems | null>(null);
  const [sel, setSel] = useState<{ hotels: boolean[]; flights: boolean[]; services: boolean[] }>({
    hotels: [], flights: [], services: [],
  });

  const leitura = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Arquivo muito grande (máx. 12 MB)");
      const fileBase64 = await toBase64(file);
      return ler({
        data: {
          filename: file.name,
          mimeType: file.type || "application/pdf",
          fileBase64,
          foco,
        },
      });
    },
    onSuccess: (r) => {
      setResultado(r);
      setSel({
        hotels: r.hotels.map(() => true),
        flights: r.flights.map(() => true),
        services: r.services.map(() => true),
      });
      const qtd = r.hotels.length + r.flights.length + r.services.length;
      if (qtd === 0) toast.warning("A IA não encontrou itens neste documento.");
      else toast.success(`${qtd} item(ns) encontrado(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao ler o arquivo"),
  });

  const gravacao = useMutation({
    mutationFn: async () => {
      if (!resultado) throw new Error("Nada para salvar");
      const payload = {
        quoteId,
        optionNumber,
        hotels: resultado.hotels.filter((_, i) => sel.hotels[i]),
        flights: resultado.flights.filter((_, i) => sel.flights[i]),
        services: resultado.services.filter((_, i) => sel.services[i]),
      };
      const qtd = payload.hotels.length + payload.flights.length + payload.services.length;
      if (qtd === 0) throw new Error("Selecione ao menos um item");
      return aplicar({ data: payload as never });
    },
    onSuccess: () => {
      toast.success("Itens adicionados ao orçamento");
      fechar(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar itens"),
  });

  function fechar(v: boolean) {
    if (!v) {
      setResultado(null);
      setSel({ hotels: [], flights: [], services: [] });
    }
    onOpenChange(v);
  }

  function pegarArquivo(files: FileList | null) {
    const file = files?.[0];
    if (file) leitura.mutate(file);
  }

  const total =
    (resultado?.hotels.length ?? 0) + (resultado?.flights.length ?? 0) + (resultado?.services.length ?? 0);

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-orange" /> Importar com IA
          </DialogTitle>
        </DialogHeader>

        {!resultado && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pegarArquivo(e.dataTransfer.files); }}
            className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
              dragging ? "border-brand-orange bg-brand-orange/5" : "border-border"
            }`}
          >
            {leitura.isPending ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
                Lendo o documento com a IA…
              </div>
            ) : (
              <>
                <FileUp className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Arraste o PDF ou a imagem aqui</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Voucher, cotação, itinerário ou print — a IA converte em itens do orçamento.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand-orange px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:brightness-110">
                  Selecionar arquivo
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => pegarArquivo(e.target.files)}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {resultado && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {total} item(ns) encontrado(s). Desmarque o que não deve entrar.
            </p>

            {resultado.hotels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Hotel className="h-3.5 w-3.5" /> Hospedagem
                </div>
                {resultado.hotels.map((h, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <Checkbox
                      checked={sel.hotels[i] ?? false}
                      onCheckedChange={(v) =>
                        setSel((s) => ({ ...s, hotels: s.hotels.map((x, xi) => (xi === i ? Boolean(v) : x)) }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{h.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[h.city, h.roomDescription, h.board].filter(Boolean).join(" · ") || "—"}
                        {h.checkin ? ` · ${h.checkin} → ${h.checkout ?? ""}` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {h.total ? formatBRL(Number(h.total)) : "—"}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {resultado.flights.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Plane className="h-3.5 w-3.5" /> Aéreo
                </div>
                {resultado.flights.map((f, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <Checkbox
                      checked={sel.flights[i] ?? false}
                      onCheckedChange={(v) =>
                        setSel((s) => ({ ...s, flights: s.flights.map((x, xi) => (xi === i ? Boolean(v) : x)) }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {f.direction === "INBOUND" ? "Volta" : "Ida"} · {f.fromIata ?? "—"} → {f.toIata ?? "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[f.airline, f.departure, `${f.segments.length} trecho(s)`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {f.total ? formatBRL(Number(f.total)) : "—"}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {resultado.services.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Package className="h-3.5 w-3.5" /> Serviços
                </div>
                {resultado.services.map((s, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <Checkbox
                      checked={sel.services[i] ?? false}
                      onCheckedChange={(v) =>
                        setSel((st) => ({ ...st, services: st.services.map((x, xi) => (xi === i ? Boolean(v) : x)) }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[s.description, s.date].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {s.total ? formatBRL(Number(s.total)) : "—"}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {total === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nada foi identificado. Tente outro arquivo ou adicione manualmente.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {resultado && (
            <Button variant="ghost" onClick={() => setResultado(null)}>Trocar arquivo</Button>
          )}
          <Button variant="ghost" onClick={() => fechar(false)}>Fechar</Button>
          {resultado && total > 0 && (
            <Button onClick={() => gravacao.mutate()} disabled={gravacao.isPending} className="gap-2">
              {gravacao.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar ao orçamento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
