import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Play,
  Pause,
  X as XIcon,
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listCatalogOperators,
  createCatalogRun,
  getCatalogRun,
  listCatalogRuns,
  setCatalogRunStatus,
  listCatalogProducts,
} from "@/lib/catalog/catalog.functions";
import { buildSearchPeriods } from "@/lib/catalog/types";

export const Route = createFileRoute("/admin/catalogo")({
  component: CatalogoPage,
  head: () => ({
    meta: [
      { title: "Importador de Catálogo | VIA AIR" },
      {
        name: "description",
        content:
          "Importa automaticamente o catálogo de serviços das operadoras do Infotravel para o banco da VIA AIR.",
      },
      { property: "og:title", content: "Importador de Catálogo | VIA AIR" },
      {
        property: "og:description",
        content: "Sincronize serviços das operadoras direto para o banco da VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PORTAL_URL = "https://frt.infotravel.com.br/infotravel/admin/main.xhtml";

function CatalogoPage() {
  const qc = useQueryClient();
  const fetchOperators = useServerFn(listCatalogOperators);
  const createRun = useServerFn(createCatalogRun);
  const fetchRun = useServerFn(getCatalogRun);
  const fetchRuns = useServerFn(listCatalogRuns);
  const setStatus = useServerFn(setCatalogRunStatus);
  const fetchProducts = useServerFn(listCatalogProducts);

  const [operatorSlug, setOperatorSlug] = useState("infotravel-frt");
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [months, setMonths] = useState(12);
  const [blockDays, setBlockDays] = useState(30);
  const [overlapDays, setOverlapDays] = useState(0);
  const [concurrency, setConcurrency] = useState(2);
  const [delayMs, setDelayMs] = useState(1200);
  const [importAll, setImportAll] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef<number | null>(null);

  const { data: operators = [] } = useQuery({
    queryKey: ["catalog-operators"],
    queryFn: () => fetchOperators(),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["catalog-runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 15000,
  });

  const { data: runData } = useQuery({
    queryKey: ["catalog-run", runId],
    queryFn: () => fetchRun({ data: { runId: runId! } }),
    enabled: !!runId,
    refetchInterval: 3000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["catalog-products", operatorSlug],
    queryFn: () => fetchProducts({ data: { operator_slug: operatorSlug, status: "ativo", limit: 40 } }),
  });

  const periods = useMemo(
    () =>
      buildSearchPeriods({
        start: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
        months,
        blockDays,
        overlapDays,
      }),
    [startDate, months, blockDays, overlapDays],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = runData?.run as any;
  const progress = (run?.progress ?? {}) as Record<string, unknown>;
  const donePeriods = Number(progress.done_periods ?? 0);
  const totalPeriods = Number(progress.total_periods ?? periods.length);
  const pct = totalPeriods > 0 ? Math.min(100, Math.round((donePeriods / totalPeriods) * 100)) : 0;

  const eta = useMemo(() => {
    if (!startedAt.current || donePeriods < 1) return "—";
    const elapsed = Date.now() - startedAt.current;
    const perPeriod = elapsed / donePeriods;
    const left = Math.max(0, (totalPeriods - donePeriods) * perPeriod);
    const min = Math.round(left / 60000);
    return min > 60 ? `${Math.floor(min / 60)}h ${min % 60}min` : `${min} min`;
  }, [donePeriods, totalPeriods]);

  function sendToExtension(token: string) {
    window.postMessage(
      {
        __viaair: "catalog-start",
        token,
        apiBase: window.location.origin,
        config: {
          operator_slug: operatorSlug,
          destination,
          category,
          periods,
          concurrency,
          delay_ms: delayMs,
          import_all: importAll,
        },
      },
      "*",
    );
  }

  async function handleStart() {
    if (!destination && !importAll) {
      toast.error("Informe o destino ou marque “Importar tudo”.");
      return;
    }
    setBusy(true);
    try {
      const res = await createRun({
        data: {
          operator_slug: operatorSlug,
          destination,
          category,
          start_date: startDate,
          months,
          block_days: blockDays,
          overlap_days: overlapDays,
          concurrency,
          delay_ms: delayMs,
          import_all: importAll,
        },
      });
      setRunId(res.runId);
      startedAt.current = Date.now();
      sendToExtension(res.token);
      toast.success("Importação iniciada — abra a aba do Infotravel logado.");
      qc.invalidateQueries({ queryKey: ["catalog-runs"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: "running" | "paused" | "cancelled") {
    if (!runId) return;
    await setStatus({ data: { runId, status } });
    window.postMessage({ __viaair: "catalog-control", status }, "*");
    qc.invalidateQueries({ queryKey: ["catalog-run", runId] });
  }

  useEffect(() => {
    if (run?.status === "done") {
      qc.invalidateQueries({ queryKey: ["catalog-products", operatorSlug] });
    }
  }, [run?.status, operatorSlug, qc]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Database className="h-6 w-6 text-primary" />
          Importador de Catálogo
        </h1>
        <p className="text-sm text-muted-foreground">
          Importa os serviços das operadoras do Infotravel usando a sua sessão já autenticada, direto
          para o banco da VIA AIR. Mantenha a aba do portal aberta e logada durante a importação.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Operadora">
            <select
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={operatorSlug}
              onChange={(e) => setOperatorSlug(e.target.value)}
            >
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(operators as any[]).map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destino">
            <input
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              placeholder="Ex.: Orlando"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </Field>
          <Field label="Categoria (opcional)">
            <input
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              placeholder="Ex.: Ingressos"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Data inicial (opcional)">
            <input
              type="date"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Quantidade de meses">
            <input
              type="number"
              min={1}
              max={24}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) || 12)}
            />
          </Field>
          <Field label="Bloco (dias) / sobreposição">
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={90}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                value={blockDays}
                onChange={(e) => setBlockDays(Number(e.target.value) || 30)}
              />
              <input
                type="number"
                min={0}
                max={30}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                value={overlapDays}
                onChange={(e) => setOverlapDays(Number(e.target.value) || 0)}
              />
            </div>
          </Field>
          <Field label="Processos simultâneos">
            <input
              type="number"
              min={1}
              max={6}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) || 2)}
            />
          </Field>
          <Field label="Intervalo entre pesquisas (ms)">
            <input
              type="number"
              min={0}
              max={60000}
              step={100}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Importar tudo">
            <label className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={importAll}
                onChange={(e) => setImportAll(e.target.checked)}
              />
              Varrer todos os destinos disponíveis
            </label>
          </Field>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Serão geradas <b>{periods.length}</b> pesquisas — de {periods[0]?.start ?? "—"} até{" "}
          {periods[periods.length - 1]?.end ?? "—"}.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleStart}
            disabled={busy || run?.status === "running"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Importar
          </button>
          <button
            onClick={() => changeStatus("paused")}
            disabled={!runId || run?.status !== "running"}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            <Pause className="h-4 w-4" /> Pausar
          </button>
          <button
            onClick={() => changeStatus("running")}
            disabled={!runId || run?.status !== "paused"}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Continuar
          </button>
          <button
            onClick={() => changeStatus("cancelled")}
            disabled={!runId || !["running", "paused"].includes(run?.status)}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-destructive disabled:opacity-40"
          >
            <XIcon className="h-4 w-4" /> Cancelar
          </button>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["catalog-products", operatorSlug] });
              qc.invalidateQueries({ queryKey: ["catalog-runs"] });
            }}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
          >
            <ExternalLink className="h-4 w-4" /> Abrir Infotravel
          </a>
        </div>
      </section>

      {run && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Progresso
            </h2>
            <StatusChip status={run.status} />
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Operadora" value={String(progress.operator ?? run.operator_slug ?? "—")} />
            <Stat label="Destino" value={String(progress.destination ?? run.destination ?? "—")} />
            <Stat label="Período" value={String(progress.period ?? "—")} />
            <Stat
              label="Página"
              value={`${progress.page ?? "—"}${progress.total_pages ? ` / ${progress.total_pages}` : ""}`}
            />
            <Stat label="Produto atual" value={String(progress.product ?? "—")} />
            <Stat label="Importados" value={String(run.total_found ?? 0)} />
            <Stat label="Novos" value={String(run.total_new ?? 0)} />
            <Stat label="Atualizados" value={String(run.total_updated ?? 0)} />
            <Stat label="Erros" value={String(run.total_errors ?? 0)} />
            <Stat label="Tempo restante" value={eta} />
          </div>

          {runData?.logs?.length ? (
            <div className="mt-4 max-h-56 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(runData.logs as any[]).map((l) => (
                <div key={l.id} className="flex gap-2 border-b border-border/40 py-1 last:border-0">
                  {l.level === "error" ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                  <span className="text-muted-foreground">
                    {new Date(l.created_at).toLocaleTimeString("pt-BR")}
                  </span>
                  <span>{l.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Serviços importados ({products.length})
        </h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum serviço importado ainda.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(products as any[]).map((p) => (
              <article key={p.id} className="rounded-xl border bg-background p-3">
                <p className="line-clamp-2 text-sm font-semibold">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[p.destination_label, p.city, p.country].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-2 text-xs">
                  {p.price != null
                    ? `${p.currency ?? "BRL"} ${Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "sem preço"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Últimas execuções
        </h2>
        <div className="space-y-2 text-sm">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(runs as any[]).map((r) => (
            <button
              key={r.id}
              onClick={() => setRunId(r.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/50"
            >
              <StatusChip status={r.status} />
              <span className="font-medium">{r.operator_slug}</span>
              <span className="text-muted-foreground">{r.destination ?? "todos"}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {r.total_new} novos · {r.total_updated} atualizados · {r.total_errors} erros
              </span>
            </button>
          ))}
          {runs.length === 0 && <p className="text-muted-foreground">Nenhuma execução ainda.</p>}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-primary/10 text-primary",
    paused: "bg-amber-500/10 text-amber-600",
    cancelled: "bg-destructive/10 text-destructive",
    done: "bg-emerald-500/10 text-emerald-600",
  };
  const label: Record<string, string> = {
    running: "Rodando",
    paused: "Pausado",
    cancelled: "Cancelado",
    done: "Concluído",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-muted"}`}>
      {label[status] ?? status}
    </span>
  );
}
