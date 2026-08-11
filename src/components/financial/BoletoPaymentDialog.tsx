import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Upload, ScanLine, ShieldCheck, AlertTriangle, CalendarClock, Ban, RefreshCw,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComprovanteActions } from "@/components/financial/ComprovanteActions";
import { formatBRL } from "@/lib/format";
import { confirmThen } from "@/lib/confirm";
import { uploadBoletoDocument } from "@/lib/boleto-upload.functions";
import {
  lerBoleto, criarPagamentoBoleto, listarPagamentosBoleto,
  sincronizarPagamentoBoleto, cancelarPagamentoBoleto,
} from "@/lib/boleto-pay.functions";
import { BILL_STATUS_LABEL } from "@/lib/boleto-pay.helpers";

type Leitura = {
  linhaDigitavel: string | null;
  valor: number | null;
  vencimento: string | null;
  beneficiario: string | null;
  validadoPeloAsaas: boolean;
  simulacaoErro: string | null;
  vencido: boolean;
  divergencias: string[];
  valorTotal: number | null;
  hoje: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(`${v}T12:00:00-03:00`).toLocaleDateString("pt-BR");
}

export function BoletoPaymentDialog({
  open, onOpenChange, entry, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: { id: string; description: string; amount: number; due_date: string | null; counterparty: string | null; boleto_path?: string | null } | null;
  onDone?: () => void;
}) {
  const upload = useServerFn(uploadBoletoDocument);
  const ler = useServerFn(lerBoleto);
  const criar = useServerFn(criarPagamentoBoleto);
  const listar = useServerFn(listarPagamentosBoleto);
  const sincronizar = useServerFn(sincronizarPagamentoBoleto);
  const cancelar = useServerFn(cancelarPagamentoBoleto);

  const [path, setPath] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [linhaManual, setLinhaManual] = useState("");
  const [modo, setModo] = useState<"agendar" | "agora">("agendar");
  const [dataPagamento, setDataPagamento] = useState("");
  const [horaPagamento, setHoraPagamento] = useState("09:00");
  const [revisao, setRevisao] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPath(entry?.boleto_path ?? null);
    setLeitura(null); setConfirmado(false); setLinhaManual("");
    setModo("agendar"); setDataPagamento(""); setHoraPagamento("09:00"); setRevisao(false);
  }, [open, entry?.id, entry?.boleto_path]);

  const pagamentos = useQuery({
    queryKey: ["boleto-pagamentos", entry?.id],
    queryFn: () => listar({ data: { financialEntryId: entry!.id } }),
    enabled: open && !!entry?.id,
  });

  const ativo = useMemo(
    () => (pagamentos.data ?? []).find((p: any) => ["pendente", "agendado", "processando", "pago"].includes(p.status)),
    [pagamentos.data],
  );

  const linha = leitura?.linhaDigitavel ?? (linhaManual.replace(/\D+/g, "") || null);

  const anexar = async (file: File) => {
    setLendo(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = () => rej(new Error("Falha ao ler arquivo"));
        r.readAsDataURL(file);
      });
      const up = await upload({ data: { filename: file.name, contentType: file.type, base64: b64 } });
      setPath(up.path);
      const res = await ler({
        data: {
          base64: b64,
          mimeType: file.type,
          valorInformado: entry ? Number(entry.amount) : null,
          vencimentoInformado: entry?.due_date ?? null,
        },
      });
      setLeitura(res as Leitura);
      setConfirmado(false);
      if (!res.linhaDigitavel) toast.warning("Não achei a linha digitável — informe manualmente.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLendo(false);
    }
  };

  const dataEfetiva = useMemo(() => {
    if (modo === "agora") return leitura?.hoje ?? "";
    return dataPagamento || leitura?.vencimento || entry?.due_date || "";
  }, [modo, dataPagamento, leitura, entry]);

  const enviar = async () => {
    if (!linha) return;
    const valorFinal = Number(leitura?.valor ?? entry?.amount ?? 0);
    if (!valorFinal) {
      toast.error("Não foi possível determinar o valor do boleto.");
      return;
    }
    setEnviando(true);
    try {
      const r = await criar({
        data: {
          financialEntryId: entry?.id ?? null,
          identificationField: linha,
          value: valorFinal,
          dueDate: leitura?.vencimento ?? entry?.due_date ?? null,
          scheduleDate: modo === "agendar" ? (dataEfetiva || null) : null,
          scheduleTime: modo === "agendar" ? (horaPagamento || null) : null,
          description: entry?.description ?? leitura?.beneficiario ?? "Pagamento de boleto",
          beneficiaryName: leitura?.beneficiario ?? entry?.counterparty ?? null,
          boletoPath: path,
          confirmado: true as const,
        },
      });

      toast.success(r.status === "agendado" ? "Pagamento agendado no ASAAS" : "Pagamento enviado ao ASAAS");
      setRevisao(false);
      pagamentos.refetch();
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagar boleto via ASAAS</DialogTitle>
        </DialogHeader>

        {ativo ? (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Pagamento {BILL_STATUS_LABEL[ativo.status] ?? ativo.status} via ASAAS</p>
              <p className="text-muted-foreground">Beneficiário: {ativo.beneficiary_name ?? "—"}</p>
              <p className="text-muted-foreground">Valor: {formatBRL(Number(ativo.value))}</p>
              <p className="text-muted-foreground">Vencimento: {fmtDate(ativo.due_date)}</p>
              <p className="text-muted-foreground">Data agendada: {fmtDate(ativo.scheduled_date ?? ativo.effective_date)}</p>
              <p className="text-muted-foreground break-all">ID ASAAS: {ativo.asaas_bill_id ?? "—"}</p>
              {ativo.fail_reason && <p className="text-red-500">{ativo.fail_reason}</p>}
              <div className="pt-1">
                <ComprovanteActions billId={ativo.asaas_bill_id} compact={false} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={async () => {
                try { await sincronizar({ data: { id: ativo.id } }); pagamentos.refetch(); onDone?.(); }
                catch (e) { toast.error((e as Error).message); }
              }}>
                <RefreshCw className="h-4 w-4" /> Atualizar status
              </Button>
              {ativo.status !== "pago" && (
                <Button variant="destructive" className="gap-2" onClick={() =>
                  confirmThen("Cancelar o pagamento agendado no ASAAS?", async () => {
                    try { await cancelar({ data: { id: ativo.id } }); pagamentos.refetch(); onDone?.(); toast.success("Agendamento cancelado"); }
                    catch (e) { toast.error((e as Error).message); }
                  })
                }>
                  <Ban className="h-4 w-4" /> Cancelar agendamento
                </Button>
              )}
            </div>
          </div>
        ) : revisao ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3 space-y-1">
              <p><span className="text-muted-foreground">Beneficiário:</span> {leitura?.beneficiario ?? entry?.counterparty ?? "—"}</p>
              <p className="break-all"><span className="text-muted-foreground">Linha digitável:</span> {linha}</p>
              <p><span className="text-muted-foreground">Valor:</span> {formatBRL(Number(leitura?.valor ?? entry?.amount ?? 0))}</p>
              <p><span className="text-muted-foreground">Vencimento:</span> {fmtDate(leitura?.vencimento ?? entry?.due_date)}</p>
              <p><span className="text-muted-foreground">Data efetiva do pagamento:</span> {fmtDate(dataEfetiva)}{modo === "agendar" && horaPagamento ? ` às ${horaPagamento}` : ""}</p>
              <p><span className="text-muted-foreground">Conta utilizada:</span> ASAAS</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Em finais de semana e feriados o ASAAS processa no próximo dia útil.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevisao(false)}>Voltar</Button>
              <Button onClick={enviar} disabled={enviando}>
                {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Boleto (PDF ou imagem)</Label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/40">
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {lendo ? "Lendo boleto…" : path ? "Boleto anexado — trocar arquivo" : "Anexar boleto"}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); }}
                />
              </label>
            </div>

            {leitura && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <ScanLine className="h-4 w-4 text-primary" /> Dados lidos do boleto
                </p>
                <p><span className="text-muted-foreground">Beneficiário:</span> {leitura.beneficiario ?? "—"}</p>
                <p><span className="text-muted-foreground">Valor:</span> {leitura.valor ? formatBRL(leitura.valor) : "—"}</p>
                <p><span className="text-muted-foreground">Vencimento:</span> {fmtDate(leitura.vencimento)}</p>
                <p className="break-all"><span className="text-muted-foreground">Linha digitável:</span> {leitura.linhaDigitavel ?? "—"}</p>
                <p className={`flex items-center gap-1.5 text-xs ${leitura.validadoPeloAsaas ? "text-emerald-500" : "text-amber-500"}`}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {leitura.validadoPeloAsaas ? "Validado pelo ASAAS" : leitura.simulacaoErro ?? "Ainda não validado pelo ASAAS"}
                </p>
                {leitura.divergencias.map((d) => (
                  <p key={d} className="flex items-start gap-1.5 text-xs text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d}
                  </p>
                ))}
                {leitura.vencido && (
                  <p className="text-xs text-red-500">
                    Este boleto está vencido. O pagamento não pode ser agendado para uma data futura.
                  </p>
                )}
                {!confirmado && (
                  <Button size="sm" className="mt-1" onClick={() => {
                    setConfirmado(true);
                    setDataPagamento(leitura.vencimento ?? entry?.due_date ?? "");
                    if (leitura.vencido) setModo("agora");
                  }}>
                    Confirmar dados do boleto
                  </Button>
                )}
              </div>
            )}

            <div>
              <Label>Linha digitável {leitura ? "(ajustar se necessário)" : "(manual)"}</Label>
              <Input
                value={linhaManual || leitura?.linhaDigitavel || ""}
                onChange={(e) => { setLinhaManual(e.target.value); setConfirmado(false); }}
                placeholder="34191..."
                inputMode="numeric"
              />
            </div>

            {confirmado && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={modo === "agendar" ? "default" : "outline"}
                    disabled={leitura?.vencido}
                    onClick={() => setModo("agendar")}
                    className="gap-1.5"
                  >
                    <CalendarClock className="h-4 w-4" /> Agendar para o vencimento
                  </Button>
                  <Button size="sm" variant={modo === "agora" ? "default" : "outline"} onClick={() => setModo("agora")}>
                    Pagar agora
                  </Button>
                </div>
                {modo === "agendar" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Pagamento programado para</Label>
                      <Input type="date" value={dataPagamento} min={leitura?.hoje}
                        onChange={(e) => setDataPagamento(e.target.value)} />
                    </div>
                    <div>
                      <Label>Hora do disparo</Label>
                      <Input type="time" step={300} value={horaPagamento}
                        onChange={(e) => setHoraPagamento(e.target.value)} />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Enviado ao ASAAS nesse horário (Brasília).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button disabled={!confirmado || !linha} onClick={() => setRevisao(true)}>
                Revisar e confirmar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
