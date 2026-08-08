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
import { ComprovanteActions } from "@/components/financial/ComprovanteActions";
import {
  obterResumoBancario, listarExtratoBancario,
} from "@/lib/conta-bancaria.functions";
import type { ExtratoItem } from "@/lib/conta-bancaria.helpers";
import { asaasTypeLabel } from "@/lib/asaas-labels";

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

function typeLabel(t: string | null) {
  return asaasTypeLabel(t);
}

function typeTone(t: string | null, dir: "in" | "out") {
  const k = (t ?? "").toUpperCase();
  if (k.includes("FEE")) return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  if (dir === "in") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  return "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

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
    <div className="mx-auto w-full max-w-7xl space-y-8 px-3 py-6 sm:px-6 md:py-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Conta bancária</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Saldo e extrato da conta ASAAS, consultados direto pela API.
          </p>
        </div>
        <Button onClick={refreshAll} variant="outline" className="gap-2 border-border/60 bg-foreground/5">
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

      <div className="grid gap-5 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 to-primary/5 p-6 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.4)]">
          <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary/80">Saldo atual</p>
          <p className="text-4xl font-bold">
            {resumo.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : formatBRL(resumo.data?.saldo ?? 0)}
          </p>
          <div className="mt-4 h-1 w-12 rounded-full bg-primary" />
        </div>

        <div className="rounded-2xl border border-border/60 bg-foreground/5 p-6 transition-colors hover:border-emerald-500/30">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entradas do mês</p>
          <p className="text-3xl font-bold text-emerald-400">
            {resumo.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatBRL(resumo.data?.entradasMes ?? 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-foreground/5 p-6 transition-colors hover:border-rose-500/30">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saídas do mês</p>
          <p className="text-3xl font-bold text-rose-400">
            {resumo.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatBRL(resumo.data?.saidasMes ?? 0)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/60 bg-foreground/5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col justify-between gap-4 border-b border-border/60 p-4 lg:flex-row lg:items-center">
          <div className="flex w-fit flex-wrap items-center gap-1 rounded-xl bg-background/40 p-1">
            {([
              ["hoje", "Hoje"],
              ["mes", "Este mês"],
              ["anterior", "Mês anterior"],
              ["custom", "Período"],
            ] as [Preset, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setPreset(k); setPages(1); }}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                  preset === k
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-border" />

            {([
              ["todos", "Todos"],
              ["in", "Entradas"],
              ["out", "Saídas"],
            ] as [Dir, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setDir(k)}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                  dir === k ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar descrição ou referência"
              className="rounded-xl border-border/60 bg-background/40 pl-9"
            />
          </div>
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4 text-sm">
            <Input
              type="date"
              value={custom.start}
              onChange={(e) => { setCustom((c) => ({ ...c, start: e.target.value })); setPages(1); }}
              className="w-auto rounded-xl border-border/60 bg-background/40"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="date"
              value={custom.finish}
              onChange={(e) => { setCustom((c) => ({ ...c, finish: e.target.value })); setPages(1); }}
              className="w-auto rounded-xl border-border/60 bg-background/40"
            />
          </div>
        )}

        {extrato.isLoading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando extrato…
          </div>
        )}

        {!extrato.isLoading && filtrado.length === 0 && !erro && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma movimentação no período.
          </div>
        )}

        {!extrato.isLoading && filtrado.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-4 font-semibold">Transação / Referência</th>
                  <th className="px-4 py-4 font-semibold">Tipo / Data</th>
                  <th className="px-4 py-4 text-right font-semibold">Valor</th>
                  <th className="px-4 py-4 text-right font-semibold">Comprovante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtrado.map((i) => (
                  <tr key={i.id} className="transition-colors hover:bg-foreground/[0.03]">
                    <td className="px-4 py-5">
                      <div className="flex items-start gap-4">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            i.direction === "in"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-rose-500/10 text-rose-500"
                          }`}
                        >
                          {i.direction === "in" ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {i.description || typeLabel(i.type)}
                          </p>
                          {i.reference && (
                            <p className="mt-1 truncate font-mono text-xs tracking-tight text-muted-foreground">
                              {i.reference}
                            </p>
                          )}
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
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${typeTone(i.type, i.direction)}`}
                      >
                        {typeLabel(i.type)}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtDate(i.createdAt || i.date)}</p>
                    </td>
                    <td className="px-4 py-5 text-right">
                      <span
                        className={`text-sm font-bold ${
                          i.direction === "in" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {i.direction === "in" ? "+" : "−"} {formatBRL(Math.abs(i.value))}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-right">
                      {i.receiptUrl || i.paymentId || i.transferId ? (
                        <ComprovanteActions
                          url={i.receiptUrl}
                          paymentId={i.paymentId}
                          transferId={i.transferId}
                        />
                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          title="Taxas e tarifas do banco não geram comprovante."
                        >
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {extrato.data?.hasMore && (
          <div className="border-t border-border/40 bg-background/10 p-4 text-center">
            <Button variant="ghost" size="sm" onClick={() => setPages((p) => p + 1)}>
              Ver mais transações
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

