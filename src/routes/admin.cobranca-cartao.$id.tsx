import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Zap,
  AlertTriangle,
  Clock,
  CreditCard,
  Printer,
  Copy,
  Check,
  ReceiptText,
  CalendarDays,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { ROTULO_STATUS, corStatus } from "./admin.cobranca-cartao.index";
import {
  detalheCobrancaCartao,
  reconsultarCobranca,
  simularAntecipacaoCobranca,
  solicitarAntecipacaoCobranca,
  type Antecipacao,
  type CobrancaCartao,
  type EventoCobranca,
} from "@/lib/asaas-card.functions";

export const Route = createFileRoute("/admin/cobranca-cartao/$id")({
  component: DetalheCobrancaPage,
  head: () => ({
    meta: [
      { title: "Comprovante da transação | VIA AIR" },
      {
        name: "description",
        content:
          "Comprovante completo da transação de cartão: ID ASAAS, bandeira, final do cartão, datas, valores bruto e líquido, taxas, antecipação e códigos de autorização.",
      },
      { property: "og:title", content: "Comprovante da transação | VIA AIR" },
      {
        property: "og:description",
        content: "Auditoria e conciliação da transação de cartão da VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const dataBR = (v?: string | null) =>
  v
    ? v.length <= 10
      ? new Date(`${v}T12:00:00Z`).toLocaleDateString("pt-BR")
      : new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";

function Copiavel({ valor }: { valor: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          toast.error("Não foi possível copiar.");
        }
      }}
      className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold hover:text-primary print:pointer-events-none"
      title="Copiar"
    >
      {valor}
      {ok ? (
        <Check className="h-3 w-3 text-emerald-500 print:hidden" />
      ) : (
        <Copy className="h-3 w-3 opacity-50 print:hidden" />
      )}
    </button>
  );
}

function Linha({
  rotulo,
  valor,
  copiar,
  destaque,
}: {
  rotulo: string;
  valor?: React.ReactNode;
  copiar?: string | null;
  destaque?: boolean;
}) {
  const conteudo =
    copiar != null && copiar !== "" ? (
      <Copiavel valor={copiar} />
    ) : valor != null && valor !== "" ? (
      valor
    ) : (
      <span className="text-xs font-normal text-muted-foreground">
        não disponibilizado pelo ASAAS
      </span>
    );
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={`text-right ${destaque ? "text-base font-bold" : "font-medium"}`}>
        {conteudo}
      </span>
    </div>
  );
}

function Bloco({
  titulo,
  icone,
  children,
  className = "",
}: {
  titulo: string;
  icone: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-5 print:break-inside-avoid print:rounded-none ${className}`}
    >
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {icone} {titulo}
      </h2>
      {children}
    </section>
  );
}

function DetalheCobrancaPage() {
  const { id } = Route.useParams();
  const carregarFn = useServerFn(detalheCobrancaCartao);
  const reconsultar = useServerFn(reconsultarCobranca);
  const simular = useServerFn(simularAntecipacaoCobranca);
  const solicitar = useServerFn(solicitarAntecipacaoCobranca);

  const [charge, setCharge] = useState<CobrancaCartao | null>(null);
  const [antecipacoes, setAntecipacoes] = useState<Antecipacao[]>([]);
  const [eventos, setEventos] = useState<EventoCobranca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await carregarFn({ data: { chargeId: id } });
      setCharge(r.charge);
      setAntecipacoes(r.antecipacoes);
      setEventos(r.eventos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar a transação.");
    } finally {
      setCarregando(false);
    }
  }, [carregarFn, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sincronizar = async () => {
    setOcupado(true);
    try {
      await reconsultar({ data: { chargeId: id } });
      await carregar();
      toast.success("Transação sincronizada com o ASAAS.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setOcupado(false);
    }
  };

  const simularAnt = async () => {
    setOcupado(true);
    try {
      const s = await simular({ data: { chargeId: id } });
      toast.message(
        `Antecipação: bruto ${formatBRL(Number(s.valorBruto ?? 0))} • taxa ${formatBRL(Number(s.taxa ?? 0))} • líquido ${formatBRL(Number(s.valorLiquido ?? 0))}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível simular.");
    } finally {
      setOcupado(false);
    }
  };

  const solicitarAnt = async () => {
    setOcupado(true);
    try {
      await solicitar({ data: { chargeId: id } });
      await carregar();
      toast.success("Antecipação solicitada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível solicitar a antecipação.");
    } finally {
      setOcupado(false);
    }
  };

  if (carregando && !charge) {
    return (
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando transação...
      </div>
    );
  }
  if (!charge)
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm">Transação não encontrada.</div>;

  const ultimaAnt = antecipacoes[0] ?? null;
  const podeAntecipar = ["aprovado", "recebido"].includes(charge.status);
  const valorParcela = charge.valor_parcela ?? charge.valor / Math.max(1, charge.parcelas);
  const taxaTotal =
    (charge.taxas ?? 0) + (ultimaAnt?.status === "CREDITED" ? (ultimaAnt.taxa ?? 0) : 0);
  const liquidoFinal =
    ultimaAnt?.status === "CREDITED" && ultimaAnt.valor_liquido != null
      ? ultimaAnt.valor_liquido
      : charge.valor_liquido;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:py-0">
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          to="/admin/cobranca-cartao"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="ml-auto flex gap-2">
          <button
            onClick={sincronizar}
            disabled={ocupado}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${ocupado ? "animate-spin" : ""}`} /> Consultar no
            ASAAS
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {charge.chargeback_status && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm font-bold text-destructive">
          <AlertTriangle className="h-4 w-4" /> CHARGEBACK ABERTO — {charge.chargeback_status}
        </div>
      )}

      <header className="mb-5 rounded-2xl border border-border bg-card p-5 print:rounded-none">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <ReceiptText className="h-3.5 w-3.5" /> Comprovante de transação • VIA AIR
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {charge.venda_ref
                ? `Venda #${charge.venda_ref}`
                : `Transação #${charge.id.slice(0, 8).toUpperCase()}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {charge.cliente_nome ?? "—"}
              {charge.cliente_documento ? ` • ${charge.cliente_documento}` : ""} • lançada em{" "}
              {dataHora(charge.created_at)} por {charge.atendente_nome ?? "—"}
            </p>
          </div>
          <span
            className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold ${corStatus(charge.status)}`}
          >
            {ROTULO_STATUS[charge.status] ?? charge.status}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor bruto</p>
            <p className="text-lg font-bold">{formatBRL(charge.valor_bruto ?? charge.valor)}</p>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Taxas</p>
            <p className="text-lg font-bold text-destructive">
              {taxaTotal ? `- ${formatBRL(taxaTotal)}` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Líquido a receber
            </p>
            <p className="text-lg font-bold text-emerald-600">
              {liquidoFinal != null ? formatBRL(liquidoFinal) : "—"}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco titulo="Cartão e autorização" icone={<CreditCard className="h-3.5 w-3.5" />}>
          <Linha rotulo="Bandeira" valor={charge.card_brand} />
          <Linha
            rotulo="Final do cartão"
            valor={charge.card_last4 ? `•••• •••• •••• ${charge.card_last4}` : undefined}
          />
          <Linha rotulo="Titular" valor={charge.card_holder_name} />
          <Linha rotulo="Código de autorização" copiar={charge.authorization_code} />
          <Linha rotulo="NSU" copiar={charge.nsu} />
          <Linha rotulo="TID" copiar={charge.tid} />
          <Linha rotulo="Transação da adquirente" copiar={charge.acquirer_transaction_id} />
          {charge.erro_mensagem && (
            <Linha
              rotulo="Retorno da recusa"
              valor={
                <span className="text-destructive">
                  {charge.erro_codigo ? `${charge.erro_codigo} — ` : ""}
                  {charge.erro_mensagem}
                </span>
              }
            />
          )}
        </Bloco>

        <Bloco titulo="Identificadores ASAAS" icone={<Landmark className="h-3.5 w-3.5" />}>
          <Linha rotulo="ID da cobrança" copiar={charge.asaas_payment_id} />
          <Linha rotulo="ID do parcelamento" copiar={charge.asaas_installment_id} />
          <Linha rotulo="ID do cliente" copiar={charge.asaas_customer_id} />
          <Linha rotulo="Referência externa" copiar={charge.external_reference} />
          <Linha rotulo="Status no ASAAS" valor={charge.asaas_status} />
          <Linha rotulo="ID interno" copiar={charge.id} />
        </Bloco>

        <Bloco titulo="Valores e parcelamento" icone={<ReceiptText className="h-3.5 w-3.5" />}>
          <Linha rotulo="Valor da venda" valor={formatBRL(charge.valor)} destaque />
          <Linha
            rotulo="Parcelamento"
            valor={`${charge.parcelas}x de ${formatBRL(valorParcela)}`}
          />
          <Linha
            rotulo="Valor bruto"
            valor={charge.valor_bruto != null ? formatBRL(charge.valor_bruto) : undefined}
          />
          <Linha
            rotulo="Taxa da adquirente"
            valor={charge.taxas != null ? formatBRL(charge.taxas) : undefined}
          />
          <Linha
            rotulo="Valor líquido"
            valor={charge.valor_liquido != null ? formatBRL(charge.valor_liquido) : undefined}
          />
          <Linha rotulo="Descrição" valor={charge.descricao} />
        </Bloco>

        <Bloco titulo="Datas" icone={<CalendarDays className="h-3.5 w-3.5" />}>
          <Linha rotulo="Criada no ASAAS" valor={dataBR(charge.date_created)} />
          <Linha rotulo="Autorizada / lançada" valor={dataHora(charge.created_at)} />
          <Linha rotulo="Confirmada" valor={dataBR(charge.confirmed_date)} />
          <Linha rotulo="Pagamento" valor={dataBR(charge.payment_date)} />
          <Linha rotulo="Crédito previsto" valor={dataBR(charge.credit_date)} />
          <Linha rotulo="Última atualização" valor={dataHora(charge.updated_at)} />
        </Bloco>
      </div>

      <Bloco
        titulo="Antecipação"
        icone={<Zap className="h-3.5 w-3.5" />}
        className="mt-4"
      >
        {ultimaAnt ? (
          <>
            <Linha rotulo="Status" valor={ultimaAnt.status} destaque />
            <Linha rotulo="ID da antecipação" copiar={ultimaAnt.asaas_anticipation_id} />
            <Linha
              rotulo="Valor bruto antecipado"
              valor={ultimaAnt.valor_bruto != null ? formatBRL(ultimaAnt.valor_bruto) : undefined}
            />
            <Linha
              rotulo="Taxa da antecipação"
              valor={ultimaAnt.taxa != null ? formatBRL(ultimaAnt.taxa) : undefined}
            />
            <Linha
              rotulo="Líquido antecipado"
              valor={
                ultimaAnt.valor_liquido != null ? formatBRL(ultimaAnt.valor_liquido) : undefined
              }
            />
            <Linha rotulo="Solicitada em" valor={dataHora(ultimaAnt.requested_at)} />
            <Linha rotulo="Data prevista" valor={dataBR(ultimaAnt.scheduled_date)} />
            <Linha rotulo="Data do crédito" valor={dataBR(ultimaAnt.credit_date)} />
            <Linha rotulo="Parcelas antecipadas" valor={ultimaAnt.parcelas_antecipadas} />
            {ultimaAnt.denial_reason && (
              <Linha rotulo="Motivo da negativa" valor={ultimaAnt.denial_reason} />
            )}
            {antecipacoes.length > 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {antecipacoes.length - 1} solicitação(ões) anterior(es) registrada(s) no histórico.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma antecipação registrada. O ciclo da antecipação é independente do status do
            pagamento.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <button
            onClick={simularAnt}
            disabled={ocupado || !podeAntecipar}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Simular antecipação
          </button>
          <button
            onClick={solicitarAnt}
            disabled={ocupado || !podeAntecipar}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" /> Solicitar antecipação
          </button>
        </div>
        {!podeAntecipar && (
          <p className="mt-2 text-xs text-muted-foreground print:hidden">
            Disponível somente com a cobrança aprovada/recebida.
          </p>
        )}
      </Bloco>

      <Bloco titulo="Linha do tempo" icone={<Clock className="h-3.5 w-3.5" />} className="mt-4">
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="space-y-2">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {dataHora(ev.received_at)}
                </span>
                <span className="font-semibold">{ev.event_type}</span>
                {ev.status_anterior && ev.status_novo && ev.status_anterior !== ev.status_novo && (
                  <span className="text-xs text-muted-foreground">
                    {ev.status_anterior} → {ev.status_novo}
                  </span>
                )}
                {ev.resultado && (
                  <span className="text-xs text-muted-foreground">• {ev.resultado}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Bloco>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Documento interno de conciliação — VIA AIR • gerado em {new Date().toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
