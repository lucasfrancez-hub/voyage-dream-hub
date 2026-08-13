import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgePercent,
  Baggage,
  CalendarDays,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe2,
  Image as ImageIcon,
  Instagram,
  Link2,
  Loader2,
  MessageCircle,
  Plane,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  generatePromotionLink,
  getAirfarePromoRun,
  listAirfarePromotions,
  listInstallmentMarkups,
  refreshAirfarePromotion,
  runAirfarePromoCollection,
  savePromoOpportunity,
  saveInstallmentMarkup,
  searchPromoOpportunity,
  setPromotionStatus,
} from "@/lib/airfare-promos.functions";
import { promoInstagramText, promoWhatsappText, type PromoRow } from "@/lib/airfare-promo-text";
import { PromoArtDialog } from "@/components/promo/PromoArtDialog";

export const Route = createFileRoute("/admin/promocoes-aereo")({
  head: () => ({
    meta: [
      { title: "Promoções de Aéreo — VIA AIR" },
      { name: "description", content: "Curadoria de oportunidades de passagens aéreas do motor VIA AIR." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PromocoesAereoPage,
});

type Promo = PromoRow & {
  id: string;
  scope: string;
  status: string;
  fare_status: string;
  last_checked_at: string;
};

const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const horaBR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "—";

/** "hoje às 06:47" / "12/08 às 21:10" */
function validadoEm(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const dia = fmt({ dateStyle: "short" });
  const hora = fmt({ hour: "2-digit", minute: "2-digit" });
  return dia === hoje ? `hoje às ${hora}` : `${dia} às ${hora}`;
}

/** Próxima coleta automática (06:00 e 12:00 BRT). */
function proximaColeta() {
  const agoraBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const h = agoraBRT.getHours() + agoraBRT.getMinutes() / 60;
  if (h < 6) return "06:00";
  if (h < 12) return "12:00";
  return "06:00 (amanhã)";
}

function copiar(texto: string, msg = "Copiado") {
  try {
    navigator.clipboard.writeText(texto);
    toast.success(msg);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

/* ------------------------------------------------------------------ */
/* Atalhos de origem                                                   */
/* ------------------------------------------------------------------ */

type Atalho = { label: string; iatas: string[] };

const ATALHOS_NACIONAL: Atalho[] = [
  { label: "Todas", iatas: [] },
  { label: "Maringá", iatas: ["MGF"] },
  { label: "Londrina", iatas: ["LDB"] },
  { label: "Curitiba", iatas: ["CWB"] },
  { label: "Cascavel", iatas: ["CAC"] },
  { label: "Foz do Iguaçu", iatas: ["IGU"] },
];

const ATALHOS_INTERNACIONAL: Atalho[] = [
  { label: "Todos", iatas: [] },
  { label: "Guarulhos", iatas: ["GRU"] },
  { label: "Rio de Janeiro", iatas: ["GIG", "SDU", "RIO"] },
  { label: "Brasília", iatas: ["BSB"] },
  { label: "Curitiba", iatas: ["CWB"] },
];

/* ------------------------------------------------------------------ */
/* Card da curadoria                                                   */
/* ------------------------------------------------------------------ */

function PromoCard({
  promo,
  onRefresh,
  onLink,
  onStatus,
  onArt,
  busy,
}: {
  promo: Promo;
  onRefresh: () => void;
  onLink: () => void;
  onStatus: (s: string) => void;
  onArt: () => void;
  busy: boolean;
}) {
  const semJuros =
    promo.interest_free_installments > 1
      ? `até ${promo.interest_free_installments}x de ${brl(promo.interest_free_installment_value)} sem juros`
      : "pagamento à vista";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card/90 to-card/60 p-4 shadow-sm backdrop-blur transition hover:border-brand-orange/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black leading-tight tracking-tight">
            {promo.origin_city ?? promo.origin_iata} <span className="text-brand-orange">→</span>{" "}
            {promo.destination_city ?? promo.destination_iata}
          </h3>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {promo.origin_iata} → {promo.destination_iata}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            promo.status === "publicado"
              ? "bg-emerald-500/15 text-emerald-400"
              : promo.status === "descartado"
                ? "bg-muted text-muted-foreground"
                : "bg-brand-orange/15 text-brand-orange"
          }`}
        >
          {promo.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {dataBR(promo.departure_date)}
          {promo.return_date ? ` – ${dataBR(promo.return_date)}` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {promo.airline_logo ? (
            <img src={promo.airline_logo} alt={promo.airline_name ?? ""} className="h-4 w-auto rounded-sm" />
          ) : (
            <Plane className="h-3.5 w-3.5" />
          )}
          {promo.airline_name ?? promo.airline_iata ?? "—"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Baggage className="h-3.5 w-3.5" />
          {promo.has_checked_baggage ? "Bagagem despachada" : "Só bagagem de mão"}
        </span>
        <span>{promo.stops === 0 ? "Voo direto" : `${promo.stops} parada(s)`}</span>
        {promo.fare_status !== "valida" ? (
          <span className="font-bold uppercase text-destructive">{promo.fare_status}</span>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-border/50 bg-background/40 p-3">
        <div className="text-2xl font-black leading-none tracking-tight">{brl(promo.price_per_passenger)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          por passageiro • total {brl(promo.total_price)}
        </div>
        <div className="mt-1.5 text-xs font-bold text-brand-orange">{semJuros}</div>
        {promo.extended_max_installments && promo.extended_installment_value_12x ? (
          <div className="text-[11px] text-muted-foreground">
            ou até {promo.extended_max_installments}x de {brl(promo.extended_installment_value_12x)}
          </div>
        ) : null}
      </div>

      <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" /> Última validação: {validadoEm(promo.last_checked_at)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={() => copiar(promoWhatsappText(promo), "Texto do WhatsApp copiado")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5"
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </button>
        <button
          type="button"
          onClick={() => copiar(promoInstagramText(promo), "Legenda do Instagram copiada")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5"
        >
          <Instagram className="h-3.5 w-3.5" /> Instagram
        </button>
        <button
          type="button"
          onClick={onArt}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90"
        >
          <ImageIcon className="h-3.5 w-3.5" /> Gerar arte
        </button>
        {promo.short_url || promo.cart_url ? (
          <a
            href={promo.short_url ?? promo.cart_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir oferta
          </a>
        ) : null}
        <button
          type="button"
          onClick={onLink}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5 disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" /> Copiar link
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5 disabled:opacity-50"
          title="Revalidar tarifa no motor"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
        <select
          value={promo.status}
          onChange={(e) => onStatus(e.target.value)}
          className="ml-auto rounded-lg border border-border/70 bg-transparent px-2 py-1.5 text-[11px] font-semibold"
        >
          <option value="novo">Novo</option>
          <option value="selecionado">Selecionado</option>
          <option value="publicado">Publicado</option>
          <option value="descartado">Descartado</option>
        </select>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Configurações de parcelamento (recolhido)                           */
/* ------------------------------------------------------------------ */

function MarkupsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listInstallmentMarkups);
  const save = useServerFn(saveInstallmentMarkup);
  const [aberto, setAberto] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["airfare-markups"], queryFn: () => list(), enabled: aberto });
  const [draft, setDraft] = useState<Record<number, string>>({});

  const mut = useMutation({
    mutationFn: (input: { installments: number; markup_percent: number }) =>
      save({ data: { ...input, active: true } }),
    onSuccess: () => {
      toast.success("Markup atualizado");
      qc.invalidateQueries({ queryKey: ["airfare-markups"] });
      qc.invalidateQueries({ queryKey: ["airfare-promos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/50">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-black uppercase tracking-widest"
      >
        <BadgePercent className="h-4 w-4 text-brand-orange" /> Configurações de parcelamento
        <ChevronDown className={`ml-auto h-4 w-4 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto ? (
        <div className="border-t border-border/50 p-4">
          <p className="text-[11px] text-muted-foreground">
            Percentual aplicado apenas nas modalidades de maior prazo (5x a 12x). A condição sem juros segue a
            regra da companhia aérea e não recebe markup.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(data as Array<{ installments: number; markup_percent: number | string }>).map((m) => (
              <label key={m.installments} className="rounded-xl border border-border/60 p-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {m.installments}x
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    value={draft[m.installments] ?? String(Number(m.markup_percent))}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.installments]: e.target.value }))}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== Number(m.markup_percent)) {
                        mut.mutate({ installments: m.installments, markup_percent: v });
                      }
                    }}
                    className="w-full rounded-md border border-border/60 bg-transparent px-2 py-1 text-sm font-semibold"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pesquisa manual                                                     */
/* ------------------------------------------------------------------ */

function PesquisaManual({ onSalvo }: { onSalvo: () => void }) {
  const buscar = useServerFn(searchPromoOpportunity);
  const salvar = useServerFn(savePromoOpportunity);
  const [aberto, setAberto] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [scope, setScope] = useState<"nacional" | "internacional">("nacional");
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      buscar({
        data: {
          origin: origin.toUpperCase(),
          destination: destination.toUpperCase(),
          departureDate: ida,
          returnDate: volta || null,
          scope,
          adults: 1,
        },
      }),
    onSuccess: (r) => setResultado(r as Record<string, unknown>),
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarMut = useMutation({
    mutationFn: () => salvar({ data: { row: resultado as Record<string, unknown> } }),
    onSuccess: () => {
      toast.success("Oportunidade adicionada à curadoria");
      setResultado(null);
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const r = resultado as null | {
    origin_iata: string;
    destination_iata: string;
    airline_name: string | null;
    total_price: number;
    price_per_passenger: number;
    interest_free_installments: number;
    interest_free_installment_value: number;
    has_checked_baggage: boolean;
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/50">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-black uppercase tracking-widest"
      >
        <Search className="h-4 w-4 text-brand-orange" /> Pesquisar novas oportunidades
        <ChevronDown className={`ml-auto h-4 w-4 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto ? (
        <div className="border-t border-border/50 p-4">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="Origem (MGF)"
              className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="Destino (GRU)"
              className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={ida}
              onChange={(e) => setIda(e.target.value)}
              className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={volta}
              onChange={(e) => setVolta(e.target.value)}
              className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "nacional" | "internacional")}
              className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            >
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </select>
            <button
              type="button"
              disabled={mut.isPending || origin.length !== 3 || destination.length !== 3 || !ida}
              onClick={() => mut.mutate()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Pesquisar
            </button>
          </div>

          {mut.isPending ? (
            <p className="mt-3 text-xs text-muted-foreground">Consultando o motor VIA AIR…</p>
          ) : null}

          {r ? (
            <div className="mt-4">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Resultados da pesquisa
              </h3>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                <div>
                  <p className="text-sm font-black">
                    {r.origin_iata} → {r.destination_iata} • {r.airline_name ?? "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {brl(r.price_per_passenger)} por passageiro • total {brl(r.total_price)} •{" "}
                    {r.has_checked_baggage ? "com bagagem" : "só bagagem de mão"}
                  </p>
                  <p className="text-[11px] font-bold text-brand-orange">
                    até {r.interest_free_installments}x de {brl(r.interest_free_installment_value)} sem juros
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => salvarMut.mutate()}
                  disabled={salvarMut.isPending}
                  className="rounded-lg bg-brand-orange px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {salvarMut.isPending ? "Salvando…" : "Transformar em promoção"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

function PromocoesAereoPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAirfarePromotions);
  const collect = useServerFn(runAirfarePromoCollection);
  const runStatus = useServerFn(getAirfarePromoRun);
  const refreshOne = useServerFn(refreshAirfarePromotion);
  const genLink = useServerFn(generatePromotionLink);
  const status = useServerFn(setPromotionStatus);

  const [aba, setAba] = useState<"nacional" | "internacional">("nacional");
  const [atalho, setAtalho] = useState(0);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [destination, setDestination] = useState("");
  const [airline, setAirline] = useState("");
  const [promoStatus, setPromoStatus] = useState("todos");
  const [baggage, setBaggage] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("preco");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [artPromo, setArtPromo] = useState<(PromoRow & { id: string }) | null>(null);

  useEffect(() => setAtalho(0), [aba]);

  const atalhos = aba === "nacional" ? ATALHOS_NACIONAL : ATALHOS_INTERNACIONAL;

  const filtros = useMemo(
    () => ({
      destination,
      airline,
      scope: aba,
      status: promoStatus,
      baggage,
      maxPrice: maxPrice ? Number(maxPrice) : null,
      sort,
    }),
    [destination, airline, aba, promoStatus, baggage, maxPrice, sort],
  );

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["airfare-promos", filtros],
    queryFn: () => list({ data: filtros }),
    placeholderData: (prev) => prev,
  });

  const promos = useMemo(() => {
    const iatas = atalhos[atalho]?.iatas ?? [];
    const rows = data as unknown as Promo[];
    return iatas.length ? rows.filter((p) => iatas.includes(p.origin_iata)) : rows;
  }, [data, atalho, atalhos]);

  const { data: run } = useQuery({
    queryKey: ["airfare-promo-run"],
    queryFn: () => runStatus(),
    refetchInterval: (q) =>
      (q.state.data as { status?: string } | null)?.status === "running" ? 5000 : 60000,
  });

  const rodando = (run as { status?: string } | null)?.status === "running";

  useEffect(() => {
    if (!rodando && run) qc.invalidateQueries({ queryKey: ["airfare-promos"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando]);

  const coletar = useMutation({
    mutationFn: () => collect({ data: {} }),
    onSuccess: (r) => {
      const res = r as { started: boolean; reason?: string };
      if (res.started) toast.success("Coleta iniciada. Pode fechar a página — ela continua rodando.");
      else toast.warning(res.reason ?? "Já existe uma coleta em andamento.");
      qc.invalidateQueries({ queryKey: ["airfare-promo-run"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acao = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["airfare-promos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falhou");
    } finally {
      setBusyId(null);
    }
  };

  const info = run as null | {
    status: string;
    total: number;
    processed: number;
    saved: number;
    last_label: string | null;
    started_at: string;
    finished_at: string | null;
  };
  const pct = info && info.total > 0 ? Math.min(100, Math.round((info.processed / info.total) * 100)) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Sparkles className="h-5 w-5 text-brand-orange" /> Promoções de Aéreo
          </h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Curadoria das melhores oportunidades encontradas e validadas no motor VIA AIR.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Última atualização: {validadoEm(info?.finished_at ?? info?.started_at)} • Próxima coleta:{" "}
            {proximaColeta()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => coletar.mutate()}
          disabled={coletar.isPending || rodando}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {coletar.isPending || rodando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {rodando ? "Atualizando promoções…" : "Atualizar agora"}
        </button>
      </header>

      {/* Status da coleta */}
      {rodando && info ? (
        <div className="mt-4 rounded-2xl border border-brand-orange/40 bg-brand-orange/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-2 font-bold text-brand-orange">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando promoções…
            </span>
            <span className="text-muted-foreground">
              {info.total > 0
                ? `${info.processed} de ${info.total} oportunidades verificadas`
                : "Preparando as rotas…"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/60">
            {pct === null ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-orange" />
            ) : (
              <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${pct}%` }} />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Iniciada às {horaBR(info.started_at).split(", ")[1] ?? "—"}
            {info.last_label ? ` • Última oportunidade processada: ${info.last_label}` : ""}
          </p>
        </div>
      ) : null}

      {/* Abas Nacional / Internacional */}
      <div className="mt-5 inline-flex rounded-xl border border-border/60 bg-card/50 p-1">
        <button
          type="button"
          onClick={() => setAba("nacional")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
            aba === "nacional" ? "bg-brand-orange text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🇧🇷 Nacionais
        </button>
        <button
          type="button"
          onClick={() => setAba("internacional")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black uppercase tracking-wide transition ${
            aba === "internacional" ? "bg-brand-orange text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe2 className="h-4 w-4" /> Internacionais
        </button>
      </div>

      {/* Atalhos de origem */}
      <div className="mt-3 flex flex-wrap gap-2">
        {atalhos.map((a, i) => (
          <button
            key={a.label}
            type="button"
            onClick={() => setAtalho(i)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              atalho === i
                ? "border-brand-orange bg-brand-orange/15 text-brand-orange"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setFiltrosAbertos((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
        </button>
      </div>

      {/* Filtros avançados */}
      {filtrosAbertos ? (
        <div className="mt-3 grid gap-2 rounded-2xl border border-border/60 bg-card/50 p-3 sm:grid-cols-3 lg:grid-cols-5">
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
            placeholder="Destino (IATA)"
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
            placeholder="Companhia"
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Valor máximo (R$)"
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          />
          <select
            value={promoStatus}
            onChange={(e) => setPromoStatus(e.target.value)}
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          >
            <option value="todos">Todos os status</option>
            <option value="novo">Novo</option>
            <option value="selecionado">Selecionado</option>
            <option value="publicado">Publicado</option>
            <option value="descartado">Descartado</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          >
            <option value="preco">Menor valor total</option>
            <option value="pax">Menor valor por passageiro</option>
            <option value="data">Data de embarque</option>
            <option value="recente">Consulta mais recente</option>
          </select>
          <label className="flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
            <input type="checkbox" checked={baggage} onChange={(e) => setBaggage(e.target.checked)} />
            Só com bagagem despachada
          </label>
        </div>
      ) : null}

      {/* Promoções */}
      <section className="mt-6">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          Promoções encontradas{" "}
          <span className="text-brand-orange">
            {promos.length}
            {isFetching ? " …" : ""}
          </span>
        </h2>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {isLoading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-border/50 bg-card/40" />
            ))
          ) : promos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground lg:col-span-2">
              Nenhuma promoção {aba} para essa origem no momento. Use “Atualizar agora” ou a pesquisa manual.
            </p>
          ) : (
            promos.map((promo) => (
              <PromoCard
                key={promo.id}
                promo={promo}
                busy={busyId === promo.id}
                onArt={() => setArtPromo(promo)}
                onRefresh={() =>
                  acao(promo.id, () => refreshOne({ data: { id: promo.id } }), "Tarifa reconsultada")
                }
                onLink={() =>
                  acao(
                    promo.id,
                    async () => {
                      const r = (await genLink({ data: { id: promo.id } })) as {
                        short_url: string | null;
                        cart_url: string;
                      };
                      copiar(r.short_url ?? r.cart_url, "Link copiado");
                    },
                    "Link gerado",
                  )
                }
                onStatus={(s) =>
                  acao(
                    promo.id,
                    () => status({ data: { id: promo.id, status: s as never } }),
                    "Status atualizado",
                  )
                }
              />
            ))
          )}
        </div>
      </section>

      {/* Pesquisa manual + configurações */}
      <div className="mt-8 space-y-3">
        <PesquisaManual onSalvo={() => qc.invalidateQueries({ queryKey: ["airfare-promos"] })} />
        <MarkupsPanel />
      </div>

      {artPromo ? <PromoArtDialog promo={artPromo} onClose={() => setArtPromo(null)} /> : null}
    </div>
  );
}
