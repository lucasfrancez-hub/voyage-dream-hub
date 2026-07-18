import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload, CheckCircle2, ChevronRight, Plane, Hotel, Package as PackageIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  extractMultiVoucher,
  type MultiExtractResult,
  type MultiExtractedItem,
  type MultiPassenger,
} from "@/lib/multi-voucher-extract.functions";
import {
  upsertOrderItem,
  upsertPassenger,
  upsertItemFinancial,
  updateOrderMeta,
} from "@/lib/orders.functions";

type Props = {
  orderId: string;
  onImported: () => void;
  trigger: React.ReactNode;
};

const MAX_BYTES = 15 * 1024 * 1024;

function parseMoneyInput(raw: string): number | "" {
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

function kindLabel(k: MultiExtractedItem["kind"]) {
  return k === "flight" ? "Aéreo" : k === "hotel" ? "Hospedagem" : "Serviço";
}
function kindIcon(k: MultiExtractedItem["kind"]) {
  if (k === "flight") return <Plane className="h-4 w-4" />;
  if (k === "hotel") return <Hotel className="h-4 w-4" />;
  return <PackageIcon className="h-4 w-4" />;
}

export function ImportarMultiDialog({ orderId, onImported, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "review" | "saving">("idle");
  const [result, setResult] = useState<MultiExtractResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const extract = useServerFn(extractMultiVoucher);
  const saveItem = useServerFn(upsertOrderItem);
  const savePax = useServerFn(upsertPassenger);
  const saveFin = useServerFn(upsertItemFinancial);
  const updateMeta = useServerFn(updateOrderMeta);

  function reset() {
    setFile(null);
    setResult(null);
    setPhase("idle");
    setSelected({});
  }

  async function processFile() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 15 MB.");
      return;
    }
    setPhase("uploading");
    try {
      const b64 = await fileToBase64(file);
      const r = await extract({
        data: {
          filename: file.name,
          mimeType: file.type || "application/pdf",
          fileBase64: b64,
        },
      });
      if (!r.items.length) {
        toast.error("Nenhum item identificado no documento.");
        setPhase("idle");
        return;
      }
      setResult(r);
      const initSel: Record<number, boolean> = {};
      r.items.forEach((_, i) => (initSel[i] = true));
      setSelected(initSel);
      setPhase("review");
    } catch (e) {
      toast.error("Erro ao extrair: " + (e as Error).message);
      setPhase("idle");
    }
  }

  function patchItem(i: number, next: Partial<MultiExtractedItem>) {
    if (!result) return;
    const items = [...result.items];
    items[i] = { ...items[i], ...next } as MultiExtractedItem;
    setResult({ ...result, items });
  }
  function patchItemDetails(i: number, k: string, v: unknown) {
    if (!result) return;
    const items = [...result.items];
    const cur = items[i]!;
    items[i] = { ...cur, details: { ...(cur.details ?? {}), [k]: v } } as MultiExtractedItem;
    setResult({ ...result, items });
  }

  async function confirmar() {
    if (!result) return;
    setPhase("saving");
    try {
      // 1) Passageiros do documento inteiro
      const pax = result.passengers ?? [];
      const kindMap: Record<string, "ADT" | "CHD" | "INF"> = { adult: "ADT", child: "CHD", infant: "INF" };
      for (let i = 0; i < pax.length; i++) {
        const p = pax[i]!;
        if (!p.full_name?.trim()) continue;
        const cpf = (p.cpf ?? "").replace(/\D/g, "");
        await savePax({
          data: {
            order_id: orderId,
            full_name: p.full_name.trim(),
            passenger_type: kindMap[p.kind ?? "adult"] ?? "ADT",
            birth_date: p.birth_date ?? null,
            cpf: cpf.length === 11 ? cpf : null,
            document: p.document ?? null,
            doc_type: "cpf",
            sort_order: i,
          },
        });
      }

      // 2) Itens selecionados
      let firstLocator: string | undefined;
      let firstSupplier: string | undefined;

      for (let idx = 0; idx < result.items.length; idx++) {
        if (!selected[idx]) continue;
        const item = result.items[idx]!;
        const status = item.status ?? (item.supplier_locator ? "confirmed" : "reserved");

        if (item.kind === "flight") {
          const segs = item.segments ?? [];
          const totalValue = Number(item.details?.value ?? 0) || 0;
          const totalTaxes = Number(item.details?.tax_value ?? 0) || 0;
          // Um order_item por segmento, compartilhando supplier_locator
          for (let s = 0; s < (segs.length || 1); s++) {
            const seg = segs[s] ?? {};
            const title =
              item.title?.trim() ||
              `Aéreo ${seg.from_iata ?? ""}${seg.to_iata ? ` → ${seg.to_iata}` : ""}`.trim() ||
              "Aéreo";
            const details = {
              airline_code: seg.airline_code,
              airline_name: seg.airline_name,
              flight_number: seg.flight_number,
              from_iata: seg.from_iata,
              to_iata: seg.to_iata,
              depart_at: seg.depart_at,
              arrive_at: seg.arrive_at,
              cabin_class: seg.cabin_class,
              fare_class: seg.fare_class,
              segment_index: seg.segment_index ?? s,
              cancellation_policy: item.details?.cancellation_policy,
              observations: item.details?.observations,
              notes: item.details?.notes,
            };
            const saved = await saveItem({
              data: {
                order_id: orderId,
                kind: "flight",
                title,
                supplier_locator: item.supplier_locator ?? null,
                details: details as unknown as import("@/integrations/supabase/types").Json,
                status,
                sort_order: s,
              },
            });
            // Financeiro só no primeiro segmento
            if (s === 0 && saved?.id && (totalValue || totalTaxes)) {
              await saveFin({
                data: {
                  order_item_id: saved.id,
                  supplier_name: item.supplier_name ?? null,
                  sale_value: totalValue,
                  tax_value: totalTaxes,
                  total: totalValue + totalTaxes,
                  sort_order: 0,
                },
              });
            }
          }
        } else {
          const details = { ...(item.details ?? {}) } as Record<string, unknown>;
          const title =
            item.title?.trim() ||
            (item.kind === "hotel"
              ? `Hospedagem — ${String(details.hotel_name ?? "")}`.trim()
              : String(details.category ?? "Serviço"));
          const saved = await saveItem({
            data: {
              order_id: orderId,
              kind: item.kind,
              title,
              supplier_locator: item.supplier_locator ?? null,
              details: details as unknown as import("@/integrations/supabase/types").Json,
              status,
              sort_order: 0,
            },
          });
          const value = Number(details.value ?? 0) || 0;
          const taxes = Number(details.tax_value ?? 0) || 0;
          if (saved?.id) {
            await saveFin({
              data: {
                order_item_id: saved.id,
                supplier_name: item.supplier_name ?? null,
                sale_value: value,
                tax_value: taxes,
                total: value + taxes,
                sort_order: 0,
              },
            });
          }
        }

        if (!firstLocator && item.supplier_locator?.trim()) firstLocator = item.supplier_locator.trim();
        if (!firstSupplier && item.supplier_name?.trim()) firstSupplier = item.supplier_name.trim();
      }

      const metaPatch: Record<string, string | null> = {};
      if (firstLocator) {
        metaPatch.airline_locator = firstLocator.toUpperCase();
        metaPatch.supplier_order_number = firstLocator;
      }
      if (firstSupplier) metaPatch.supplier_name = firstSupplier;
      if (Object.keys(metaPatch).length) {
        await updateMeta({ data: { id: orderId, ...metaPatch } });
      }

      toast.success("Voucher importado!");
      setOpen(false);
      reset();
      onImported();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
      setPhase("review");
    }
  }

  const items = result?.items ?? [];
  const pax = result?.passengers ?? [];

  return (
    <>
      <span onClick={() => { reset(); setOpen(true); }}>{trigger}</span>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar voucher (automático)</DialogTitle>
          </DialogHeader>

          {(phase === "idle" || phase === "uploading") && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Envie um documento com um ou mais itens (aéreo, hospedagem, serviços). A IA separa por tipo automaticamente.
              </p>
              <label
                htmlFor="multi-voucher-file-input"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  if (phase === "uploading") return;
                  const f = e.dataTransfer.files?.[0];
                  if (!f) return;
                  const ok = f.type === "application/pdf" || f.type.startsWith("image/");
                  if (!ok) { toast.error("Envie um PDF, JPG ou PNG."); return; }
                  setFile(f);
                }}
                className={`block cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver ? "border-brand-orange bg-brand-orange/5" : "border-border hover:border-brand-orange/60"
                } ${phase === "uploading" ? "opacity-60 pointer-events-none" : ""}`}
              >
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Arraste o voucher aqui ou <span className="font-medium text-foreground underline">clique para selecionar</span> (PDF, JPG ou PNG).
                </p>
                <Input
                  id="multi-voucher-file-input"
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={phase === "uploading"}
                />
                {file && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </label>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={phase === "uploading"}>Cancelar</Button>
                <Button onClick={processFile} disabled={!file || phase === "uploading"} className="gap-2">
                  {phase === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {phase === "uploading" ? "Lendo documento…" : "Extrair itens"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {(phase === "review" || phase === "saving") && result && (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                <div className="text-sm text-emerald-800">
                  {items.length} {items.length === 1 ? "item identificado" : "itens identificados"}
                  {pax.length ? ` · ${pax.length} passageiro(s)` : ""}. Desmarque o que não quiser importar.
                </div>
              </div>

              <div className="space-y-3">
                {items.map((it, i) => {
                  const d = (it.details ?? {}) as Record<string, unknown>;
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${selected[i] ? "border-brand-orange/70 bg-brand-orange/5" : "border-border opacity-60"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!selected[i]}
                          onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))}
                          className="h-4 w-4 accent-brand-orange"
                        />
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                          {kindIcon(it.kind)} {kindLabel(it.kind)}
                        </span>
                        <Input
                          className="flex-1 h-8"
                          value={it.title ?? ""}
                          onChange={(e) => patchItem(i, { title: e.target.value })}
                          placeholder="Título do item"
                        />
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <Label className="text-xs">Fornecedor</Label>
                          <Input className="h-8" value={it.supplier_name ?? ""} onChange={(e) => patchItem(i, { supplier_name: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Localizador</Label>
                          <Input className="h-8" value={it.supplier_locator ?? ""} onChange={(e) => patchItem(i, { supplier_locator: e.target.value.toUpperCase() })} />
                        </div>
                      </div>

                      {it.kind === "flight" && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {(it.segments ?? []).length} trecho(s):{" "}
                          {(it.segments ?? []).map((s) => `${s.from_iata ?? "?"}→${s.to_iata ?? "?"}`).join(" · ")}
                        </div>
                      )}
                      {it.kind === "hotel" && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {String(d.hotel_name ?? "")} · {String(d.check_in ?? "")} → {String(d.check_out ?? "")}
                        </div>
                      )}
                      {it.kind === "other" && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {String(d.category ?? "")} · {String(d.date_from ?? "")}
                        </div>
                      )}

                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Valor total</Label>
                          <Input className="h-8" inputMode="decimal" value={String(d.value ?? "")} onChange={(e) => patchItemDetails(i, "value", parseMoneyInput(e.target.value))} placeholder="0,00" />
                        </div>
                        <div>
                          <Label className="text-xs">Taxas</Label>
                          <Input className="h-8" inputMode="decimal" value={String(d.tax_value ?? "")} onChange={(e) => patchItemDetails(i, "tax_value", parseMoneyInput(e.target.value))} placeholder="0,00" />
                        </div>
                        <div>
                          <Label className="text-xs">Moeda</Label>
                          <Input className="h-8" value={String(d.currency ?? "BRL")} onChange={(e) => patchItemDetails(i, "currency", e.target.value.toUpperCase())} />
                        </div>
                      </div>

                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Políticas e observações</summary>
                        <div className="mt-2 space-y-2">
                          <div>
                            <Label className="text-xs">Política de cancelamento</Label>
                            <Textarea
                              rows={3}
                              value={String(d.cancellation_policy ?? "")}
                              onChange={(e) => patchItemDetails(i, "cancellation_policy", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Observações (uma por linha)</Label>
                            <Textarea
                              rows={4}
                              value={Array.isArray(d.observations) ? (d.observations as string[]).join("\n") : String(d.observations ?? "")}
                              onChange={(e) =>
                                patchItemDetails(
                                  i,
                                  "observations",
                                  e.target.value.split("\n").map((s) => s.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean),
                                )
                              }
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>

              {pax.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Users className="h-4 w-4" /> Passageiros ({pax.length})
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {pax.map((p: MultiPassenger, i) => (
                      <div key={i}>
                        · {p.full_name} {p.cpf ? `— CPF ${p.cpf}` : ""} {p.birth_date ? `— ${p.birth_date}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={reset} disabled={phase === "saving"}>Voltar</Button>
                <Button onClick={confirmar} disabled={phase === "saving"} className="gap-2 bg-brand-orange hover:bg-brand-orange/90">
                  {phase === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {phase === "saving" ? "Importando…" : `Importar ${Object.values(selected).filter(Boolean).length} ite${Object.values(selected).filter(Boolean).length === 1 ? "m" : "ns"}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
