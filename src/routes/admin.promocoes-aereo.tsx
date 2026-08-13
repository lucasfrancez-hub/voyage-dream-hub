import { cityLabel } from "@/lib/iata-lookup";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgePercent,
  Luggage,
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
  X,
} from "lucide-react";

import { toast } from "sonner";
import {
  generatePromotionLink,
  cancelAirfarePromoCollection,
  getAirfarePromoRun,
  listAirfarePromotions,
  listInstallmentMarkups,
  refreshAirfarePromotion,
  runAirfarePromoCollection,
  savePromoOpportunity,
  saveInstallmentMarkup,
  explorePromoOpportunities,
  setPromotionStatus,
  countArchivedPromotions,
} from "@/lib/airfare-promos.functions";
import { ArquivadosDialog } from "@/components/promocoes/ArquivadosDialog";
import { promoInstagramText, promoWhatsappText, type PromoRow } from "@/lib/airfare-promo-text";
import { PromoArtDialog } from "@/components/promo/PromoArtDialog";
import { PromoSocialDialog } from "@/components/promo/PromoSocialDialog";
import { scopeOfRoute } from "@/lib/br-airports";
import { isOriginAllowedForScope } from "@/lib/airfare-promos.config";



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
  quoted_at?: string | null;
  reference_source?: string | null;
  reference_price?: number | null;
  reference_collected_at?: string | null;
  price_difference?: number | null;
  price_difference_percent?: number | null;
  cycle_state?: string | null;
  cycle_changed_fields?: string[] | null;
  cycle_state_at?: string | null;
  cycle_day?: string | null;
};

/** Rótulos dos campos alterados entre a coleta das 06h e a das 12h. */
const CAMPO_LABEL: Record<string, string> = {
  price: "preço",
  airline: "companhia",
  fare_id: "tarifa",
  flight: "voo",
  connection: "conexão",
  baggage: "bagagem",
  installment: "parcelamento",
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


/**
 * Comparativo administrativo: preço de referência do Melhores Destinos x preço
 * validado no motor VIA AIR. Serve só para auditoria da curadoria — a referência
 * NUNCA vai para feed, story, WhatsApp, Instagram, arte ou página pública.
 *
 * diferença = preço MD − preço VIA AIR  (positivo = estamos abaixo da referência)
 */
function ComparativoReferencia({ promo }: { promo: Promo }) {
  const ref = promo.reference_price != null ? Number(promo.reference_price) : null;
  if (!ref || ref <= 0) return null;

  const viaair = Number(promo.total_price ?? 0);
  const diff = ref - viaair;
  const pct = (diff / ref) * 100;
  const igual = Math.abs(diff) < 0.5 || Math.abs(pct) < 0.5;
  const abaixo = diff > 0;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-tight text-muted-foreground">
          Ref. Melhores Destinos
        </span>
        <span className="text-xs font-bold text-foreground">{brl(ref)}</span>
      </div>
      {igual ? (
        <div className="text-xs font-bold text-muted-foreground">Mesmo valor da referência</div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${abaixo ? "text-emerald-500" : "text-amber-500"}`}>
            {abaixo ? "−" : "+"} {brl(Math.abs(diff))}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              abaixo ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
            }`}
          >
            {Math.abs(pct).toFixed(1).replace(".", ",")}% {abaixo ? "ABAIXO" : "ACIMA"}
          </span>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] font-medium uppercase text-muted-foreground/80">
        <div>{promo.reference_collected_at ? `Ref. coletada: ${horaBR(promo.reference_collected_at)}` : ""}</div>
        <div className="text-right italic">
          Validado: {horaBR(promo.quoted_at ?? promo.last_checked_at)}
        </div>
      </div>
    </div>
  );
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
/* Botão de ação circular (só ícone)                                   */
/* ------------------------------------------------------------------ */

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  primary,
  className = "",
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition disabled:opacity-50 ${
        primary
          ? "bg-brand-orange text-white shadow-lg shadow-brand-orange/20 hover:brightness-110"
          : "border border-border/70 bg-background/40 text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card da curadoria                                                   */
/* ------------------------------------------------------------------ */


function PromoCard({
  promo,
  onRefresh,
  onLink,
  onStatus,
  onArt,
  onSocial,
  busy,
}: {
  promo: Promo;
  onRefresh: () => void;
  onLink: () => void;
  onStatus: (s: string) => void;
  onArt: () => void;
  onSocial: (canal: "whatsapp" | "instagram") => void;
  busy: boolean;
}) {
  const semJuros =
    promo.interest_free_installments > 1
      ? `até ${promo.interest_free_installments}x de ${brl(promo.interest_free_installment_value)} sem juros`
      : "pagamento à vista";

  const ciclo = promo.cycle_state === "new" || promo.cycle_state === "changed" ? promo.cycle_state : null;
  const horaCiclo = promo.cycle_state_at
    ? new Date(promo.cycle_state_at).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const camposCiclo = (promo.cycle_changed_fields ?? [])
    .map((c) => CAMPO_LABEL[c] ?? c)
    .join(" + ");

  const contorno =
    ciclo === "new"
      ? "border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_22px_-8px_rgba(16,185,129,0.55)] hover:border-emerald-400"
      : ciclo === "changed"
        ? "border-brand-orange/70 shadow-[0_0_0_1px_rgba(242,107,31,0.25),0_0_22px_-8px_rgba(242,107,31,0.55)] hover:border-brand-orange"
        : "border-border/60 hover:border-brand-orange/50";

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-xl backdrop-blur transition ${contorno}`}
    >
      {/* Cabeçalho: rota + status */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold leading-tight tracking-tight text-foreground">
              {cityLabel(promo.origin_iata, promo.origin_city)} <span className="text-brand-orange">→</span>{" "}
              {cityLabel(promo.destination_iata, promo.destination_city)}
            </h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {promo.origin_iata} <span className="mx-1 opacity-50">•</span> {promo.destination_iata}
            </p>
          </div>

          <select
            value={promo.status}
            onChange={(e) => onStatus(e.target.value)}
            className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
              promo.status === "publicado"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : promo.status === "descartado"
                  ? "border-border/60 bg-muted text-muted-foreground"
                  : "border-brand-orange/30 bg-brand-orange/10 text-brand-orange"
            }`}
          >
            <option value="novo">Novo</option>
            <option value="selecionado">Selecionado</option>
            <option value="publicado">Publicado</option>
            <option value="descartado">Descartado</option>
          </select>
        </div>

        {ciclo ? (
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                ciclo === "new"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-brand-orange/15 text-brand-orange"
              }`}
            >
              {ciclo === "new" ? "Nova" : "Alterada"}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              {ciclo === "new"
                ? horaCiclo
                  ? `encontrada às ${horaCiclo}`
                  : "nesta coleta"
                : `${horaCiclo ? `alterada às ${horaCiclo}` : "alterada"}${camposCiclo ? ` · ${camposCiclo}` : ""}`}
            </span>
          </div>
        ) : null}
      </div>

      {/* Informações do voo */}
      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <CalendarDays className="h-4 w-4 opacity-70" />
          {dataBR(promo.departure_date)}
          {promo.return_date ? ` – ${dataBR(promo.return_date)}` : ""}
        </div>

        <div className="flex items-center justify-between gap-3 border-y border-border/50 py-2">
          <span className="inline-flex min-w-0 items-center gap-2">
            {promo.airline_logo ? (
              <img src={promo.airline_logo} alt={promo.airline_name ?? ""} className="h-5 w-auto rounded-sm" />
            ) : (
              <Plane className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="truncate text-xs font-semibold text-foreground/90">
              {promo.airline_name ?? promo.airline_iata ?? "—"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Luggage className="h-3.5 w-3.5" />
              {promo.has_checked_baggage ? "Despachada" : "Mão"}
            </span>
            <span>{promo.stops === 0 ? "Direto" : `${promo.stops} parada(s)`}</span>
          </span>
        </div>

        {promo.fare_status !== "valida" ? (
          <span className="text-[10px] font-bold uppercase text-destructive">{promo.fare_status}</span>
        ) : null}
      </div>

      {/* Preço */}
      <div className="mx-5 rounded-xl border border-border/70 bg-background/60 p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preço VIA AIR</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-4xl font-black leading-none tracking-tight text-foreground">
            {brl(promo.price_per_passenger)}
          </span>
          <span className="text-xs text-muted-foreground">/pax</span>
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          Total <span className="font-semibold text-foreground/80">{brl(promo.total_price)}</span>
        </div>

        <div className="mt-4 space-y-1 border-t border-border/50 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-brand-orange">
              {promo.interest_free_installments > 1
                ? `Até ${promo.interest_free_installments}x sem juros`
                : semJuros}
            </span>
            {promo.interest_free_installments > 1 ? (
              <span className="text-xs font-semibold text-foreground">
                {brl(promo.interest_free_installment_value)}
              </span>
            ) : null}
          </div>
          {promo.extended_max_installments && promo.extended_installment_value_12x ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase text-muted-foreground">
                Ou até {promo.extended_max_installments}x
              </span>
              <span className="text-xs text-muted-foreground">{brl(promo.extended_installment_value_12x)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Comparativo de referência */}
      <div className="px-5 py-5">
        <ComparativoReferencia promo={promo} />
      </div>

      {/* Rodapé / ações */}
      <div className="mt-auto px-5 pb-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          {promo.short_url || promo.cart_url ? (
            <a
              href={promo.short_url ?? promo.cart_url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-orange hover:underline"
            >
              Abrir oferta
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1.5 text-[10px] italic text-muted-foreground">
            <Clock className="h-3 w-3" /> Última validação: {validadoEm(promo.last_checked_at)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <IconBtn
            title="Divulgar no WhatsApp"
            onClick={() => onSocial("whatsapp")}
            className="hover:border-emerald-500/50 hover:text-emerald-500"
          >
            <MessageCircle className="h-4 w-4" />
          </IconBtn>
          <IconBtn
            title="Divulgar no Instagram"
            onClick={() => onSocial("instagram")}
            className="hover:border-pink-500/50 hover:text-pink-500"
          >
            <Instagram className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Gerar arte" onClick={onArt} primary>
            <ImageIcon className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Copiar link" onClick={onLink} disabled={busy}>
            <Link2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Revalidar tarifa no motor" onClick={onRefresh} disabled={busy} className="ml-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </IconBtn>
        </div>
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

function PesquisaManual({
  aberto,
  onFechar,
  scopeInicial,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  scopeInicial: "nacional" | "internacional";
  onSalvo: () => void;
}) {
  const buscar = useServerFn(explorePromoOpportunities);
  const salvar = useServerFn(savePromoOpportunity);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [scope, setScope] = useState<"nacional" | "internacional">(scopeInicial);

  type Resultado = {
    origin_iata: string;
    destination_iata: string;
    destination_city?: string | null;
    departure_date: string;
    return_date?: string | null;
    airline_name: string | null;
    total_price: number;
    price_per_passenger: number;
    interest_free_installments: number;
    interest_free_installment_value: number;
    has_checked_baggage: boolean;
  };
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [salvos, setSalvos] = useState<string[]>([]);

  const podePesquisar = origin.length === 3 || destination.length === 3;

  const mut = useMutation({
    mutationFn: () =>
      buscar({
        data: {
          origin: origin || null,
          destination: destination || null,
          departureDate: ida || null,
          returnDate: volta || null,
          scope,
          adults: 1,
          limit: 6,
        },
      }),
    onSuccess: (r) => {
      const rows = ((r as { rows?: unknown[] }).rows ?? []) as Resultado[];
      setResultados(rows);
      setSalvos([]);
      if (!rows.length) toast.info("Nenhuma tarifa encontrada para esses filtros. Tente outra data ou destino.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarMut = useMutation({
    mutationFn: (row: Resultado) => salvar({ data: { row: row as unknown as Record<string, unknown> } }),
    onSuccess: (_d, row) => {
      toast.success("Oportunidade adicionada à curadoria");
      setSalvos((s) => [...s, `${row.origin_iata}${row.destination_iata}${row.departure_date}`]);
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!aberto) return null;

  return (
    <div className="mt-3 rounded-2xl border border-brand-orange/40 bg-card/60">
      <div className="flex w-full items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest">
        <Search className="h-4 w-4 text-brand-orange" /> Pesquisar novas oportunidades
        <button type="button" onClick={onFechar} className="ml-auto rounded-lg p-1 hover:bg-foreground/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-t border-border/50 p-4">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Só a origem já basta — ex.: <strong className="text-foreground">MGF</strong>. Os demais campos são
          opcionais e apenas afinam a busca.
        </p>

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
            placeholder="Destino (opcional)"
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={ida}
            onChange={(e) => setIda(e.target.value)}
            title="Ida (opcional)"
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={volta}
            onChange={(e) => setVolta(e.target.value)}
            title="Volta (opcional)"
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
            disabled={mut.isPending || !podePesquisar}
            onClick={() => mut.mutate()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Pesquisar
          </button>
        </div>

        {mut.isPending ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Descobrindo oportunidades e validando no motor VIA AIR…
          </p>
        ) : null}

        {resultados.length ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Resultados da pesquisa ({resultados.length})
            </h3>
            {resultados.map((r) => {
              const chave = `${r.origin_iata}${r.destination_iata}${r.departure_date}`;
              const jaSalvo = salvos.includes(chave);
              return (
                <div
                  key={chave}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <div>
                    <p className="text-sm font-black">
                      {cityLabel(r.origin_iata, null)} → {cityLabel(r.destination_iata, r.destination_city)} • {r.airline_name ?? "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {dataBR(r.departure_date)}
                      {r.return_date ? ` – ${dataBR(r.return_date)}` : ""} • {brl(r.price_per_passenger)} por
                      passageiro • total {brl(r.total_price)} •{" "}
                      {r.has_checked_baggage ? "com bagagem" : "só bagagem de mão"}
                    </p>
                    <p className="text-[11px] font-bold text-brand-orange">
                      até {r.interest_free_installments}x de {brl(r.interest_free_installment_value)} sem juros
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => salvarMut.mutate(r)}
                    disabled={salvarMut.isPending || jaSalvo}
                    className="rounded-lg bg-brand-orange px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {jaSalvo ? "Na curadoria" : salvarMut.isPending ? "Salvando…" : "Transformar em promoção"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
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
  const cancelColeta = useServerFn(cancelAirfarePromoCollection);
  const refreshOne = useServerFn(refreshAirfarePromotion);
  const genLink = useServerFn(generatePromotionLink);
  const status = useServerFn(setPromotionStatus);

  const [aba, setAba] = useState<"nacional" | "internacional">("nacional");
  const [atalho, setAtalho] = useState(0);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const [arquivadosAberto, setArquivadosAberto] = useState(false);
  const contarArquivados = useServerFn(countArchivedPromotions);
  const { data: arquivados } = useQuery({
    queryKey: ["airfare-arquivados-count"],
    queryFn: () => contarArquivados(),
    refetchInterval: 5 * 60_000,
  });

  const [destination, setDestination] = useState("");
  const [airline, setAirline] = useState("");
  const [promoStatus, setPromoStatus] = useState("todos");
  const [baggage, setBaggage] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("preco");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [artPromo, setArtPromo] = useState<(PromoRow & { id: string }) | null>(null);
  const [artEditando, setArtEditando] = useState(false);
  const [socialPromo, setSocialPromo] = useState<(PromoRow & { id: string }) | null>(null);
  const [socialCanal, setSocialCanal] = useState<"whatsapp" | "instagram">("whatsapp");

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
    // Guarda de escopo: rota 100% brasileira nunca aparece em Internacionais
    // (e vice-versa) e a origem precisa pertencer ao escopo (BSB só internacional,
    // MGF/LDB/CAC/IGU só nacional).
    // Exceção: promoção salva manualmente no Passagens Baratas foi escolhida
    // por uma pessoa — não pode ser escondida pela lista de origens do radar.
    const doEscopo = rows.filter((p) => {
      if (scopeOfRoute(p.origin_iata, p.destination_iata) !== aba) return false;
      if (p.reference_source === "passagens_baratas") return true;
      return isOriginAllowedForScope(p.origin_iata, aba);
    });
    return iatas.length ? doEscopo.filter((p) => iatas.includes(p.origin_iata)) : doEscopo;
  }, [data, atalho, atalhos, aba]);




  const { data: run } = useQuery({
    queryKey: ["airfare-promo-run"],
    queryFn: () => runStatus(),
    refetchInterval: (q) =>
      ["running", "cancel_requested"].includes(
        (q.state.data as { status?: string } | null)?.status ?? "",
      )
        ? 5000
        : 60000,
  });

  const runStatusValue = (run as { status?: string } | null)?.status ?? "";
  const cancelando = runStatusValue === "cancel_requested";
  const rodando = runStatusValue === "running" || cancelando;

  useEffect(() => {
    if (!rodando && run) qc.invalidateQueries({ queryKey: ["airfare-promos"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando]);

  const desde = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : null;

  const coletar = useMutation({
    mutationFn: () => collect({ data: {} }),
    onSuccess: (r) => {
      const res = r as { started: boolean; reason?: string };
      if (res.started) toast.success("Coleta iniciada. Pode fechar a página — ela continua rodando.");
      else {
        const h = desde((run as { started_at?: string } | null)?.started_at);
        toast.warning(h ? `Atualização em andamento desde ${h}.` : (res.reason ?? "Já existe uma coleta em andamento."));
      }
      qc.invalidateQueries({ queryKey: ["airfare-promo-run"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: () => cancelColeta(),
    onSuccess: () => {
      toast.success("Cancelamento solicitado. O que já foi validado continua salvo.");
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
    phase: string | null;
    total: number;
    discovered: number | null;
    discovered_raw: number | null;
    deduped: number | null;
    radar_available?: boolean | null;
    radar_errors?: number | null;
    fallback_count?: number | null;
    radar_note?: string | null;
    origin_metrics:
      | Array<{
          origin: string;
          discovered: number;
          deduped: number;
          eligible?: number;
          excluded?: number;
          selected: number;
          selected_nacional?: number;
          selected_internacional?: number;
          validated: number;
          with_price: number;
          no_result: number;
          errors: number;
          avg_seconds: number | null;
        }>
      | null;

    processed: number;
    validated: number | null;
    saved: number;
    no_result: number | null;
    new_count: number | null;
    updated_count: number | null;
    expired_count: number | null;
    error_count: number | null;
    last_label: string | null;
    started_at: string;
    finished_at: string | null;
    cancelled_at?: string | null;
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

      {/* Atualização cancelada */}
      {!rodando && info?.status === "cancelada" && info.cancelled_at ? (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Atualização cancelada às {desde(info.cancelled_at)} — o que já havia sido validado foi mantido.
        </p>
      ) : null}

      {/* Radar do Melhores Destinos indisponível nesta execução */}
      {info && info.radar_available === false ? (
        <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Radar Melhores Destinos temporariamente indisponível nesta execução
          {info.radar_errors ? ` (${info.radar_errors} tentativas sem resposta)` : ""} — nenhuma
          oportunidade nova foi descoberta e as promoções válidas da coleta anterior foram
          preservadas.
        </p>
      ) : null}
      {info && info.radar_available !== false && (info.fallback_count ?? 0) > 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {info.fallback_count} oportunidade(s) desta execução vieram de complemento interno (sem
          referência do Melhores Destinos).
        </p>
      ) : null}

      {/* Status da coleta */}
      {rodando && info ? (
        <div className="mt-4 rounded-2xl border border-brand-orange/40 bg-brand-orange/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-2 font-bold text-brand-orange">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {cancelando
                ? "Cancelando atualização…"
                : info.phase === "descobrindo"
                  ? (info.radar_note ?? "Buscando novas oportunidades no radar…")
                  : info.phase === "curadoria"
                    ? "Curadoria concluída — preparando candidatas…"
                    : info.phase === "expirando"
                      ? "Conferindo ofertas que saíram do ar…"
                      : info.total > 0
                        ? `Validando ${Math.min(info.processed + 1, info.total)} de ${info.total} no motor VIA AIR…`
                        : "Preparando as oportunidades…"}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span>
                {desde(info.started_at) ? `Em andamento desde ${desde(info.started_at)} • ` : ""}
                {info.total > 0
                  ? `${info.processed} de ${info.total} oportunidades verificadas`
                  : "Preparando as oportunidades…"}
              </span>
              <button
                type="button"
                onClick={() => cancelar.mutate()}
                disabled={cancelar.isPending || cancelando}
                className="rounded-lg border border-destructive/50 px-2 py-1 text-[11px] font-bold text-destructive disabled:opacity-60"
              >
                {cancelando ? "Cancelando…" : "Cancelar atualização"}
              </button>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/60">
            {pct === null ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-orange" />
            ) : (
              <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${pct}%` }} />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>Encontradas no radar: {info.discovered_raw ?? info.discovered ?? 0}</span>
            <span>Após deduplicação: {info.deduped ?? 0}</span>
            <span>Selecionadas: {info.total ?? 0}</span>
            <span>Confirmadas: {info.validated ?? 0}</span>
            <span>Novas: {info.new_count ?? 0}</span>
            <span>Atualizadas: {info.updated_count ?? 0}</span>
            <span>Sem tarifa: {info.no_result ?? 0}</span>
            {info.error_count ? <span className="text-destructive">Falhas: {info.error_count}</span> : null}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Iniciada às {horaBR(info.started_at).split(", ")[1] ?? "—"}
            {info.last_label ? ` • Última oportunidade processada: ${info.last_label}` : ""}
          </p>

          {info.origin_metrics?.length ? (
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {info.origin_metrics.map((m) => (
                <div
                  key={m.origin}
                  className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center justify-between font-black tracking-wide">
                    <span>{m.origin}</span>
                    <span className="text-muted-foreground">
                      {m.avg_seconds != null ? `${m.avg_seconds}s/oportunidade` : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                    <span>Radar: {m.discovered}</span>
                    <span>Elegíveis: {m.eligible ?? "—"}</span>
                    {m.excluded ? <span>Excluídas: {m.excluded}</span> : null}
                    <span className="font-bold text-foreground">
                      Selecionadas: {m.selected}
                    </span>
                    <span>Nac.: {m.selected_nacional ?? 0}</span>
                    <span>Int.: {m.selected_internacional ?? 0}</span>
                    <span>Validadas: {m.validated}</span>
                    <span>Com tarifa: {m.with_price}</span>
                    <span>Sem tarifa: {m.no_result}</span>
                    {m.errors ? <span className="text-destructive">Erros: {m.errors}</span> : null}
                  </div>

                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Abas Nacional / Internacional + pesquisa manual */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border/60 bg-card/50 p-1">
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
        <button
          type="button"
          onClick={() => setPesquisaAberta((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-widest transition ${
            pesquisaAberta
              ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
              : "border-brand-orange/40 text-brand-orange hover:bg-brand-orange/5"
          }`}
        >
          <Search className="h-4 w-4" /> Pesquisar novas oportunidades
        </button>
        <button
          type="button"
          onClick={() => setArquivadosAberto(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground transition hover:border-brand-orange/40 hover:text-foreground"
        >
          🗑 Arquivados
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-foreground">
            {arquivados?.total ?? 0}
          </span>
        </button>
      </div>

      <ArquivadosDialog aberto={arquivadosAberto} onFechar={() => setArquivadosAberto(false)} />

      <PesquisaManual
        aberto={pesquisaAberta}
        onFechar={() => setPesquisaAberta(false)}
        scopeInicial={aba}
        onSalvo={() => qc.invalidateQueries({ queryKey: ["airfare-promos"] })}
      />


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
                onSocial={(canal) => {
                  setSocialCanal(canal);
                  setSocialPromo(promo);
                }}
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

      {/* Configurações */}
      <div className="mt-8 space-y-3">
        <MarkupsPanel />
      </div>


      {artPromo ? (
        <PromoArtDialog
          promo={artPromo}
          startEditing={artEditando}
          onClose={() => {
            setArtPromo(null);
            setArtEditando(false);
          }}
          onDone={
            artEditando
              ? () => {
                  setSocialPromo(artPromo);
                  setArtPromo(null);
                  setArtEditando(false);
                }
              : undefined
          }
          onDivulgar={(canal) => {
            setSocialCanal(canal);
            setSocialPromo(artPromo);
            setArtPromo(null);
            setArtEditando(false);
          }}
        />
      ) : null}

      <PromoSocialDialog
        promo={socialPromo}
        open={!!socialPromo}
        onOpenChange={(v) => !v && setSocialPromo(null)}
        initialChannel={socialCanal}
        onEditArt={() => {
          if (!socialPromo) return;
          setArtEditando(true);
          setArtPromo(socialPromo);
        }}
      />
    </div>
  );
}
