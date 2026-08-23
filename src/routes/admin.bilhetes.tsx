import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
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
import { passhubReservas, passhubBilheteNumeros } from "@/lib/passhub/passhub.functions";
import type { PassHubReservaLista } from "@/lib/passhub/types";
import { nomeProprio } from "@/components/passhub/ComprovanteReserva";
import { BadgeCia } from "@/components/passhub/ResultadosPassHub";

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
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => window.open(`/admin/bilhetes/${id}/eticket`, "_blank")}>
          Com valor total
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(`/admin/bilhetes/${id}/eticket?valores=0`, "_blank")}
        >
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

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="cons-card relative overflow-hidden p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-20 blur-2xl"
          style={{ background: "radial-gradient(circle,#37d39a,transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px]">
            <div className="mb-2 flex items-center gap-2">
              <BadgeCia codigo={r.companhia} nome={r.companhia || r.provedor} />
              <span className="cons-status cons-status-ok">
                {r.emitidaEm ? "EMITIDO" : "EM EMISSÃO"}
              </span>
            </div>
            <div className="cons-lab">Bilhete eletrônico</div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-[30px] font-black tracking-tight md:text-[36px]">
                {principal || (isFetching ? "buscando…" : "—")}
              </h1>
              {principal && (
                <button
                  type="button"
                  className="cons-btn !px-2 !py-1"
                  onClick={() => copiar(principal, "Bilhete")}
                  aria-label="Copiar número do bilhete"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[13px] cons-muted">
              {r.origem} → {r.destino} · emitido em {dataHora(r.emitidaEm)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoImprimir id={r.idPassagem} />
            <button type="button" className="cons-btn" onClick={onVoltar}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { l: "Localizador", v: r.localizador || "—", mono: true },
            { l: "Loc. companhia", v: r.localizadorCompanhia || "—", mono: true },
            { l: "Sistema", v: r.companhia || r.provedor || "—" },
            { l: "Total da venda", v: brl(r.totalVenda || r.preco) },
          ].map((c) => (
            <div key={c.l} className="cons-box p-4">
              <div className="cons-lab mb-1.5">{c.l}</div>
              <div
                className={`text-[17px] font-black ${c.mono ? "font-mono tracking-widest" : ""}`}
              >
                {c.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {/* Voos */}
          <div className="cons-card p-4 md:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
              <Plane className="h-4 w-4 text-[#77b8ff]" /> Itinerário emitido
            </h3>
            <div className="space-y-3">
              {r.segmentos.map((s, i) => (
                <div key={i} className="cons-box p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[16px] font-black">
                      {s.origem} <ArrowRight className="h-4 w-4 cons-muted" /> {s.destino}
                    </div>
                    <span className="cons-chip">{s.duracao}</span>
                  </div>
                  <div className="mt-3 grid items-center gap-2 sm:grid-cols-[1fr_44px_1fr]">
                    <div className="cons-soft p-3">
                      <div className="text-[20px] font-black">{hora(s.partida)}</div>
                      <div className="text-[12px] cons-muted">
                        {s.origem} · {dataCurta(s.partida)}
                      </div>
                    </div>
                    <div className="grid place-items-center text-[#77b8ff]">
                      <Plane className="h-5 w-5" />
                    </div>
                    <div className="cons-soft p-3">
                      <div className="text-[20px] font-black">{hora(s.chegada)}</div>
                      <div className="text-[12px] cons-muted">
                        {s.destino} · {dataCurta(s.chegada)}
                      </div>
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
          </div>

          {/* Passageiros */}
          <div className="cons-card p-4 md:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
              <User className="h-4 w-4 text-[#77b8ff]" /> Passageiros
            </h3>
            <div className="space-y-2">
              {paxDetalhe.map((p, i) => {
                const num = numeros.find(
                  (n) =>
                    (n.passageiro || "").trim().toUpperCase() === (p.nome || "").trim().toUpperCase(),
                );
                return (
                  <div
                    key={`${p.nome}-${i}`}
                    className="cons-box grid gap-2 p-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]"
                  >
                    <div>
                      <div className="cons-lab mb-1">Passageiro</div>
                      <div className="text-[14px] font-black">{nomeProprio(p.nome)}</div>
                    </div>
                    <div>
                      <div className="cons-lab mb-1">
                        {(p.documentoTipo || "cpf").toLowerCase().includes("pass")
                          ? "Passaporte"
                          : "CPF"}
                      </div>
                      <div className="font-mono text-[13px]">
                        {docFmt(p.documentoTipo, p.documento)}
                      </div>
                    </div>
                    <div>
                      <div className="cons-lab mb-1">Nascimento</div>
                      <div className="text-[13px]">
                        {p.nascimento ? dataCurta(p.nascimento) : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="cons-lab mb-1">Bilhete</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[13px] font-bold">
                          {num?.numero || principal || "—"}
                        </span>
                        {(num?.numero || principal) && (
                          <button
                            type="button"
                            className="cons-btn !px-1.5 !py-1"
                            onClick={() => copiar(num?.numero || principal, "Bilhete")}
                            aria-label="Copiar bilhete do passageiro"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!paxDetalhe.length && (
                <div className="text-[13px] cons-muted">Sem passageiros informados</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="cons-card p-4">
            <h3 className="mb-2 text-[15px] font-bold">Financeiro</h3>
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
              <span className="cons-muted">Comissão (inclusa)</span>
              <b>{brl(r.comissao)}</b>
            </div>
            {r.comissaoExtra > 0 && (
              <div className="flex justify-between py-2 text-[13px]">
                <span className="cons-muted">Comissão extra</span>
                <b>{brl(r.comissaoExtra)}</b>
              </div>
            )}
            <div className="cons-dot my-2" />
            <div className="cons-lab">Total da venda</div>
            <div className="text-[26px] font-black">{brl(r.totalVenda || r.preco)}</div>
          </div>

          <div className="cons-card p-4">
            <h3 className="mb-2 text-[15px] font-bold">Contexto</h3>
            {[
              ["Agência", "VIA AIR"],
              ["Emissor", nomeProprio(r.emissor) || "—"],
              ["Fornecedor", r.provedor || "—"],
              ["Rota", `${r.origem}-${r.destino}`],
              ["Embarque", dataCurta(r.dataIda)],
            ].map(([l, v], i, arr) => (
              <div
                key={l}
                className={`flex justify-between py-2 text-[13px] ${
                  i < arr.length - 1 ? "border-b border-dotted border-white/10" : ""
                }`}
              >
                <span className="cons-muted">{l}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BilhetesPage() {
  const listar = useServerFn(passhubReservas);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<PassHubReservaLista | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["passhub-reservas"],
    queryFn: () => listar({ data: undefined }),
    staleTime: 60_000,
  });

  const erro = data && !data.ok ? data.erro : null;
  const todos = useMemo(() => (data?.ok ? data.reservas : []).filter(emitido), [data]);
  const bilhetes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return todos;
    return todos.filter((r) =>
      [r.localizador, r.localizadorCompanhia, r.origem, r.destino, r.companhia, ...r.passageiros]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [todos, busca]);

  const totalVendido = todos.reduce((s, r) => s + (r.totalVenda || r.preco), 0);
  const totalComissao = todos.reduce((s, r) => s + r.comissao + (r.comissaoExtra || 0), 0);

  return (
    <div className="cons">
      <div className="cons-shell space-y-4">
        {aberto ? (
          <DetalheBilhete r={aberto} onVoltar={() => setAberto(null)} />
        ) : (
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

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { l: "Bilhetes", v: String(todos.length) },
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
              <table className="cons-table min-w-[1080px]">
                <thead>
                  <tr>
                    <th>Companhia</th>
                    <th>Localizador</th>
                    <th>Loc. cia</th>
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
                  {bilhetes.map((r) => (
                    <tr key={r.idPassagem} onClick={() => setAberto(r)}>
                      <td>
                        <BadgeCia codigo={r.companhia} nome={r.companhia || r.provedor} />
                      </td>
                      <td className="font-mono font-black tracking-widest">
                        {r.localizador || "—"}
                      </td>
                      <td className="font-mono">{r.localizadorCompanhia || "—"}</td>
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
                  ))}
                  {!isFetching && bilhetes.length === 0 && !erro && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center cons-muted">
                        Nenhum bilhete emitido até agora.
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
