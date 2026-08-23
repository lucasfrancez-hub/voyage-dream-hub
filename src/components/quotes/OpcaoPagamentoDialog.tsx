/**
 * Condições de pagamento manuais de UMA opção do orçamento.
 * Permite ligar/desligar cartão, boleto e Pix e definir valores reais
 * (parcelas, valor da parcela, entrada e data limite de pagamento).
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Barcode, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { definirPagamentoOpcao } from "@/lib/quotes/items.functions";
import {
  emptyPaymentOverride,
  type ManualRow,
  type OptionPaymentOverride,
} from "@/lib/public-quote/payment-override";

type Props = {
  quoteId: string;
  optionNumber: number;
  optionLabel: string;
  atual?: OptionPaymentOverride | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
};

const num = (v: string): number | null => {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const txt = (v: number | null | undefined) => (v == null ? "" : String(v));

/** Tabela de faixas: para cada quantidade de parcelas, 1ª parcela e demais. */
function FaixasEditor({
  rows,
  onChange,
  max = 12,
}: {
  rows: ManualRow[];
  onChange: (rows: ManualRow[]) => void;
  max?: number;
}) {
  const get = (n: number) => rows.find((r) => r.parcelas === n) ?? null;
  const setCampo = (n: number, campo: "entrada" | "demais", valor: number | null) => {
    const atual = get(n);
    const nova: ManualRow = { parcelas: n, entrada: null, demais: null, ...(atual ?? {}) };
    nova[campo] = valor;
    const resto = rows.filter((r) => r.parcelas !== n);
    const manter = (nova.entrada ?? 0) > 0 || (nova.demais ?? 0) > 0;
    onChange([...resto, ...(manter ? [nova] : [])].sort((a, b) => a.parcelas - b.parcelas));
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="grid grid-cols-[52px_1fr_1fr] gap-2 border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Parc.</span>
        <span>1ª parcela</span>
        <span>Demais</span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {Array.from({ length: max - 1 }, (_, i) => i + 2).map((n) => {
          const r = get(n);
          return (
            <div key={n} className="grid grid-cols-[52px_1fr_1fr] items-center gap-2 px-2 py-1">
              <span className="text-xs font-semibold">{n}x</span>
              <Input
                className="h-8"
                inputMode="decimal"
                placeholder="—"
                value={txt(r?.entrada ?? null)}
                onChange={(e) => setCampo(n, "entrada", num(e.target.value))}
              />
              <Input
                className="h-8"
                inputMode="decimal"
                placeholder="—"
                value={txt(r?.demais ?? null)}
                onChange={(e) => setCampo(n, "demais", num(e.target.value))}
              />
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
        Preencha só as faixas que quer oferecer. Em branco = não aparece.
      </p>
    </div>
  );
}

export function OpcaoPagamentoDialog({
  quoteId,
  optionNumber,
  optionLabel,
  atual,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const [ov, setOv] = useState<OptionPaymentOverride>(atual ?? emptyPaymentOverride());

  useEffect(() => {
    if (open) setOv(atual ?? emptyPaymentOverride());
  }, [open, atual]);

  const salvar = useServerFn(definirPagamentoOpcao);
  const mutation = useMutation({
    mutationFn: (override: OptionPaymentOverride | null) =>
      salvar({ data: { quoteId, optionNumber, override } }),
    onSuccess: () => {
      toast.success("Condições de pagamento salvas");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const set = (patch: Partial<OptionPaymentOverride>) => setOv((o) => ({ ...o, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamento — {optionLabel}</DialogTitle>
          <DialogDescription>
            Defina manualmente o que esta opção aceita e os valores exibidos ao cliente. Campos em
            branco seguem o cálculo automático.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm">
          <span className="font-medium">Usar condições manuais nesta opção</span>
          <Switch checked={ov.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        </label>

        <fieldset disabled={!ov.enabled} className="space-y-4 disabled:opacity-50">
          {/* Cartão */}
          <div className="space-y-3 rounded-xl border border-border p-3">
            <label className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" /> Cartão de crédito
              </span>
              <Switch
                checked={ov.card.enabled}
                onCheckedChange={(v) => set({ card: { ...ov.card, enabled: v } })}
              />
            </label>
            {ov.card.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Faixas de parcelamento (R$)</Label>
                  <FaixasEditor
                    rows={ov.card.rows ?? []}
                    max={12}
                    onChange={(rows) => set({ card: { ...ov.card, rows } })}
                  />
                </div>
                <label className="col-span-2 flex items-center justify-between text-xs text-muted-foreground">
                  Exibir como “sem juros”
                  <Switch
                    checked={ov.card.interestFree}
                    onCheckedChange={(v) => set({ card: { ...ov.card, interestFree: v } })}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Boleto */}
          <div className="space-y-3 rounded-xl border border-border p-3">
            <label className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <Barcode className="h-4 w-4 text-primary" /> Boleto
              </span>
              <Switch
                checked={ov.boleto.enabled}
                onCheckedChange={(v) => set({ boleto: { ...ov.boleto, enabled: v } })}
              />
            </label>
            {ov.boleto.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Faixas de parcelamento (R$)</Label>
                  <FaixasEditor
                    rows={ov.boleto.rows ?? []}
                    max={10}
                    onChange={(rows) => set({ boleto: { ...ov.boleto, rows } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data limite de quitação</Label>
                  <Input
                    type="date"
                    value={ov.boleto.dueDate ?? ""}
                    onChange={(e) =>
                      set({ boleto: { ...ov.boleto, dueDate: e.target.value || null } })
                    }
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Observação do boleto</Label>
                  <Input
                    placeholder="ex.: sujeito à aprovação"
                    value={ov.boleto.note ?? ""}
                    onChange={(e) => set({ boleto: { ...ov.boleto, note: e.target.value || null } })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Pix */}
          <div className="space-y-3 rounded-xl border border-border p-3">
            <label className="flex items-center justify-between text-sm font-medium">
              <span>Pix</span>
              <Switch
                checked={ov.pix.enabled}
                onCheckedChange={(v) => set({ pix: { ...ov.pix, enabled: v } })}
              />
            </label>
            {ov.pix.enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Valor no Pix (R$)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="automático"
                    value={txt(ov.pix.total)}
                    onChange={(e) => set({ pix: { ...ov.pix, total: num(e.target.value) } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Desconto (%)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    value={txt(ov.pix.discountPercent)}
                    onChange={(e) =>
                      set({ pix: { ...ov.pix, discountPercent: num(e.target.value) } })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data limite de pagamento</Label>
              <Input
                type="date"
                value={ov.dueDate ?? ""}
                onChange={(e) => set({ dueDate: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação ao cliente</Label>
              <Input
                placeholder="ex.: valores sujeitos a reajuste"
                value={ov.note ?? ""}
                onChange={(e) => set({ note: e.target.value || null })}
              />
            </div>
          </div>
        </fieldset>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(null)}
          >
            Voltar ao automático
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate(ov)}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
