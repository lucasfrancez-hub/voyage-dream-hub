import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, RefreshCw, Search, ArrowDownLeft, ArrowUpRight, ExternalLink, AlertTriangle, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";
import {
  obterResumoBancario, listarExtratoBancario,
} from "@/lib/conta-bancaria.functions";
import type { ExtratoItem } from "@/lib/conta-bancaria.helpers";

export const Route = createFileRoute("/admin/conta-bancaria")({
  component: ContaBancariaPage,
  head: () => ({
    meta: [
      { title: "Conta bancária — Admin VIA AIR" },
      { name: "description", content: "Saldo, entradas, saídas e extrato da conta bancária ASAAS da VIA AIR." },
      { property: "og:title", content: "Conta bancária — Admin VIA AIR" },
      { property: "og:description", content: "Saldo, entradas, saídas e extrato da conta ASAAS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Preset = "hoje" | "mes" | "anterior" | "custom";
type Dir = "todos" | "in" | "out";

function todayBRT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function monthBounds(offset: number) {
  const [y, m] = todayBRT().split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + offset, 1));
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(start), finish: iso(end) };
}

function rangeFor(preset: Preset, custom: { start: string; finish: string }) {
  if (preset === "hoje") return { start: todayBRT(), finish: todayBRT() };
  if (preset === "mes") return monthBounds(0);
  if (preset === "anterior") return monthBounds(-1);
  return custom;
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00-03:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PAGE = 50;

function ContaBancariaPage() {
  const resumoFn = useServerFn(obterResumoBancario);
  const extratoFn = useServerFn(listarExtratoBancario);

  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState(() => monthBounds(0));
  const [dir, setDir] = useState<Dir>("todos");
  const [busca, setBusca] = useState("");
  const [pages, setPages] = useState(1);

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);

  const resumo = useQuery({
    queryKey: ["conta-bancaria", "resumo"],
    queryFn: () => resumoFn({ data: undefined as never }),
    retry: false,
  });

  const extrato = useQuery({
    queryKey: ["conta-bancaria", "extrato", range.start, range.finish, pages],
    queryFn: async () => {
      const all: ExtratoItem[] = [];
      let hasMore = false;
      for (let p = 0; p < pages; p++) {
        const res = await extratoFn({
          data: { startDate: range.start, finishDate: range.finish, offset: p * PAGE, limit: PAGE },
        });
        all.push(...res.items);
        hasMore = res.hasMore;
        if (!hasMore) break;
      }
      return { items: all, hasMore };
    },
    retry: false,
  });

  const filtrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (extrato.data?.items ?? []).filter((i) => {
      if (dir !== "todos" && i.direction !== dir) return false;
      if (!q) return true;
      return `${i.description ?? ""} ${i.reference ?? ""} ${i.type ?? ""}`.toLowerCase().includes(q);
    });
  }, [extrato.data, dir, busca]);

  const refreshAll = () => {
    setPages(1);
    resumo.refetch();
    extrato.refetch();
  };

  const erro = resumo.error || extrato.error;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Wallet className="h-5 w-5 text-primary" /> Conta bancária
          </h1>
          <p className="text-sm text-muted-foreground">
            Saldo e extrato da conta ASAAS, consultados direto pela API.
          </p>
        </div>
        <Button onClick={refreshAll} variant="outline" className="gap-2">
          {resumo.isFetching || extrato.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Não foi possível atualizar os dados bancários no momento. Tente novamente.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Saldo atual"
          value={resumo.data?.saldo}
          loading={resumo.isLoading}
          tone="text-foreground"
        />
        <SummaryCard
          label="Entradas do mês"
          value={resumo.data?.entradasMes}
          loading={resumo.isLoading}
          tone="text-emerald-500"
        />
        <SummaryCard
          label="Saídas do mês"
          value={resumo.data?.saidasMes}
          loading={resumo.isLoading}
          tone="text-red-500"
        />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {([
            ["hoje", "Hoje"],
            ["mes", "Este mês"],
            ["anterior", "Mês anterior"],
            ["custom", "Período"],
          ] as [Preset, string][]).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={preset === k ? "default" : "outline"}
              onClick={() => { setPreset(k); setPages(1); }}
            >
              {label}
            </Button>
          ))}

          <span className="mx-1 h-5 w-px bg-border" />

          {([
            ["todos", "Todos"],
            ["in", "Entradas"],
            ["out", "Saídas"],
          ] as [Dir, string][]).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={dir === k ? "secondary" : "ghost"}
              onClick={() => setDir(k)}
            >
              {label}
            </Button>
          ))}

          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar descrição ou referência"
              className="pl-8"
            />
          </div>
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
            <Input
              type="date"
              value={custom.start}
              onChange={(e) => { setCustom((c) => ({ ...c, start: e.target.value })); setPages(1); }}
              className="w-auto"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="date"
              value={custom.finish}
              onChange={(e) => { setCustom((c) => ({ ...c, finish: e.target.value })); setPages(1); }}
              className="w-auto"
            />
          </div>
        )}

        <div className="divide-y">
          {extrato.isLoading && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando extrato…
            </div>
          )}

          {!extrato.isLoading && filtrado.length === 0 && !erro && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma movimentação no período.
            </div>
          )}

          {filtrado.map((i) => (
            <div key={i.id} className="flex items-start gap-3 p-3">
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  i.direction === "in"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-red-500/15 text-red-500"
                }`}
              >
                {i.direction === "in" ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {i.description || i.type || "Movimentação"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(i.createdAt || i.date)}
                  {i.type ? ` · ${i.type}` : ""}
                  {i.reference ? ` · ${i.reference}` : ""}
                </p>
                {i.link && (
                  <Link
                    to={i.link.kind === "pedido" ? "/admin/pedidos/$id" : "/admin/pagamentos"}
                    params={i.link.kind === "pedido" ? { id: i.link.id } : ({} as never)}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> {i.link.label}
                  </Link>
                )}
              </div>

              <div
                className={`shrink-0 text-sm font-semibold ${
                  i.direction === "in" ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {i.direction === "in" ? "+" : "−"} {formatBRL(Math.abs(i.value))}
              </div>
            </div>
          ))}
        </div>

        {extrato.data?.hasMore && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" size="sm" onClick={() => setPages((p) => p + 1)}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, loading, tone,
}: { label: string; value: number | undefined; loading: boolean; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatBRL(value ?? 0)}
      </p>
    </div>
  );
}
