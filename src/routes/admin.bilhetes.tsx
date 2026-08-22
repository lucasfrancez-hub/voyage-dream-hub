import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Luggage, Plane, Printer, RefreshCw, Search } from "lucide-react";
import { passhubReservas } from "@/lib/passhub/passhub.functions";
import type { PassHubReservaLista } from "@/lib/passhub/types";

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

/** Consideramos bilhete tudo que já foi emitido (ou está em emissão). */
const emitido = (r: PassHubReservaLista) =>
  !!r.emitidaEm || ["ISSUED", "IN_PROGRESS", "EMITIDA"].includes((r.status || "").toUpperCase());

function DetalheBilhete({ r, onVoltar }: { r: PassHubReservaLista; onVoltar: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-black tracking-tight">
            E-ticket {r.localizador || "—"}
          </h1>
          <p className="text-[13px] cons-muted">
            {r.origem} → {r.destino} · emitido em {dataHora(r.emitidaEm)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="cons-status cons-status-ok">
            {r.emitidaEm ? "EMITIDO" : "EM EMISSÃO"}
          </span>
          <button type="button" className="cons-btn" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" className="cons-btn" onClick={onVoltar}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="cons-card p-4 md:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="cons-box p-4">
              <div className="cons-lab mb-1.5">Localizador</div>
              <div className="font-mono text-[18px] font-black tracking-widest">
                {r.localizador || "—"}
              </div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-1.5">Loc. companhia</div>
              <div className="font-mono text-[18px] font-black">
                {r.localizadorCompanhia || "—"}
              </div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-1.5">Sistema</div>
              <div className="text-[18px] font-black">{r.companhia || r.provedor || "—"}</div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-1.5">Emissão</div>
              <div className="text-[16px] font-black">{dataHora(r.emitidaEm)}</div>
            </div>
          </div>

          <div className="cons-dot my-5" />

          <h3 className="mb-3 text-[15px] font-bold">Voos emitidos</h3>
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
              <span className="cons-muted">RAV ({r.ravPercentual}%)</span>
              <b>{brl(r.ravValor)}</b>
            </div>
            <div className="flex justify-between py-2 text-[13px]">
              <span className="cons-muted">Comissão</span>
              <b>{brl(r.comissao)}</b>
            </div>
            <div className="cons-dot my-2" />
            <div className="cons-lab">Total</div>
            <div className="text-[26px] font-black">{brl(r.preco)}</div>
          </div>

          <div className="cons-card p-4">
            <h3 className="mb-2 text-[15px] font-bold">Contexto</h3>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Agência</span>
              <b>VIA AIR</b>
            </div>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Emissor</span>
              <b>{r.emissor || "—"}</b>
            </div>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Fornecedor</span>
              <b>{r.provedor || "—"}</b>
            </div>
            <div className="flex justify-between py-2 text-[13px]">
              <span className="cons-muted">Rota</span>
              <b>
                {r.origem}-{r.destino}
              </b>
            </div>
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
  const bilhetes = useMemo(() => {
    const lista = (data?.ok ? data.reservas : []).filter(emitido);
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((r) =>
      [r.localizador, r.localizadorCompanhia, r.origem, r.destino, r.companhia, ...r.passageiros]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, busca]);

  return (
    <div className="cons">
      <div className="cons-shell space-y-4">
        {aberto ? (
          <DetalheBilhete r={aberto} onVoltar={() => setAberto(null)} />
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[28px] font-black tracking-tight">E-tickets</h1>
                <p className="text-[13px] cons-muted">
                  Clique em uma linha para abrir o detalhe do bilhete emitido.
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
                    <th>Sistema</th>
                    <th>Localizador</th>
                    <th>Loc. cia</th>
                    <th>Emissão</th>
                    <th>Embarque</th>
                    <th>Passageiro</th>
                    <th>Rota</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bilhetes.map((r) => (
                    <tr key={r.idPassagem} onClick={() => setAberto(r)}>
                      <td>
                        <span className="cons-pill">{r.companhia || r.provedor || "—"}</span>
                      </td>
                      <td className="font-mono font-black tracking-widest">
                        {r.localizador || "—"}
                      </td>
                      <td className="font-mono">{r.localizadorCompanhia || "—"}</td>
                      <td>{dataHora(r.emitidaEm)}</td>
                      <td>{dataCurta(r.dataIda)}</td>
                      <td className="max-w-[220px] truncate">
                        {r.passageiros.join(" · ") || "—"}
                      </td>
                      <td>
                        {r.origem}-{r.destino}
                      </td>
                      <td>
                        <span className="cons-status cons-status-ok">
                          {r.emitidaEm ? "EMITIDA" : "EM EMISSÃO"}
                        </span>
                      </td>
                      <td className="font-bold">{brl(r.preco)}</td>
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
