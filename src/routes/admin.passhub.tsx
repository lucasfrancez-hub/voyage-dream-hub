import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeftRight, Code2, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import { AirlineLogo } from "@/components/AirlineLogo";
import { passhubStatus, passhubMotorBuscar } from "@/lib/passhub/passhub.functions";
import { ReservaPassHubDialog } from "@/components/passhub/ReservaPassHubDialog";
import { ResultadosPassHub, type FiltrosMotor } from "@/components/passhub/ResultadosPassHub";
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
type Tipo = "ida-volta" | "ida" | "multi";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function Radio({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 text-[14px] font-bold">
      <span
        className={`grid h-[18px] w-[18px] place-items-center rounded-full border-2 ${
          ativo ? "border-[var(--cons-orange)]" : "border-[var(--cons-line2)]"
        }`}
      >
        {ativo && <span className="h-2 w-2 rounded-full bg-[var(--cons-orange)]" />}
      </span>
      {children}
    </button>
  );
}

function PassHubPage() {
  const statusFn = useServerFn(passhubStatus);
  const buscarFn = useServerFn(passhubMotorBuscar);

  const [tipo, setTipo] = useState<Tipo>("ida-volta");
  const [trechos, setTrechos] = useState<Trecho[]>([{ origem: "", destino: "", data: "" }]);
  const [dataVolta, setDataVolta] = useState("");
  const [adultos, setAdultos] = useState(1);
  const [criancas, setCriancas] = useState(0);
  const [bebes, setBebes] = useState(0);
  const [classe, setClasse] = useState(1);
  const [rav, setRav] = useState(0);
  const [pagina, setPagina] = useState(1);

  const [ordem, setOrdem] = useState<FiltrosMotor["ordem"]>("preco");
  const [mostrar, setMostrar] = useState(10);
  const [bagagem, setBagagem] = useState<FiltrosMotor["bagagem"]>("todas");
  const [direto, setDireto] = useState(false);
  const [ciasSel, setCiasSel] = useState<string[]>([]);

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
          dataVolta: tipo === "ida-volta" && dataVolta ? dataVolta : null,
          adultos,
          criancas,
          bebes,
          classe,
          ravPercentual: rav,
          pagina: p,
          porPagina: 30,
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
      setCiasSel([]);
      setBruto(JSON.stringify(r.bruto, null, 2));
      toast.success(`${r.resultado.total} ofertas encontradas`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cias = useMemo(() => {
    if (!resultado) return [];
    const set = new Set<string>();
    for (const o of resultado.ofertas) {
      for (const v of [o.ida, ...o.voltas]) set.add(v.companhia || v.companhiaIata);
    }
    return [...set].filter(Boolean).sort();
  }, [resultado]);

  const atualiza = (i: number, campo: keyof Trecho, valor: string) =>
    setTrechos((prev) => prev.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)));

  const inverter = () =>
    setTrechos((prev) =>
      prev.map((t, i) => (i === 0 ? { ...t, origem: t.destino, destino: t.origem } : t)),
    );

  const buscar = (p: number) => {
    if (trechos.some((t) => !t.origem || !t.destino || !t.data)) {
      toast.error("Preencha origem, destino e data de todos os trechos.");
      return;
    }
    setPagina(p);
    busca.mutate(p);
  };

  const limpar = () => {
    setTrechos([{ origem: "", destino: "", data: "" }]);
    setDataVolta("");
    setResultado(null);
    setBruto(null);
  };

  const filtros: FiltrosMotor = { ordem, mostrar, bagagem, direto, companhias: ciasSel };

  return (
    <div className="cons">
      <div className="cons-shell space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-black tracking-tight">Busca aérea</h1>
            <p className="text-[13px] cons-muted">
              Motor interno da consolidadora — ida, ida e volta e multitrecho, com bagagem, conexões
              e parcelamento.
            </p>
          </div>
          <button
            type="button"
            className="cons-status cons-status-ok h-9 px-4"
            onClick={() => status.mutate()}
            disabled={status.isPending}
          >
            {status.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="mr-1.5">●</span>
            )}
            PassHub conectada
          </button>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]">
          {/* Pesquisa */}
          <section className="cons-card p-4 md:p-5">
            <h3 className="mb-3 text-[15px] font-bold">Pesquisa</h3>

            <div className="mb-4 flex flex-wrap items-center gap-6">
              <Radio ativo={tipo === "ida-volta"} onClick={() => { setTipo("ida-volta"); setTrechos((p) => p.slice(0, 1)); }}>
                Ida e volta
              </Radio>
              <Radio ativo={tipo === "ida"} onClick={() => { setTipo("ida"); setTrechos((p) => p.slice(0, 1)); setDataVolta(""); }}>
                Somente ida
              </Radio>
              <Radio ativo={tipo === "multi"} onClick={() => { setTipo("multi"); setDataVolta(""); }}>
                Múltiplos trechos
              </Radio>
            </div>

            <div className="cons-dot mb-4" />

            {trechos.map((t, i) => (
              <div
                key={i}
                className="mb-3 grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)_160px_160px]"
              >
                <div>
                  <span className="cons-lab mb-1.5 block">Origem</span>
                  <AirportAutocomplete
                    value={t.origem}
                    onSelect={(iata) => atualiza(i, "origem", iata)}
                    placeholder="MGF - Maringá"
                  />
                </div>
                <div className="hidden md:block">
                  {i === 0 && (
                    <button
                      type="button"
                      aria-label="Inverter origem e destino"
                      className="cons-btn h-10 w-10 !px-0"
                      onClick={inverter}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div>
                  <span className="cons-lab mb-1.5 block">Destino</span>
                  <AirportAutocomplete
                    value={t.destino}
                    onSelect={(iata) => atualiza(i, "destino", iata)}
                    placeholder="GRU - Guarulhos"
                    isDeparture={false}
                  />
                </div>
                <div>
                  <span className="cons-lab mb-1.5 block">
                    {tipo === "multi" ? `Data ${i + 1}` : "Data ida"}
                  </span>
                  <input
                    className="cons-field"
                    type="date"
                    value={t.data}
                    onChange={(e) => atualiza(i, "data", e.target.value)}
                  />
                </div>
                <div>
                  {tipo === "ida-volta" && i === 0 ? (
                    <>
                      <span className="cons-lab mb-1.5 block">Data volta</span>
                      <input
                        className="cons-field"
                        type="date"
                        value={dataVolta}
                        onChange={(e) => setDataVolta(e.target.value)}
                      />
                    </>
                  ) : tipo === "multi" && trechos.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remover trecho"
                      className="cons-btn h-10 w-10 !px-0"
                      onClick={() => setTrechos((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {tipo === "multi" && (
              <button
                type="button"
                className="cons-btn mb-3"
                onClick={() =>
                  setTrechos((p) => [...p, { origem: "", destino: "", data: "" }].slice(0, 6))
                }
              >
                <Plus className="h-4 w-4" /> Adicionar trecho
              </button>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <span className="cons-lab mb-1.5 block">Adultos</span>
                <select
                  className="cons-field"
                  value={adultos}
                  onChange={(e) => setAdultos(Number(e.target.value))}
                >
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Adulto" : "Adultos"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Crianças</span>
                <select
                  className="cons-field"
                  value={criancas}
                  onChange={(e) => setCriancas(Number(e.target.value))}
                >
                  {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Criança" : "Crianças"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Bebês</span>
                <select
                  className="cons-field"
                  value={bebes}
                  onChange={(e) => setBebes(Number(e.target.value))}
                >
                  {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Bebê" : "Bebês"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cons-dot my-4" />

            <div className="flex flex-wrap items-center justify-end gap-2">
              {bruto && (
                <button type="button" className="cons-btn" onClick={() => setVerBruto((v) => !v)}>
                  <Code2 className="h-4 w-4" /> {verBruto ? "Ocultar JSON" : "Ver JSON"}
                </button>
              )}
              <button type="button" className="cons-btn" onClick={limpar}>
                Limpar
              </button>
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

          {/* Filtros */}
          <section className="cons-card p-4 md:p-5">
            <h3 className="mb-3 text-[15px] font-bold">Filtros</h3>
            <div className="space-y-3">
              <div>
                <span className="cons-lab mb-1.5 block">Classe</span>
                <select
                  className="cons-field"
                  value={classe}
                  onChange={(e) => setClasse(Number(e.target.value))}
                >
                  <option value={1}>Econômica</option>
                  <option value={2}>Premium Economy</option>
                  <option value={3}>Executiva</option>
                  <option value={4}>Primeira classe</option>
                </select>
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Ordenar por</span>
                <select
                  className="cons-field"
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value as FiltrosMotor["ordem"])}
                >
                  <option value="preco">Valor</option>
                  <option value="duracao">Duração</option>
                  <option value="partida">Horário de saída</option>
                  <option value="chegada">Horário de chegada</option>
                </select>
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Mostrar</span>
                <select
                  className="cons-field"
                  value={mostrar}
                  onChange={(e) => setMostrar(Number(e.target.value))}
                >
                  {[5, 10, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      {n} linhas
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="cons-lab mb-1.5 block">Bagagem</span>
                <select
                  className="cons-field"
                  value={bagagem}
                  onChange={(e) => setBagagem(e.target.value as FiltrosMotor["bagagem"])}
                >
                  <option value="todas">Todas as opções</option>
                  <option value="com">Com bagagem despachada</option>
                  <option value="sem">Somente bagagem de mão</option>
                </select>
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
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--cons-orange)]"
                  checked={direto}
                  onChange={(e) => setDireto(e.target.checked)}
                />
                Apenas voos diretos
              </label>
            </div>
          </section>

          {/* Companhias (só depois da pesquisa) */}
          <section className="cons-card p-4 md:p-5">
            <h3 className="mb-3 text-[15px] font-bold">Companhia aérea</h3>
            {!cias.length ? (
              <p className="text-[13px] cons-muted">
                As companhias aparecem aqui depois que você faz a pesquisa.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {cias.map((c) => {
                  const marcada = ciasSel.length === 0 || ciasSel.includes(c);
                  return (
                    <label
                      key={c}
                      className="cons-box flex cursor-pointer items-center gap-2 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--cons-orange)]"
                        checked={marcada}
                        onChange={() =>
                          setCiasSel((prev) => {
                            const base = prev.length ? prev : cias;
                            return base.includes(c) ? base.filter((x) => x !== c) : [...base, c];
                          })
                        }
                      />
                      <AirlineLogo airline={c} size={20} hideIfUnknown />
                      <span className="cons-pill">{c}</span>
                    </label>
                  );
                })}
                <label className="cons-box flex cursor-pointer items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--cons-orange)]"
                    checked={ciasSel.length === 0}
                    onChange={() => setCiasSel([])}
                  />
                  <span className="text-[13px] font-bold">Marcar todas</span>
                </label>
              </div>
            )}
          </section>
        </div>

        {resultado && (
          <>
            <div className="cons-card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12px]">
              <span>
                <b>{resultado.total}</b> ofertas · faixa {brl(resultado.precoMin)} –{" "}
                {brl(resultado.precoMax)}
              </span>
              {resultado.totalPaginas > 1 && (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cons-btn h-8"
                    disabled={pagina <= 1 || busca.isPending}
                    onClick={() => buscar(pagina - 1)}
                  >
                    Anterior
                  </button>
                  <span className="cons-muted">
                    {pagina} / {resultado.totalPaginas}
                  </span>
                  <button
                    type="button"
                    className="cons-btn h-8"
                    disabled={pagina >= resultado.totalPaginas || busca.isPending}
                    onClick={() => buscar(pagina + 1)}
                  >
                    Próxima
                  </button>
                </span>
              )}
            </div>

            <ResultadosPassHub
              resultado={resultado}
              filtros={filtros}
              onReservar={setOfertaReserva}
            />
          </>
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
