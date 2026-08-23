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
  Loader2,
  Luggage,
  Plane,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import {
  passhubCancelarReserva,
  passhubLinkPagamento,
  passhubReservas,
} from "@/lib/passhub/passhub.functions";
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
  const [link, setLink] = useState(r.linkPagamento);
  const [copiado, setCopiado] = useState(false);

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
          </div>
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

          <h3 className="mb-3 text-[15px] font-bold">Trechos</h3>
          <div className="space-y-3">
            {r.segmentos.map((s, i) => (
              <div key={i} className="cons-box p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[16px] font-black">
                    {s.origem} → {s.destino}
                  </div>
                  <span className="cons-chip">{s.duracao}</span>
                </div>
                <div className="mt-1 text-[12px] cons-muted">
                  {dataCurta(s.partida)} · {hora(s.partida)} → {hora(s.chegada)}
                </div>
                <div className="mt-3 grid items-center gap-2 sm:grid-cols-[1fr_38px_1fr]">
                  <div className="cons-soft p-3">
                    <div className="text-[18px] font-black">{s.origem}</div>
                    <div className="text-[12px] cons-muted">{hora(s.partida)}</div>
                  </div>
                  <div className="grid place-items-center text-[#77b8ff]">
                    <Plane className="h-5 w-5" />
                  </div>
                  <div className="cons-soft p-3">
                    <div className="text-[18px] font-black">{s.destino}</div>
                    <div className="text-[12px] cons-muted">{hora(s.chegada)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.conexoes.map((c, j) => (
                    <span key={j} className="cons-chip">
                      {c.numeroVoo} · {c.origem}→{c.destino} · {c.familiaTarifaria || c.classe}
                    </span>
                  ))}
                  <span className="cons-chip">
                    <Luggage className="h-3 w-3" />
                    {s.bagagemDespachada
                      ? `${s.bagagemDespachadaQtd || 1} despachada(s)`
                      : "só bagagem de mão"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="cons-dot my-5" />

          <h3 className="mb-3 text-[15px] font-bold">Passageiros</h3>
          {r.passageirosDetalhe.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {r.passageirosDetalhe.map((p, i) => (
                <div key={i} className="cons-box p-4">
                  <div className="text-[15px] font-black uppercase">{p.nome}</div>
                  <div className="mt-2 grid gap-1 text-[12px] cons-muted">
                    <div>
                      {p.documentoTipo === "passport" ? "Passaporte" : "CPF"}:{" "}
                      <b className="text-[13px]">{p.documento || "—"}</b>
                    </div>
                    <div>
                      Nascimento: <b className="text-[13px]">{dataCurta(p.nascimento)}</b>
                    </div>
                    {p.telefone && (
                      <div>
                        Telefone: <b className="text-[13px]">{p.telefone}</b>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {r.passageiros.length ? (
                r.passageiros.map((p) => (
                  <span key={p} className="cons-chip">
                    {p}
                  </span>
                ))
              ) : (
                <span className="text-[13px] cons-muted">Sem passageiros informados</span>
              )}
            </div>
          )}
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
