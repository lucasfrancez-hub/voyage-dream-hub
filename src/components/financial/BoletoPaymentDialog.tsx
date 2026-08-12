import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Upload, ShieldCheck, AlertTriangle, CalendarClock, Ban, RefreshCw,
  Search, ChevronRight, XCircle, Clock,
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
  lerBoleto, consultarBoleto, criarPagamentoBoleto, listarPagamentosBoleto,
  sincronizarPagamentoBoleto, cancelarPagamentoBoleto,
} from "@/lib/boleto-pay.functions";
import { BILL_STATUS_LABEL, parseBoletoCode } from "@/lib/boleto-pay.helpers";

type ErroBoleto = {
  titulo: string;
  mensagem: string;
  codigo: string | null;
  tecnico: string | null;
  orientacao: string | null;
};

type BoletoConsultado = {
  tipo: string | null;
  linhaDigitavel: string;
  codigoBarras: string | null;
  beneficiario: string | null;
  documentoBeneficiario: string | null;
  instituicao: string | null;
  valorOriginal: number | null;
  valorAtualizado: number | null;
  valorFinal: number | null;
  juros: number | null;
  multa: number | null;
  desconto: number | null;
  abatimento: number | null;
  vencimento: string | null;
  vencido: boolean;
  descricao: string | null;
  valorEditavel: boolean;
  valorMinimo: number | null;
  valorMaximo: number | null;
  dataMinimaPagamento: string | null;
  dataMaximaPagamento: string | null;
  podePagarComSaldo: boolean | null;
  hoje: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(`${v}T12:00:00-03:00`).toLocaleDateString("pt-BR");
}

/** Máscara visual leve para a linha digitável. */
function maskLinha(v: string) {
  const d = v.replace(/\D+/g, "");
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
  }
  if (d.length === 48) return d.replace(/(\d{12})(?=\d)/g, "$1 ").trim();
  return d;
}

function ErroPanel({ erro }: { erro: ErroBoleto }) {
  const [detalhes, setDetalhes] = useState(false);
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-1.5">
      <p className="flex items-center gap-1.5 font-semibold text-destructive">
        <XCircle className="h-4 w-4 shrink-0" /> {erro.titulo}
      </p>
      <p className="text-sm">{erro.mensagem}</p>
      {erro.orientacao && <p className="text-xs text-muted-foreground">{erro.orientacao}</p>}
      {(erro.codigo || erro.tecnico) && (
        <button
          type="button"
          className="text-xs underline text-muted-foreground"
          onClick={() => setDetalhes((v) => !v)}
        >
          {detalhes ? "ocultar detalhes" : "ver detalhes"}
        </button>
      )}
      {detalhes && (
        <div className="rounded-lg bg-background/60 p-2 text-[11px] font-mono break-all max-h-40 overflow-auto">
          {erro.codigo && <p>código: {erro.codigo}</p>}
          {erro.tecnico && <p className="whitespace-pre-wrap">{erro.tecnico}</p>}
        </div>
      )}
    </div>
  );
}

function Linha({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value}</span>
    </div>
  );
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
  const consultar = useServerFn(consultarBoleto);
  const criar = useServerFn(criarPagamentoBoleto);
  const listar = useServerFn(listarPagamentosBoleto);
  const sincronizar = useServerFn(sincronizarPagamentoBoleto);
  const cancelar = useServerFn(cancelarPagamentoBoleto);

  const [path, setPath] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [boleto, setBoleto] = useState<BoletoConsultado | null>(null);
  const [erro, setErro] = useState<ErroBoleto | null>(null);
  const [valorEditado, setValorEditado] = useState("");
  const [modo, setModo] = useState<"agora" | "agendar">("agora");
  const [dataPagamento, setDataPagamento] = useState("");
  const [horaPagamento, setHoraPagamento] = useState("09:00");
  const [etapa, setEtapa] = useState<"codigo" | "conferencia">("codigo");
  /** Trava síncrona contra duplo clique + id da tentativa (idempotência no backend). */
  const enviandoRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPath(entry?.boleto_path ?? null);
    setCodigo(""); setBoleto(null); setErro(null); setValorEditado("");
    setModo("agora"); setDataPagamento(""); setHoraPagamento("09:00"); setEtapa("codigo");
    enviandoRef.current = false; requestIdRef.current = null;
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

  const formato = useMemo(() => parseBoletoCode(codigo), [codigo]);
  const codigoCompleto = formato.valid;

  /* ---------- Consulta ---------- */
  const consultarCodigo = async (code?: string) => {
    const alvo = code ?? codigo;
    setConsultando(true);
    setErro(null);
    setBoleto(null);
    try {
      const r: any = await consultar({
        data: { code: alvo, financialEntryId: entry?.id ?? null },
      });
      if (!r.ok) {
        setErro(r.erro as ErroBoleto);
        return;
      }
      const b = r.boleto as BoletoConsultado;
      setBoleto(b);
      setValorEditado(String(b.valorFinal ?? b.valorOriginal ?? ""));
      setDataPagamento(b.vencido ? b.hoje : (b.vencimento ?? b.hoje));
      setModo(b.vencido ? "agora" : "agora");
    } catch (e) {
      setErro({
        titulo: "Falha na consulta",
        mensagem: (e as Error).message,
        codigo: null, tecnico: null,
        orientacao: "Tente novamente em instantes.",
      });
    } finally {
      setConsultando(false);
    }
  };

  /* ---------- Leitura por arquivo (opcional) ---------- */
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
      const res: any = await ler({
        data: {
          base64: b64,
          mimeType: file.type,
          valorInformado: entry ? Number(entry.amount) : null,
          vencimentoInformado: entry?.due_date ?? null,
        },
      });
      const lida = res?.linhaDigitavel ?? res?.codigoBarras ?? "";
      if (!lida) {
        toast.warning("Não achei a linha digitável — informe manualmente.");
        return;
      }
      setCodigo(lida);
      await consultarCodigo(lida);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLendo(false);
    }
  };

  const dataEfetiva = modo === "agora" ? (boleto?.hoje ?? "") : dataPagamento;

  const valorAPagar = boleto
    ? boleto.valorEditavel
      ? Number(valorEditado.replace(",", ".")) || 0
      : Number(boleto.valorFinal ?? boleto.valorOriginal ?? 0)
    : 0;

  const enviar = async () => {
    if (!boleto) return;
    if (enviandoRef.current) return; // duplo clique: ignora a segunda chamada
    enviandoRef.current = true;
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    setEnviando(true);
    setErro(null);
    try {
      const r: any = await criar({
        data: {
          financialEntryId: entry?.id ?? null,
          identificationField: boleto.linhaDigitavel,
          value: valorAPagar,
          dueDate: boleto.vencimento,
          scheduleDate: modo === "agendar" ? (dataEfetiva || null) : null,
          scheduleTime: modo === "agendar" ? (horaPagamento || null) : null,
          description: entry?.description ?? boleto.beneficiario ?? "Pagamento de boleto",
          beneficiaryName: boleto.beneficiario ?? entry?.counterparty ?? null,
          beneficiaryDocument: boleto.documentoBeneficiario,
          boletoPath: path,
          clientRequestId: requestIdRef.current!,
          confirmado: true as const,
        },
      });
      if (!r.ok) {
        setErro(r.erro as ErroBoleto);
        setEtapa("conferencia");
        // Nova tentativa recebe novo identificador (a anterior ficou registrada).
        requestIdRef.current = null;
        return;
      }
      if (r.reaproveitado) {
        toast.info("Este pagamento já havia sido criado — nenhum pagamento duplicado foi gerado.");
        pagamentos.refetch();
        onDone?.();
        onOpenChange(false);
        return;
      }
      toast.success(
        r.status === "agendado"
          ? "Pagamento agendado"
          : r.status === "pago"
            ? "Pagamento concluído"
            : "Pagamento enviado — acompanhando processamento",
      );
      pagamentos.refetch();
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      setErro({
        titulo: "Pagamento não autorizado",
        mensagem: (e as Error).message,
        codigo: null, tecnico: null,
        orientacao: "Verifique os dados e tente novamente.",
      });
    } finally {
      setEnviando(false);
      enviandoRef.current = false;
    }
  };

  /* ---------- Painel de pagamento já existente ---------- */
  if (open && ativo) {
    const titulo =
      ativo.status === "pago" ? "Pagamento concluído"
        : ativo.status === "agendado" ? "Agendamento de pagamento"
          : ativo.status === "processando" ? "Pagamento em processamento"
            : "Pagamento aguardando processamento";
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border p-3 text-sm divide-y divide-border">
              <Linha label="Situação" value={BILL_STATUS_LABEL[ativo.status] ?? ativo.status} />
              <Linha label="Beneficiário" value={ativo.beneficiary_name ?? "—"} />
              <Linha label="Valor" value={formatBRL(Number(ativo.value))} />
              <Linha label="Vencimento" value={fmtDate(ativo.due_date)} />
              <Linha label="Data do pagamento" value={fmtDate(ativo.effective_date ?? ativo.scheduled_date)} />
              <Linha label="ID da operação" value={ativo.asaas_bill_id ?? "—"} />
              {ativo.fail_reason && <Linha label="Motivo" value={<span className="text-destructive">{ativo.fail_reason}</span>} />}
            </div>
            {ativo.status === "pago" ? (
              <ComprovanteActions billId={ativo.asaas_bill_id} compact={false} />
            ) : (
              <p className="flex items-center gap-1.5 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                O comprovante definitivo fica disponível após a confirmação do pagamento.
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={async () => {
                try { await sincronizar({ data: { id: ativo.id } }); pagamentos.refetch(); onDone?.(); }
                catch (e) { toast.error((e as Error).message); }
              }}>
                <RefreshCw className="h-4 w-4" /> Atualizar status
              </Button>
              {ativo.status !== "pago" && (
                <Button variant="destructive" className="gap-2" onClick={() =>
                  confirmThen("Cancelar este pagamento de boleto?", async () => {
                    try { await cancelar({ data: { id: ativo.id } }); pagamentos.refetch(); onDone?.(); toast.success("Pagamento cancelado"); }
                    catch (e) { toast.error((e as Error).message); }
                  })
                }>
                  <Ban className="h-4 w-4" /> Cancelar pagamento
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {etapa === "conferencia" ? "Você está pagando" : "Pagar boleto"}
          </DialogTitle>
        </DialogHeader>

        {etapa === "codigo" ? (
          <div className="space-y-4">
            <div>
              <Label>Linha digitável ou código de barras</Label>
              <Input
                autoFocus
                value={maskLinha(codigo)}
                onChange={(e) => { setCodigo(e.target.value.replace(/\D+/g, "")); setBoleto(null); setErro(null); }}
                onPaste={(e) => {
                  // Aceita colagem com pontos, espaços, quebras de linha ou texto junto.
                  const bruto = e.clipboardData.getData("text") ?? "";
                  const d = bruto.replace(/\D+/g, "");
                  if (!d) return;
                  e.preventDefault();
                  setBoleto(null);
                  setErro(null);
                  setCodigo(d);
                  const p = parseBoletoCode(d);
                  if (p.valid) void consultarCodigo(d);
                }}
                placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                inputMode="numeric"
                className="font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {codigo.length === 0
                  ? "Digite ou cole o código do boleto (47/48 dígitos) ou o código de barras (44)."
                  : formato.valid
                    ? `${formato.kind === "arrecadacao" ? "Conta de consumo/tributo" : "Boleto bancário"} válido — código de barras ${formato.barcode}.`
                    : formato.message}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="gap-2"
                disabled={!codigoCompleto || consultando}
                onClick={() => consultarCodigo()}
              >
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar boleto
              </Button>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40">
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {lendo ? "Lendo…" : "Ler de um arquivo"}
                <input type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); }} />
              </label>
            </div>

            {erro && <ErroPanel erro={erro} />}

            {boleto && (
              <div className="space-y-3">
                <div className="rounded-xl border p-3 divide-y divide-border">
                  <p className="flex items-center gap-1.5 pb-2 text-sm font-semibold text-emerald-500">
                    <ShieldCheck className="h-4 w-4" /> Boleto disponível para pagamento
                  </p>
                  <Linha label="Beneficiário" value={boleto.beneficiario ?? "—"} />
                  {boleto.documentoBeneficiario && <Linha label="CPF/CNPJ" value={boleto.documentoBeneficiario} />}
                  {boleto.instituicao && <Linha label="Instituição" value={boleto.instituicao} />}
                  <Linha label="Vencimento" value={fmtDate(boleto.vencimento)} />
                  {boleto.valorOriginal != null && <Linha label="Valor original" value={formatBRL(boleto.valorOriginal)} />}
                  {boleto.juros != null && boleto.juros > 0 && <Linha label="Juros" value={formatBRL(boleto.juros)} />}
                  {boleto.multa != null && boleto.multa > 0 && <Linha label="Multa" value={formatBRL(boleto.multa)} />}
                  {boleto.desconto != null && boleto.desconto > 0 && <Linha label="Desconto" value={formatBRL(boleto.desconto)} />}
                  {boleto.abatimento != null && boleto.abatimento > 0 && <Linha label="Abatimento" value={formatBRL(boleto.abatimento)} />}
                  <Linha label="Valor a pagar" value={<span className="text-base">{formatBRL(valorAPagar)}</span>} />
                  {boleto.dataMinimaPagamento && <Linha label="Pagável a partir de" value={fmtDate(boleto.dataMinimaPagamento)} />}
                  {boleto.dataMaximaPagamento && <Linha label="Data limite" value={fmtDate(boleto.dataMaximaPagamento)} />}
                  {boleto.descricao && <Linha label="Informações" value={boleto.descricao} />}
                </div>

                {boleto.vencido && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Boleto vencido — o provedor aceitou o pagamento com os encargos acima. Só é possível pagar hoje.
                  </p>
                )}

                <div>
                  <Label>Valor {boleto.valorEditavel ? "(alterável neste título)" : "(definido pelo boleto)"}</Label>
                  <Input
                    value={boleto.valorEditavel ? valorEditado : String(boleto.valorFinal ?? boleto.valorOriginal ?? "")}
                    readOnly={!boleto.valorEditavel}
                    disabled={!boleto.valorEditavel}
                    onChange={(e) => setValorEditado(e.target.value)}
                    inputMode="decimal"
                  />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant={modo === "agora" ? "default" : "outline"} onClick={() => setModo("agora")}>
                    Pagar agora
                  </Button>
                  <Button
                    size="sm"
                    variant={modo === "agendar" ? "default" : "outline"}
                    disabled={boleto.vencido}
                    onClick={() => setModo("agendar")}
                    className="gap-1.5"
                  >
                    <CalendarClock className="h-4 w-4" /> Agendar
                  </Button>
                </div>

                {modo === "agendar" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={dataPagamento}
                        min={boleto.dataMinimaPagamento ?? boleto.hoje}
                        max={boleto.dataMaximaPagamento ?? undefined}
                        onChange={(e) => setDataPagamento(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Hora</Label>
                      <Input type="time" step={300} value={horaPagamento}
                        onChange={(e) => setHoraPagamento(e.target.value)} />
                      <p className="mt-1 text-[11px] text-muted-foreground">Disparo no horário de Brasília.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button
                className="gap-1.5"
                disabled={!boleto || valorAPagar <= 0 || (modo === "agendar" && !dataPagamento)}
                onClick={() => setEtapa("conferencia")}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="text-2xl font-bold">{formatBRL(valorAPagar)}</p>
              <div className="mt-2 divide-y divide-border">
                <Linha label="Beneficiário" value={boleto?.beneficiario ?? entry?.counterparty ?? "—"} />
                <Linha label="CPF/CNPJ" value={boleto?.documentoBeneficiario ?? "—"} />
                <Linha label="Vencimento" value={fmtDate(boleto?.vencimento)} />
                <Linha
                  label="Data do pagamento"
                  value={`${fmtDate(dataEfetiva)}${modo === "agendar" ? ` às ${horaPagamento}` : ""}`}
                />
                <Linha label="Linha digitável" value={<span className="font-mono text-xs">{maskLinha(boleto?.linhaDigitavel ?? "")}</span>} />
              </div>
            </div>

            {erro && <ErroPanel erro={erro} />}

            <p className="text-[11px] text-muted-foreground">
              Em finais de semana e feriados o processamento ocorre no próximo dia útil. O comprovante
              definitivo só é gerado após a confirmação do pagamento.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setErro(null); setEtapa("codigo"); }}>Voltar</Button>
              <Button onClick={enviar} disabled={enviando}>
                {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
