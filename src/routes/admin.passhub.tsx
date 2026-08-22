import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Code2, Loader2, PlugZap, Plus, Search, Trash2 } from "lucide-react";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import { passhubStatus, passhubMotorBuscar } from "@/lib/passhub/passhub.functions";
import { ReservaPassHubDialog } from "@/components/passhub/ReservaPassHubDialog";
import { ResultadosPassHub } from "@/components/passhub/ResultadosPassHub";
import type { PassHubOferta, PassHubResultado } from "@/lib/passhub/types";

export const Route = createFileRoute("/admin/passhub")({
  head: () => ({
    meta: [
      { title: "Motor PassHub — Ambiente interno | VIA AIR" },
      {
        name: "description",
        content:
          "Motor de busca interno da VIA AIR conectado à PassHub: ida, ida e volta e multitrecho com filtros, bagagem e parcelamento.",
      },
      { property: "og:title", content: "Motor PassHub — Ambiente interno | VIA AIR" },
      {
        property: "og:description",
        content: "Busca aérea PassHub com filtros, ordenação e detalhes de tarifa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassHubPage,
});

type Trecho = { origem: string; destino: string; data: string };

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });


function PassHubPage() {
  const statusFn = useServerFn(passhubStatus);
  const buscarFn = useServerFn(passhubMotorBuscar);

  const [trechos, setTrechos] = useState<Trecho[]>([{ origem: "GRU", destino: "LDB", data: "" }]);
  const [dataVolta, setDataVolta] = useState("");
  const [adultos, setAdultos] = useState(1);
  const [criancas, setCriancas] = useState(0);
  const [bebes, setBebes] = useState(0);
  const [rav, setRav] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(12);

  const [resultado, setResultado] = useState<PassHubResultado | null>(null);
  const [bruto, setBruto] = useState<string | null>(null);
  const [verBruto, setVerBruto] = useState(false);

  const [ofertaReserva, setOfertaReserva] = useState<PassHubOferta | null>(null);

  const status = useMutation({
    mutationFn: async () => statusFn(),
    onSuccess: (r) =>
      r.ok ? toast.success("Conectado à PassHub") : toast.error(r.erro ?? "Falha na autenticação"),
    onError: (e) => toast.error((e as Error).message),
  });

  const busca = useMutation({
    mutationFn: async (p: number) =>
      buscarFn({
        data: {
          trechos: trechos.map((t) => ({
            origem: t.origem.toUpperCase(),
            destino: t.destino.toUpperCase(),
            data: t.data,
          })),
          dataVolta: trechos.length === 1 && dataVolta ? dataVolta : null,
          adultos,
          criancas,
          bebes,
          ravPercentual: rav,
          pagina: p,
          porPagina,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setResultado(null);
        setBruto(null);
        toast.error(r.erro);
        return;
      }
      setResultado(r.resultado);
      setBruto(JSON.stringify(r.bruto, null, 2));
      toast.success(`${r.resultado.total} ofertas encontradas`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const atualiza = (i: number, campo: keyof Trecho, valor: string) =>
    setTrechos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  const buscar = (p: number) => {
    setPagina(p);
    busca.mutate(p);
  };

  return (
    <div className="cons">
      <div className="cons-shell space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-black tracking-tight">Busca aérea</h1>
            <p className="text-[13px] cons-muted">
              Motor interno da consolidadora — ida, ida e volta e multitrecho, com bagagem,
              conexões e parcelamento por bandeira.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="cons-status cons-status-ok">● Consolidadora conectada</span>
            <button
              type="button"
              className="cons-btn"
              onClick={() => status.mutate()}
              disabled={status.isPending}
            >
              {status.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              Testar conexão
            </button>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)]">
          <section className="cons-card p-4 md:p-5">
            <h3 className="mb-3 text-[14px] font-bold">Pesquisa</h3>

            {trechos.map((t, i) => (
              <div
                key={i}
                className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_44px]"
              >
                <div>
                  <span className="cons-lab mb-1.5 block">Origem</span>
                  <AirportAutocomplete
                    value={t.origem}
                    onSelect={(iata) => atualiza(i, "origem", iata)}
                    placeholder="Cidade ou IATA"
                  />
                </div>
                <div>
                  <span className="cons-lab mb-1.5 block">Destino</span>
                  <AirportAutocomplete
                    value={t.destino}
                    onSelect={(iata) => atualiza(i, "destino", iata)}
                    placeholder="Cidade ou IATA"
                    isDeparture={false}
                  />
                </div>
                <div>
                  <span className="cons-lab mb-1.5 block">
                    {trechos.length > 1 ? `Data ${i + 1}` : "Data ida"}
                  </span>
                  <input
                    className="cons-field"
                    type="date"
                    value={t.data}
                    onChange={(e) => atualiza(i, "data", e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  {trechos.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remover trecho"
                      className="cons-btn h-10 w-10 !px-0"
                      onClick={() => setTrechos((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="cons-dot my-4" />

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {trechos.length === 1 && (
                <div>
                  <span className="cons-lab mb-1.5 block">Data volta</span>
                  <input
                    className="cons-field"
                    type="date"
                    value={dataVolta}
                    onChange={(e) => setDataVolta(e.target.value)}
                  />
                </div>
              )}
              <div>
                <span className="cons-lab mb-1.5 block">Adultos</span>
                <input
                  className="cons-field"
                  type="number"
                  min={1}
                  max={9}
                  value={adultos}
                  onChange={(e) => setAdultos(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Crianças</span>
                <input
                  className="cons-field"
                  type="number"
                  min={0}
                  max={8}
                  value={criancas}
                  onChange={(e) => setCriancas(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Bebês</span>
                <input
                  className="cons-field"
                  type="number"
                  min={0}
                  max={8}
                  value={bebes}
                  onChange={(e) => setBebes(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">RAV (%)</span>
                <input
                  className="cons-field"
                  type="number"
                  min={0}
                  max={100}
                  value={rav}
                  onChange={(e) => setRav(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="cons-dot my-4" />

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="cons-btn"
                onClick={() =>
                  setTrechos((p) => [...p, { origem: "", destino: "", data: "" }].slice(0, 6))
                }
              >
                <Plus className="h-4 w-4" /> Adicionar trecho
              </button>
              {bruto && (
                <button type="button" className="cons-btn" onClick={() => setVerBruto((v) => !v)}>
                  <Code2 className="h-4 w-4" /> {verBruto ? "Ocultar JSON" : "Ver JSON bruto"}
                </button>
              )}
              <button
                type="button"
                className="cons-btn cons-btn-primary"
                onClick={() => buscar(1)}
                disabled={busca.isPending}
              >
                {busca.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Pesquisar
              </button>
            </div>
          </section>

          <section className="cons-card p-4 md:p-5">
            <h3 className="mb-3 text-[14px] font-bold">Exibição</h3>
            <div className="space-y-3">
              <div>
                <span className="cons-lab mb-1.5 block">Ofertas por página</span>
                <input
                  className="cons-field"
                  type="number"
                  min={1}
                  max={50}
                  value={porPagina}
                  onChange={(e) =>
                    setPorPagina(Math.min(50, Math.max(1, Number(e.target.value) || 12)))
                  }
                />
              </div>
              <div className="cons-box p-3 text-[12px] cons-muted">
                A ida e a volta vêm combinadas na mesma linha do resultado. Clique no{" "}
                <b className="text-[var(--cons-orange2)]">+</b> para reservar direto no sistema.
              </div>
              {resultado && (
                <div className="cons-box p-3 text-[12px]">
                  <div className="cons-lab mb-1">Resumo da busca</div>
                  <div>{resultado.total} ofertas</div>
                  <div className="cons-muted">
                    faixa {brl(resultado.precoMin)} – {brl(resultado.precoMax)}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {resultado && (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="cons-lab">Etapa 2</div>
                <h2 className="text-[20px] font-black">Disponibilidade aérea</h2>
              </div>
              <span className="cons-status cons-status-res">
                página {resultado.pagina}/{resultado.totalPaginas}
              </span>
            </div>

            <ResultadosPassHub resultado={resultado} onReservar={setOfertaReserva} />

            {resultado.totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="cons-btn"
                  disabled={pagina <= 1 || busca.isPending}
                  onClick={() => buscar(pagina - 1)}
                >
                  Anterior
                </button>
                <span className="text-[12px] cons-muted">
                  {pagina} / {resultado.totalPaginas}
                </span>
                <button
                  type="button"
                  className="cons-btn"
                  disabled={pagina >= resultado.totalPaginas || busca.isPending}
                  onClick={() => buscar(pagina + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </section>
        )}

        {verBruto && bruto && (
          <pre className="cons-card max-h-[520px] overflow-auto p-4 text-[11px]">{bruto}</pre>
        )}

        <ReservaPassHubDialog
          oferta={ofertaReserva}
          adultos={adultos}
          criancas={criancas}
          bebes={bebes}
          ravPercentual={rav}
          onClose={() => setOfertaReserva(null)}
        />
      </div>
    </div>
  );
}

