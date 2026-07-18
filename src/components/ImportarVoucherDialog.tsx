import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { extractItemVoucher, type ExtractedItemVoucher } from "@/lib/voucher-item-extract.functions";
import { upsertOrderItem, upsertPassenger, upsertItemFinancial, updateOrderMeta } from "@/lib/orders.functions";
import { HotelAutocomplete } from "@/components/HotelAutocomplete";

type Props = {
  orderId: string;
  kind: "hotel" | "other";
  onImported: () => void;
  trigger: React.ReactNode;
};

const MAX_BYTES = 15 * 1024 * 1024;

// Normaliza entrada monetária BRL. Aceita "11.585,85", "11585,85", "11585.85".
function parseMoneyInputVoucher(raw: string): number | "" {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  const norm = hasComma && hasDot ? s.replace(/\./g, "").replace(",", ".") : hasComma ? s.replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export function ImportarVoucherDialog({ orderId, kind, onImported, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "review">("idle");
  const [extracted, setExtracted] = useState<ExtractedItemVoucher | null>(null);

  const extract = useServerFn(extractItemVoucher);
  const saveItem = useServerFn(upsertOrderItem);
  const savePax = useServerFn(upsertPassenger);
  const saveFin = useServerFn(upsertItemFinancial);
  const updateMeta = useServerFn(updateOrderMeta);

  function reset() {
    setFile(null);
    setExtracted(null);
    setPhase("idle");
  }

  async function processFile() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 15 MB. Envie um voucher menor.");
      return;
    }
    setPhase("uploading");
    try {
      const b64 = await fileToBase64(file);
      const result = await extract({ data: {
        filename: file.name,
        mimeType: file.type || "application/pdf",
        fileBase64: b64,
        kind,
      } });
      setExtracted(result);
      setPhase("review");
    } catch (e) {
      toast.error("Erro ao extrair: " + (e as Error).message);
      setPhase("idle");
    }
  }

  async function confirmar() {
    if (!extracted) return;
    try {
      const details: Record<string, unknown> = { ...(extracted.details ?? {}) };
      if (extracted.kind === "hotel" && extracted.details?.hotel_name && !details.hotel_name) {
        details.hotel_name = extracted.details.hotel_name;
      }
      const status: "confirmed" | "reserved" | "pending" = extracted.status ?? (extracted.supplier_locator ? "confirmed" : "reserved");
      const title = extracted.title?.trim() ||
        (extracted.kind === "hotel"
          ? `Hospedagem — ${String(details.hotel_name ?? "")}`.trim()
          : "Serviço");
      const saved = await saveItem({ data: {
        order_id: orderId,
        kind: extracted.kind,
        title,
        supplier_locator: extracted.supplier_locator ?? null,
        details: details as unknown as import("@/integrations/supabase/types").Json,
        status,
        sort_order: 0,
      } });

      const paxList = extracted.passengers ?? [];
      if (paxList.length && saved?.id) {
        const kindMap: Record<string, "ADT" | "CHD" | "INF"> = { adult: "ADT", child: "CHD", infant: "INF" };
        for (let i = 0; i < paxList.length; i++) {
          const p = paxList[i]!;
          if (!p.full_name?.trim()) continue;
          const cpf = (p.cpf ?? "").replace(/\D/g, "");
          await savePax({ data: {
            order_id: orderId,
            full_name: p.full_name.trim(),
            passenger_type: kindMap[p.kind ?? "adult"] ?? "ADT",
            birth_date: p.birth_date ?? null,
            cpf: cpf.length === 11 ? cpf : null,
            document: p.document ?? null,
            doc_type: cpf.length === 11 ? "cpf" : "cpf",
            sort_order: i,
          } });
        }
      }

      // Financeiro do item (valor + taxas)
      const value = Number(details.value ?? 0);
      const taxes = Number(details.tax_value ?? 0);
      if (saved?.id && (value > 0 || taxes > 0)) {
        await saveFin({ data: {
          order_item_id: saved.id,
          supplier_name: extracted.supplier_name ?? null,
          sale_value: value,
          tax_value: taxes,
          total: value,
          sort_order: 0,
        } });
      }

      // Localizador principal + fornecedor do pedido
      const metaPatch: Record<string, string | null> = {};
      if (extracted.supplier_locator?.trim()) metaPatch.airline_locator = extracted.supplier_locator.trim().toUpperCase();
      if (extracted.supplier_name?.trim()) metaPatch.supplier_name = extracted.supplier_name.trim();
      if (extracted.supplier_locator?.trim()) metaPatch.supplier_order_number = extracted.supplier_locator.trim();
      if (Object.keys(metaPatch).length > 0) {
        await updateMeta({ data: { id: orderId, ...metaPatch } });
      }

      toast.success("Voucher importado!");
      setOpen(false);
      reset();
      onImported();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    }
  }

  return (
    <>
      <span onClick={() => { reset(); setOpen(true); }}>{trigger}</span>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Importar voucher {kind === "hotel" ? "de hospedagem" : "de serviço"}
            </DialogTitle>
          </DialogHeader>

          {(phase === "idle" || phase === "uploading") && (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Anexe o voucher do fornecedor (PDF, JPG ou PNG). A IA vai extrair datas, nomes, endereços, políticas e demais dados.
                </p>
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  className="mt-3"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={phase === "uploading"}
                />
                {file && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={phase === "uploading"}>Cancelar</Button>
                <Button onClick={processFile} disabled={!file || phase === "uploading"} className="gap-2">
                  {phase === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {phase === "uploading" ? "Lendo voucher…" : "Extrair dados"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {phase === "review" && extracted && (
            <ReviewExtracted
              value={extracted}
              onChange={setExtracted}
              onCancel={reset}
              onConfirm={confirmar}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewExtracted({
  value, onChange, onCancel, onConfirm,
}: {
  value: ExtractedItemVoucher;
  onChange: (v: ExtractedItemVoucher) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isHotel = value.kind === "hotel";
  const d = (value.details ?? {}) as Record<string, unknown>;

  function patch(next: Partial<ExtractedItemVoucher>) {
    onChange({ ...value, ...next } as ExtractedItemVoucher);
  }
  function patchDetails(k: string, v: unknown) {
    onChange({ ...value, details: { ...d, [k]: v } } as ExtractedItemVoucher);
  }
  function patchPax(i: number, k: string, v: unknown) {
    const list = [...(value.passengers ?? [])];
    list[i] = { ...list[i], [k]: v };
    onChange({ ...value, passengers: list } as ExtractedItemVoucher);
  }
  function removePax(i: number) {
    const list = [...(value.passengers ?? [])];
    list.splice(i, 1);
    onChange({ ...value, passengers: list } as ExtractedItemVoucher);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
        <div className="text-sm text-emerald-800">
          Dados extraídos. Confira antes de salvar — você pode editar qualquer campo.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Título</Label>
          <Input value={value.title ?? ""} onChange={(e) => patch({ title: e.target.value })} />
        </div>
        <div>
          <Label>Fornecedor</Label>
          <Input value={value.supplier_name ?? ""} onChange={(e) => patch({ supplier_name: e.target.value })} />
        </div>
        <div>
          <Label>Localizador</Label>
          <Input value={value.supplier_locator ?? ""} onChange={(e) => patch({ supplier_locator: e.target.value.toUpperCase() })} />
        </div>
      </div>

      {isHotel ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome do hotel</Label>
              <Input value={String(d.hotel_name ?? "")} onChange={(e) => patchDetails("hotel_name", e.target.value)} />
            </div>
            <div>
              <Label>Estrelas</Label>
              <Input type="number" min={0} max={5} value={String(d.hotel_stars ?? "")} onChange={(e) => patchDetails("hotel_stars", e.target.value ? Number(e.target.value) : "")} />
            </div>
            <div>
              <Label>Regime</Label>
              <Input value={String(d.board ?? "")} onChange={(e) => patchDetails("board", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input value={String(d.address ?? "")} onChange={(e) => patchDetails("address", e.target.value)} />
            </div>
            <div>
              <Label>Quarto</Label>
              <Input value={String(d.room ?? "")} onChange={(e) => patchDetails("room", e.target.value)} />
            </div>
            <div>
              <Label>Hóspedes</Label>
              <Input value={String(d.guests ?? "")} onChange={(e) => patchDetails("guests", e.target.value)} />
            </div>
            <div>
              <Label>Check-in</Label>
              <Input type="date" value={String(d.check_in ?? "")} onChange={(e) => patchDetails("check_in", e.target.value)} />
            </div>
            <div>
              <Label>Check-out</Label>
              <Input type="date" value={String(d.check_out ?? "")} onChange={(e) => patchDetails("check_out", e.target.value)} />
            </div>
            <div>
              <Label>Noites</Label>
              <Input type="number" value={String(d.nights ?? "")} onChange={(e) => patchDetails("nights", e.target.value ? Number(e.target.value) : "")} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Input value={String(d.category ?? "")} onChange={(e) => patchDetails("category", e.target.value)} />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="number" value={String(d.quantity ?? "")} onChange={(e) => patchDetails("quantity", e.target.value ? Number(e.target.value) : "")} />
            </div>
            <div>
              <Label>Data início</Label>
              <Input type="date" value={String(d.date_from ?? "")} onChange={(e) => patchDetails("date_from", e.target.value)} />
            </div>
            <div>
              <Label>Hora início</Label>
              <Input type="time" value={String(d.time_from ?? "")} onChange={(e) => patchDetails("time_from", e.target.value)} />
            </div>
            <div>
              <Label>Data fim</Label>
              <Input type="date" value={String(d.date_to ?? "")} onChange={(e) => patchDetails("date_to", e.target.value)} />
            </div>
            <div>
              <Label>Hora fim</Label>
              <Input type="time" value={String(d.time_to ?? "")} onChange={(e) => patchDetails("time_to", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Local / endereço</Label>
              <Input value={String(d.address ?? "")} onChange={(e) => patchDetails("address", e.target.value)} />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Valor total</Label>
          <Input inputMode="decimal" value={String(d.value ?? "")} onChange={(e) => patchDetails("value", parseMoneyInputVoucher(e.target.value))} placeholder="0,00" />
        </div>
        <div>
          <Label>Taxas inclusas</Label>
          <Input inputMode="decimal" value={String(d.tax_value ?? "")} onChange={(e) => patchDetails("tax_value", parseMoneyInputVoucher(e.target.value))} placeholder="0,00" />
        </div>
        <div>
          <Label>Moeda</Label>
          <Input value={String(d.currency ?? "BRL")} onChange={(e) => patchDetails("currency", e.target.value.toUpperCase())} />
        </div>
      </div>

      <div>
        <Label>Políticas (cancelamento, reembolso, taxas)</Label>
        <Textarea rows={4} value={String(d.policies ?? "")} onChange={(e) => patchDetails("policies", e.target.value)} />
      </div>

      <div>
        <Label>Observações</Label>
        <Textarea rows={2} value={String(d.notes ?? "")} onChange={(e) => patchDetails("notes", e.target.value)} />
      </div>

      {(value.passengers?.length ?? 0) > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">
            {isHotel ? "Hóspedes" : "Participantes"} ({value.passengers!.length})
          </div>
          <div className="space-y-2">
            {value.passengers!.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_140px_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">Nome completo</Label>
                  <Input value={p.full_name ?? ""} onChange={(e) => patchPax(i, "full_name", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">CPF</Label>
                  <Input value={p.cpf ?? ""} onChange={(e) => patchPax(i, "cpf", e.target.value.replace(/\D/g, ""))} />
                </div>
                <div>
                  <Label className="text-xs">Nascimento</Label>
                  <Input type="date" value={p.birth_date ?? ""} onChange={(e) => patchPax(i, "birth_date", e.target.value)} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => removePax(i)}>Remover</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Voltar</Button>
        <Button onClick={onConfirm} className="gap-2">
          Confirmar e salvar <ChevronRight className="h-4 w-4" />
        </Button>
      </DialogFooter>
    </div>
  );
}
