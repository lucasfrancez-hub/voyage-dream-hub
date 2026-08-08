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
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-emerald-500 text-xs font-semibold uppercase tracking-wider">
        <CheckCircle2 className="h-4 w-4" /> Chave validada
      </div>
      <Row label="Favorecido" value={owner.name} />
      <Row label="CPF/CNPJ" value={maskDoc(owner.cpfCnpj)} />
      <Row label="Instituição" value={owner.bankName || "—"} />
      <Row label="Tipo da chave" value={KEY_TYPE_LABEL[owner.pixKeyType] ?? owner.pixKeyType} />
      <Row label="Chave Pix" value={owner.pixKey} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "confirm" ? "Confirmar Pix" : "Novo pagamento Pix"}
          </DialogTitle>
          <DialogDescription>
            {step === "chave"
              ? "Informe a chave Pix do favorecido. Buscamos o titular automaticamente."
              : step === "dados"
                ? "Confira o titular e informe o valor do pagamento."
                : "Revise os dados antes de enviar. Esta operação movimenta dinheiro."}
          </DialogDescription>
        </DialogHeader>

        {step === "chave" && (
          <div className="space-y-3">
            <div>
              <Label>Chave Pix</Label>
              <Input
                value={pixKey}
                onChange={(e) => { setPixKey(e.target.value); setLookupError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") doLookup(); }}
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                O tipo da chave é detectado automaticamente.
              </p>
            </div>
            {lookupError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {lookupError}
              </div>
            )}
          </div>
        )}

        {step === "dados" && (
          <div className="space-y-3">
            {ownerCard}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (R$)</Label>
                <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus />
              </div>
              <div>
                <Label>Quando</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agora">Pagar agora</SelectItem>
                    <SelectItem value="agendar">Agendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "agendar" && (
                <div>
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={date} min={todayBR()} onChange={(e) => setDate(e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
            </div>
            {initial?.supplierName && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
                Salvar esta chave Pix para {initial.supplierName}
              </label>
            )}
          </div>
        )}

        {step === "confirm" && owner && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="text-center pb-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Você está enviando</div>
              <div className="text-3xl font-bold text-brand-orange">{formatBRL(numericValue)}</div>
            </div>
            <Row label="Para" value={owner.name} />
            <Row label="CPF/CNPJ" value={maskDoc(owner.cpfCnpj)} />
            <Row label="Instituição" value={owner.bankName || "—"} />
            <Row label="Chave Pix" value={owner.pixKey} />
            <Row label="Data" value={new Date(effectiveDate + "T00:00:00").toLocaleDateString("pt-BR")} />
            <Row label="Descrição" value={description || "—"} />
            <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
              A baixa financeira só acontece quando o ASAAS confirmar a transferência (TRANSFER_DONE).
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
              Os dados do titular vêm da consulta da chave Pix e são revalidados no envio.
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "dados" && (
            <Button variant="ghost" onClick={() => setStep("chave")} disabled={sending}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Trocar chave
            </Button>
          )}
          {step === "confirm" && (
            <Button variant="ghost" onClick={() => setStep("dados")} disabled={sending}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending || looking}>Cancelar</Button>
          {step === "chave" && (
            <Button onClick={doLookup} disabled={looking}>
              {looking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Continuar
            </Button>
          )}
          {step === "dados" && <Button onClick={goConfirm}>Revisar</Button>}
          {step === "confirm" && (
            <Button onClick={send} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Confirmar Pix
            </Button>
          )}
        </DialogFooter>
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
