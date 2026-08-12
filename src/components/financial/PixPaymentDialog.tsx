import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ArrowLeft, Search, CheckCircle2, Building2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/format";
import {
  criarPagamentoPix,
  consultarChavePix,
  buscarChavePixFornecedor,
  salvarChavePixFornecedor,
} from "@/lib/pagamentos.functions";

export type PixPaymentOrigin = "contas_pagar" | "avulso" | "pedido" | "outro";

export type PixPaymentInitial = {
  favoredName?: string;
  pixKey?: string;
  pixKeyType?: string | null;
  cpfCnpj?: string | null;
  value?: number;
  description?: string;
  date?: string | null;
  origin?: PixPaymentOrigin;
  financialEntryId?: string | null;
  orderId?: string | null;
  /** quando informado, tenta buscar/salvar a chave Pix do fornecedor */
  supplierName?: string | null;
};

type Owner = {
  pixKey: string;
  pixKeyType: string;
  name: string;
  cpfCnpj: string | null;
  bankName: string | null;
};

const KEY_TYPE_LABEL: Record<string, string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  EVP: "Chave aleatória",
};

function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Mascara CPF/CNPJ mantendo apenas parte dos dígitos visíveis. */
function maskDoc(doc: string | null) {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return doc;
}

export function PixPaymentDialog({
  open, onOpenChange, initial, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: PixPaymentInitial;
  onDone?: () => void;
}) {
  const criar = useServerFn(criarPagamentoPix);
  const consultar = useServerFn(consultarChavePix);
  const buscarChave = useServerFn(buscarChavePixFornecedor);
  const salvarChave = useServerFn(salvarChavePixFornecedor);

  const [step, setStep] = useState<"chave" | "dados" | "confirm">("chave");
  const [sending, setSending] = useState(false);
  const [looking, setLooking] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"agora" | "agendar">("agora");
  const [date, setDate] = useState(todayBR());
  const [time, setTime] = useState("09:00");
  const [saveKey, setSaveKey] = useState(true);
  const idemRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    setStep("chave");
    setSending(false);
    setLooking(false);
    setOwner(null);
    setLookupError(null);
    idemRef.current = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    setPixKey(initial?.pixKey ?? "");
    setValue(initial?.value ? String(initial.value) : "");
    setDescription(initial?.description ?? "");
    const d = initial?.date ?? todayBR();
    setDate(d);
    setMode(d > todayBR() ? "agendar" : "agora");
    setTime("09:00");
    // Preenche a chave do fornecedor, quando cadastrada
    if (initial?.supplierName && !initial?.pixKey) {
      buscarChave({ data: { supplierName: initial.supplierName } })
        .then((row: any) => {
          if (row?.pix_key) setPixKey(row.pix_key);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const numericValue = useMemo(() => Number(String(value).replace(",", ".")) || 0, [value]);
  const effectiveDate = mode === "agendar" ? date : todayBR();

  const doLookup = async () => {
    if (!pixKey.trim()) return toast.error("Informe a chave Pix");
    setLooking(true);
    setLookupError(null);
    try {
      const res = (await consultar({ data: { pixKey: pixKey.trim() } })) as Owner;
      setOwner(res);
      setStep("dados");
    } catch (e) {
      setOwner(null);
      setLookupError(
        (e as Error).message ||
          "Não foi possível localizar esta chave Pix. Confira os dados e tente novamente.",
      );
    } finally {
      setLooking(false);
    }
  };

  const goConfirm = () => {
    if (!owner) return;
    if (numericValue <= 0) return toast.error("Informe um valor válido");
    setStep("confirm");
  };

  const send = async () => {
    if (sending || !owner) return; // trava duplo clique
    setSending(true);
    try {
      const res: any = await criar({
        data: {
          idempotencyKey: idemRef.current,
          favoredName: owner.name,
          pixKey: owner.pixKey,
          pixKeyType: owner.pixKeyType as any,
          cpfCnpj: owner.cpfCnpj,
          value: numericValue,
          description: description.trim() || null,
          scheduleDate: mode === "agendar" ? date : null,
          scheduleTime: mode === "agendar" ? (time || null) : null,
          origin: initial?.origin ?? "avulso",
          financialEntryId: initial?.financialEntryId ?? null,
          orderId: initial?.orderId ?? null,
        },
      });
      if (initial?.supplierName && saveKey) {
        salvarChave({
          data: {
            supplierName: initial.supplierName,
            favoredName: owner.name,
            pixKey: owner.pixKey,
            pixKeyType: owner.pixKeyType,
            cpfCnpj: owner.cpfCnpj,
          },
        }).catch(() => {});
      }
      toast.success(
        res?.duplicated
          ? "Pagamento já havia sido criado (duplicidade bloqueada)."
          : mode === "agendar"
            ? "Pagamento agendado no ASAAS."
            : "Pix enviado ao ASAAS. Aguardando confirmação.",
      );
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const ownerCard = owner && (
    <div className="relative">
      <div className="absolute -inset-0.5 rounded-[2rem] bg-gradient-to-tr from-primary/20 to-emerald-500/20 opacity-30 blur" />
      <div className="relative space-y-4 rounded-[2rem] border border-white/10 bg-card/60 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Chave validada</span>
          </div>
          <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {owner.bankName || "—"}
          </span>
        </div>

        <div>
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">Favorecido</span>
          <h3 className="text-lg font-semibold leading-snug break-words">{owner.name}</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-3">
          <div>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">CPF/CNPJ</span>
            <span className="text-sm font-medium tabular-nums">{maskDoc(owner.cpfCnpj)}</span>
          </div>
          <div className="text-right">
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Chave Pix · {KEY_TYPE_LABEL[owner.pixKeyType] ?? owner.pixKeyType}
            </span>
            <span className="break-all text-sm font-medium tabular-nums">{owner.pixKey}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/80 backdrop-blur-xl"
        className="max-w-[520px] max-h-[92vh] overflow-y-auto rounded-[2.5rem] border-white/10 bg-card/70 p-0 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.55)]"
      >
        <DialogHeader className="px-8 pb-5 pt-9 text-left sm:px-10">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {step === "confirm" ? "Confirmar Pix" : "Novo pagamento Pix"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {step === "chave"
              ? "Informe a chave Pix do favorecido. Buscamos o titular automaticamente."
              : step === "dados"
                ? "Confira o titular e informe o valor do pagamento."
                : "Revise os dados antes de enviar. Esta operação movimenta dinheiro."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 px-8 pb-9 sm:px-10">
          {step === "chave" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="ml-1 text-xs font-medium text-muted-foreground">Chave Pix</Label>
                <Input
                  value={pixKey}
                  onChange={(e) => { setPixKey(e.target.value); setLookupError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") doLookup(); }}
                  placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                  autoFocus
                  className="h-auto rounded-2xl border-white/10 bg-muted/30 px-4 py-4 text-base"
                />
                <p className="ml-1 text-xs text-muted-foreground">O tipo da chave é detectado automaticamente.</p>
              </div>
              {lookupError && (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {lookupError}
                </div>
              )}
            </div>
          )}

          {step === "dados" && (
            <div className="space-y-8">
              {ownerCard}

              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 space-y-2 sm:col-span-7">
                  <Label className="ml-1 text-xs font-medium text-muted-foreground">Valor (R$)</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                      R$
                    </span>
                    <Input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      autoFocus
                      className="h-auto rounded-2xl border-white/10 bg-muted/30 py-4 pl-11 pr-4 text-xl font-semibold"
                    />
                  </div>
                </div>

                <div className="col-span-12 space-y-2 sm:col-span-5">
                  <Label className="ml-1 text-xs font-medium text-muted-foreground">Quando</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                    <SelectTrigger className="h-auto rounded-2xl border-white/10 bg-muted/30 px-4 py-[1.15rem] text-sm font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agora">Pagar agora</SelectItem>
                      <SelectItem value="agendar">Agendar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mode === "agendar" && (
                  <>
                    <div className="col-span-12 space-y-2 sm:col-span-7">
                      <Label className="ml-1 text-xs font-medium text-muted-foreground">Data do pagamento</Label>
                      <Input type="date" value={date} min={todayBR()} onChange={(e) => setDate(e.target.value)}
                        className="h-auto rounded-2xl border-white/10 bg-muted/30 px-4 py-3.5" />
                    </div>
                    <div className="col-span-12 space-y-2 sm:col-span-5">
                      <Label className="ml-1 text-xs font-medium text-muted-foreground">Hora do disparo</Label>
                      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300}
                        className="h-auto rounded-2xl border-white/10 bg-muted/30 px-4 py-3.5" />
                      <p className="ml-1 text-[11px] text-muted-foreground">Horário de Brasília.</p>
                    </div>
                  </>
                )}

                <div className="col-span-12 space-y-2">
                  <Label className="ml-1 text-xs font-medium text-muted-foreground">
                    Descrição <span className="text-muted-foreground/60">(opcional)</span>
                  </Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Ex: Pagamento de serviços…"
                    className="resize-none rounded-2xl border-white/10 bg-muted/30 px-4 py-3 text-sm"
                  />
                </div>
              </div>

              {initial?.supplierName && (
                <label className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
                  Salvar esta chave Pix para {initial.supplierName}
                </label>
              )}
            </div>
          )}

          {step === "confirm" && owner && (
            <div className="relative">
              <div className="absolute -inset-0.5 rounded-[2rem] bg-gradient-to-tr from-primary/20 to-emerald-500/20 opacity-30 blur" />
              <div className="relative space-y-3 rounded-[2rem] border border-white/10 bg-card/60 p-6 text-sm">
                <div className="pb-2 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Você está enviando</div>
                  <div className="text-4xl font-bold tracking-tight text-brand-orange">{formatBRL(numericValue)}</div>
                </div>
                <div className="space-y-2 border-t border-white/5 pt-3">
                  <Row label="Para" value={owner.name} />
                  <Row label="CPF/CNPJ" value={maskDoc(owner.cpfCnpj)} />
                  <Row label="Instituição" value={owner.bankName || "—"} />
                  <Row label="Chave Pix" value={owner.pixKey} />
                  <Row
                    label="Data"
                    value={
                      new Date(effectiveDate + "T00:00:00").toLocaleDateString("pt-BR") +
                      (mode === "agendar" && time ? ` às ${time}` : "")
                    }
                  />
                  <Row label="Descrição" value={description || "—"} />
                </div>
                <div className="flex items-start gap-2 border-t border-white/5 pt-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  A baixa financeira só acontece quando o ASAAS confirmar a transferência (TRANSFER_DONE).
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                  Os dados do titular vêm da consulta da chave Pix e são revalidados no envio.
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row items-center justify-between gap-3 pt-2 sm:justify-between">
            <div>
              {step === "dados" && (
                <button type="button" disabled={sending} onClick={() => setStep("chave")}
                  className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Trocar chave
                </button>
              )}
              {step === "confirm" && (
                <button type="button" disabled={sending} onClick={() => setStep("dados")}
                  className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={sending || looking}
                className="rounded-2xl px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                Cancelar
              </button>
              {step === "chave" && (
                <Button onClick={doLookup} disabled={looking} className="h-auto rounded-2xl px-8 py-3 font-bold">
                  {looking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                  Continuar
                </Button>
              )}
              {step === "dados" && (
                <Button onClick={goConfirm} className="h-auto rounded-2xl px-10 py-3 font-bold">Revisar</Button>
              )}
              {step === "confirm" && (
                <Button onClick={send} disabled={sending} className="h-auto rounded-2xl px-8 py-3 font-bold">
                  {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Confirmar Pix
                </Button>
              )}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right break-all ${strong ? "font-bold text-brand-orange" : "font-medium"}`}>{value}</span>
    </div>
  );
}
