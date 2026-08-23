import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComissaoExtraEditor } from "@/components/passhub/ComissaoExtraEditor";
import { BlocoPagamentoInterno } from "@/components/passhub/BlocoPagamentoInterno";
import { PassageirosEditor } from "@/components/passhub/PassageirosEditor";
import { nomeProprio } from "@/components/passhub/ComprovanteReserva";
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
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
import type { PassHubReservaLista, PassHubReservaPax } from "@/lib/passhub/types";

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

function SecaoRecolhivel({
  titulo,
  icone,
  children,
  aberta,
}: {
  titulo: string;
  icone: ReactNode;
  children: ReactNode;
  aberta?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(aberta));
  return (
    <div className="cons-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[15px] font-bold">
          {icone} {titulo}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-white/5 p-4">{children}</div> : null}
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

  const [extra, setExtra] = useState({ valor: r.comissaoExtra, obs: r.comissaoExtraObs });
  const [pax, setPax] = useState<PassHubReservaPax[]>(
    r.passageirosDetalhe.length
      ? r.passageirosDetalhe
      : r.passageiros.map((nome) => ({
          nome,
          documentoTipo: "cpf",
          documento: "",
          nascimento: "",
          genero: "",
          tipo: "",
          telefone: "",
        })),
  );
  const totalComExtra = r.totalVenda - r.comissaoExtra + extra.valor;

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cons-btn !px-3 !py-1.5 inline-flex items-center gap-2"
              >
                <FileText className="h-4 w-4" /> Plano de viagem
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem asChild>
                <a
                  className="flex w-full cursor-pointer items-center gap-2"
                  href={`/admin/reservas/${r.idPassagem}/plano-viagem`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="h-4 w-4" /> Com valor total
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  className="flex w-full cursor-pointer items-center gap-2"
                  href={`/admin/reservas/${r.idPassagem}/plano-viagem?valores=0`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="h-4 w-4" /> Sem valor
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
              <div className="text-[12px] cons-muted">{nomeProprio(r.emissor) || "VIA AIR"}</div>
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

                    <div className="flex items-center gap-4 px-1">
                      <div className="min-w-0">
                        <div className="text-[26px] font-black leading-none">{hora(s.partida)}</div>
                        <div className="mt-1 text-[13px] font-bold cons-muted">{s.origem}</div>
                        <div className="text-[11px] cons-muted">{dataCurta(s.partida)}</div>
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <span className="h-px flex-1 border-t border-dashed border-white/10" />
                        <span className="rounded-full bg-white/10 p-1.5">
                          <Plane className="h-3 w-3 rotate-90 text-[#77b8ff]" />
                        </span>
                        <span className="h-px flex-1 border-t border-dashed border-white/10" />
                      </div>
                      <div className="min-w-0 text-right">
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

          <PassageirosEditor
            localizador={r.localizador || String(r.idPassagem)}
            passageiros={pax}
            onSalvo={(lista) => setPax(lista)}
          />


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
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Comissão ({r.ravPercentual}%)</span>
              <b>{brl(r.comissao || r.ravValor)}</b>
            </div>
            <ComissaoExtraEditor
              idPassagem={r.idPassagem}
              localizador={r.localizador}
              valor={extra.valor}
              observacao={extra.obs}
              onSalvo={(valor, obs) => {
                setExtra({ valor, obs });
                onAtualizar();
              }}
            />
            <div className="cons-dot my-2" />
            <div className="cons-lab">Total da reserva</div>
            <div className="text-[28px] font-black">{brl(totalComExtra)}</div>
          </div>


          <SecaoRecolhivel
            titulo="Pagamento da reserva"
            icone={<CreditCard className="h-4 w-4" />}
            aberta
          >
            <BlocoPagamentoInterno r={r} />
          </SecaoRecolhivel>
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
