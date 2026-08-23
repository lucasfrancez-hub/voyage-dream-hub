/**
 * Pagamento interno da reserva na consolidadora.
 *
 * Cenário 1 — Cobrar cliente com RAV por fora: gera um Pix NOSSO (ASAAS) com o
 * valor da consolidadora + RAV. Quando o Pix cai, o sistema paga sozinho o Pix
 * da consolidadora com o saldo ASAAS.
 *
 * Cenário 2 — Pagar agora: paga o Pix da consolidadora na hora, debitando do
 * nosso saldo ASAAS.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Loader2, QrCode, RefreshCw, Send, Wallet, Zap } from "lucide-react";
import {
  passhubCobrarComRav,
  passhubPagamentosReserva,
  passhubPagarAgora,
  passhubPixReserva,
  passhubRepassarPagamento,
} from "@/lib/passhub/passhub.functions";
import { confirm } from "@/lib/confirm";
import type { PassHubReservaLista } from "@/lib/passhub/types";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const rotuloStatus: Record<string, { texto: string; cor: string }> = {
  aguardando: { texto: "Aguardando pagamento", cor: "cons-status-pay" },
  recebido: { texto: "Recebido — repassando", cor: "cons-status-res" },
  repassado: { texto: "Pago à consolidadora", cor: "cons-status-ok" },
  falha_repasse: { texto: "Falha no repasse", cor: "cons-status-pay" },
  cancelado: { texto: "Cancelado", cor: "cons-status-pay" },
  estornado: { texto: "Estornado", cor: "cons-status-pay" },
};

export function BlocoPagamentoInterno({ r }: { r: PassHubReservaLista }) {
  const cobrarFn = useServerFn(passhubCobrarComRav);
  const pagarFn = useServerFn(passhubPagarAgora);
  const repassarFn = useServerFn(passhubRepassarPagamento);
  const listarFn = useServerFn(passhubPagamentosReserva);

  const pedirPixPasshub = useServerFn(passhubPixReserva);
  const [rav, setRav] = useState(
    r.comissaoExtra ? String(r.comissaoExtra).replace(".", ",") : "",
  );
  const [valorManual, setValorManual] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [pixPasshub, setPixPasshub] = useState<{
    copiaECola: string;
    qrCodeBase64: string;
    valor: number;
    expiraEm: string;
  } | null>(null);

  const gerarPixPasshub = useMutation({
    mutationFn: () =>
      pedirPixPasshub({ data: { id: r.idPassagem, localizador: r.localizador || undefined } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      setPixPasshub(res.pix);
      toast.success("Pix da PassHub gerado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao gerar o Pix da PassHub"),
  });


  const pagamentos = useQuery({
    queryKey: ["passhub-pagamentos", r.idPassagem],
    queryFn: () => listarFn({ data: { id: r.idPassagem } }),
    refetchInterval: 20_000,
  });

  const lista = pagamentos.data?.ok ? pagamentos.data.pagamentos : [];
  const numero = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
  // Piso do Pix VIA AIR: total da reserva (líquido + comissão da consolidadora).
  const base = r.totalVenda || r.preco;
  const previsto = numero(valorManual) > 0 ? numero(valorManual) : base + numero(rav);

  const cobrar = useMutation({
    mutationFn: () =>
      cobrarFn({
        data: {
          id: r.idPassagem,
          localizador: r.localizador || undefined,
          markup: numero(rav),
          valorCobradoManual: numero(valorManual) > 0 ? numero(valorManual) : undefined,
          clienteNome: r.passageirosDetalhe?.[0]?.nome || r.passageiros?.[0] || undefined,
          clienteDocumento: r.passageirosDetalhe?.[0]?.documento || undefined,
          clienteTelefone: r.whatsapp || undefined,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      toast.success("Pix da VIA AIR gerado — pode enviar ao cliente");
      setRav("");
      setValorManual("");
      pagamentos.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao gerar a cobrança"),
  });

  const pagarAgora = useMutation({
    mutationFn: () =>
      pagarFn({ data: { id: r.idPassagem, localizador: r.localizador || undefined } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      toast.success(`Pix da consolidadora pago: ${brl(res.pagamento.valorPasshub)}`);
      pagamentos.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao pagar"),
  });

  const repassar = useMutation({
    mutationFn: (pagamentoId: string) => repassarFn({ data: { pagamentoId } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      toast.success("Consolidadora paga");
      pagamentos.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao repassar"),
  });

  const confirmarPagamento = async () => {
    const ok = await confirm({
      title: "Pagar a consolidadora agora?",
      description: `O Pix da reserva ${r.localizador || r.idPassagem} será pago debitando o saldo da nossa conta ASAAS.`,
      confirmText: "Pagar agora",
      cancelText: "Voltar",
    });
    if (ok) pagarAgora.mutate();
  };

  const copiar = async (texto: string, chave: string, aviso: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    toast.success(aviso);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <div>
      <p className="mb-3 text-[11px] cons-muted">
        <b>Pix VIA AIR</b>: cobra o cliente com a RAV por fora — quando cair, o sistema paga o Pix
        da PassHub sozinho. <b>Pix PassHub</b>: o Pix de custo da consolidadora, que você pode pagar
        na hora com o saldo ASAAS.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* -------- Pix VIA AIR (cobrança do cliente) -------- */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="cons-lab">1 · Pix VIA AIR (cliente)</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] cons-muted">RAV por fora (R$)</span>
              <input
                className="cons-field w-full"
                inputMode="decimal"
                placeholder="0,00"
                value={rav}
                onChange={(e) => setRav(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] cons-muted">Ou valor total manual (R$)</span>
              <input
                className="cons-field w-full"
                inputMode="decimal"
                placeholder="opcional"
                value={valorManual}
                onChange={(e) => setValorManual(e.target.value)}
              />
            </label>
          </div>
          <p className="text-[12px]">
            Custo PassHub <b>{brl(base)}</b> · cliente paga <b>{brl(previsto)}</b>
          </p>
          <button
            type="button"
            className="cons-btn cons-btn-primary"
            onClick={() => cobrar.mutate()}
            disabled={cobrar.isPending}
          >
            {cobrar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            Gerar Pix VIA AIR
          </button>
          <p className="text-[11px] cons-muted">
            Pagamento identificado automaticamente → PassHub paga sozinho.
          </p>
        </div>

        {/* -------- Pix PassHub (custo) -------- */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="cons-lab">2 · Pix PassHub (custo)</div>
          <button
            type="button"
            className="cons-btn"
            onClick={() => gerarPixPasshub.mutate()}
            disabled={gerarPixPasshub.isPending}
          >
            {gerarPixPasshub.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            {pixPasshub ? "Gerar Pix PassHub novamente" : "Gerar Pix PassHub"}
          </button>

          {pixPasshub ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              {pixPasshub.qrCodeBase64 ? (
                <img
                  src={pixPasshub.qrCodeBase64}
                  alt="QR Code Pix da PassHub"
                  className="h-32 w-32 shrink-0 rounded-lg bg-white p-2"
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-2">
                {pixPasshub.valor ? (
                  <p className="text-[13px] font-semibold">{brl(pixPasshub.valor)}</p>
                ) : null}
                {pixPasshub.expiraEm ? (
                  <p className="text-[11px] cons-muted">Válido até {pixPasshub.expiraEm}</p>
                ) : null}
                <code className="block max-h-20 overflow-auto break-all rounded-lg bg-black/30 px-2 py-1 text-[10px]">
                  {pixPasshub.copiaECola}
                </code>
                <button
                  type="button"
                  className="cons-btn"
                  onClick={() =>
                    copiar(pixPasshub.copiaECola, "pix-passhub", "Pix da PassHub copiado")
                  }
                >
                  {copiado === "pix-passhub" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Copia e cola
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="cons-btn cons-btn-blue"
            onClick={confirmarPagamento}
            disabled={pagarAgora.isPending}
          >
            {pagarAgora.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Pagar PassHub agora (saldo ASAAS)
          </button>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          className="cons-btn"
          onClick={() => pagamentos.refetch()}
          disabled={pagamentos.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${pagamentos.isFetching ? "animate-spin" : ""}`} />
          Atualizar status
        </button>
      </div>


      {lista.length ? (
        <div className="mt-3 space-y-3">
          {lista.map((p) => {
            const st = rotuloStatus[p.status] ?? { texto: p.status, cor: "cons-status-pay" };
            return (
              <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`cons-status ${st.cor}`}>{st.texto}</span>
                  <span className="text-[11px] cons-muted">
                    {p.modo === "pagamento_direto" ? "Pago do saldo ASAAS" : "Cobrança ao cliente"} ·{" "}
                    {new Date(p.criadoEm).toLocaleString("pt-BR")}
                  </span>
                </div>

                {p.modo === "cobranca_cliente" ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {p.pixQrBase64 ? (
                      <img
                        src={p.pixQrBase64}
                        alt="QR Code Pix VIA AIR"
                        className="h-36 w-36 shrink-0 rounded-lg bg-white p-2"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-[13px]">
                        Cliente paga <b>{brl(p.valorCobrado)}</b> · consolidadora{" "}
                        {brl(p.valorPasshub)} · RAV por fora <b>{brl(p.markup)}</b>
                      </p>
                      {p.pixCopiaCola ? (
                        <>
                          <code className="block max-h-20 overflow-auto break-all rounded-lg bg-black/30 px-2 py-1 text-[10px]">
                            {p.pixCopiaCola}
                          </code>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="cons-btn"
                              onClick={() =>
                                copiar(p.pixCopiaCola!, `pix-${p.id}`, "Pix copia e cola copiado")
                              }
                            >
                              {copiado === `pix-${p.id}` ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                              Copia e cola
                            </button>
                            <a
                              className="cons-btn"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://wa.me/${(r.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(
                                `Pix da sua reserva ${r.localizador || ""} — ${brl(p.valorCobrado)}:\n\n${p.pixCopiaCola}`,
                              )}`}
                            >
                              <Send className="h-4 w-4" /> Enviar no WhatsApp
                            </a>
                          </div>
                        </>
                      ) : null}
                      {p.status === "recebido" || p.status === "falha_repasse" ? (
                        <button
                          type="button"
                          className="cons-btn cons-btn-primary"
                          onClick={() => repassar.mutate(p.id)}
                          disabled={repassar.isPending}
                        >
                          {repassar.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                          Pagar consolidadora agora
                        </button>
                      ) : null}
                      {p.repasseErro ? (
                        <p className="text-[11px] text-red-300">Repasse: {p.repasseErro}</p>
                      ) : null}
                      {p.repasseEm ? (
                        <p className="text-[11px] cons-muted">
                          Repassado {brl(p.repasseValor ?? 0)} em{" "}
                          {new Date(p.repasseEm).toLocaleString("pt-BR")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px]">
                    Pago à consolidadora <b>{brl(p.repasseValor ?? p.valorPasshub)}</b>
                    {p.repasseEm ? ` em ${new Date(p.repasseEm).toLocaleString("pt-BR")}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
