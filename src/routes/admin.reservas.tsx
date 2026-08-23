import { BlocoPagamentoInterno } from "@/components/passhub/BlocoPagamentoInterno";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  FileText,
  Loader2,
  Luggage,
  Plane,
  QrCode,
  RefreshCw,
  Search,
  Send,

  Users,
  XCircle,
} from "lucide-react";
import {
  passhubCancelarReserva,
  passhubLinkPagamento,
  passhubPixReserva,
  passhubReservas,
} from "@/lib/passhub/passhub.functions";
import { BadgeCia } from "@/components/passhub/ResultadosPassHub";
import { confirm } from "@/lib/confirm";
import type { PassHubReservaLista } from "@/lib/passhub/types";

export const Route = createFileRoute("/admin/reservas")({
  component: ReservasPage,
  head: () => ({
    meta: [
      { title: "Reservas e emissões — Consolidadora | VIA AIR" },
      {
        name: "description",
        content:
          "Todas as reservas aéreas da VIA AIR na consolidadora: localizador, prazo de emissão, valores, passageiros e link de pagamento.",
      },
      { property: "og:title", content: "Reservas e emissões — Consolidadora | VIA AIR" },
      {
        property: "og:description",
        content: "Acompanhe reservas, prazos de emissão e links de pagamento em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const dataHora = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const dataCurta = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "--";

const hora = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const rotuloStatus: Record<string, string> = {
  CREATED: "RESERVADA",
  ISSUED: "EMITIDA",
  CANCELED: "CANCELADA",
  CANCELLED: "CANCELADA",
  EXPIRED: "EXPIRADA",
  IN_PROGRESS: "EM EMISSÃO",
  ERROR: "ERRO",
};

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  const label = rotuloStatus[s] ?? status ?? "—";
  const classe =
    s === "ISSUED" ? "cons-status-ok" : s === "CREATED" ? "cons-status-res" : "cons-status-pay";
  return <span className={`cons-status ${classe}`}>{label}</span>;
}

function BlocoPagamento({ r }: { r: PassHubReservaLista }) {
  const buscarLink = useServerFn(passhubLinkPagamento);
  const pedirPix = useServerFn(passhubPixReserva);
  const [link, setLink] = useState(r.linkPagamento);
  const [copiado, setCopiado] = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [clienteCopiado, setClienteCopiado] = useState(false);
  const [pix, setPix] = useState<{
    copiaECola: string;
    qrCodeBase64: string;
    valor: number;
    expiraEm: string;
  } | null>(null);

  const copiar = async (valor: string) => {
    await navigator.clipboard.writeText(valor);
    setCopiado(true);
    toast.success("Link de pagamento copiado");
    setTimeout(() => setCopiado(false), 2000);
  };

  const gerar = useMutation({
    mutationFn: () => buscarLink({ data: { id: r.idPassagem, localizador: r.localizador } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      setLink(res.link);
      await copiar(res.link);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao obter o link"),
  });

  const gerarPix = useMutation({
    mutationFn: () =>
      pedirPix({
        data: link
          ? { link }
          : { id: r.idPassagem, localizador: r.localizador },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      setPix(res.pix);
      toast.success("QR Code Pix gerado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao gerar o Pix"),
  });

  const copiarPix = async (codigo: string) => {
    await navigator.clipboard.writeText(codigo);
    setPixCopiado(true);
    toast.success("Pix copia e cola copiado");
    setTimeout(() => setPixCopiado(false), 2000);
  };

  const codigoCheckout = /\/payment\/([^/?#\s]+)/.exec(link ?? "")?.[1] ?? "";
  const linkCliente =
    codigoCheckout && typeof window !== "undefined"
      ? `${window.location.origin}/pagar/reserva/${codigoCheckout}`
      : "";

  const copiarCliente = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setClienteCopiado(true);
    toast.success("Link do QR Code copiado — é só enviar ao cliente");
    setTimeout(() => setClienteCopiado(false), 2000);
  };




  return (
    <div className="cons-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
        <CreditCard className="h-4 w-4" /> Link de pagamento
      </h3>
      {link ? (
        <div className="space-y-2">
          <code className="block break-all rounded-lg bg-white/5 px-2 py-1 text-[11px]">{link}</code>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="cons-btn" onClick={() => copiar(link)}>
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar link
            </button>
            <a className="cons-btn cons-btn-blue" href={link} target="_blank" rel="noreferrer">
              Abrir checkout
            </a>
            <button
              type="button"
              className="cons-btn cons-btn-primary"
              onClick={() => gerarPix.mutate()}
              disabled={gerarPix.isPending}
            >
              {gerarPix.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4" />
              )}
              {pix ? "Gerar Pix novamente" : "Gerar QR Code Pix"}
            </button>
            {linkCliente ? (
              <>
                <button
                  type="button"
                  className="cons-btn"
                  onClick={() => copiarCliente(linkCliente)}
                >
                  {clienteCopiado ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}{" "}
                  Enviar QR Code ao cliente
                </button>
                <a
                  className="cons-btn"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Segue o link para pagamento da sua reserva ${r.localizador}: ${linkCliente}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </>
            ) : null}
          </div>


          {pix ? (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center">
              {pix.qrCodeBase64 ? (
                <img
                  src={pix.qrCodeBase64}
                  alt="QR Code Pix da reserva"
                  className="h-40 w-40 shrink-0 rounded-lg bg-white p-2"
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-2">
                {pix.valor ? (
                  <p className="text-[13px] font-semibold">
                    {pix.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                ) : null}
                {pix.expiraEm ? (
                  <p className="text-[11px] cons-muted">Válido até {pix.expiraEm}</p>
                ) : null}
                <code className="block max-h-24 overflow-auto break-all rounded-lg bg-black/30 px-2 py-1 text-[10px]">
                  {pix.copiaECola}
                </code>
                <button
                  type="button"
                  className="cons-btn"
                  onClick={() => copiarPix(pix.copiaECola)}
                >
                  {pixCopiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copia e
                  cola
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] cons-muted">
            Esta reserva ainda não tem link de pagamento carregado.
          </p>
          <button
            type="button"
            className="cons-btn cons-btn-primary"
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending}
          >
            {gerar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Gerar link e copiar
          </button>
        </div>
      )}
    </div>
  );
}

function DetalheReserva({
  r,
  onVoltar,
  onAtualizar,
}: {
  r: PassHubReservaLista;
  onVoltar: () => void;
  onAtualizar: () => void;
}) {
  const cancelarFn = useServerFn(passhubCancelarReserva);
  const cancelada = ["CANCELED", "CANCELLED", "EXPIRED"].includes((r.status || "").toUpperCase());

  const cancelar = useMutation({
    mutationFn: () => cancelarFn({ data: { id: r.idPassagem, motivo: "Cancelamento solicitado pela agência" } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(res.mensagem || "Reserva cancelada");
      onAtualizar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar"),
  });

  const pedirCancelamento = async () => {
    const ok = await confirm({
      title: "Cancelar reserva na consolidadora?",
      description: `A reserva ${r.localizador || r.idPassagem} será cancelada na PassHub. Essa ação não pode ser desfeita.`,
      confirmText: "Cancelar reserva",
      cancelText: "Voltar",
      destructive: true,
    });
    if (ok) cancelar.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-black tracking-tight">
            Reserva {r.localizador || "—"}
          </h1>
          <p className="text-[13px] cons-muted">
            {r.origem} → {r.destino} · {dataCurta(r.dataIda)}
            {r.dataVolta ? ` · volta ${dataCurta(r.dataVolta)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          <a
            className="cons-btn"
            href={`/admin/reservas/${r.idPassagem}/plano-viagem`}
            target="_blank"
            rel="noreferrer"
          >
            <FileText className="h-4 w-4" /> Plano de viagem
          </a>
          {!cancelada && (
            <button
              type="button"
              className="cons-btn cons-btn-danger"
              onClick={pedirCancelamento}
              disabled={cancelar.isPending}
            >
              {cancelar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancelar reserva
            </button>
          )}
          <button type="button" className="cons-btn" onClick={onVoltar}>
            <ArrowLeft className="h-4 w-4" /> Voltar para reservas
          </button>
        </div>
      </div>


      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="cons-card p-4 md:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Localizador</div>
              <div className="font-mono text-[20px] font-black tracking-widest">
                {r.localizador || "—"}
              </div>
              <div className="text-[12px] cons-muted">{r.provedor || "consolidadora"}</div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Loc. companhia</div>
              <div className="font-mono text-[18px] font-black">
                {r.localizadorCompanhia || "—"}
              </div>
              <div className="text-[12px] cons-muted">{r.companhia || "—"}</div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Emissão limite</div>
              <div className="text-[16px] font-black">{dataHora(r.limiteEmissao)}</div>
              <div className="text-[12px] cons-muted">Horário de Brasília</div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Criação</div>
              <div className="text-[16px] font-black">{dataHora(r.criadaEm)}</div>
              <div className="text-[12px] cons-muted">{r.emissor || "VIA AIR"}</div>
            </div>
          </div>

          <div className="cons-dot my-5" />

          <h3 className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#9fb4c6]">
            <Plane className="h-4 w-4 text-[#77b8ff]" /> Trechos da viagem
          </h3>
          <div className="space-y-4">
            {r.segmentos.map((s, i) => {
              const primeira = s.conexoes[0];
              const ultima = s.conexoes[s.conexoes.length - 1];
              const cia = primeira?.companhia || r.companhia;
              const classe = primeira?.familiaTarifaria || primeira?.classe || "—";
              return (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-colors hover:border-white/20"
                >
                  <div className="p-5">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <BadgeCia codigo={cia} grande />
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#77b8ff]">
                            Voo {primeira?.numeroVoo || "—"}
                            {s.conexoes.length > 1 ? ` · +${s.conexoes.length - 1} conexão(ões)` : ""}
                          </div>
                          <div className="text-[17px] font-black">
                            {s.origem} <span className="mx-1 cons-muted">→</span> {s.destino}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="cons-lab">Duração</div>
                        <div className="text-[13px] font-bold">{s.duracao || ultima?.duracao || "—"}</div>
                      </div>
                    </div>

                    <div className="relative flex items-center justify-between px-1">
                      <div className="relative z-10 bg-[#0b1a24] pr-4">
                        <div className="text-[26px] font-black leading-none">{hora(s.partida)}</div>
                        <div className="mt-1 text-[13px] font-bold cons-muted">{s.origem}</div>
                        <div className="text-[11px] cons-muted">{dataCurta(s.partida)}</div>
                      </div>
                      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center border-t border-dashed border-white/10">
                        <span className="-mt-3 rounded-full bg-white/10 p-1.5">
                          <Plane className="h-3 w-3 rotate-90 text-[#77b8ff]" />
                        </span>
                      </div>
                      <div className="relative z-10 bg-[#0b1a24] pl-4 text-right">
                        <div className="text-[26px] font-black leading-none">{hora(s.chegada)}</div>
                        <div className="mt-1 text-[13px] font-bold cons-muted">{s.destino}</div>
                        <div className="text-[11px] cons-muted">{dataCurta(s.chegada)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap divide-x divide-white/5 border-t border-white/5 bg-white/[0.03]">
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="cons-lab">Classe</span>
                      <span className="text-[12px] font-bold text-[#bfe0ff]">{classe}</span>
                    </div>
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="cons-lab">Bagagem</span>
                      <span className="flex items-center gap-1 text-[12px] font-bold text-[#8ce0b6]">
                        <Luggage className="h-3 w-3" />
                        {s.bagagemDespachada
                          ? `${s.bagagemDespachadaQtd || 1} despachada(s)`
                          : "somente mão"}
                      </span>
                    </div>
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="cons-lab">Voos</span>
                      <span className="text-[12px] font-bold">
                        {s.conexoes.map((c) => c.numeroVoo).filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>


          <div className="cons-dot my-5" />

          <h3 className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#9fb4c6]">
            <Users className="h-4 w-4 text-[#8ce0b6]" /> Passageiros
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-white/5 bg-white/[0.04]">
                <tr>
                  <th className="px-5 py-3 cons-lab">Nome completo</th>
                  <th className="px-5 py-3 text-center cons-lab">Documento</th>
                  <th className="px-5 py-3 text-center cons-lab">Nascimento</th>
                  <th className="px-5 py-3 text-right cons-lab">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(r.passageirosDetalhe.length
                  ? r.passageirosDetalhe
                  : r.passageiros.map((nome) => ({
                      nome,
                      documento: "",
                      documentoTipo: "cpf",
                      nascimento: "",
                      tipo: "",
                      genero: "",
                      telefone: "",
                    }))
                ).map((p, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#8ce0b6]/10 text-[11px] font-black text-[#8ce0b6]">
                          {iniciais(p.nome)}
                        </span>
                        <span className="text-[13px] font-bold uppercase">{p.nome}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-[13px]">
                      {p.documento ? (
                        <>
                          <span className="cons-muted mr-1 text-[11px] uppercase">
                            {p.documentoTipo === "passport" ? "Pass." : "CPF"}
                          </span>
                          <b>{p.documento}</b>
                        </>
                      ) : (
                        <span className="cons-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center text-[13px] font-bold">
                      {p.nascimento ? dataCurta(p.nascimento) : <span className="cons-muted font-normal">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right text-[12px] cons-muted uppercase">
                      {p.tipo || "ADT"}
                    </td>
                  </tr>
                ))}
                {r.passageirosDetalhe.length === 0 && r.passageiros.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-[13px] cons-muted">
                      Sem passageiros informados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

        <div className="space-y-4">
          <div className="cons-card p-4">
            <h3 className="mb-2 text-[15px] font-bold">Resumo financeiro</h3>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Tarifa</span>
              <b>{brl(r.precoSemTaxa)}</b>
            </div>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Taxas</span>
              <b>{brl(r.taxas)}</b>
            </div>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Líquido consolidadora</span>
              <b>{brl(r.preco)}</b>
            </div>
            <div className="flex justify-between py-2 text-[13px]">
              <span className="cons-muted">Comissão ({r.ravPercentual}%)</span>
              <b>{brl(r.comissao || r.ravValor)}</b>
            </div>
            <div className="cons-dot my-2" />
            <div className="cons-lab">Total da reserva</div>
            <div className="text-[28px] font-black">{brl(r.totalVenda)}</div>
          </div>


          <BlocoPagamento r={r} />
          <BlocoPagamentoInterno r={r} />
        </div>
      </div>
    </div>
  );
}

function ReservasPage() {
  const listar = useServerFn(passhubReservas);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<PassHubReservaLista | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["passhub-reservas"],
    queryFn: () => listar({ data: undefined }),
    staleTime: 60_000,
  });

  const reservas = data?.ok ? data.reservas : [];
  const erro = data && !data.ok ? data.erro : null;

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return reservas;
    return reservas.filter((r) =>
      [r.localizador, r.localizadorCompanhia, r.origem, r.destino, r.companhia, ...r.passageiros]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [reservas, busca]);

  return (
    <div className="cons">
      <div className="cons-shell space-y-4">
        {aberta ? (
          <DetalheReserva
            r={aberta}
            onVoltar={() => setAberta(null)}
            onAtualizar={() => {
              setAberta(null);
              void refetch();
            }}
          />
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[28px] font-black tracking-tight">Reservas</h1>
                <p className="text-[13px] cons-muted">
                  Clique em uma linha para abrir o detalhe da reserva. Inclui as reservas feitas
                  direto no portal da consolidadora.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 cons-muted" />
                  <input
                    className="cons-field w-[280px] pl-9"
                    placeholder="Localizador, passageiro ou rota"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="cons-btn"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Atualizar
                </button>
              </div>
            </header>

            {erro && (
              <div className="cons-card p-3 text-[13px] text-[#ffd6d6]">{erro}</div>
            )}

            {isFetching && reservas.length === 0 && (
              <div className="flex items-center gap-2 text-[13px] cons-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando reservas…
              </div>
            )}

            <div className="cons-card overflow-x-auto">
              <table className="cons-table min-w-[1080px]">
                <thead>
                  <tr>
                    <th>Localizador</th>
                    <th>Loc. cia</th>
                    <th>Passageiro</th>
                    <th>Rota</th>
                    <th>Criação</th>
                    <th>Limite emissão</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((r) => (
                    <tr key={r.idPassagem} onClick={() => setAberta(r)}>
                      <td className="font-mono font-black tracking-widest">
                        {r.localizador || "—"}
                      </td>
                      <td className="font-mono">{r.localizadorCompanhia || "—"}</td>
                      <td className="max-w-[220px] truncate">
                        {r.passageiros.join(" · ") || "—"}
                      </td>
                      <td>
                        {r.origem} → {r.destino} · {dataCurta(r.dataIda)}
                        {r.dataVolta ? ` / ${dataCurta(r.dataVolta)}` : ""}
                      </td>
                      <td>{dataHora(r.criadaEm)}</td>
                      <td>{dataHora(r.limiteEmissao)}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="font-bold">{brl(r.totalVenda)}</td>
                      <td>
                        <div className="cons-open">
                          <Search className="h-3.5 w-3.5" />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isFetching && filtradas.length === 0 && !erro && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center cons-muted">
                        Nenhuma reserva encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
