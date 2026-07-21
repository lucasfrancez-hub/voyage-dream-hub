import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Cloud, Download, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { previewMondeSale, importMondeSale, type MondeSalePreview } from "@/lib/monde-sales.functions";
import { formatBRL } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: (orderId: string) => void;
};

const KIND_LABEL: Record<string, string> = {
  flight: "Aéreo", hotel: "Hotel", cruise: "Cruzeiro", insurance: "Seguro",
  train: "Trem", ground: "Transfer", car: "Locação", package: "Pacote",
};

export function MondeSaleImportDialog({ open, onOpenChange, onImported }: Props) {
  const preview = useServerFn(previewMondeSale);
  const doImport = useServerFn(importMondeSale);
  const [num, setNum] = useState("");
  const [data, setData] = useState<MondeSalePreview | null>(null);

  const previewMut = useMutation({
    mutationFn: async (n: number) => preview({ data: { sale_number: n } }),
    onSuccess: (d) => setData(d),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const importMut = useMutation({
    mutationFn: async (n: number) => doImport({ data: { sale_number: n } }),
    onSuccess: (r) => {
      toast.success(`Pedido ${r.order_number} criado a partir da venda Monde.`);
      onImported?.(r.order_id);
      handleClose(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao importar"),
  });

  function submit() {
    const n = parseInt(num.replace(/\D+/g, ""), 10);
    if (!n || n < 1) { toast.error("Digite o número da venda"); return; }
    setData(null);
    previewMut.mutate(n);
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) { setNum(""); setData(null); }
  }

  const busy = previewMut.isPending || importMut.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4" /> Importar venda do Monde
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="Número da venda (ex.: 391)"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <Button onClick={submit} disabled={busy}>
            {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1">Buscar</span>
          </Button>
        </div>

        {previewMut.isPending && (
          <p className="text-xs text-muted-foreground">
            Buscando na API do Monde… (pode levar alguns segundos, paginamos até achar o número)
          </p>
        )}

        {data && (
          <div className="mt-2 max-h-[520px] overflow-y-auto rounded-md border border-border p-4 space-y-4">
            {data.already_imported_order_id && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Esta venda já foi importada.
                <Link
                  to="/admin/pedidos/$id"
                  params={{ id: data.already_imported_order_id }}
                  className="underline inline-flex items-center gap-1"
                  onClick={() => handleClose(false)}
                >
                  Abrir pedido <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            <div>
              <div className="text-xs uppercase text-muted-foreground">Venda</div>
              <div className="font-semibold">#{data.sale_number} · {new Date(data.sale_date).toLocaleDateString("pt-BR")}</div>
              <div className="text-xs text-muted-foreground">
                Situação: {data.status} · Vendedor: {data.travel_agent_name ?? "—"}
              </div>
              {data.observations && (
                <div className="mt-1 text-xs italic text-muted-foreground">"{data.observations}"</div>
              )}
            </div>

            <div>
              <div className="text-xs uppercase text-muted-foreground">Pagador</div>
              <div className="text-sm">{data.payer.name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {data.payer.cpf_cnpj ?? "—"} · {data.payer.email ?? "sem e-mail"} · {data.payer.phone ?? "sem telefone"}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">
                Itens ({data.items.length})
              </div>
              {data.items.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nenhum item na venda.</div>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {data.items.map((it, i) => (
                    <li key={i} className="p-2 text-sm flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-brand-orange font-semibold">{KIND_LABEL[it.kind] ?? it.kind}</div>
                        <div className="truncate">{it.title || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.locator ? `Localizador: ${it.locator} · ` : ""}
                          {it.begin ? new Date(it.begin).toLocaleDateString("pt-BR") : "—"}
                          {it.end ? ` → ${new Date(it.end).toLocaleDateString("pt-BR")}` : ""}
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="font-semibold">{formatBRL(it.customer_amount)}</div>
                        {it.fees > 0 && <div className="text-xs text-muted-foreground">Taxas: {formatBRL(it.fees)}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">
                Passageiros ({data.passengers.length})
              </div>
              {data.passengers.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nenhum passageiro identificado.</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {data.passengers.map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{i + 1}.</span>
                      <span>{p.name}</span>
                      {p.cpf && <span className="text-xs text-muted-foreground">CPF {p.cpf}</span>}
                      {p.birth_date && (
                        <span className="text-xs text-muted-foreground">
                          · {new Date(p.birth_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex justify-between"><span>Produtos</span><span>{formatBRL(data.totals.products)}</span></div>
              <div className="flex justify-between"><span>Taxas</span><span>{formatBRL(data.totals.fees)}</span></div>
              <div className="flex justify-between"><span>Descontos</span><span>-{formatBRL(data.totals.discount)}</span></div>
              <div className="mt-1 flex justify-between font-bold border-t border-border pt-1">
                <span>Total</span><span>{formatBRL(data.totals.final_value)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>Fechar</Button>
          {data && !data.already_imported_order_id && (
            <Button
              onClick={() => importMut.mutate(data.sale_number)}
              disabled={busy}
              className="gap-2"
            >
              {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Criar pedido
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
