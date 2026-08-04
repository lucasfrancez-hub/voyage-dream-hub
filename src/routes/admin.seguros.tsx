import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldCheck,
  Search,
  Loader2,
  ExternalLink,
  Copy,
  Users,
  Plus,
  Minus,
  Globe2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useIsPublicEngine } from "@/lib/public-engine";
import {
  onerInsuranceDestinationsPublic,
  onerInsuranceSearchPublic,
} from "@/lib/onertravel-public-extras.functions";


import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DateRangeField } from "@/components/search/DateRangeField";
import {
  onerInsuranceDestinations,
  onerInsuranceSearch,
} from "@/lib/onertravel-extras.functions";
import type {
  InsuranceDestination,
  InsurancePlan,
  InsuranceSearchResult,
} from "@/lib/onertravel-extras.server";

export const Route = createFileRoute("/admin/seguros")({
  head: () => ({
    meta: [
      { title: "Seguro viagem — VIA AIR" },
      {
        name: "description",
        content: "Cotação de seguro viagem por região, período e idades dos passageiros.",
      },
      { property: "og:title", content: "Seguro viagem — VIA AIR" },
      {
        property: "og:description",
        content: "Cotação de seguro viagem por região, período e idades dos passageiros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SegurosPage />,
});

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fieldShell(children: React.ReactNode) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 backdrop-blur">
      {children}
    </div>
  );
}

function PlanCard({ plan, onSelect }: { plan: InsurancePlan; onSelect?: () => void }) {
  const [open, setOpen] = useState(false);
  const highlights = plan.coverages.filter((c) => c.showInResults || c.isDMH).slice(0, 6);
  const list = open ? plan.coverages : highlights;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur transition hover:border-primary/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {plan.insurer.logoUrl ? (
            <img
              src={plan.insurer.logoUrl}
              alt={plan.insurer.name}
              loading="lazy"
              className="h-10 w-20 shrink-0 rounded-lg bg-background/80 object-contain p-1"
            />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{plan.description}</p>
            <p className="truncate text-xs text-muted-foreground">
              {plan.insurer.name} · {plan.destination.name}
            </p>
          </div>
        </div>
        <div className="text-right">
          {plan.categoryName ? (
            <Badge variant="secondary" className="mb-1">
              {plan.categoryName}
            </Badge>
          ) : null}
          <p className="text-xl font-bold text-primary">{fmtBRL(plan.price)}</p>
          <p className="text-[11px] text-muted-foreground">total do período</p>
          {onSelect && (
            <Button size="sm" className="mt-2 rounded-xl" onClick={onSelect}>
              Selecionar
            </Button>
          )}
        </div>
      </div>

      {plan.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {list.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex items-start gap-1.5 text-xs">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className={c.isDMH ? "font-medium" : "text-muted-foreground"}>{c.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {plan.coverages.length > highlights.length && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Ver menos" : `Ver todas as ${plan.coverages.length} coberturas`}
          </Button>
        )}
        {plan.generalConditionsUrl && (
          <a
            href={plan.generalConditionsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" /> Condições gerais
          </a>
        )}
      </div>
    </div>
  );
}

export function SegurosPage({ header }: { header?: React.ReactNode } = {}) {
  const [destinations, setDestinations] = useState<InsuranceDestination[]>([]);
  const [destinationId, setDestinationId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ages, setAges] = useState<number[]>([35]);
  const [result, setResult] = useState<InsuranceSearchResult | null>(null);

  const isPublic = useIsPublicEngine();
  const loadDestinations = useServerFn(
    isPublic ? onerInsuranceDestinationsPublic : onerInsuranceDestinations,
  );
  const search = useServerFn(isPublic ? onerInsuranceSearchPublic : onerInsuranceSearch);


  useEffect(() => {
    loadDestinations()
      .then((d) => {
        setDestinations(d);
        setDestinationId((cur) => cur || String(d[0]?.id ?? ""));
      })
      .catch(() => toast.error("Não foi possível carregar os destinos do seguro"));
  }, [loadDestinations]);

  const destinationName = useMemo(
    () => destinations.find((d) => String(d.id) === destinationId)?.name ?? "",
    [destinations, destinationId],
  );

  const run = useMutation({
    mutationFn: async () => {
      if (!destinationId) throw new Error("Escolha o destino");
      if (!startDate || !endDate) throw new Error("Informe ida e volta");
      return search({
        data: {
          destinationId,
          destinationName,
          startDate,
          endDate,
          ages,
          page: 1,
          pageSize: 20,
          ordering: 1,
        },
      });
    },
    onSuccess: (r) => {
      setResult(r);
      if (!r.plans.length) toast.info("Nenhum plano retornado para esse período");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na cotação"),
  });

  return (
    <div className={header ? "" : "min-h-screen bg-background"}>
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {header ?? (
            <div className="px-2">
              <h1 className="text-4xl font-bold tracking-tight">
                Qual <span className="text-primary">seguro</span> vamos cotar?
              </h1>
            </div>
          )}

          <div className="mt-6 grid gap-3 rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl md:grid-cols-[1.2fr_1.4fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Destino</Label>
              {fieldShell(
                <>
                  <Globe2 className="h-4 w-4 shrink-0 text-primary" />
                  <select
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    {destinations.length === 0 && <option value="">Carregando…</option>}
                    {destinations.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </>,
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Período da viagem</Label>
              <DateRangeField
                departureDate={startDate}
                returnDate={endDate}
                onChange={(s, e) => {
                  setStartDate(s);
                  setEndDate(e);
                }}
              />
            </div>

            <div className="flex items-end">
              <Button
                className="h-11 w-full rounded-xl px-6 md:w-auto"
                onClick={() => run.mutate()}
                disabled={run.isPending}
              >
                {run.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Cotar seguro
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Idades dos passageiros
            </span>
            {ages.map((age, i) => (
              <div
                key={i}
                className="flex h-9 items-center gap-1 rounded-full border border-border/60 bg-card/70 px-2"
              >
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={age}
                  onChange={(e) =>
                    setAges((a) =>
                      a.map((v, idx) => (idx === i ? Math.max(0, Number(e.target.value) || 0) : v)),
                    )
                  }
                  className="w-12 bg-transparent text-center text-sm outline-none"
                />
                <span className="text-[11px] text-muted-foreground">anos</span>
                {ages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAges((a) => a.filter((_, idx) => idx !== i))}
                    className="grid h-5 w-5 place-items-center rounded-full hover:bg-muted"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full"
              onClick={() => setAges((a) => [...a, 35])}
            >
              <Plus className="h-3.5 w-3.5" /> Passageiro
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {run.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando as seguradoras…
          </div>
        )}

        {result && !run.isPending && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {result.count} plano(s) encontrados · {destinationName}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(result.url);
                    toast.success("Link copiado");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar link
                </Button>
                <Button size="sm" asChild>
                  <a href={result.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir no Comprar Viagem
                  </a>
                </Button>
              </div>
            </div>
            <div className="grid gap-3">
              {result.plans.map((p) => (
                <PlanCard key={p.uuid} plan={p} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
