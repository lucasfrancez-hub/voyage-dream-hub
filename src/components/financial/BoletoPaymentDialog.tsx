import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Upload, ShieldCheck, AlertTriangle, CalendarClock, Ban, RefreshCw,
  Search, ChevronRight, XCircle, Clock, Landmark,

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
  entry: { id: string; description: string; amount: number; due_date: string | null; counterparty: string | null; boleto_path?: string | null; boleto_line?: string | null } | null;
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

  const beneficiarioNome =
    boleto?.beneficiario ?? boleto?.instituicao ?? entry?.counterparty ?? "Beneficiário não informado";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/80 backdrop-blur-xl"
        className="max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border-white/10 bg-card/80 p-0 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.55)]"
      >
        <DialogHeader className="px-6 pb-4 pt-7 text-left">
          <DialogTitle className="text-xl font-bold tracking-tight">
            {etapa === "conferencia" ? "Você está pagando" : "Pagar boleto"}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {etapa === "conferencia"
              ? "Confira os dados antes de confirmar"
              : "Verifique os detalhes antes de confirmar"}
          </p>
        </DialogHeader>

        {etapa === "codigo" ? (
          <div className="space-y-5 px-6 pb-6">
            <div className="space-y-2">
              <div className="flex items-end justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Código de barras
                </span>
                {codigo.length > 0 && (
                  <span
                    className={
                      formato.valid
                        ? "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500"
                        : "rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500"
                    }
                  >
                    {formato.valid ? "VÁLIDO" : "INCOMPLETO"}
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={maskLinha(codigo)}
                  onChange={(e) => { setCodigo(e.target.value.replace(/\D+/g, "")); setBoleto(null); setErro(null); }}
                  onPaste={(e) => {
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
                  className="h-auto rounded-2xl border-border/60 bg-muted/40 py-4 pl-11 pr-4 font-mono text-[13px]"
                />
              </div>
              <p className="px-1 text-[11px] text-muted-foreground">
                {codigo.length === 0
                  ? "Digite ou cole o código do boleto (47/48 dígitos) ou o código de barras (44)."
                  : formato.valid
                    ? `${formato.kind === "arrecadacao" ? "Conta de consumo/tributo" : "Boleto bancário"} válido.`
                    : formato.message}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="h-11 flex-1 gap-2 rounded-2xl font-bold"
                disabled={!codigoCompleto || consultando}
                onClick={() => consultarCodigo()}
              >
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar boleto
              </Button>
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 px-4 text-xs font-semibold text-muted-foreground transition hover:bg-muted">
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {lendo ? "Lendo…" : "Arquivo"}
                <input type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); }} />
              </label>
            </div>

            {erro && <ErroPanel erro={erro} />}

            {boleto && (
              <div className="space-y-4">
                <div className="space-y-5 rounded-3xl border border-white/5 bg-gradient-to-b from-muted/40 to-muted/10 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                      <Landmark className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Beneficiário
                      </p>
                      <p className="text-base font-bold leading-tight break-words">{beneficiarioNome}</p>
                      {boleto.documentoBeneficiario && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{boleto.documentoBeneficiario}</p>
                      )}
                      {boleto.instituicao && boleto.instituicao !== beneficiarioNome && (
                        <p className="text-xs text-muted-foreground">{boleto.instituicao}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {boleto.valorOriginal != null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Valor original</span>
                        <span className="font-medium">{formatBRL(boleto.valorOriginal)}</span>
                      </div>
                    )}
                    {boleto.multa != null && boleto.multa > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Multa</span>
                        <span className="font-medium text-amber-500">+ {formatBRL(boleto.multa)}</span>
                      </div>
                    )}
                    {boleto.juros != null && boleto.juros > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Juros</span>
                        <span className="font-medium text-amber-500">+ {formatBRL(boleto.juros)}</span>
                      </div>
                    )}
                    {boleto.desconto != null && boleto.desconto > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Desconto</span>
                        <span className="font-medium text-emerald-500">− {formatBRL(boleto.desconto)}</span>
                      </div>
                    )}
                    {boleto.abatimento != null && boleto.abatimento > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Abatimento</span>
                        <span className="font-medium text-emerald-500">− {formatBRL(boleto.abatimento)}</span>
                      </div>
                    )}

                    <div className="mt-3 flex items-end justify-between border-t border-white/5 pt-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Total a pagar
                        </p>
                        <p className="text-3xl font-bold tracking-tight">{formatBRL(valorAPagar)}</p>
                      </div>
                      <p className="pb-1 text-[10px] text-muted-foreground">
                        {boleto.vencido ? "Venceu em " : "Vence em "}{fmtDate(boleto.vencimento)}
                      </p>
                    </div>
                  </div>

                  {(boleto.dataMaximaPagamento || boleto.descricao) && (
                    <div className="space-y-1 border-t border-white/5 pt-3 text-[11px] text-muted-foreground">
                      {boleto.dataMaximaPagamento && <p>Data limite: {fmtDate(boleto.dataMaximaPagamento)}</p>}
                      {boleto.descricao && <p className="break-words">{boleto.descricao}</p>}
                    </div>
                  )}
                </div>

                {boleto.vencido && (
                  <div className="flex gap-3 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs leading-relaxed text-amber-500/80">
                      Este boleto está <span className="font-bold text-amber-500">vencido</span>. Os encargos foram
                      calculados pelo banco emissor e o pagamento só pode ser feito hoje.
                    </p>
                  </div>
                )}

                {boleto.valorEditavel && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Valor (alterável neste título)
                    </Label>
                    <Input
                      value={valorEditado}
                      onChange={(e) => setValorEditado(e.target.value)}
                      inputMode="decimal"
                      className="h-12 rounded-2xl border-border/60 bg-muted/40 text-base font-semibold"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant={modo === "agendar" ? "default" : "secondary"}
                    disabled={boleto.vencido}
                    onClick={() => setModo("agendar")}
                    className="h-12 gap-2 rounded-2xl font-bold"
                  >
                    <CalendarClock className="h-4 w-4" /> Agendar
                  </Button>
                  <Button
                    variant={modo === "agora" ? "default" : "secondary"}
                    onClick={() => setModo("agora")}
                    className="h-12 rounded-2xl font-bold"
                  >
                    Pagar agora
                  </Button>
                </div>

                {modo === "agendar" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data</Label>
                      <Input
                        type="date"
                        value={dataPagamento}
                        min={boleto.dataMinimaPagamento ?? boleto.hoje}
                        max={boleto.dataMaximaPagamento ?? undefined}
                        onChange={(e) => setDataPagamento(e.target.value)}
                        className="h-11 rounded-2xl border-border/60 bg-muted/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hora</Label>
                      <Input type="time" step={300} value={horaPagamento}
                        onChange={(e) => setHoraPagamento(e.target.value)}
                        className="h-11 rounded-2xl border-border/60 bg-muted/40" />
                      <p className="text-[10px] text-muted-foreground">Horário de Brasília.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="mt-2 flex-row items-center justify-between gap-3 border-t border-white/5 pt-4 sm:justify-between">
              <button
                type="button"
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </button>
              <Button
                className="h-11 gap-1.5 rounded-full px-6 font-bold"
                disabled={!boleto || valorAPagar <= 0 || (modo === "agendar" && !dataPagamento)}
                onClick={() => setEtapa("conferencia")}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 px-6 pb-6">
            <div className="space-y-5 rounded-3xl border border-white/5 bg-gradient-to-b from-muted/40 to-muted/10 p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor</p>
                <p className="text-4xl font-bold tracking-tight">{formatBRL(valorAPagar)}</p>
              </div>
              <div className="flex items-start gap-4 border-t border-white/5 pt-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Landmark className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Beneficiário</p>
                  <p className="text-base font-bold leading-tight break-words">{beneficiarioNome}</p>
                  {boleto?.documentoBeneficiario && (
                    <p className="text-xs text-muted-foreground">{boleto.documentoBeneficiario}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2.5 border-t border-white/5 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vencimento</span>
                  <span className="font-medium">{fmtDate(boleto?.vencimento)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Data do pagamento</span>
                  <span className="font-medium">
                    {fmtDate(dataEfetiva)}{modo === "agendar" ? ` às ${horaPagamento}` : ""}
                  </span>
                </div>
                <div className="border-t border-white/5 pt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Linha digitável</p>
                  <p className="break-all font-mono text-[11px]">{maskLinha(boleto?.linhaDigitavel ?? "")}</p>
                </div>
              </div>
            </div>

            {erro && <ErroPanel erro={erro} />}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Em finais de semana e feriados o processamento ocorre no próximo dia útil. O comprovante
              definitivo só é gerado após a confirmação do pagamento.
            </p>

            <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-white/5 pt-4 sm:justify-between">
              <button
                type="button"
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                onClick={() => { setErro(null); setEtapa("codigo"); }}
              >
                Voltar
              </button>
              <Button onClick={enviar} disabled={enviando} className="h-11 rounded-full px-6 font-bold">
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

