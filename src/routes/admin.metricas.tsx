import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Users,
  MousePointerClick,
  Timer,
  Globe2,
  Link2,
  Smartphone,
  ArrowRightLeft,
} from "lucide-react";
import { obterMetricasSite, obterMetricasLinks } from "@/lib/analytics.functions";

export const Route = createFileRoute("/admin/metricas")({
  component: MetricasPage,
  head: () => ({
    meta: [
      { title: "Métricas de uso — VIA AIR" },
      { name: "description", content: "Painel interno de métricas de navegação e links curtos da VIA AIR." },
      { property: "og:title", content: "Métricas de uso — VIA AIR" },
      { property: "og:description", content: "Visitas, navegação, cliques, região e links curtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERIODOS = [
  { dias: 1, label: "Hoje" },
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

function duracao(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function Card({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <div className="mt-3 font-display text-2xl font-bold sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Lista({
  titulo,
  descricao,
  itens,
  icone,
}: {
  titulo: string;
  descricao?: string;
  itens: Array<{ label: string; total: number }>;
  icone?: React.ReactNode;
}) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  const soma = itens.reduce((a, i) => a + i.total, 0) || 1;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-foreground">
          {icone}
          {titulo}
        </h3>
        {descricao && <p className="mt-0.5 text-[11px] text-muted-foreground">{descricao}</p>}
      </div>
      {itens.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">Sem dados no período.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {itens.map((i) => (
            <li key={i.label} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-foreground">{i.label}</span>
                <span className="shrink-0 text-right text-xs font-semibold text-muted-foreground">
                  {Math.round((i.total / soma) * 100)}%
                  <span className="ml-1.5 font-normal">({i.total})</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand-orange"
                  style={{ width: `${Math.max(3, (i.total / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MetricasPage() {
  const [dias, setDias] = useState(30);
  const [aba, setAba] = useState<"site" | "links">("site");
  const siteFn = useServerFn(obterMetricasSite);
  const linksFn = useServerFn(obterMetricasLinks);

  const site = useQuery({
    queryKey: ["metricas-site", dias],
    queryFn: () => siteFn({ data: { dias } }),
  });
  const links = useQuery({
    queryKey: ["metricas-links", dias],
    queryFn: () => linksFn({ data: { dias } }),
  });

  const s = site.data;
  const l = links.data;

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-orange/30 bg-brand-orange/10 text-brand-orange">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-brand-orange">
            Configurações
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-bold">Métricas de uso</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Visitas, navegação, cliques, região, tempo de permanência e desempenho dos links curtos.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                dias === p.dias
                  ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                  : "border-border hover:border-brand-orange/60"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 inline-flex rounded-full border border-border bg-muted/40 p-1">
        {(["site", "links"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              aba === k ? "bg-background text-brand-orange shadow-sm" : "text-muted-foreground"
            }`}
          >
            {k === "site" ? "Site" : "Links curtos"}
          </button>
        ))}
      </div>

      {aba === "site" ? (
        site.isLoading ? (
          <div className="mt-6 text-sm text-muted-foreground">Carregando métricas…</div>
        ) : site.error ? (
          <div className="mt-6 text-sm text-red-500">{(site.error as Error).message}</div>
        ) : s ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card icon={<Users className="h-4 w-4" />} label="Visitantes" value={s.resumo.visitantes} hint={`${s.resumo.sessoes} sessões`} />
              <Card icon={<ArrowRightLeft className="h-4 w-4" />} label="Navegaram" value={s.resumo.navegaram} hint={`${s.resumo.rejeicao}% viram só 1 página`} />
              <Card icon={<MousePointerClick className="h-4 w-4" />} label="Cliques" value={s.resumo.cliques} hint={`${s.resumo.pageviews} páginas vistas`} />
              <Card icon={<Timer className="h-4 w-4" />} label="Tempo médio" value={duracao(s.resumo.tempoMedioMs)} hint={`${s.resumo.diretoPct}% entraram direto pelo link`} />
            </div>

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Visitas por dia
              </div>
              <div className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-1">
                {s.serie.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sem dados ainda.</span>
                )}
                {s.serie.map((d) => {
                  const max = Math.max(1, ...s.serie.map((x) => x.sessoes));
                  return (
                    <div key={d.dia} className="flex min-w-[26px] flex-col items-center gap-1">
                      <div
                        className="w-5 rounded-t bg-brand-orange/70"
                        style={{ height: `${Math.max(4, (d.sessoes / max) * 110)}px` }}
                        title={`${d.sessoes} sessões · ${d.views} páginas`}
                      />
                      <span className="text-[9px] text-muted-foreground">{d.dia.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Lista titulo="Como chegaram (origem)" itens={s.origens} icone={<Globe2 className="h-3.5 w-3.5" />} />
              <Lista titulo="Páginas de entrada" itens={s.entradasPagina} />
              <Lista titulo="Páginas mais vistas" itens={s.paginas} />
              <Lista titulo="Mais clicado" itens={s.cliquesTop} icone={<MousePointerClick className="h-3.5 w-3.5" />} />
              <Lista titulo="Estados / regiões" itens={s.regioes} />
              <Lista titulo="Cidades" itens={s.cidades} />
              <Lista titulo="Países" itens={s.paises} />
              <Lista titulo="Dispositivos" itens={s.dispositivos} icone={<Smartphone className="h-3.5 w-3.5" />} />
              <Lista titulo="Navegadores" itens={s.navegadores} />
              <Lista titulo="Sistemas" itens={s.sistemas} />
              <Lista titulo="Campanhas (utm)" itens={s.campanhas} />
            </div>
          </div>
        ) : null
      ) : links.isLoading ? (
        <div className="mt-6 text-sm text-muted-foreground">Carregando métricas dos links…</div>
      ) : links.error ? (
        <div className="mt-6 text-sm text-red-500">{(links.error as Error).message}</div>
      ) : l ? (
        <div className="mt-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card icon={<MousePointerClick className="h-4 w-4" />} label="Cliques no período" value={l.resumo.cliquesPeriodo} />
            <Card icon={<Link2 className="h-4 w-4" />} label="Links com clique" value={l.resumo.linksAtivos} hint={`${l.resumo.linksTotais} links criados`} />
            <Card icon={<Globe2 className="h-4 w-4" />} label="Regiões alcançadas" value={l.regioes.length} />
          </div>

          <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            O detalhamento de cliques (data, região, dispositivo) começa a ser registrado a partir da ativação das métricas.
            Links criados antes disso não têm histórico retroativo — a coluna “Total” mostra o acumulado desde a criação do link.
          </p>

          <section className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Desempenho por link
            </div>

            {l.links.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhum link criado ainda.</div>
            ) : (
              <ul className="divide-y divide-border">
                {l.links.map((row) => (
                  <li key={row.slug} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-sm font-semibold text-brand-orange">/l/{row.slug}</code>
                        {row.label && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {row.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 break-all text-xs text-muted-foreground">→ {row.target_url}</div>
                      {row.last_click_at && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          último clique {new Date(row.last_click_at).toLocaleString("pt-BR")}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-4 text-right">
                      <div>
                        <div className="text-lg font-bold text-brand-orange">{row.periodo}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">no período</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{row.total}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">total</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Lista titulo="De onde vieram os cliques" itens={l.origens} icone={<Globe2 className="h-3.5 w-3.5" />} />
            <Lista titulo="Estados / regiões" itens={l.regioes} />
            <Lista titulo="Cidades" itens={l.cidades} />
            <Lista titulo="Dispositivos" itens={l.dispositivos} icone={<Smartphone className="h-3.5 w-3.5" />} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
