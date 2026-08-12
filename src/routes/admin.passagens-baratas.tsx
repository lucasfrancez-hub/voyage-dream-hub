/**
 * Passagens aéreas baratas — navegação igual à do Melhores Destinos:
 * região → país → destino → origem → datas, tudo automático e com o link
 * do nosso motor (Comprar Viagem) no lugar do parceiro.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Backpack,
  Briefcase,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Luggage,
  Plane,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { explorarPassagensMd, buscarOrigensMd } from "@/lib/melhores-destinos.functions";
import { viaairFlightUrl, nomeCompanhia } from "@/lib/melhores-destinos.parse";
import { imagemRegiao } from "@/lib/regiao-imagens";


export const Route = createFileRoute("/admin/passagens-baratas")({
  component: PassagensBaratasPage,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type Step = {
  label: string;
  baseLabel?: string;
  categoryId?: number;
  toIata?: string;
  fromIata?: string;
  month?: string;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-xl border bg-background px-3 py-2 focus-within:border-primary">
      <span className="block text-[9px] font-black uppercase tracking-widest text-primary">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Blocos de bagagem (item pessoal / mão / despachada) no estilo do comparador. */
function BaggageBlocks({ label }: { label: string | null }) {
  const t = (label ?? "").toLowerCase();
  const despachada = /despach|checked|23kg|bagagem inclu/.test(t);
  const mao = despachada || /mão|mao|carry|hand|10kg/.test(t);
  const pessoal = true;
  const itens: { icon: typeof Briefcase; on: boolean; title: string }[] = [
    { icon: Backpack, on: pessoal, title: "Item pessoal" },
    { icon: Briefcase, on: mao, title: "Bagagem de mão" },
    { icon: Luggage, on: despachada, title: "Bagagem despachada" },
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-1">
        {itens.map(({ icon: Icon, on, title }) => (
          <span
            key={title}
            title={title}
            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
              on
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 bg-muted/40 text-muted-foreground/40"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
      </div>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {despachada ? "Com despachada" : mao ? "Bagagem de mão" : "Item pessoal"}
      </span>
    </div>
  );
}

/** Placeholder de carregamento — cache de até 24h, sem cara de busca ao vivo. */
function LoadingSkeleton() {
  return (
    <Card className="overflow-hidden rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4 text-primary" />
        Preços coletados nas últimas 24 horas
        <span className="text-xs font-normal text-muted-foreground">
          · abrindo tarifas salvas
        </span>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    </Card>
  );
}


function PassagensBaratasPage() {
  const explorar = useServerFn(explorarPassagensMd);
  const buscarOrigens = useServerFn(buscarOrigensMd);
  const [trail, setTrail] = useState<Step[]>([{ label: "Passagens baratas" }]);

  // Filtros globais (origem e mês), iguais aos do site de referência.
  const [filtro, setFiltro] = useState<{ iata: string | null; label: string; month: string }>({
    iata: null,
    label: "",
    month: "",
  });
  const [buscaOrigem, setBuscaOrigem] = useState("");

  const sugestoes = useQuery({
    queryKey: ["md-origens", buscaOrigem],
    enabled: buscaOrigem.trim().length >= 2,
    queryFn: () => buscarOrigens({ data: { q: buscaOrigem.trim() } }),
    staleTime: 10 * 60 * 1000,
  });

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";
  const current = trail[trail.length - 1];

  const q = useQuery({
    queryKey: ["md-explorar", current, filtro.iata, filtro.month],
    queryFn: () =>
      explorar({
        data: {
          base: origin,
          ...(current.categoryId ? { categoryId: current.categoryId } : {}),
          ...(current.toIata ? { toIata: current.toIata } : {}),
          ...(current.fromIata ? { fromIata: current.fromIata } : {}),
          ...(filtro.iata ? { originIata: filtro.iata } : {}),
          ...(current.month || filtro.month ? { month: current.month || filtro.month } : {}),
        },
      }),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });


  const go = (step: Step) => setTrail((t) => [...t, step]);
  const backTo = (i: number) => setTrail((t) => t.slice(0, i + 1));

  const data = q.data;
  const cheapest = data?.dates[0] ?? null;
  const maxMonth = Math.max(0, ...(data?.months.map((m) => m.price ?? 0) ?? [0]));

  const [motor, setMotor] = useState({ origem: "", destino: "", ida: "", volta: "" });

  useEffect(() => {
    if (!data?.dates.length) return;
    setMotor({
      origem: current.fromIata ?? "",
      destino: current.toIata ?? "",
      ida: data.dates[0].departDate,
      volta: data.dates[0].returnDate ?? "",
    });
  }, [data, current.fromIata, current.toIata]);

  const pesquisar = () => {
    if (!motor.origem || !motor.destino || !motor.ida) {
      toast.error("Informe origem, destino e data de ida");
      return;
    }
    const url = viaairFlightUrl(motor.origem, motor.destino, motor.ida, motor.volta || null, "", {
      originName: null,
      destinationName: null,
    });
    window.open(url, "_blank", "noopener");
  };


  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthParam = (label: string): string | null => {
    const [mes, ano] = label.split("/");
    const idx = MESES.indexOf(mes) + 1;
    return idx && ano ? `${ano}-${idx}` : null;
  };
  const selectMonth = (label: string) => {
    const month = monthParam(label);
    if (!month) return;
    setTrail((t) => {
      const last = t[t.length - 1];
      const base = last.baseLabel ?? last.label;
      return [...t.slice(0, -1), { ...last, baseLabel: base, label: `${base} · ${label}`, month }];
    });
  };

  // Próximos 12 meses para o filtro global.
  const hoje = new Date();
  const mesesFiltro = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    return {
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: `${MESES[d.getMonth()]}/${d.getFullYear()}`,
    };
  });



  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Plane className="h-6 w-6 text-primary" /> Passagens aéreas baratas
          </h1>
          <p className="mt-1 text-sm font-semibold text-primary">
            Veja as passagens que encontramos nas últimas 24 horas
          </p>
        </div>

        {/* Filtros de origem e mês — ao lado do título */}
        <div className="flex items-stretch gap-3 lg:w-auto">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:w-[440px] lg:flex-none">

        <div className="relative">
          <Field label="Origem">
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Digite a origem"
              value={filtro.iata ? filtro.label : buscaOrigem}
              onChange={(e) => {
                setBuscaOrigem(e.target.value);
                setFiltro((f) => ({ ...f, iata: null, label: "" }));
              }}
            />
          </Field>
          {filtro.iata && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFiltro((f) => ({ ...f, iata: null, label: "" }));
                setBuscaOrigem("");
              }}
            >
              limpar
            </button>
          )}
          {!filtro.iata && buscaOrigem.trim().length >= 2 && sugestoes.data?.length ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-xl">
              {sugestoes.data.map((o) => (
                <button
                  key={o.iata}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setFiltro((f) => ({ ...f, iata: o.iata, label: `${o.cidade} (${o.iata})` }));
                    setBuscaOrigem("");
                  }}
                >
                  <span className="truncate">
                    {o.cidade} <span className="text-muted-foreground">· {o.pais}</span>
                  </span>
                  <span className="ml-2 font-mono text-xs text-primary">{o.iata}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Field label="Mês">
          <select
            className="w-full bg-transparent text-sm outline-none"
            value={filtro.month}
            onChange={(e) => setFiltro((f) => ({ ...f, month: e.target.value }))}
          >
            <option value="">Qualquer mês</option>
            {mesesFiltro.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>


      {/* Trilha de navegação — setas encadeadas na identidade VIA AIR */}
      <nav
        aria-label="Trilha de navegação"
        className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/50 bg-card/60 p-1.5 backdrop-blur"
      >
        {trail.map((s, i) => {
          const isLast = i === trail.length - 1;
          const isFirst = i === 0;
          return (
            <button
              key={`${s.label}-${i}`}
              onClick={() => backTo(i)}
              title={s.label}
              style={{
                clipPath: isFirst
                  ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                  : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                marginLeft: isFirst ? 0 : -10,
              }}
              className={`relative flex items-center gap-1.5 py-2 pr-6 text-sm font-semibold transition-colors ${
                isFirst ? "pl-4" : "pl-6"
              } ${
                isLast
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {isFirst && <Plane className="h-3.5 w-3.5 shrink-0" />}
              <span className="max-w-[42vw] truncate sm:max-w-none">{s.label}</span>
            </button>
          );
        })}
      </nav>


      {q.isLoading && <LoadingSkeleton />}

      {q.isError && (
        <Card className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Não consegui carregar as tarifas agora</p>
            <p className="text-xs text-muted-foreground">
              A base de preços das últimas 24 horas está indisponível no momento.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tentar novamente
          </Button>
        </Card>
      )}

      {/* Regiões / países */}
      {data?.categories.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => go({ label: c.name, categoryId: c.id })}
              className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all duration-300 hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <img
                  src={imagemRegiao(c.name)}
                  alt={c.name}
                  loading="lazy"
                  width={640}
                  height={640}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold leading-tight">{c.name}</h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">{c.description}</p>
              </div>
              {c.price != null && (
                <div className="shrink-0 text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Ida + volta
                  </span>
                  <span className="block text-[10px] text-muted-foreground">a partir de</span>
                  <span className="text-xl font-bold text-primary">{brl(c.price)}</span>
                </div>
              )}
            </button>
          ))}
        </div>

      ) : null}

      {/* Destinos ou origens (tabela igual à do Melhores Destinos) */}
      {data?.cities.length ? (
        <Card className="overflow-hidden border-white/5 shadow-2xl">
          <div className="flex items-center justify-between bg-primary px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-primary-foreground">
            <span>{data.level === "origins" ? "Origem → Destino" : "Destino"}</span>
            <span className="text-right">Ida + volta a partir de</span>
          </div>
          <div className="flex flex-col">
            {data.cities.map((c, i) => (
              <button
                key={`${c.fromIata ?? ""}-${c.toIata ?? i}`}
                className="group flex w-full items-center justify-between gap-3 border-b border-white/5 px-6 py-4 text-left transition-all hover:bg-white/[0.03]"
                onClick={() =>
                  data.level === "cities"
                    ? go({
                        label: c.toName,
                        categoryId: current.categoryId,
                        toIata: c.toIata ?? undefined,
                      })
                    : go({
                        label: `${c.fromName} → ${c.toName}`,
                        categoryId: current.categoryId,
                        toIata: c.toIata ?? current.toIata,
                        fromIata: c.fromIata ?? undefined,
                      })
                }
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                    {c.fromName ? `${c.fromName} → ${c.toName}` : c.toName}
                  </span>
                  <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {[c.fromIata, c.toIata].filter(Boolean).join(" → ") || "Principais aeroportos"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="whitespace-nowrap text-lg font-bold text-foreground">
                    {c.price != null ? (
                      <>
                        <span className="mr-1 text-sm font-medium text-primary">R$</span>
                        {brl(c.price).replace(/^R\$\s*/, "")}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
              </button>
            ))}
            <div className="bg-black/10 p-4 text-center text-[11px] font-medium uppercase tracking-tight text-muted-foreground">
              Visualizando os destinos mais econômicos{current.label ? ` para ${current.label}` : ""}
            </div>
          </div>
        </Card>

      ) : null}


      {/* Preços do trecho: gráfico de meses + tabela comparativa + motor */}
      {data && (data.months.length > 0 || data.dates.length > 0) ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Ida + volta • melhores preços encontrados
              </div>
              <h2 className="mt-1 text-3xl font-extrabold tracking-tight">{data.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.dates.length} datas disponíveis
              </p>
            </div>
            {cheapest && (
              <Card className="border-primary/30 bg-card/80 px-5 py-3 shadow-xl">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Melhor tarifa detectada
                </div>
                <div className="flex items-baseline gap-1 text-3xl font-black text-primary">
                  {brl(cheapest.price)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {cheapest.departLabel}
                  {cheapest.returnLabel ? ` — ${cheapest.returnLabel}` : ""}
                </div>
              </Card>
            )}
          </div>

          {data.months.length > 0 && (
            <Card className="rounded-2xl p-6">
              <div className="mb-7 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Histórico de preços
                  </h3>
                </div>
                <span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                  Clique no mês para filtrar
                </span>
              </div>
              <div className="flex h-32 items-end justify-between gap-3">
                {data.months.map((m) => {
                  const value = m.price ?? 0;
                  const height = maxMonth ? Math.max(14, Math.round((value / maxMonth) * 100)) : 14;
                  const active = current.month === monthParam(m.label);
                  return (
                    <button
                      key={m.label}
                      onClick={() => selectMonth(m.label)}
                      className="group flex min-w-12 flex-1 flex-col items-center gap-3"
                      title={m.price ? brl(m.price) : "Sem preço"}
                    >
                      <span
                        className={`text-[10px] ${
                          active || m.cheapest
                            ? "font-black text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      >
                        {m.price ? brl(m.price) : "—"}
                      </span>
                      <span
                        style={{ height: `${height}px` }}
                        className={`w-full rounded-t-md transition-all ${
                          active
                            ? "bg-gradient-to-t from-primary to-primary/60 shadow-[0_0_20px_hsl(var(--primary)/0.35)]"
                            : "bg-muted group-hover:bg-muted-foreground/40"
                        }`}
                      />
                      <span
                        className={`text-[10px] font-semibold uppercase ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {q.isFetching && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> carregando tarifas salvas...
                </div>
              )}
            </Card>
          )}

          {data.dates.length > 0 && (
            <Card className="overflow-hidden rounded-2xl shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <th className="px-6 py-4">Companhia</th>
                      <th className="px-6 py-4">Ida</th>
                      <th className="px-6 py-4">Volta</th>
                      <th className="px-6 py-4">Duração</th>
                      <th className="px-6 py-4 text-center">Bagagem</th>
                      <th className="px-6 py-4">Preço final</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.dates.map((o, i) => (
                      <tr
                        key={`${o.departDate}-${o.returnDate}-${o.price}`}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            {o.airlineLogo ? (
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1.5">
                                <img
                                  src={o.airlineLogo}
                                  alt={nomeCompanhia(o.airline) ?? "Companhia"}
                                  className="max-h-full max-w-full"
                                />
                              </span>
                            ) : null}
                            <div className="text-xs font-bold">
                              {nomeCompanhia(o.airline) ?? "—"}
                            </div>

                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold">{o.departLabel}</div>
                          <div className="text-[10px] text-muted-foreground">{o.weekdayOut}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold">{o.returnLabel ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{o.weekdayIn}</div>
                        </td>
                        <td className="px-6 py-5">
                          {o.nights ? (
                            <Badge variant="secondary" className="rounded-full text-[10px]">
                              {o.nights} dias
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <BaggageBlocks label={o.baggage} />
                        </td>

                        <td className="px-6 py-5">
                          <div
                            className={`text-xl font-black ${i === 0 ? "text-primary" : ""}`}
                          >
                            {brl(o.price)}
                          </div>
                          {i === 0 && (
                            <div className="text-[9px] font-bold uppercase tracking-tight text-primary">
                              Tarifa mínima
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <Button size="sm" variant={i === 0 ? "default" : "secondary"} asChild>
                            <a href={o.viaairUrl} target="_blank" rel="noreferrer">
                              Ver voos <ExternalLink className="ml-1 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Motor de busca — pesquise outras datas */}
          <Card className="rounded-2xl p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-6 w-1.5 rounded-full bg-primary" />
              <h3 className="text-sm font-black uppercase tracking-[0.15em]">
                Pesquise outras datas
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Origem">
                <input
                  value={motor.origem}
                  onChange={(e) => setMotor((m) => ({ ...m, origem: e.target.value.toUpperCase() }))}
                  placeholder="PFB"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <Field label="Destino">
                <input
                  value={motor.destino}
                  onChange={(e) =>
                    setMotor((m) => ({ ...m, destino: e.target.value.toUpperCase() }))
                  }
                  placeholder="SAO"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <Field label="Ida">
                <input
                  type="date"
                  value={motor.ida}
                  onChange={(e) => setMotor((m) => ({ ...m, ida: e.target.value }))}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <Field label="Volta">
                <input
                  type="date"
                  value={motor.volta}
                  onChange={(e) => setMotor((m) => ({ ...m, volta: e.target.value }))}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <div className="flex items-end">
                <Button className="h-11 w-full font-black uppercase tracking-[0.2em]" onClick={pesquisar}>
                  <Search className="mr-2 h-4 w-4" /> Pesquisar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}


      {data && !q.isFetching && !data.categories.length && !data.cities.length && !data.dates.length && (
        <Card className="p-6 text-sm text-muted-foreground">
          Nada encontrado aqui. <Badge variant="secondary">volte um nível</Badge>
        </Card>
      )}
    </div>
  );
}
