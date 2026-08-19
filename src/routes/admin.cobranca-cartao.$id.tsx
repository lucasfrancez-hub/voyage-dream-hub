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
      { title: "Detalhe da transação | VIA AIR" },
      {
        name: "description",
        content: "Pagamento, antecipação e linha do tempo completa da transação de cartão no ASAAS.",
      },
      { property: "og:title", content: "Detalhe da transação | VIA AIR" },
      { property: "og:description", content: "Auditoria da transação de cartão da VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const dataBR = (v?: string | null) =>
  v ? new Date(`${v}T12:00:00Z`).toLocaleDateString("pt-BR") : "—";

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
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
  if (!charge) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm">Transação não encontrada.</div>;

  const ultimaAnt = antecipacoes[0] ?? null;
  const podeAntecipar = ["aprovado", "recebido"].includes(charge.status);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/admin/cobranca-cartao" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {charge.chargeback_status && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm font-bold text-destructive">
          <AlertTriangle className="h-4 w-4" /> CHARGEBACK ABERTO — {charge.chargeback_status}
        </div>
      )}

      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            VENDA {charge.venda_ref ? `#${charge.venda_ref}` : `#${charge.id.slice(0, 8).toUpperCase()}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {charge.cliente_nome} • lançada em {dataHora(charge.created_at)} por {charge.atendente_nome ?? "—"}
          </p>
        </div>
        <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold ${corStatus(charge.status)}`}>
          {ROTULO_STATUS[charge.status] ?? charge.status}
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" /> Pagamento
          </h2>
          <Linha rotulo="Valor da venda" valor={formatBRL(charge.valor)} />
          <Linha
            rotulo="Parcelamento"
            valor={`${charge.parcelas}x de ${formatBRL(charge.valor_parcela ?? charge.valor / charge.parcelas)}`}
          />
          <Linha rotulo="Status do pagamento" valor={ROTULO_STATUS[charge.status] ?? charge.status} />
          <Linha rotulo="Status ASAAS" valor={charge.asaas_status ?? "—"} />
          <Linha rotulo="Bandeira" valor={charge.card_brand ?? "—"} />
          <Linha rotulo="Cartão" valor={charge.card_last4 ? `•••• ${charge.card_last4}` : "—"} />
          <Linha rotulo="Titular" valor={charge.card_holder_name ?? "—"} />
          <Linha
            rotulo="Código de autorização"
            valor={charge.authorization_code ?? <span className="text-muted-foreground">não disponibilizado pelo ASAAS</span>}
          />
          <Linha rotulo="NSU" valor={charge.nsu ?? <span className="text-muted-foreground">não disponibilizado pelo ASAAS</span>} />
          <Linha rotulo="TID" valor={charge.tid ?? <span className="text-muted-foreground">não disponibilizado pelo ASAAS</span>} />
          <Linha
            rotulo="Transação da adquirente"
            valor={charge.acquirer_transaction_id ?? <span className="text-muted-foreground">não disponibilizado pelo ASAAS</span>}
          />
          <Linha rotulo="ID ASAAS" valor={charge.asaas_payment_id ?? "—"} />
          <Linha rotulo="ID parcelamento" valor={charge.asaas_installment_id ?? "—"} />
          <Linha rotulo="Referência externa" valor={charge.external_reference ?? "—"} />
          <Linha rotulo="Valor bruto" valor={charge.valor_bruto != null ? formatBRL(charge.valor_bruto) : "—"} />
          <Linha rotulo="Taxas" valor={charge.taxas != null ? formatBRL(charge.taxas) : "—"} />
          <Linha rotulo="Valor líquido" valor={charge.valor_liquido != null ? formatBRL(charge.valor_liquido) : "—"} />
          <Linha rotulo="Confirmado em" valor={dataBR(charge.confirmed_date)} />
          <Linha rotulo="Crédito previsto" valor={dataBR(charge.credit_date)} />
          {charge.erro_mensagem && <Linha rotulo="Erro" valor={charge.erro_mensagem} />}

          <button
            onClick={sincronizar}
            disabled={ocupado}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Consultar no ASAAS
          </button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Zap className="h-3.5 w-3.5" /> Antecipação
          </h2>
          {ultimaAnt ? (
            <>
              <Linha rotulo="Status" valor={ultimaAnt.status} />
              <Linha rotulo="ID da antecipação" valor={ultimaAnt.asaas_anticipation_id ?? "—"} />
              <Linha rotulo="Valor bruto" valor={ultimaAnt.valor_bruto != null ? formatBRL(ultimaAnt.valor_bruto) : "—"} />
              <Linha rotulo="Taxa" valor={ultimaAnt.taxa != null ? formatBRL(ultimaAnt.taxa) : "—"} />
              <Linha rotulo="Valor líquido" valor={ultimaAnt.valor_liquido != null ? formatBRL(ultimaAnt.valor_liquido) : "—"} />
              <Linha rotulo="Solicitada em" valor={dataHora(ultimaAnt.requested_at)} />
              <Linha rotulo="Data prevista" valor={dataBR(ultimaAnt.scheduled_date)} />
              <Linha rotulo="Data do crédito" valor={dataBR(ultimaAnt.credit_date)} />
              <Linha rotulo="Parcelas antecipadas" valor={ultimaAnt.parcelas_antecipadas ?? "—"} />
              {ultimaAnt.denial_reason && <Linha rotulo="Motivo da negativa" valor={ultimaAnt.denial_reason} />}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma antecipação registrada. O ciclo da antecipação é independente do status do pagamento.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
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
            <p className="mt-2 text-xs text-muted-foreground">
              Disponível somente com a cobrança aprovada/recebida.
            </p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Linha do tempo
        </h2>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="space-y-2">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">{dataHora(ev.received_at)}</span>
                <span className="font-semibold">{ev.event_type}</span>
                {ev.status_anterior && ev.status_novo && ev.status_anterior !== ev.status_novo && (
                  <span className="text-xs text-muted-foreground">
                    {ev.status_anterior} → {ev.status_novo}
                  </span>
                )}
                {ev.resultado && <span className="text-xs text-muted-foreground">• {ev.resultado}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
