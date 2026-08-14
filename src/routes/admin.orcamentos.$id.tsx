import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Hotel, Plane, Package, DollarSign, Users, ExternalLink, Printer,
  Link2 as LinkIcon, ArrowRightLeft, RotateCcw, Loader2, Copy, Hash, Star, Pencil,
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
import { HotelTripAdvisorDialog } from "@/components/quotes/HotelTripAdvisorDialog";

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
  const [hotelEdit, setHotelEdit] = useState<{ name: string; city: string | null } | null>(null);

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
  const totalPax = (pax?.adults ?? 0) + (pax?.children ?? 0) + (pax?.infants ?? 0);
  const resumoPax = [
    pax?.adults ? `${pax.adults} adulto(s)` : null,
    pax?.children ? `${pax.children} criança(s)` : null,
    pax?.infants ? `${pax.infants} bebê(s)` : null,
  ].filter(Boolean).join(" · ");
  const somaHoteis = hoteis.reduce((a, h) => a + Number(h.total ?? 0), 0);
  const somaVoos = voos.reduce((a, f) => a + Number(f.total ?? 0), 0);
  const somaServicos = servicos.reduce((a, s) => a + Number(s.total ?? 0), 0);
  const linhasFinanceiro: Array<{ item: string; tipo: string; periodo: string; total: number }> = [
    ...hoteis.map((h) => ({
      item: h.name,
      tipo: "Hospedagem",
      periodo: `${dt(h.checkin)} → ${dt(h.checkout)}`,
      total: Number(h.total ?? 0),
    })),
    ...voos.map((f) => ({
      item: `${f.airline ?? "Voo"} — ${f.fromIata ?? "—"} → ${f.toIata ?? "—"}`,
      tipo: f.direction === "INBOUND" ? "Aéreo (volta)" : "Aéreo (ida)",
      periodo: dt(f.departure),
      total: Number(f.total ?? 0),
    })),
    ...servicos.map((s) => ({
      item: s.name,
      tipo: "Serviço",
      periodo: s.date ? dt(s.date) : "—",
      total: Number(s.total ?? 0),
    })),
  ];


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
        <TabsList className="flex w-full flex-nowrap overflow-x-auto h-auto justify-start sm:flex-wrap">
          <TabsTrigger value="hospedagem"><Hotel className="h-3.5 w-3.5 mr-1.5" /> Hospedagem ({hoteis.length})</TabsTrigger>
          <TabsTrigger value="aereo"><Plane className="h-3.5 w-3.5 mr-1.5" /> Aéreo ({voos.length})</TabsTrigger>
          <TabsTrigger value="servicos"><Package className="h-3.5 w-3.5 mr-1.5" /> Serviços ({servicos.length})</TabsTrigger>
          <TabsTrigger value="financeiro"><DollarSign className="h-3.5 w-3.5 mr-1.5" /> Financeiro</TabsTrigger>
        </TabsList>

        {/* ---------- Hospedagem ---------- */}
        <TabsContent value="hospedagem" className="mt-4 space-y-3">
          {hoteis.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nenhuma hospedagem neste orçamento.
            </div>
          )}
          {hoteis.map((h, i) => (
            <div key={`${h.name}-${i}`} className="rounded-xl border border-border bg-card p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
                {/* Coluna 1: reserva */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Hotel className="h-3.5 w-3.5" /> Hospedagem
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold text-brand-orange tabular-nums">
                    {h.total ? formatBRL(Number(h.total)) : "—"}
                  </div>
                  {h.photos?.length ? (
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Fotos: <span className="normal-case text-foreground">{h.photos.length}</span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-0.5">
                    <Button size="sm" variant="ghost" title="Editar" onClick={() => setHotelEdit({ name: h.name, city: h.city ?? null })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Coluna 2: detalhes */}
                <div className="min-w-0 border-l border-border pl-4">
                  <div className="font-semibold flex items-center gap-2 flex-wrap">
                    <span>{h.name}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    {h.city && <div>{h.city}</div>}
                    {h.address && <div>{h.address}</div>}
                    {h.roomDescription && <div>Categoria: <span className="text-foreground">{h.roomDescription}</span></div>}
                    {h.board && <div>Regime: <span className="text-foreground">{h.board}</span></div>}
                    {(h.checkin || h.checkout) && (
                      <div>
                        Check-in <span className="text-foreground">{dt(h.checkin)}</span>
                        {" · "}
                        Check-out <span className="text-foreground">{dt(h.checkout)}</span>
                        {h.nights ? ` · ${h.nights} noite(s)` : ""}
                      </div>
                    )}
                  </div>
                </div>

                {/* Coluna 3: hóspedes */}
                <div className="min-w-0 border-l border-border pl-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Hóspedes ({nomesPax.length || totalPax})
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {nomesPax.length === 0 && (
                      <li className="text-xs text-muted-foreground">{resumoPax || "Nenhum passageiro"}</li>
                    )}
                    {nomesPax.map((n, pi) => (
                      <li key={`${n}-${pi}`} className="text-xs font-medium text-foreground">{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ---------- Aéreo ---------- */}
        <TabsContent value="aereo" className="mt-4 space-y-3">
          {voos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nenhum voo neste orçamento.
            </div>
          )}
          {voos.map((f, i) => {
            const hit = findAirline(f.airline ?? "");
            const airlineName = hit?.name ?? f.airline ?? "";
            const segs = f.segments?.length ? f.segments : [{
              airline: f.airline, flightNumber: null, fromIata: f.fromIata, toIata: f.toIata,
              departure: f.departure, arrival: f.arrival, duration: f.duration, cabin: null,
            } as (typeof f.segments)[number]];
            return (
              <div key={`${f.fromIata}-${i}`} className="rounded-xl border border-border bg-card p-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
                  {/* Coluna 1: reserva */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Plane className="h-3.5 w-3.5" /> Reserva aérea
                    </div>
                    {airlineName && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                        {airlineName}
                      </div>
                    )}
                    <div className="mt-1 font-mono text-lg font-bold text-brand-orange tabular-nums">
                      {f.total ? formatBRL(Number(f.total)) : "—"}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {f.direction === "INBOUND" ? "Voo de volta" : "Voo de ida"}
                      {typeof f.stops === "number" ? ` · ${f.stops === 0 ? "Direto" : `${f.stops} conexão(ões)`}` : ""}
                    </div>
                  </div>

                  {/* Coluna 2: trechos */}
                  <div className="min-w-0 space-y-2 border-l border-border pl-4">
                    {segs.map((s, si) => {
                      const segHit = findAirline(s.airlineIata ?? s.airline ?? "");
                      const segAirline = segHit?.name ?? s.airline ?? airlineName;
                      const segKey = segHit?.iata ?? segAirline;
                      return (
                        <div key={si} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${f.direction === "INBOUND" ? "bg-brand-blue/15 text-brand-blue" : "bg-brand-orange/15 text-brand-orange"}`}>
                                {f.direction === "INBOUND" ? "Volta" : "Ida"}
                              </span>
                              {segAirline && <AirlineLogo airline={segKey} size={22} />}
                              {segAirline && <span className="text-xs text-muted-foreground">{segAirline}</span>}
                              {s.flightNumber && <span className="font-mono text-xs">{s.flightNumber}</span>}
                              {s.cabin && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.cabin}</span>}
                            </div>
                          </div>
                          <div className="mt-1.5 grid gap-1 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                            <div>
                              <div className="text-xs text-muted-foreground">Partida</div>
                              <div className="font-medium">{s.fromIata ?? "—"}</div>
                              <div className="text-xs">{dt(s.departure)}{hora(s.departure) ? `, ${hora(s.departure)}` : ""}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Chegada</div>
                              <div className="font-medium">{s.toIata ?? "—"}</div>
                              <div className="text-xs">{dt(s.arrival)}{hora(s.arrival) ? `, ${hora(s.arrival)}` : ""}</div>
                            </div>
                            {s.duration && (
                              <div className="text-xs text-muted-foreground sm:pl-2 sm:text-right">{s.duration}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Coluna 3: passageiros */}
                  <div className="min-w-0 border-l border-border pl-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> Passageiros ({nomesPax.length || totalPax})
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {nomesPax.length === 0 && (
                        <li className="text-xs text-muted-foreground">{resumoPax || "Nenhum passageiro"}</li>
                      )}
                      {nomesPax.map((n, pi) => (
                        <li key={`${n}-${pi}`} className="text-xs font-medium text-foreground">{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* ---------- Serviços ---------- */}
        <TabsContent value="servicos" className="mt-4 space-y-3">
          {servicos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nenhum serviço neste orçamento.
            </div>
          )}
          {servicos.map((s, i) => (
            <div key={`${s.name}-${i}`} className="rounded-xl border border-border bg-card p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Package className="h-3.5 w-3.5" /> Serviço
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold text-brand-orange tabular-nums">
                    {s.total ? formatBRL(Number(s.total)) : "—"}
                  </div>
                </div>
                <div className="min-w-0 border-l border-border pl-4">
                  <div className="font-semibold">{s.name}</div>
                  <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    {s.description && <div>{s.description}</div>}
                    {s.date && <div>Data: <span className="text-foreground">{dt(s.date)}</span></div>}
                    {s.quantity ? <div>Quantidade: <span className="text-foreground">{s.quantity}</span></div> : null}
                  </div>
                </div>
                <div className="min-w-0 border-l border-border pl-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Passageiros ({nomesPax.length || totalPax})
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {nomesPax.length === 0 && (
                      <li className="text-xs text-muted-foreground">{resumoPax || "Nenhum passageiro"}</li>
                    )}
                    {nomesPax.map((n, pi) => (
                      <li key={`${n}-${pi}`} className="text-xs font-medium text-foreground">{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ---------- Financeiro ---------- */}
        <TabsContent value="financeiro" className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hospedagem</div>
              <div className="font-semibold">{formatBRL(somaHoteis)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aéreo</div>
              <div className="font-semibold">{formatBRL(somaVoos)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Serviços</div>
              <div className="font-semibold">{formatBRL(somaServicos)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total da opção</div>
              <div className="font-semibold text-brand-orange">{formatBRL(Number(option?.total ?? total))}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Financeiro por item
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Item</th>
                    <th className="text-left py-2 px-2">Tipo</th>
                    <th className="text-left py-2 px-2">Período</th>
                    <th className="text-right py-2 px-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFinanceiro.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">Nenhum item neste orçamento.</td></tr>
                  )}
                  {linhasFinanceiro.map((l, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 px-2 text-xs">{l.item}</td>
                      <td className="py-2 px-2 text-xs">{l.tipo}</td>
                      <td className="py-2 px-2 text-xs">{l.periodo}</td>
                      <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-2 px-2 text-right text-xs text-muted-foreground">Total do orçamento</td>
                    <td className="py-2 px-2 text-right text-sm font-bold tabular-nums">{formatBRL(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {((option?.paymentConditions ?? []).length > 0 || (option?.notes ?? []).length > 0) && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3 text-sm">
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
          )}
        </TabsContent>
      </Tabs>


      {hotelEdit && (
        <HotelTripAdvisorDialog
          open
          onOpenChange={(v) => { if (!v) setHotelEdit(null); }}
          hotelName={hotelEdit.name}
          city={hotelEdit.city}
          onLinked={() => { void qc.invalidateQueries({ queryKey: ["admin", "quoteDetail", id] }); }}
        />
      )}

    </div>
  );
}
