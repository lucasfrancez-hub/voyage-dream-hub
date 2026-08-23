import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  
  Copy,
  Loader2,
  Luggage,
  Plane,
  Printer,
  RefreshCw,
  Search,
  Ticket,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  passhubReservas,
  passhubBilheteNumeros,
  passhubBilhetesLista,
} from "@/lib/passhub/passhub.functions";
import type { PassHubReservaLista } from "@/lib/passhub/types";
import { nomeProprio } from "@/components/passhub/ComprovanteReserva";
import { BadgeCia } from "@/components/passhub/ResultadosPassHub";
import { pedidosReservasAereas } from "@/lib/orders/reservas-aereas.functions";
import { BadgeFonte, FiltroFonte, type FonteReserva } from "@/components/passhub/FiltroFonte";
import { abrirDocumento } from "@/lib/docs/abrir";
import { JanelaDetalhe } from "@/components/passhub/JanelaDetalhe";

export const Route = createFileRoute("/admin/bilhetes")({
  component: BilhetesPage,
  head: () => ({
    meta: [
      { title: "Bilhetes emitidos — Consolidadora | VIA AIR" },
      {
        name: "description",
        content:
          "Bilhetes aéreos já emitidos pela VIA AIR na consolidadora: número do bilhete, passageiros, trechos, tarifa, taxas, RAV e comissão.",
      },
      { property: "og:title", content: "Bilhetes emitidos — Consolidadora | VIA AIR" },
      {
        property: "og:description",
        content: "Consulte bilhetes emitidos, valores e detalhes de cada voo.",
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

const docFmt = (tipo: string, valor: string) => {
  const v = (valor || "").replace(/\D/g, "");
  if ((tipo || "").toLowerCase().includes("cpf") && v.length === 11) {
    return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
  }
  return valor || "—";
};

/** Consideramos bilhete tudo que já foi emitido (ou está em emissão). */
const emitido = (r: PassHubReservaLista) =>
  !!r.emitidaEm || ["ISSUED", "IN_PROGRESS", "EMITIDA"].includes((r.status || "").toUpperCase());

function copiar(texto: string, label: string) {
  navigator.clipboard
    .writeText(texto)
    .then(() => toast.success(`${label} copiado`))
    .catch(() => toast.error("Não foi possível copiar"));
}

function BotaoImprimir({ id }: { id: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="cons-btn cons-btn-primary">
          <Printer className="h-4 w-4" /> Baixar bilhete
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[120]">
        <DropdownMenuItem onClick={() => void abrirDocumento("bilhete", id)}>
          Com valor total
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void abrirDocumento("bilhete", id, { semValores: true })}>
          Sem valor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetalheBilhete({ r, onVoltar }: { r: PassHubReservaLista; onVoltar: () => void }) {
  const numerosFn = useServerFn(passhubBilheteNumeros);
  const { data: bilhete, isFetching } = useQuery({
    queryKey: ["passhub-bilhete-numeros", r.idPassagem],
    queryFn: () => numerosFn({ data: { id: r.idPassagem, localizador: r.localizador || null } }),
    staleTime: 5 * 60_000,
  });
  const numeros = bilhete?.ok ? (bilhete.numeros ?? []) : [];
  const principal = numeros[0]?.numero ?? "";
  const paxDetalhe = r.passageirosDetalhe?.length
    ? r.passageirosDetalhe
    : r.passageiros.map((nome) => ({
        nome,
        documento: "",
        documentoTipo: "",
        nascimento: "",
        genero: "",
        tipo: "",
        telefone: "",
      }));

  const iniciais = (nome: string) =>
    nomeProprio(nome)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {/* Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="group flex items-center text-[14px] text-white/50 transition-colors hover:text-white"
          onClick={onVoltar}
        >
          <ArrowLeft className="mr-2 h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Voltar
        </button>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] text-white transition-all hover:bg-white/10"
            onClick={() => copiar(principal || r.localizador, "Bilhete")}
          >
            <Copy className="mr-2 h-4 w-4 text-white/50" /> Compartilhar
          </button>
          <BotaoImprimir id={r.idPassagem} />
        </div>
      </div>

      {/* Documento */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12] shadow-[0_20px_60px_rgba(0,0,0,.8)]">
        <div className="flex h-1.5 w-full">
          <div className="w-2/3 bg-[#F26B1F]" />
          <div className="w-1/3 bg-white/10" />
        </div>

        <div
          className="p-6 md:p-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at top right, rgba(242,107,31,.07), transparent 55%)",
          }}
        >
          {/* Cabeçalho */}
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-8">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-[22px] font-bold tracking-tight text-white">VIA AIR</span>
                <span className="mt-1 rounded border border-[#F26B1F]/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#F26B1F]">
                  Premium
                </span>
              </div>
              <div className="space-y-1 text-[13px] text-white/50">
                <p>
                  Agência: <span className="font-medium text-white/85">VIA AIR</span>
                </p>
                <p>
                  Emissor:{" "}
                  <span className="font-medium text-white/85">{nomeProprio(r.emissor) || "—"}</span>
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="mb-3 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70">
                <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-[#F26B1F] shadow-[0_0_8px_rgba(242,107,31,.6)]" />
                {r.emitidaEm ? "Emitido" : "Em emissão"}
              </div>
              <div className="flex items-center justify-end gap-2">
                <p className="font-mono text-[26px] font-black tracking-tight text-white md:text-[30px]">
                  {principal || (isFetching ? "buscando…" : "—")}
                </p>
                {principal && (
                  <button
                    type="button"
                    className="rounded-md border border-white/10 bg-white/5 p-1.5 text-white/60 hover:text-white"
                    onClick={() => copiar(principal, "Bilhete")}
                    aria-label="Copiar número do bilhete"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
                Bilhete eletrônico · {r.origem} → {r.destino}
              </p>
            </div>
          </div>

          {/* Localizadores */}
          <div className="mb-8 grid gap-6 rounded-xl border border-white/5 bg-white/[0.03] p-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { l: "Loc. VIA AIR", v: r.localizador || "—", cor: "text-[#F26B1F]", mono: true },
              { l: "Loc. companhia", v: r.localizadorCompanhia || "—", cor: "text-white", mono: true },
              { l: "Sistema", v: r.companhia || r.provedor || "—", cor: "text-white/60" },
              { l: "Total da venda", v: brl(r.totalVenda || r.preco), cor: "text-white" },
            ].map((c) => (
              <div key={c.l}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  {c.l}
                </p>
                <p
                  className={`text-[17px] font-bold ${c.cor} ${c.mono ? "font-mono tracking-widest" : ""}`}
                >
                  {c.v}
                </p>
              </div>
            ))}
          </div>

          {/* Itinerário */}
          <div className="mb-10">
            <h3 className="mb-6 flex items-center text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
              <Plane className="mr-2 h-4 w-4 text-[#F26B1F]" /> Itinerário de voo
            </h3>
            <div className="space-y-4">
              {r.segmentos.map((s, i) => (
                <div
                  key={i}
                  className="group flex flex-wrap items-center gap-5 rounded-xl border border-white/5 bg-white/[0.03] p-5 transition-all hover:bg-white/[0.07]"
                >
                  <div className="z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/10 bg-[#181920] shadow-2xl transition-transform group-hover:scale-105">
                    <span className="text-[9px] font-bold uppercase text-white/40">
                      {i === 0 ? "Ida" : "Volta"}
                    </span>
                    <span className="text-[13px] font-bold text-[#F26B1F]">
                      {dataCurta(s.partida)}
                    </span>
                  </div>
                  <div className="grid flex-1 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-white/40">{s.origem}</p>
                      <p className="text-[22px] font-bold text-white">{hora(s.partida)}</p>
                    </div>
                    <div className="flex flex-col items-center justify-center px-2">
                      <div className="flex w-full items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <Plane className="h-4 w-4 rotate-90 text-[#F26B1F]/50" />
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                        {s.duracao}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-white/40">{s.destino}</p>
                      <p className="text-[22px] font-bold text-white">{hora(s.chegada)}</p>
                    </div>
                    <div className="flex flex-col justify-center gap-2 border-white/10 sm:border-l sm:pl-5">
                      {s.conexoes.map((c, j) => (
                        <p key={j} className="text-[11px] font-bold text-white/70">
                          {c.numeroVoo} · {c.origem}→{c.destino}
                          {c.familiaTarifaria || c.classe ? ` · ${c.familiaTarifaria || c.classe}` : ""}
                        </p>
                      ))}
                      <span className="inline-flex w-fit items-center gap-1 rounded border border-[#F26B1F]/20 bg-[#F26B1F]/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-[#F26B1F]">
                        <Luggage className="h-3 w-3" />
                        {s.bagagemDespachada
                          ? `${s.bagagemDespachadaQtd || 1} despachada(s)`
                          : "só bagagem de mão"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Passageiros */}
            <div>
              <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
                Passageiros
              </h3>
              <div className="space-y-3">
                {paxDetalhe.map((p, i) => {
                  const num = numeros.find(
                    (n) =>
                      (n.passageiro || "").trim().toUpperCase() ===
                      (p.nome || "").trim().toUpperCase(),
                  );
                  const tkne = num?.numero || principal;
                  return (
                    <div
                      key={`${p.nome}-${i}`}
                      className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.03] p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#F26B1F]/20 bg-[#F26B1F]/10 text-[13px] font-bold text-[#F26B1F]">
                        {iniciais(p.nome)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold uppercase text-white">
                          {nomeProprio(p.nome)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/45">
                          {(p.documentoTipo || "cpf").toLowerCase().includes("pass")
                            ? "Passaporte"
                            : "CPF"}
                          : {docFmt(p.documentoTipo, p.documento)} · Nasc:{" "}
                          {p.nascimento ? dataCurta(p.nascimento) : "—"}
                        </p>
                        {tkne && (
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#F26B1F]/80 hover:text-[#F26B1F]"
                            onClick={() => copiar(tkne, "Bilhete")}
                          >
                            TKNE: {tkne} <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!paxDetalhe.length && (
                  <div className="text-[13px] text-white/45">Sem passageiros informados</div>
                )}
              </div>
            </div>

            {/* Financeiro */}
            <div className="relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#F26B1F]/10 blur-3xl"
              />
              <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
                Detalhamento financeiro
              </h3>
              <div className="space-y-3 text-[13px]">
                <div className="flex justify-between text-white/55">
                  <span>Tarifa base</span>
                  <b className="font-medium text-white/85">{brl(r.precoSemTaxa)}</b>
                </div>
                <div className="flex justify-between text-white/55">
                  <span>Taxas aeroportuárias</span>
                  <b className="font-medium text-white/85">{brl(r.taxas)}</b>
                </div>
                <div className="flex justify-between text-white/55">
                  <span>Líquido consolidadora</span>
                  <b className="font-medium text-white/85">{brl(r.preco)}</b>
                </div>
                <div className="flex justify-between text-white/55">
                  <span>Comissão (inclusa)</span>
                  <b className="font-medium text-[#F26B1F]">{brl(r.comissao)}</b>
                </div>
                {r.comissaoExtra > 0 && (
                  <div className="flex justify-between text-white/55">
                    <span>Comissão extra</span>
                    <b className="font-medium text-[#F26B1F]">{brl(r.comissaoExtra)}</b>
                  </div>
                )}
                <div className="my-2 h-px bg-white/10" />
                <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
                  <div>
                    <span className="mb-1 block text-[10px] font-bold uppercase leading-none text-white/40">
                      Total da venda
                    </span>
                    <span className="text-[28px] font-black tracking-tight text-white">
                      {brl(r.totalVenda || r.preco)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[9px] font-bold uppercase text-white/40">
                      Embarque
                    </span>
                    <span className="text-[11px] font-bold text-white/80">
                      {dataCurta(r.dataIda)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 bg-[#08090d] p-4 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-white/25">
            Documento de viagem oficial · VIA AIR Premium Travel
          </p>
        </div>
      </div>
    </div>
  );
}

function BilhetesPage() {
  const listar = useServerFn(passhubReservas);
  const listarBilhetes = useServerFn(passhubBilhetesLista);
  const listarPedidos = useServerFn(pedidosReservasAereas);
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [fonte, setFonte] = useState<FonteReserva>("todas");
  const [aberto, setAberto] = useState<PassHubReservaLista | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["passhub-reservas"],
    queryFn: () => listar({ data: undefined }),
    staleTime: 60_000,
  });

  const ids = useMemo(() => (data?.ok ? data.reservas : []).filter(emitido).map((r) => r.idPassagem), [data]);

  const { data: bilhetesData, isFetching: bilhetesFetching } = useQuery({
    queryKey: ["passhub-bilhetes-lista", ids.join(",")],
    queryFn: () => listarBilhetes({ data: { ids } }),
    enabled: ids.length > 0,
    staleTime: 30_000,
  });

  const numerosPorReserva = useMemo<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    if (!bilhetesData?.ok) return map;
    for (const [id, nums] of Object.entries(bilhetesData.bilhetes)) {
      map[Number(id)] = nums[0]?.numero ?? "";
    }
    return map;
  }, [bilhetesData]);

  const pedidosQuery = useQuery({
    queryKey: ["pedidos-reservas-aereas"],
    queryFn: () => listarPedidos({ data: undefined }),
    staleTime: 60_000,
  });
  // Dos pedidos, só entram aqui os que já têm número de bilhete.
  const todosPedidos = useMemo(
    () => (pedidosQuery.data?.ok ? pedidosQuery.data.reservas : []).filter((r) => r.bilhetes.length),
    [pedidosQuery.data],
  );

  const erro = data && !data.ok ? data.erro : null;
  const todos = useMemo(() => (data?.ok ? data.reservas : []).filter(emitido), [data]);
  const bilhetes = useMemo(() => {
    if (fonte === "pedidos") return [];
    const q = busca.trim().toLowerCase();
    if (!q) return todos;
    return todos.filter((r) => {
      const campos = [
        r.localizador,
        r.localizadorCompanhia,
        r.origem,
        r.destino,
        r.companhia,
        numerosPorReserva[r.idPassagem],
        ...r.passageiros,
      ]
        .join(" ")
        .toLowerCase();
      return campos.includes(q);
    });
  }, [todos, busca, numerosPorReserva, fonte]);

  const bilhetesPedidos = useMemo(() => {
    if (fonte === "consolidadora") return [];
    const q = busca.trim().toLowerCase();
    if (!q) return todosPedidos;
    return todosPedidos.filter((r) =>
      [
        r.localizador,
        r.localizadorCompanhia,
        r.orderNumber,
        r.cliente,
        r.origem,
        r.destino,
        r.companhia,
        ...r.passageiros,
        ...r.bilhetes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [todosPedidos, busca, fonte]);

  const vazio = bilhetes.length === 0 && bilhetesPedidos.length === 0;

  const totalVendido = todos.reduce((s, r) => s + (r.totalVenda || r.preco), 0);
  const totalComissao = todos.reduce((s, r) => s + r.comissao + (r.comissaoExtra || 0), 0);

  return (
    <div className="cons">
      <div className="cons-shell space-y-4">
        <JanelaDetalhe aberto={!!aberto} onFechar={() => setAberto(null)} titulo="Bilhete">
          {aberto ? <DetalheBilhete r={aberto} onVoltar={() => setAberto(null)} /> : null}
        </JanelaDetalhe>
        {
          <>

            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 text-[28px] font-black tracking-tight">
                  <Ticket className="h-6 w-6 text-[#f26b1f]" /> Bilhetes emitidos
                </h1>
                <p className="text-[13px] cons-muted">
                  Clique em uma linha para abrir o e-ticket com passageiros e números de bilhete.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 cons-muted" />
                  <input
                    className="cons-field w-[280px] pl-9"
                    placeholder="Bilhete, passageiro ou rota"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="cons-btn"
                  onClick={() => {
                    void refetch();
                    void pedidosQuery.refetch();
                  }}
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

            <FiltroFonte
              valor={fonte}
              onChange={setFonte}
              contagens={{ consolidadora: todos.length, pedidos: todosPedidos.length }}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { l: "Bilhetes", v: String(todos.length + todosPedidos.length) },
                { l: "Total vendido", v: brl(totalVendido) },
                { l: "Comissão acumulada", v: brl(totalComissao) },
              ].map((c) => (
                <div key={c.l} className="cons-card p-4">
                  <div className="cons-lab mb-1">{c.l}</div>
                  <div className="text-[22px] font-black">{c.v}</div>
                </div>
              ))}
            </div>

            {erro && <div className="cons-card p-3 text-[13px] text-[#ffd6d6]">{erro}</div>}

            {isFetching && bilhetes.length === 0 && (
              <div className="flex items-center gap-2 text-[13px] cons-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando bilhetes…
              </div>
            )}

            <div className="cons-card overflow-x-auto">
              <table className="cons-table min-w-[1180px]">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th>Companhia</th>
                    <th>Localizador</th>
                    <th>Loc. cia</th>
                    <th>Bilhete</th>
                    <th>Emissão</th>
                    <th>Embarque</th>
                    <th>Passageiro</th>
                    <th>Rota</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bilhetes.map((r) => {
                    const numeroBilhete = numerosPorReserva[r.idPassagem];
                    return (
                      <tr key={r.idPassagem} onClick={() => setAberto(r)}>
                        <td>
                          <BadgeFonte tipo="consolidadora" />
                        </td>
                        <td>
                          <BadgeCia codigo={r.companhia} nome={r.companhia || r.provedor} />
                        </td>
                        <td className="font-mono font-black tracking-widest">
                          {r.localizador || "—"}
                        </td>
                        <td className="font-mono">{r.localizadorCompanhia || "—"}</td>
                        <td>
                          {numeroBilhete ? (
                            <span className="font-mono text-[13px] font-black">{numeroBilhete}</span>
                          ) : bilhetesFetching ? (
                            <span className="flex items-center gap-1.5 text-[12px] cons-muted">
                              <Loader2 className="h-3 w-3 animate-spin" /> buscando…
                            </span>
                          ) : (
                            <span className="text-[12px] cons-muted">—</span>
                          )}
                        </td>
                        <td>{dataHora(r.emitidaEm)}</td>
                        <td>{dataCurta(r.dataIda)}</td>
                        <td className="max-w-[220px] truncate">
                          {r.passageiros.map(nomeProprio).join(" · ") || "—"}
                        </td>
                        <td>
                          {r.origem}-{r.destino}
                        </td>
                        <td>
                          <span className="cons-status cons-status-ok">
                            {r.emitidaEm ? "EMITIDA" : "EM EMISSÃO"}
                          </span>
                        </td>
                        <td className="font-bold">{brl(r.totalVenda || r.preco)}</td>
                        <td>
                          <div className="cons-open">
                            <Search className="h-3.5 w-3.5" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {bilhetesPedidos.map((r) => (
                    <tr
                      key={r.orderId}
                      onClick={() => navigate({ to: "/admin/pedidos/$id", params: { id: r.orderId } })}
                    >
                      <td>
                        <BadgeFonte tipo="pedidos" />
                      </td>
                      <td>
                        <BadgeCia codigo={r.companhia} nome={r.companhia || "—"} />
                      </td>
                      <td className="font-mono font-black tracking-widest">
                        {r.localizador || "—"}
                      </td>
                      <td className="font-mono">{r.localizadorCompanhia || "—"}</td>
                      <td>
                        <span className="font-mono text-[13px] font-black">{r.bilhetes[0]}</span>
                        {r.bilhetes.length > 1 ? (
                          <span className="ml-1 text-[11px] cons-muted">
                            +{r.bilhetes.length - 1}
                          </span>
                        ) : null}
                      </td>
                      <td>{dataHora(r.criadaEm)}</td>
                      <td>{dataCurta(r.dataIda)}</td>
                      <td className="max-w-[220px] truncate">
                        {r.passageiros.map(nomeProprio).join(" · ") || r.cliente || "—"}
                      </td>
                      <td>
                        {r.origem || "—"}-{r.destino || "—"}
                      </td>
                      <td>
                        <span className="cons-status cons-status-ok">
                          Pedido {r.orderNumber}
                        </span>
                      </td>
                      <td className="font-bold">{brl(r.total)}</td>
                      <td>
                        <div className="cons-open">
                          <Search className="h-3.5 w-3.5" />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isFetching && vazio && !erro && (
                    <tr>
                      <td colSpan={12} className="py-8 text-center cons-muted">
                        Nenhum bilhete emitido até agora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        }

      </div>
    </div>
  );
}
