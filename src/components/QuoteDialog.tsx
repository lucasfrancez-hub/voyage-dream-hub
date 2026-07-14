import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, MessageCircle, Printer, Loader2, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getQuoteConfig, saveQuoteConfig, getQuoteToken,
  DEFAULT_QUOTE_CONFIG, type QuoteConfig,
} from "@/lib/quote.functions";


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderNumber: string;
  customerPhone?: string | null;
};

export function QuoteDialog({ open, onOpenChange, orderId, orderNumber, customerPhone }: Props) {
  const getCfg = useServerFn(getQuoteConfig);
  const saveCfg = useServerFn(saveQuoteConfig);
  const getTok = useServerFn(getQuoteToken);

  const [cfg, setCfg] = useState<QuoteConfig>(DEFAULT_QUOTE_CONFIG);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pixAsk, setPixAsk] = useState<null | "copy" | "web" | "pdf" | "wa">(null);


  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getCfg({ data: { orderId } }),
      getTok({ data: { orderId } }),
    ])
      .then(([c, t]) => {
        if (cancelled) return;
        setCfg(c);
        setToken(t.token);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, orderId, getCfg, getTok]);

  const publicUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/orcamento/${token}`
    : "";
  const printUrl = publicUrl ? `${publicUrl}?print=1` : "";

  const waPhone = (customerPhone ?? "").replace(/\D+/g, "");
  const waNumber = waPhone.length >= 10
    ? (waPhone.startsWith("55") ? waPhone : `55${waPhone}`)
    : "";
  const waHref = waNumber && publicUrl
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá! Segue o orçamento nº ${orderNumber}: ${publicUrl}`)}`
    : "";

  const doSave = async (silent = false) => {
    setSaving(true);
    try {
      await saveCfg({ data: { orderId, config: cfg } });
      if (!silent) toast.success("Configuração salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: "copy" | "web" | "pdf" | "wa", pixEnabled: boolean) => {
    const nextCfg = { ...cfg, pix: { ...cfg.pix, enabled: pixEnabled } };
    setCfg(nextCfg);
    setSaving(true);
    try {
      await saveCfg({ data: { orderId, config: nextCfg } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (action === "copy") {
      if (!publicUrl) return;
      try {
        await navigator.clipboard.writeText(publicUrl);
        toast.success("Link copiado");
      } catch {
        toast.error("Não foi possível copiar");
      }
    } else if (action === "web") {
      if (publicUrl) window.open(publicUrl, "_blank", "noopener");
    } else if (action === "pdf") {
      if (printUrl) window.open(printUrl, "_blank", "noopener");
    } else if (action === "wa") {
      if (waHref) window.open(waHref, "_blank", "noopener");
    }
  };

  const askPix = (action: "copy" | "web" | "pdf" | "wa") => setPixAsk(action);



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Orçamento — nº {orderNumber}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Link + ações */}
            <section className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Link público</Label>
                <div className="mt-1 flex gap-2">
                  <Input value={publicUrl} readOnly className="text-xs font-mono" />
                  <Button type="button" size="sm" variant="outline" onClick={() => askPix("copy")}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => askPix("web")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir web
                </Button>
                <Button type="button" size="sm" onClick={() => askPix("pdf")}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> Gerar PDF
                </Button>
                {waHref && (
                  <Button type="button" size="sm" variant="outline" onClick={() => askPix("wa")}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Enviar no WhatsApp
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                O link não mostra comissão. Ao gerar, você escolhe se aplica o desconto Pix.
              </p>
            </section>


            {/* Condições de pagamento */}
            <section className="space-y-4">
              <div className="text-sm font-semibold">Condições de pagamento</div>

              {/* Pix */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Pix</Label>
                  <Switch
                    checked={cfg.pix.enabled}
                    onCheckedChange={(v) => setCfg((c) => ({ ...c, pix: { ...c.pix, enabled: !!v } }))}
                  />
                </div>
                {cfg.pix.enabled && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2 items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Desconto (%)</Label>
                      <Input
                        type="number" min={0} max={100} step="0.5"
                        value={cfg.pix.discount_pct}
                        onChange={(e) => setCfg((c) => ({ ...c, pix: { ...c.pix, discount_pct: Number(e.target.value) || 0 } }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Cartão */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Cartão de crédito</Label>
                  <Switch
                    checked={cfg.card.enabled}
                    onCheckedChange={(v) => setCfg((c) => ({ ...c, card: { ...c.card, enabled: !!v } }))}
                  />
                </div>
                {cfg.card.enabled && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Máximo de parcelas</Label>
                      <Select
                        value={String(cfg.card.max_installments)}
                        onValueChange={(v) => setCfg((c) => ({ ...c, card: { ...c.card, max_installments: Number(v) } }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Juros a partir de (opcional)</Label>
                      <Select
                        value={cfg.card.interest_from == null ? "none" : String(cfg.card.interest_from)}
                        onValueChange={(v) => setCfg((c) => ({ ...c, card: { ...c.card, interest_from: v === "none" ? null : Number(v) } }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Tudo sem juros</SelectItem>
                          {Array.from({ length: cfg.card.max_installments }, (_, i) => i + 2).map((n) => (
                            <SelectItem key={n} value={String(n)}>A partir de {n}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Boleto */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Boleto</Label>
                  <Switch
                    checked={cfg.boleto.enabled}
                    onCheckedChange={(v) => setCfg((c) => ({ ...c, boleto: { ...c.boleto, enabled: !!v } }))}
                  />
                </div>
                {cfg.boleto.enabled && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Máximo de parcelas</Label>
                      <Select
                        value={String(cfg.boleto.max_installments)}
                        onValueChange={(v) => setCfg((c) => ({ ...c, boleto: { ...c.boleto, max_installments: Number(v) } }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Validade do orçamento</Label>
                  <Input
                    type="date"
                    value={cfg.valid_until ?? ""}
                    onChange={(e) => setCfg((c) => ({ ...c, valid_until: e.target.value || null }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Observações</Label>
                  <Textarea
                    rows={2}
                    value={cfg.notes}
                    onChange={(e) => setCfg((c) => ({ ...c, notes: e.target.value }))}
                    placeholder="Ex.: valores sujeitos a alteração, política de cancelamento…"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => doSave(false)} disabled={saving || loading}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            Salvar condições
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
