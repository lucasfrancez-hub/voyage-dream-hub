import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Hotel, Plane, Package, DollarSign, Users, ExternalLink, Printer,
  Link2 as LinkIcon, ArrowRightLeft, RotateCcw, Loader2, Copy, Hash, Star,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quoteStatusBadge, quoteSourceBadge } from "@/lib/quotes/labels";
import {
  converterOrcamentoEmPedido, gerarLinkOrcamento, reprocessarImportacao,
} from "@/lib/quotes/quotes.functions";
import type { NormalizedOption, NormalizedQuote } from "@/lib/quotes/types";
import { confirmThen } from "@/lib/confirm";

export const Route = createFileRoute("/admin/orcamentos/$id")({
  component: QuoteDetailPage,
  head: () => ({ meta: [{ title: "Detalhe do orçamento — Admin" }] }),
});

type QuoteRow = {
  id: string;
  quote_number: number;
  status: string;
  source: string;
  title: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  origin: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  total: number | null;
  consultant: string | null;
  normalized: unknown;
  source_import_id: string | null;
  converted_order_id: string | null;
  public_url: string | null;
  public_short_url: string | null;
  created_at: string;
};

function dt(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}
function hora(v?: string | null) {
  if (!v || v.length <= 10) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function QuoteDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [optionNumber, setOptionNumber] = useState<number | null>(null);

  const { data: quote, isLoading } = useQuery({
    queryKey: ["admin", "quoteDetail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          "id, quote_number, status, source, title, client_name, client_phone, client_email, origin, destination, start_date, end_date, total, consultant, normalized, source_import_id, converted_order_id, public_url, public_short_url, created_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as QuoteRow | null;
    },
  });

  const gerarLink = useServerFn(gerarLinkOrcamento);
  const converter = useServerFn(converterOrcamentoEmPedido);
  const reprocessar = useServerFn(reprocessarImportacao);

  const linkMutation = useMutation({
    mutationFn: () => gerarLink({ data: { quoteId: id } }),
    onSuccess: async (r) => {
      const url = r.shortUrl ?? r.url;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(r.reused ? "Link copiado" : "Link gerado e copiado", { description: url });
      } catch {
        toast.success("Link gerado", { description: url });
      }
      void qc.invalidateQueries({ queryKey: ["admin", "quoteDetail", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar link"),
  });

  const convertMutation = useMutation({
    mutationFn: (opt: number | null) =>
      converter({ data: opt ? { quoteId: id, optionNumber: opt } : { quoteId: id } }),
    onSuccess: (r) => {
      toast.success(r.alreadyConverted ? "Orçamento já convertido" : "Pedido gerado a partir do orçamento");
      void qc.invalidateQueries({ queryKey: ["admin", "quoteDetail", id] });
      void qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
      if (r.orderId) void navigate({ to: "/admin/pedidos/$id", params: { id: r.orderId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao converter"),
  });

  const reprocessMutation = useMutation({
    mutationFn: (importId: string) => reprocessar({ data: { importId } }),
    onSuccess: () => {
      toast.success("Importação reprocessada");
      void qc.invalidateQueries({ queryKey: ["admin", "quoteDetail", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao reprocessar"),
  });

  const normalized = (quote?.normalized ?? null) as NormalizedQuote | null;
  const options: NormalizedOption[] = useMemo(() => normalized?.options ?? [], [normalized]);
  const option: NormalizedOption | null = useMemo(() => {
    if (!options.length) return null;
    return options.find((o) => o.optionNumber === optionNumber) ?? options[0] ?? null;
  }, [options, optionNumber]);

  const hoteis = option?.hotels ?? [];
  const voos = option?.flights ?? [];
  const servicos = [
    ...(option?.services ?? []),
    ...(option?.transfers ?? []),
    ...(option?.activities ?? []),
    ...(option?.tickets ?? []),
    ...(option?.insurance ?? []),
    ...(option?.cars ?? []),
  ];
  const pax = normalized?.passengers ?? null;
  const nomesPax = pax?.names ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
      </div>
    );
  }
  if (!quote) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-muted-foreground">
        Orçamento não encontrado.
        <div className="mt-4">
          <Link to="/admin/orcamentos" className="text-brand-orange hover:underline">Voltar para Orçamentos</Link>
        </div>
      </div>
    );
  }

  const st = quoteStatusBadge(quote.status);
  const og = quoteSourceBadge(quote.source);
  const total = Number(quote.total ?? option?.total ?? 0);
  const publicUrl = quote.public_short_url ?? quote.public_url;

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/admin/orcamentos" className="inline-flex items-center gap-2 font-semibold hover:text-brand-orange">
          <ArrowLeft className="h-4 w-4" /> Orçamentos
        </Link>
        <span className="text-muted-foreground">/ Detalhe</span>
      </div>

      {/* Cabeçalho */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-bold tabular-nums">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />{quote.quote_number}
            </span>
            <span className="text-muted-foreground">
              REF <span className="font-semibold text-foreground">{quote.id.slice(0, 8).toUpperCase()}</span>
            </span>
            <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.className}`}>
              {st.label}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${og.className}`}>
              {og.label}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Criado em <span className="font-semibold text-foreground">{dt(quote.created_at)}, {hora(quote.created_at)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-5">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-display font-bold truncate">{quote.client_name ?? "Cliente"}</h1>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {[quote.client_phone, quote.client_email].filter(Boolean).join(" · ") || "Sem contato informado"}
            </div>
            <div className="mt-4 max-w-xl">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Título da viagem</div>
              <Input readOnly value={quote.title ?? quote.destination ?? ""} className="mt-1" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {[quote.origin, quote.destination].filter(Boolean).join(" → ") || "—"} ·{" "}
                {dt(quote.start_date)} – {dt(quote.end_date)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor total</div>
            <div className="text-3xl font-bold tabular-nums">
              <span className="mr-2 text-base text-muted-foreground">BRL</span>
              {formatBRL(total).replace("R$", "").trim()}
            </div>
            {quote.consultant && (
              <div className="mt-1 text-[11px] text-muted-foreground">Consultor: {quote.consultant}</div>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost" size="sm" className="gap-2"
              disabled={!publicUrl}
              onClick={() => publicUrl && window.open(publicUrl, "_blank", "noopener")}
            >
              <ExternalLink className="h-4 w-4" /> Abrir web
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            {publicUrl && (
              <Button
                variant="ghost" size="sm" className="gap-2"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl);
                  toast.success("Link copiado", { description: publicUrl });
                }}
              >
                <Copy className="h-4 w-4" /> Copiar link
              </Button>
            )}
            {quote.source_import_id && (
              <Button
                variant="ghost" size="sm" className="gap-2"
                disabled={reprocessMutation.isPending}
                onClick={() => reprocessMutation.mutate(quote.source_import_id!)}
              >
                {reprocessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reprocessar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline" size="sm" className="gap-2"
              disabled={linkMutation.isPending}
              onClick={() => linkMutation.mutate()}
            >
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              Gerar link
            </Button>
            {quote.converted_order_id ? (
              <Link
                to="/admin/pedidos/$id"
                params={{ id: quote.converted_order_id }}
                className="inline-flex items-center gap-2 rounded-md bg-brand-orange px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:brightness-110"
              >
                <ExternalLink className="h-4 w-4" /> Abrir pedido
              </Link>
            ) : (
              <Button
                size="sm" className="gap-2"
                disabled={convertMutation.isPending}
                onClick={() =>
                  confirmThen(
                    option && options.length > 1
                      ? `Converter a opção ${option.optionNumber} em pedido?`
                      : "Converter este orçamento em pedido?",
                    () => convertMutation.mutate(option?.optionNumber ?? null),
                  )
                }
              >
                {convertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                Converter em pedido
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Passageiros */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
            <Users className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-display font-bold">
            Passageiros <span className="text-muted-foreground">({nomesPax.length || (pax?.adults ?? 0) + (pax?.children ?? 0) + (pax?.infants ?? 0)})</span>
          </h2>
        </div>
        <div className="border-t border-border px-4 py-5 text-sm">
          {nomesPax.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {nomesPax.map((n, i) => (
                <li key={`${n}-${i}`} className="rounded-lg border border-border/60 px-3 py-2 font-medium">{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted-foreground">
              {pax
                ? [
                    pax.adults ? `${pax.adults} adulto(s)` : null,
                    pax.children ? `${pax.children} criança(s)` : null,
                    pax.infants ? `${pax.infants} bebê(s)` : null,
                  ].filter(Boolean).join(" · ") || "Nenhum passageiro cadastrado."
                : "Nenhum passageiro cadastrado."}
            </p>
          )}
        </div>
      </div>

      {/* Opções comerciais */}
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const active = (option?.optionNumber ?? 0) === o.optionNumber;
            return (
              <button
                key={o.optionNumber}
                type="button"
                onClick={() => setOptionNumber(o.optionNumber)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "bg-brand-orange text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label ?? `Opção ${o.optionNumber}`}
                {o.total ? <span className="ml-2 tabular-nums">{formatBRL(Number(o.total))}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Itens */}
      <Tabs defaultValue="hospedagem">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="hospedagem" className="gap-2"><Hotel className="h-4 w-4" /> Hospedagem ({hoteis.length})</TabsTrigger>
          <TabsTrigger value="aereo" className="gap-2"><Plane className="h-4 w-4" /> Aéreo ({voos.length})</TabsTrigger>
          <TabsTrigger value="servicos" className="gap-2"><Package className="h-4 w-4" /> Serviços ({servicos.length})</TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-2"><DollarSign className="h-4 w-4" /> Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="hospedagem" className="mt-4">
          <div className="rounded-2xl border border-border bg-card divide-y divide-border/60">
            {hoteis.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma hospedagem neste orçamento.</div>
            )}
            {hoteis.map((h, i) => (
              <div key={`${h.name}-${i}`} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{h.name}</span>
                    {h.city && <span className="text-[11px] text-muted-foreground">· {h.city}</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {dt(h.checkin)} → {dt(h.checkout)}
                    {h.nights ? ` · ${h.nights} noite(s)` : ""}
                    {h.board ? ` · ${h.board}` : ""}
                  </div>
                  {h.roomDescription && <div className="mt-1 text-xs">{h.roomDescription}</div>}
                  {h.address && <div className="mt-1 text-[11px] text-muted-foreground">{h.address}</div>}
                </div>
                <div className="text-right">
                  {h.total ? <div className="font-bold tabular-nums">{formatBRL(Number(h.total))}</div> : null}
                  {h.photos?.length ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Star className="h-3 w-3" /> {h.photos.length} foto(s)
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="aereo" className="mt-4">
          <div className="rounded-2xl border border-border bg-card divide-y divide-border/60">
            {voos.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum voo neste orçamento.</div>
            )}
            {voos.map((f, i) => (
              <div key={`${f.fromIata}-${i}`} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {f.direction === "INBOUND" ? "Voo de volta" : "Voo de ida"}
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-semibold">
                      <Plane className="h-4 w-4 text-brand-orange" />
                      {f.fromIata ?? "—"} → {f.toIata ?? "—"}
                      <span className="text-[11px] font-normal text-muted-foreground">{f.airline ?? ""}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      {dt(f.departure)} {hora(f.departure)} → {dt(f.arrival)} {hora(f.arrival)}
                      {f.duration ? ` · ${f.duration}` : ""}
                      {typeof f.stops === "number" ? ` · ${f.stops === 0 ? "Direto" : `${f.stops} conexão(ões)`}` : ""}
                    </div>
                  </div>
                  {f.total ? <div className="font-bold tabular-nums">{formatBRL(Number(f.total))}</div> : null}
                </div>
                {f.segments?.length > 1 && (
                  <div className="mt-3 space-y-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    {f.segments.map((s, si) => (
                      <div key={si} className="text-[11px] text-muted-foreground tabular-nums">
                        {s.airline ?? ""} {s.flightNumber ?? ""} · {s.fromIata} {hora(s.departure)} → {s.toIata} {hora(s.arrival)}
                        {s.duration ? ` · ${s.duration}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="servicos" className="mt-4">
          <div className="rounded-2xl border border-border bg-card divide-y divide-border/60">
            {servicos.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum serviço neste orçamento.</div>
            )}
            {servicos.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <div className="font-semibold">{s.name}</div>
                  {s.description && <div className="mt-0.5 text-[11px] text-muted-foreground">{s.description}</div>}
                  {s.date && <div className="mt-0.5 text-[11px] text-muted-foreground">{dt(s.date)}</div>}
                </div>
                {s.total ? <div className="font-bold tabular-nums">{formatBRL(Number(s.total))}</div> : null}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="financeiro" className="mt-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total da opção selecionada</span>
              <span className="font-bold tabular-nums">{formatBRL(Number(option?.total ?? total))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total do orçamento</span>
              <span className="font-bold tabular-nums">{formatBRL(total)}</span>
            </div>
            {(option?.paymentConditions ?? []).length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Condições de pagamento</div>
                <ul className="mt-1 list-disc pl-5 text-[13px]">
                  {(option?.paymentConditions ?? []).map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {(option?.notes ?? []).length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Observações</div>
                <ul className="mt-1 list-disc pl-5 text-[13px]">
                  {(option?.notes ?? []).map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
