/**
 * Hub de pagamento da reserva na consolidadora — modelo "Glass payment hub".
 *
 * Etapa 1 — Cobrar o cliente: gera um Pix NOSSO (ASAAS) com o total da reserva
 * + RAV extra opcional. Quando o Pix cai, o sistema paga sozinho o Pix da
 * consolidadora com o saldo ASAAS.
 *
 * Etapa 2 — Pagar a consolidadora: um único botão que busca o copia e cola da
 * PassHub e debita o saldo ASAAS na hora.
 *
 * Etapa 3 — Link do checkout da consolidadora (recurso auxiliar).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Send,
  Wallet,
  Zap,
} from "lucide-react";
import {
  passhubCobrarComRav,
  passhubLinkPagamento,
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

function Etapa({
  numero,
  titulo,
  selo,
  children,
}: {
  numero: string;
  titulo: string;
  selo?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="cons-lab">
          {numero} · {titulo}
        </h3>
        {selo}
      </div>
      {children}
    </section>
  );
}

export function BlocoPagamentoInterno({ r }: { r: PassHubReservaLista }) {
  const cobrarFn = useServerFn(passhubCobrarComRav);
  const pagarFn = useServerFn(passhubPagarAgora);
  const repassarFn = useServerFn(passhubRepassarPagamento);
  const listarFn = useServerFn(passhubPagamentosReserva);
  const pedirPixPasshub = useServerFn(passhubPixReserva);
  const buscarLink = useServerFn(passhubLinkPagamento);

  const [rav, setRav] = useState(
    r.comissaoExtra ? String(r.comissaoExtra).replace(".", ",") : "",
  );
  const [valorManual, setValorManual] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [link, setLink] = useState(r.linkPagamento);
  const [pixPasshub, setPixPasshub] = useState<{
    copiaECola: string;
    qrCodeBase64: string;
    valor: number;
    expiraEm: string;
  } | null>(null);

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

  const cobrancaAtiva = lista.find(
    (p) => p.modo === "cobranca_cliente" && !!p.pixCopiaCola && p.status !== "cancelado",
  );

  const copiar = async (texto: string, chave: string, aviso: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    toast.success(aviso);
    setTimeout(() => setCopiado(null), 2000);
  };

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

  const gerarPixPasshub = useMutation({
    mutationFn: () =>
      pedirPixPasshub({ data: { id: r.idPassagem, localizador: r.localizador || undefined } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      setPixPasshub(res.pix);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao gerar o Pix da PassHub"),
  });

  const gerarLink = useMutation({
    mutationFn: () => buscarLink({ data: { id: r.idPassagem, localizador: r.localizador } }),
    onSuccess: async (res) => {
      if (!res.ok) return toast.error(res.erro);
      setLink(res.link);
      await copiar(res.link, "link", "Link de pagamento copiado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao obter o link"),
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

  const codigoCheckout = /\/payment\/([^/?#\s]+)/.exec(link ?? "")?.[1] ?? "";
  const linkCliente =
    codigoCheckout && typeof window !== "undefined"
      ? `${window.location.origin}/pagar/reserva/${codigoCheckout}`
      : "";

  const whatsappHref = (texto: string) =>
    `https://wa.me/${(r.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;

  return (
    <div className="space-y-6">
      {/* ---------------- 1. Cobrar o cliente ---------------- */}
      <Etapa
        numero="1"
        titulo="Cobrar o cliente"
        selo={
          <span className="rounded-full bg-brand-orange/10 px-2 py-0.5 text-[10px] font-semibold text-brand-orange">
            Pix VIA AIR
          </span>
        }
      >
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="block text-[10px] uppercase tracking-wide cons-muted">
                Total da reserva
              </span>
              <span className="text-lg font-semibold">{brl(base)}</span>
            </div>
            <label className="w-32">
              <span className="mb-1 block text-right text-[10px] uppercase tracking-wide cons-muted">
                RAV extra
              </span>
              <input
                className="cons-field w-full text-right"
                inputMode="decimal"
                placeholder="0,00"
                value={rav}
                onChange={(e) => setRav(e.target.value)}
              />
            </label>
            <label className="w-32">
              <span className="mb-1 block text-right text-[10px] uppercase tracking-wide cons-muted">
                Valor manual
              </span>
              <input
                className="cons-field w-full text-right"
                inputMode="decimal"
                placeholder="opcional"
                value={valorManual}
                onChange={(e) => setValorManual(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="text-sm font-semibold">Total a cobrar</span>
            <span className="text-xl font-bold text-brand-orange">{brl(previsto)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="cons-btn cons-btn-primary justify-center"
            onClick={() => cobrar.mutate()}
            disabled={cobrar.isPending}
          >
            {cobrar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            {cobrancaAtiva ? "Gerar novo QR Pix" : "Gerar QR Pix"}
          </button>
          {cobrancaAtiva?.pixCopiaCola ? (
            <a
              className="cons-btn justify-center"
              target="_blank"
              rel="noreferrer"
              href={whatsappHref(
                `Pix da sua reserva ${r.localizador || ""} — ${brl(cobrancaAtiva.valorCobrado)}:\n\n${cobrancaAtiva.pixCopiaCola}`,
              )}
            >
              <Send className="h-4 w-4" /> Enviar no WhatsApp
            </a>
          ) : (
            <button type="button" className="cons-btn justify-center opacity-40" disabled>
              <Send className="h-4 w-4" /> Enviar no WhatsApp
            </button>
          )}
        </div>
        <p className="text-[11px] cons-muted">
          Pagamento identificado automaticamente → a consolidadora é paga sozinha.
        </p>
      </Etapa>

      {/* ---------------- 2. Pagar a consolidadora ---------------- */}
      <Etapa
        numero="2"
        titulo="Pagar a consolidadora"
        selo={
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
            <Wallet className="h-3.5 w-3.5" /> Saldo ASAAS
          </span>
        }
      >
        <button
          type="button"
          className="cons-btn cons-btn-blue w-full justify-center py-3 text-sm font-bold"
          onClick={() => abrirPrevia.mutate()}
          disabled={abrirPrevia.isPending || pagarAgora.isPending}
        >
          {abrirPrevia.isPending || pagarAgora.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Pagar PassHub agora
        </button>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] cons-muted">
            Busca o copia e cola da consolidadora e debita o nosso saldo na hora.
          </p>
          <button
            type="button"
            className="text-[11px] underline cons-muted hover:text-white"
            onClick={() => gerarPixPasshub.mutate()}
            disabled={gerarPixPasshub.isPending}
          >
            {gerarPixPasshub.isPending ? "abrindo…" : "ver copia e cola"}
          </button>
        </div>

        {pixPasshub ? (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[12px] font-semibold">
              {pixPasshub.valor ? brl(pixPasshub.valor) : "Pix da consolidadora"}
              {pixPasshub.expiraEm ? (
                <span className="ml-2 font-normal cons-muted">até {pixPasshub.expiraEm}</span>
              ) : null}
            </p>
            <code className="block max-h-20 overflow-auto break-all rounded-lg bg-black/40 px-2 py-1 text-[10px]">
              {pixPasshub.copiaECola}
            </code>
            <button
              type="button"
              className="cons-btn"
              onClick={() => copiar(pixPasshub.copiaECola, "pix-passhub", "Pix da PassHub copiado")}
            >
              {copiado === "pix-passhub" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copia e cola
            </button>
          </div>
        ) : null}
      </Etapa>

      {/* ---------------- 3. Link do checkout (auxiliar) ---------------- */}
      <section className="border-t border-white/5 pt-4">
        <span className="text-[10px] font-bold uppercase tracking-widest cons-muted">
          Recurso auxiliar · checkout da consolidadora
        </span>
        {link ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
              <code className="min-w-0 flex-1 truncate text-[11px] cons-muted">{link}</code>
              <button
                type="button"
                className="rounded-md p-1.5 cons-muted hover:bg-white/5 hover:text-white"
                title="Copiar link"
                onClick={() => copiar(link, "link", "Link de pagamento copiado")}
              >
                {copiado === "link" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <a
                className="rounded-md p-1.5 cons-muted hover:bg-white/5 hover:text-white"
                title="Abrir checkout"
                href={link}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            {linkCliente ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="cons-btn"
                  onClick={() =>
                    copiar(linkCliente, "cliente", "Link do QR Code copiado — é só enviar")
                  }
                >
                  {copiado === "cliente" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Link do QR ao cliente
                </button>
                <a
                  className="cons-btn"
                  target="_blank"
                  rel="noreferrer"
                  href={whatsappHref(
                    `Segue o link para pagamento da sua reserva ${r.localizador}: ${linkCliente}`,
                  )}
                >
                  WhatsApp
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="cons-btn mt-2"
            onClick={() => gerarLink.mutate()}
            disabled={gerarLink.isPending}
          >
            {gerarLink.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Gerar link e copiar
          </button>
        )}
      </section>

      {/* ---------------- Histórico ---------------- */}
      <section className="space-y-3 border-t border-white/5 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest cons-muted">
            Movimentações
          </span>
          <button
            type="button"
            className="cons-btn"
            onClick={() => pagamentos.refetch()}
            disabled={pagamentos.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${pagamentos.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {lista.length ? (
          lista.map((p) => {
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
                  <div className="space-y-3">
                    <p className="text-[13px]">
                      Cliente paga <b>{brl(p.valorCobrado)}</b> · consolidadora{" "}
                      {brl(p.valorPasshub)} · RAV por fora <b>{brl(p.markup)}</b>
                    </p>
                    {p.pixQrBase64 || p.pixCopiaCola ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        {p.pixQrBase64 ? (
                          <img
                            src={p.pixQrBase64}
                            alt="QR Code Pix VIA AIR"
                            className="h-32 w-32 shrink-0 self-start rounded-lg bg-white p-2"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1 space-y-2">
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
                                    copiar(
                                      p.pixCopiaCola!,
                                      `pix-${p.id}`,
                                      "Pix copia e cola copiado",
                                    )
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
                                  href={whatsappHref(
                                    `Pix da sua reserva ${r.localizador || ""} — ${brl(p.valorCobrado)}:\n\n${p.pixCopiaCola}`,
                                  )}
                                >
                                  <Send className="h-4 w-4" /> WhatsApp
                                </a>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
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
                ) : (
                  <p className="text-[13px]">
                    Pago à consolidadora <b>{brl(p.repasseValor ?? p.valorPasshub)}</b>
                    {p.repasseEm ? ` em ${new Date(p.repasseEm).toLocaleString("pt-BR")}` : ""}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-[12px] cons-muted">Nenhuma movimentação registrada nesta reserva.</p>
        )}
      </section>
    </div>
  );
}
