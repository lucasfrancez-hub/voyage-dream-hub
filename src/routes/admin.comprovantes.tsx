import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Receipt, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";
import { listarComprovantes } from "@/lib/comprovantes.functions";
import { ComprovanteActions } from "@/components/financial/ComprovanteActions";
import { ExternalReceiptButton } from "@/components/financial/ExternalReceiptButton";
import { listarPagamentosExternos } from "@/lib/pagamentos-externos.functions";
import { bancoSlug, formaLabel, type PagamentoExterno } from "@/lib/pagamentos-externos.helpers";

export const Route = createFileRoute("/admin/comprovantes")({
  component: ComprovantesPage,
  head: () => ({
    meta: [
      { title: "Comprovantes — Admin VIA AIR" },
      { name: "description", content: "Comprovantes de Pix, cobranças e boletos pagos pela conta ASAAS da VIA AIR." },
      { property: "og:title", content: "Comprovantes — Admin VIA AIR" },
      { property: "og:description", content: "Todos os comprovantes financeiros da VIA AIR em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Preset = "hoje" | "ontem" | "semana" | "mes" | "custom";

function todayBRT() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function shift(dateISO: string, days: number) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangeFor(preset: Preset, custom: { start: string; finish: string }) {
  const today = todayBRT();
  if (preset === "hoje") return { start: today, finish: today };
  if (preset === "ontem") return { start: shift(today, -1), finish: shift(today, -1) };
  if (preset === "semana") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    return { start: shift(today, -dow), finish: today };
  }
  if (preset === "mes") return { start: `${today.slice(0, 7)}-01`, finish: today };
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

function ComprovantesPage() {
  const listarFn = useServerFn(listarComprovantes);
  const listarExternosFn = useServerFn(listarPagamentosExternos);

  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState(() => {
    const t = todayBRT();
    return { start: `${t.slice(0, 7)}-01`, finish: t };
  });
  const [busca, setBusca] = useState("");
  const [fluxo, setFluxo] = useState<"todos" | "in" | "out">("todos");
  const [origem, setOrigem] = useState<"todos" | "asaas" | "externo">("todos");
  const [banco, setBanco] = useState<string>("todos");

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);

  const q = useQuery({
    queryKey: ["comprovantes", range.start, range.finish],
    queryFn: () => listarFn({ data: { startDate: range.start, finishDate: range.finish } }),
    retry: false,
    refetchOnMount: "always",
  });

  const externosQ = useQuery({
    queryKey: ["comprovantes-externos", range.start, range.finish],
    queryFn: () => listarExternosFn({ data: { startDate: range.start, finishDate: range.finish } }),
    retry: false,
    refetchOnMount: "always",
  });

  const externos = useMemo(
    () => ((externosQ.data?.items ?? []) as unknown as PagamentoExterno[]),
    [externosQ.data],
  );

  const bancos = useMemo(() => {
    const set = new Set<string>();
    for (const p of externos) set.add(bancoSlug(p.banco_nome));
    return Array.from(set).sort();
  }, [externos]);

  const unificado = useMemo(() => {
    type Row = {
      key: string;
      src: "asaas" | "externo";
      banco: string;
      date: string | null;
      favored: string | null;
      operation: string;
      status: string | null;
      value: number;
      direction: "in" | "out";
      reference: string | null;
      asaas?: any;
      externo?: PagamentoExterno;
    };
    const rows: Row[] = [];
    for (const c of q.data?.items ?? []) {
      rows.push({
        key: c.id,
        src: "asaas",
        banco: "ASAAS",
        date: c.date,
        favored: c.favored,
        operation: c.operation,
        status: c.status,
        value: c.value,
        direction: c.direction,
        reference: c.reference || c.asaasId,
        asaas: c,
      });
    }
    for (const p of externos) {
      rows.push({
        key: `externo:${p.id}`,
        src: "externo",
        banco: bancoSlug(p.banco_nome),
        date: p.data_pagamento,
        favored: p.beneficiario_nome,
        operation: `${formaLabel(p.forma_pagamento)} pago`,
        status: "Pago",
        value: Number(p.valor ?? 0),
        direction: "out",
        reference: p.autenticacao,
        externo: p,
      });
    }
    return rows.sort((a, z) => String(z.date ?? "").localeCompare(String(a.date ?? "")));
  }, [q.data, externos]);

  const filtrado = useMemo(() => {
    const s = busca.trim().toLowerCase();
    let items = unificado;
    if (fluxo !== "todos") items = items.filter((i) => i.direction === fluxo);
    if (origem !== "todos") items = items.filter((i) => i.src === origem);
    if (banco !== "todos") items = items.filter((i) => i.banco === banco);
    if (!s) return items;
    return items.filter((i) =>
      `${i.favored ?? ""} ${i.operation} ${i.status ?? ""} ${i.reference ?? ""} ${i.banco} ${formatBRL(i.value)} ${i.value}`
        .toLowerCase()
        .includes(s),
    );
  }, [unificado, busca, fluxo, origem, banco]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-3 py-6 sm:px-6 md:py-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Comprovantes</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pix enviados, cobranças recebidas e boletos pagos — consultados ao vivo na conta ASAAS.
          </p>
        </div>
        <Button
          onClick={() => q.refetch()}
          variant="outline"
          className="gap-2 border-border/60 bg-foreground/5"
        >
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {q.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Não foi possível consultar os comprovantes agora. Tente novamente.</span>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-border/60 bg-foreground/5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col justify-between gap-4 border-b border-border/60 p-4 lg:flex-row lg:items-center">
          <div className="flex w-fit flex-wrap items-center gap-1 rounded-xl bg-background/40 p-1">
            {([
              ["hoje", "Hoje"],
              ["ontem", "Ontem"],
              ["semana", "Esta semana"],
              ["mes", "Este mês"],
              ["custom", "Período"],
            ] as [Preset, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                  preset === k
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
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
              placeholder="Favorecido, valor, operação, referência ou ID"
              className="rounded-xl border-border/60 bg-background/40 pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
          {([
            { id: "todos", label: "Todos" },
            { id: "in", label: "Recebidos" },
            { id: "out", label: "Enviados" },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFluxo(f.id)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (fluxo === f.id
                  ? f.id === "in"
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                    : f.id === "out"
                      ? "border-red-500/50 bg-red-500/15 text-red-400"
                      : "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4 text-sm">
            <Input
              type="date"
              value={custom.start}
              onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
              className="w-auto rounded-xl border-border/60 bg-background/40"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="date"
              value={custom.finish}
              onChange={(e) => setCustom((c) => ({ ...c, finish: e.target.value }))}
              className="w-auto rounded-xl border-border/60 bg-background/40"
            />
          </div>
        )}

        {q.isLoading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando comprovantes…
          </div>
        )}

        {!q.isLoading && filtrado.length === 0 && !q.error && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum comprovante disponível no período.
          </div>
        )}

        {!q.isLoading && filtrado.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-4 font-semibold">Data / Favorecido</th>
                  <th className="px-6 py-4 font-semibold">Operação / Status</th>
                  <th className="px-6 py-4 text-right font-semibold">Valor</th>
                  <th className="px-6 py-4 text-right font-semibold">Comprovante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtrado.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-foreground/[0.03]">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">{c.favored || "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtDate(c.date)}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                        {c.reference || c.asaasId}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          "inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium " +
                          (c.direction === "in"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/40 bg-red-500/10 text-red-400")
                        }
                      >
                        {c.operation}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">{c.status || "—"}</p>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold">
                      {formatBRL(c.value)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.receiptUrl ? (
                        <ComprovanteActions
                          url={c.receiptUrl}
                          compact={false}
                          paymentId={c.kind === "payment" ? c.asaasId : null}
                          transferId={c.kind === "transfer" ? c.asaasId : null}
                          billId={c.kind === "bill" ? c.asaasId : null}
                          receipt={{
                            valor: Math.abs(Number(c.value ?? 0)),
                            favorecido: c.favored || "—",
                            favorecidoLabel: c.counterpartyLabel,
                            direction: c.direction,
                            instituicao: c.instituicao ?? null,
                            chavePix: c.chavePix ?? null,
                            cpfCnpj: c.cpfCnpj ?? null,
                            descricao: c.descricao ?? null,
                            tipo: c.operation,
                            dataHora: fmtDate(c.date),
                            transacaoId: c.endToEndId || c.reference || c.asaasId,
                            status: c.status ?? undefined,
                            concluido: true,
                            formaPagamento: c.formaPagamento ?? null,
                            dataVencimento: c.dueDate ?? null,
                            dataPagamento: c.paymentDate ?? c.date ?? null,
                            pdfUrl: c.receiptUrl ?? null,
                          }}
                        />
                      ) : ["Concluído", "Recebido", "Confirmado", "Pago", "Recebido em dinheiro"].includes(
                          String(c.status ?? ""),
                        ) ? (
                        <ComprovanteActions
                          compact={false}
                          paymentId={c.kind === "payment" ? c.asaasId : null}
                          transferId={c.kind === "transfer" ? c.asaasId : null}
                          billId={c.kind === "bill" ? c.asaasId : null}
                          receipt={{
                            valor: Math.abs(Number(c.value ?? 0)),
                            favorecido: c.favored || "—",
                            favorecidoLabel: c.counterpartyLabel,
                            direction: c.direction,
                            instituicao: c.instituicao ?? null,
                            chavePix: c.chavePix ?? null,
                            cpfCnpj: c.cpfCnpj ?? null,
                            descricao: c.descricao ?? null,
                            tipo: c.operation,
                            dataHora: fmtDate(c.date),
                            transacaoId: c.endToEndId || c.reference || c.asaasId,
                            status: c.status ?? undefined,
                            concluido: true,
                            formaPagamento: c.formaPagamento ?? null,
                            dataVencimento: c.dueDate ?? null,
                            dataPagamento: c.paymentDate ?? c.date ?? null,
                            pdfUrl: c.receiptUrl ?? null,
                          }}
                        />

                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          title={`Sem comprovante: movimentação com status "${c.status ?? "—"}".`}
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
      </div>
    </div>
  );
}
