/**
 * Passagens aéreas baratas — navegação igual à do Melhores Destinos:
 * região → país → destino → origem → datas, tudo automático e com o link
 * do nosso motor (Comprar Viagem) no lugar do parceiro.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Copy, ExternalLink, Loader2, Plane, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { explorarPassagensMd } from "@/lib/melhores-destinos.functions";

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

function PassagensBaratasPage() {
  const explorar = useServerFn(explorarPassagensMd);
  const [trail, setTrail] = useState<Step[]>([{ label: "Passagens baratas" }]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";
  const current = trail[trail.length - 1];

  const q = useQuery({
    queryKey: ["md-explorar", current],
    queryFn: () =>
      explorar({
        data: {
          base: origin,
          ...(current.categoryId ? { categoryId: current.categoryId } : {}),
          ...(current.toIata ? { toIata: current.toIata } : {}),
          ...(current.fromIata ? { fromIata: current.fromIata } : {}),
          ...(current.month ? { month: current.month } : {}),
        },
      }),
    staleTime: 5 * 60 * 1000,
  });

  const go = (step: Step) => setTrail((t) => [...t, step]);
  const backTo = (i: number) => setTrail((t) => t.slice(0, i + 1));

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success("Link copiado"),
      () => toast.error("Não consegui copiar"),
    );

  const data = q.data;
  const cheapest = data?.dates[0] ?? null;
  const maxMonth = Math.max(0, ...(data?.months.map((m) => m.price ?? 0) ?? [0]));

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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Plane className="h-6 w-6 text-primary" /> Passagens aéreas baratas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha a região, o país e o destino. Cada preço abre direto no nosso motor.
          </p>
        </div>
        <Button variant="secondary" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <nav className="flex flex-wrap items-center gap-1 text-sm">
        {trail.map((s, i) => (
          <span key={`${s.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <button
              className={
                i === trail.length - 1
                  ? "font-semibold"
                  : "text-muted-foreground underline-offset-2 hover:underline"
              }
              onClick={() => backTo(i)}
            >
              {s.label}
            </button>
          </span>
        ))}
      </nav>

      {q.isLoading && (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando os preços mais baratos...
        </Card>
      )}
      {q.isError && <Card className="p-6 text-sm text-destructive">{(q.error as Error).message}</Card>}

      {/* Regiões / países */}
      {data?.categories.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => go({ label: c.name, categoryId: c.id })}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
            >
              {c.image && (
                <img
                  src={c.image}
                  alt={c.name}
                  loading="lazy"
                  className="h-16 w-20 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.name}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">{c.description}</div>
              </div>
              {c.price != null && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Ida + volta</div>
                  <div className="font-bold text-primary">{brl(c.price)}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {/* Destinos ou origens (tabela igual à do Melhores Destinos) */}
      {data?.cities.length ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-3 bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            <span>{data.level === "origins" ? "Origem → Destino" : "Destino"}</span>
            <span className="text-right">Ida + volta a partir de</span>
          </div>
          <div className="divide-y">
            {data.cities.map((c, i) => (
              <button
                key={`${c.fromIata ?? ""}-${c.toIata ?? i}`}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/60"
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
                <span className="min-w-0 truncate text-sm">
                  {c.fromName ? `${c.fromName} → ${c.toName}` : c.toName}
                </span>
                <span className="whitespace-nowrap text-sm font-bold">
                  {c.price != null ? brl(c.price) : "—"}
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}


      {/* Preços do trecho: gráfico de meses + melhores datas */}
      {data && (data.months.length > 0 || data.dates.length > 0) ? (
        <div className="space-y-4">
          <Card className="relative overflow-hidden border-primary/20 p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ida + volta • melhores preços encontrados
                </div>
                <div className="text-2xl font-bold tracking-tight">{data.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.dates.length} datas disponíveis
                </div>
              </div>
              {cheapest && (
                <div className="text-right">
                  <div className="text-[11px] uppercase text-muted-foreground">A partir de</div>
                  <div className="text-4xl font-black leading-none text-primary">
                    {brl(cheapest.price)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {cheapest.departLabel}
                    {cheapest.returnLabel ? ` — ${cheapest.returnLabel}` : ""}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {data.months.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preço ao longo dos meses
              </div>
              <div className="flex items-end gap-2 overflow-x-auto pb-1">
                {data.months.map((m) => {
                  const value = m.price ?? 0;
                  const height = maxMonth ? Math.max(14, Math.round((value / maxMonth) * 100)) : 14;
                  const active = current.month === monthParam(m.label);
                  return (
                    <button
                      key={m.label}
                      onClick={() => selectMonth(m.label)}
                      className="group flex min-w-14 flex-1 flex-col items-center gap-1"
                      title={m.price ? brl(m.price) : "Sem preço"}
                    >
                      <span
                        className={`text-[11px] font-semibold ${
                          m.cheapest ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {m.price ? brl(m.price) : "—"}
                      </span>
                      <span
                        style={{ height: `${height}px` }}
                        className={`w-full rounded-t-md transition-all group-hover:opacity-90 ${
                          active
                            ? "bg-primary"
                            : m.cheapest
                              ? "bg-primary/70"
                              : "bg-muted-foreground/25"
                        }`}
                      />
                      <span
                        className={`text-[11px] ${active ? "font-bold" : "text-muted-foreground"}`}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {q.isFetching && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> atualizando datas...
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.dates.map((o, i) => (
              <Card
                key={`${o.departDate}-${o.returnDate}-${o.price}`}
                className={`group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${
                  i === 0 ? "border-primary/50 ring-1 ring-primary/30" : ""
                }`}
              >
                {i === 0 && (
                  <Badge className="absolute right-3 top-3">Melhor preço</Badge>
                )}
                <div className="flex items-center gap-2">
                  {o.airlineLogo ? (
                    <img src={o.airlineLogo} alt={o.airline ?? "Companhia"} className="h-5" />
                  ) : (
                    <span className="text-xs font-semibold">{o.airline ?? "—"}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{o.partner}</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div>
                    <div className="text-lg font-semibold leading-tight">{o.departLabel}</div>
                    <div className="text-[11px] text-muted-foreground">{o.weekdayOut}</div>
                  </div>
                  <div className="flex-1 border-t border-dashed" />
                  <Plane className="h-4 w-4 rotate-90 text-primary" />
                  <div className="flex-1 border-t border-dashed" />
                  <div className="text-right">
                    <div className="text-lg font-semibold leading-tight">{o.returnLabel ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{o.weekdayIn}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {o.nights ? <Badge variant="secondary">{o.nights} dias</Badge> : null}
                  {o.baggage ? (
                    <Badge variant={/despachada/i.test(o.baggage) ? "default" : "outline"}>
                      {o.baggage}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Ida + volta</div>
                    <div className="text-2xl font-black leading-none text-primary">
                      {brl(o.price)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => copy(o.viaairUrl)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" asChild>
                      <a href={o.viaairUrl} target="_blank" rel="noreferrer">
                        Ver voos <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
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
