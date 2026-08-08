import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
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

const KEY_TYPES = [
  { v: "CPF", label: "CPF" },
  { v: "CNPJ", label: "CNPJ" },
  { v: "EMAIL", label: "E-mail" },
  { v: "PHONE", label: "Telefone" },
  { v: "EVP", label: "Chave aleatória" },
] as const;

function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
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
  const buscarChave = useServerFn(buscarChavePixFornecedor);
  const salvarChave = useServerFn(salvarChavePixFornecedor);

  const [step, setStep] = useState<"form" | "confirm">("form");
  const [sending, setSending] = useState(false);
  const [favored, setFavored] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [keyType, setKeyType] = useState<string>("");
  const [doc, setDoc] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"agora" | "agendar">("agora");
  const [date, setDate] = useState(todayBR());
  const [saveKey, setSaveKey] = useState(true);
  const idemRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setSending(false);
    idemRef.current = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    setFavored(initial?.favoredName ?? "");
    setPixKey(initial?.pixKey ?? "");
    setKeyType(initial?.pixKeyType ?? "");
    setDoc(initial?.cpfCnpj ?? "");
    setValue(initial?.value ? String(initial.value) : "");
    setDescription(initial?.description ?? "");
    const d = initial?.date ?? todayBR();
    setDate(d);
    setMode(d > todayBR() ? "agendar" : "agora");
    // Preenche a chave do fornecedor, quando cadastrada
    if (initial?.supplierName && !initial?.pixKey) {
      buscarChave({ data: { supplierName: initial.supplierName } })
        .then((row: any) => {
          if (!row) return;
          setPixKey(row.pix_key ?? "");
          setKeyType(row.pix_key_type ?? "");
          setDoc(row.cpf_cnpj ?? "");
          if (row.favored_name) setFavored(row.favored_name);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const numericValue = useMemo(() => Number(String(value).replace(",", ".")) || 0, [value]);
  const effectiveDate = mode === "agendar" ? date : todayBR();

  const goConfirm = () => {
    if (!favored.trim()) return toast.error("Informe o nome do favorecido");
    if (!pixKey.trim()) return toast.error("Informe a chave Pix");
    if (numericValue <= 0) return toast.error("Informe um valor válido");
    setStep("confirm");
  };

  const send = async () => {
    if (sending) return; // trava duplo clique
    setSending(true);
    try {
      const res: any = await criar({
        data: {
          idempotencyKey: idemRef.current,
          favoredName: favored.trim(),
          pixKey: pixKey.trim(),
          pixKeyType: (keyType || null) as any,
          cpfCnpj: doc.trim() || null,
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
            favoredName: favored.trim(),
            pixKey: pixKey.trim(),
            pixKeyType: keyType || null,
            cpfCnpj: doc.trim() || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === "form" ? "Novo pagamento Pix" : "Confirmar pagamento"}</DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "O Pix sai da conta ASAAS da VIA AIR."
              : "Revise os dados antes de enviar. Esta operação movimenta dinheiro."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Favorecido</Label>
                <Input value={favored} onChange={(e) => setFavored(e.target.value)} placeholder="Nome de quem recebe" />
              </div>
              <div>
                <Label>Chave Pix</Label>
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF/CNPJ, e-mail, telefone..." />
              </div>
              <div>
                <Label>Tipo da chave</Label>
                <Select value={keyType || "auto"} onValueChange={(v) => setKeyType(v === "auto" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Detectar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Detectar automaticamente</SelectItem>
                    {KEY_TYPES.map((k) => <SelectItem key={k.v} value={k.v}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CPF/CNPJ do favorecido</Label>
                <Input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Quando</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agora">Pagar agora</SelectItem>
                    <SelectItem value="agendar">Agendar pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data do pagamento</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={mode === "agora"} />
              </div>
            </div>
            {initial?.supplierName && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
                Salvar esta chave Pix para {initial.supplierName}
              </label>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
            <Row label="Favorecido" value={favored} />
            <Row label="Chave Pix" value={`${pixKey}${keyType ? ` (${keyType})` : ""}`} />
            <Row label="Valor" value={formatBRL(numericValue)} strong />
            <Row label="Data" value={new Date(effectiveDate + "T00:00:00").toLocaleDateString("pt-BR")} />
            <Row label="Descrição" value={description || "—"} />
            <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
              A baixa financeira só acontece quando o ASAAS confirmar a transferência (TRANSFER_DONE).
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "confirm" && (
            <Button variant="ghost" onClick={() => setStep("form")} disabled={sending}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          {step === "form" ? (
            <Button onClick={goConfirm}>Revisar</Button>
          ) : (
            <Button onClick={send} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Confirmar pagamento
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
      <span className={`text-right ${strong ? "font-bold text-brand-orange" : "font-medium"}`}>{value}</span>
    </div>
  );
}
