import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Landmark, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { lerComprovanteExterno, registrarPagamentoExterno } from "@/lib/pagamentos-externos.functions";

type Entry = {
  id: string;
  description: string;
  amount: number;
  counterparty: string | null;
  due_date: string | null;
} | null;

type Form = {
  bancoNome: string;
  bancoCodigo: string;
  formaPagamento: string;
  valor: string;
  dataPagamento: string;
  dataVencimento: string;
  beneficiarioNome: string;
  beneficiarioDocumento: string;
  pagadorNome: string;
  pagadorDocumento: string;
  contaDebito: string;
  descricao: string;
  autenticacao: string;
  linhaDigitavel: string;
};

const EMPTY: Form = {
  bancoNome: "", bancoCodigo: "", formaPagamento: "boleto", valor: "",
  dataPagamento: "", dataVencimento: "", beneficiarioNome: "", beneficiarioDocumento: "",
  pagadorNome: "", pagadorDocumento: "", contaDebito: "", descricao: "",
  autenticacao: "", linhaDigitavel: "",
};

function nowLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Baixa manual de uma conta paga por outro banco, com leitura do comprovante por IA. */
export function ExternalPaymentDialog({
  open, onOpenChange, entry, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry?: Entry;
  onDone?: () => void;
}) {
  const ler = useServerFn(lerComprovanteExterno);
  const registrar = useServerFn(registrarPagamentoExterno);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<Form>(EMPTY);
  const [path, setPath] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPath(null); setRaw(null); setFileName(null); setLendo(false); setSalvando(false);
    setForm({
      ...EMPTY,
      dataPagamento: nowLocalInput(),
      valor: entry ? String(Number(entry.amount).toFixed(2)) : "",
      beneficiarioNome: entry?.counterparty ?? "",
      dataVencimento: entry?.due_date ?? "",
      descricao: entry?.description ?? "",
    });
  }, [open, entry]);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onFile(file: File) {
    if (!file) return;
    setFileName(file.name);
    setLendo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        r.readAsDataURL(file);
      });
      const res = await ler({
        data: { filename: file.name, mimeType: file.type || "application/pdf", base64 },
      });
      setPath(res.path ?? null);
      if (res.erro) toast.warning(res.erro);
      const e = res.extracao as any;
      if (e) {
        setRaw(e);
        setForm((f) => ({
          ...f,
          bancoNome: e.banco_nome ?? f.bancoNome,
          bancoCodigo: e.banco_codigo ?? f.bancoCodigo,
          formaPagamento: e.forma_pagamento ?? f.formaPagamento,
          valor: e.valor != null ? String(Number(e.valor).toFixed(2)) : f.valor,
          dataPagamento: e.data_pagamento
            ? (e.data_pagamento.length > 10 ? e.data_pagamento.slice(0, 16) : `${e.data_pagamento}T12:00`)
            : f.dataPagamento,
          dataVencimento: e.data_vencimento ?? f.dataVencimento,
          beneficiarioNome: e.beneficiario_nome ?? f.beneficiarioNome,
          beneficiarioDocumento: e.beneficiario_documento ?? f.beneficiarioDocumento,
          pagadorNome: e.pagador_nome ?? f.pagadorNome,
          pagadorDocumento: e.pagador_documento ?? f.pagadorDocumento,
          contaDebito: e.conta_debito ?? f.contaDebito,
          descricao: e.descricao ?? f.descricao,
          autenticacao: e.autenticacao ?? f.autenticacao,
          linhaDigitavel: e.linha_digitavel ?? f.linhaDigitavel,
        }));
        toast.success("Comprovante lido. Confira os dados antes de salvar.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível ler o comprovante.");
    } finally {
      setLendo(false);
    }
  }

  async function salvar() {
    const valor = Number(String(form.valor).replace(",", "."));
    if (!form.bancoNome.trim()) return toast.error("Informe o banco do pagamento.");
    if (!valor || valor <= 0) return toast.error("Informe o valor pago.");
    setSalvando(true);
    try {
      await registrar({
        data: {
          financialEntryId: entry?.id ?? null,
          bancoNome: form.bancoNome.trim(),
          bancoCodigo: form.bancoCodigo || null,
          formaPagamento: form.formaPagamento || "boleto",
          valor,
          dataPagamento: form.dataPagamento || nowLocalInput(),
          dataVencimento: form.dataVencimento || null,
          beneficiarioNome: form.beneficiarioNome || null,
          beneficiarioDocumento: form.beneficiarioDocumento || null,
          pagadorNome: form.pagadorNome || null,
          pagadorDocumento: form.pagadorDocumento || null,
          contaDebito: form.contaDebito || null,
          descricao: form.descricao || null,
          autenticacao: form.autenticacao || null,
          linhaDigitavel: form.linhaDigitavel || null,
          documentoPath: path,
          rawExtracao: raw,
          darBaixa: true,
        },
      });
      toast.success(entry ? "Pagamento registrado e conta baixada." : "Pagamento externo registrado.");
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível registrar o pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-brand-orange" />
            Baixa com comprovante de outro banco
          </DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.description} · ${formatBRL(Number(entry.amount))}`
              : "Registre um pagamento feito fora da conta ASAAS."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-dashed border-border p-4 text-center">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={lendo}>
            {lendo ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            {lendo ? "Lendo comprovante..." : "Anexar comprovante (PDF ou imagem)"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {fileName ? fileName : "A IA extrai banco, valor, datas, beneficiário e autenticação automaticamente."}
          </p>
          {raw && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-500">
              <Sparkles className="h-3 w-3" /> Dados preenchidos pela leitura automática
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Banco pagador *</Label>
            <Input value={form.bancoNome} onChange={(e) => set("bancoNome", e.target.value)} placeholder="Bradesco" />
          </div>
          <div className="space-y-1.5">
            <Label>Código do banco</Label>
            <Input value={form.bancoCodigo} onChange={(e) => set("bancoCodigo", e.target.value)} placeholder="237" />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={form.formaPagamento} onValueChange={(v) => set("formaPagamento", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="ted">TED</SelectItem>
                <SelectItem value="doc">DOC</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor pago *</Label>
            <Input value={form.valor} onChange={(e) => set("valor", e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Data e hora do pagamento</Label>
            <Input type="datetime-local" value={form.dataPagamento} onChange={(e) => set("dataPagamento", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento</Label>
            <Input type="date" value={form.dataVencimento} onChange={(e) => set("dataVencimento", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Beneficiário</Label>
            <Input value={form.beneficiarioNome} onChange={(e) => set("beneficiarioNome", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CPF/CNPJ do beneficiário</Label>
            <Input value={form.beneficiarioDocumento} onChange={(e) => set("beneficiarioDocumento", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pagador</Label>
            <Input value={form.pagadorNome} onChange={(e) => set("pagadorNome", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CPF/CNPJ do pagador</Label>
            <Input value={form.pagadorDocumento} onChange={(e) => set("pagadorDocumento", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Conta debitada</Label>
            <Input value={form.contaDebito} onChange={(e) => set("contaDebito", e.target.value)} placeholder="Ag. 0083 · CC 0052751-3" />
          </div>
          <div className="space-y-1.5">
            <Label>Autenticação / nº de controle</Label>
            <Input value={form.autenticacao} onChange={(e) => set("autenticacao", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Código de barras / linha digitável</Label>
            <Input value={form.linhaDigitavel} onChange={(e) => set("linhaDigitavel", e.target.value.replace(/\D/g, ""))} className="font-mono" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || lendo}>
            {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {entry ? "Salvar e dar baixa" : "Salvar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExternalPaymentDialog;
