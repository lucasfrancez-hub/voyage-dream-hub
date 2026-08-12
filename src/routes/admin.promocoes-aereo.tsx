import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgePercent,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Instagram,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  generatePromotionLink,
  listAirfarePromotions,
  listInstallmentMarkups,
  refreshAirfarePromotion,
  runAirfarePromoCollection,
  saveInstallmentMarkup,
  setPromotionStatus,
} from "@/lib/airfare-promos.functions";
import { promoInstagramText, promoWhatsappText, type PromoRow } from "@/lib/airfare-promo-text";

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

function copiar(texto: string, msg = "Copiado") {
  try {
    navigator.clipboard.writeText(texto);
    toast.success(msg);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

function PromoCard({
  promo,
  onRefresh,
  onLink,
  onStatus,
  busy,
}: {
  promo: PromoRow & { id: string; status: string; fare_status: string; last_checked_at: string };
  onRefresh: () => void;
  onLink: () => void;
  onStatus: (s: string) => void;
  busy: boolean;
}) {
  const semJuros =
    promo.interest_free_installments > 1
      ? `${promo.interest_free_installments}x de ${brl(promo.interest_free_installment_value)} sem juros`
      : `à vista ${brl(promo.total_price)}`;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
              {promo.origin_iata} → {promo.destination_iata}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {promo.status}
            </span>
            {promo.fare_status !== "valida" ? (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-destructive">
                {promo.fare_status}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 truncate text-lg font-black tracking-tight">
            {promo.destination_city ?? promo.destination_iata}
            <span className="text-muted-foreground"> · saindo de {promo.origin_city ?? promo.origin_iata}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {promo.airline_name ?? promo.airline_iata ?? "—"} • {dataBR(promo.departure_date)}
            {promo.return_date ? ` a ${dataBR(promo.return_date)}` : ""} •{" "}
            {promo.stops === 0 ? "direto" : `${promo.stops} parada(s)`} •{" "}
            {promo.has_checked_baggage ? "com bagagem despachada" : "só bagagem de mão"}
          </p>
        </div>

        <div className="text-right">
          <div className="text-2xl font-black leading-none tracking-tight">{brl(promo.total_price)}</div>
          <div className="text-[11px] text-muted-foreground">
            {brl(promo.price_per_passenger)} / passageiro • {promo.passengers} pax
          </div>
          <div className="mt-1 text-[11px] font-semibold text-primary">Melhor condição: {semJuros}</div>
          {promo.extended_max_installments && promo.extended_installment_value_12x ? (
            <div className="text-[11px] text-muted-foreground">
              Precisa de mais prazo? até {promo.extended_max_installments}x de{" "}
              {brl(promo.extended_installment_value_12x)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
        <button
          type="button"
          onClick={onLink}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5 disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" /> Gerar link
        </button>
        {promo.short_url || promo.cart_url ? (
          <a
            href={promo.short_url ?? promo.cart_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-foreground/5"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Carrinho
          </a>
        ) : null}
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
          disabled
          title="Aguardando os HTMLs aprovados dos cards"
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground/70"
        >
          <ImageIcon className="h-3.5 w-3.5" /> Gerar arte (Feed / Story)
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
        <span className="text-[10px] text-muted-foreground">Consulta: {horaBR(promo.last_checked_at)}</span>
      </div>
    </div>
  );
}

function MarkupsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listInstallmentMarkups);
  const save = useServerFn(saveInstallmentMarkup);
  const { data = [] } = useQuery({ queryKey: ["airfare-markups"], queryFn: () => list() });
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
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
        <BadgePercent className="h-4 w-4 text-brand-orange" /> Markup do parcelamento estendido
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Percentual aplicado sobre o valor original para as modalidades de maior prazo. A condição sem juros
        segue a regra da companhia e não recebe markup.
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
  );
}

function PromocoesAereoPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAirfarePromotions);
  const collect = useServerFn(runAirfarePromoCollection);
  const refreshOne = useServerFn(refreshAirfarePromotion);
  const genLink = useServerFn(generatePromotionLink);
  const status = useServerFn(setPromotionStatus);

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [airline, setAirline] = useState("");
  const [scope, setScope] = useState("todos");
  const [promoStatus, setPromoStatus] = useState("todos");
  const [baggage, setBaggage] = useState(false);
  const [sort, setSort] = useState("preco");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtros = useMemo(
    () => ({ origin, destination, airline, scope, status: promoStatus, baggage, sort }),
    [origin, destination, airline, scope, promoStatus, baggage, sort],
  );

  const { data = [], isLoading } = useQuery({
    queryKey: ["airfare-promos", filtros],
    queryFn: () => list({ data: filtros }),
  });

  const coletar = useMutation({
    mutationFn: () => collect({ data: {} }),
    onSuccess: (r: { saved: number; routes: number; errors: string[] }) => {
      toast.success(`Coleta concluída: ${r.saved} oportunidade(s) de ${r.routes} rota(s)`);
      if (r.errors?.length) toast.warning(`${r.errors.length} rota(s) falharam`);
      qc.invalidateQueries({ queryKey: ["airfare-promos"] });
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Sparkles className="h-5 w-5 text-brand-orange" /> Promoções de Aéreo
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Curadoria das oportunidades pesquisadas no nosso motor. Coleta automática às 09:00 e 15:00 (BRT).
          </p>
        </div>
        <button
          type="button"
          onClick={() => coletar.mutate()}
          disabled={coletar.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {coletar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar agora
        </button>
      </header>

      <div className="mt-5 grid gap-2 rounded-2xl border border-border/70 bg-card/60 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <input
          value={origin}
          onChange={(e) => setOrigin(e.target.value.toUpperCase())}
          placeholder="Origem (ex.: MGF)"
          className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
        />
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value.toUpperCase())}
          placeholder="Destino"
          className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
        />
        <input
          value={airline}
          onChange={(e) => setAirline(e.target.value)}
          placeholder="Companhia"
          className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
        >
          <option value="todos">Nacional + Internacional</option>
          <option value="nacional">Nacional</option>
          <option value="internacional">Internacional</option>
        </select>
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

      <div className="mt-5 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando oportunidades…</p>
        ) : data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
            Nenhuma promoção encontrada. Use “Atualizar agora” para rodar a coleta nas rotas prioritárias.
          </p>
        ) : (
          (data as never[]).map((p: never) => {
            const promo = p as PromoRow & {
              id: string;
              status: string;
              fare_status: string;
              last_checked_at: string;
            };
            return (
              <PromoCard
                key={promo.id}
                promo={promo}
                busy={busyId === promo.id}
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
            );
          })
        )}
      </div>

      <div className="mt-8">
        <MarkupsPanel />
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Copy className="h-3.5 w-3.5" /> Os cards Feed e Story serão conectados a estes mesmos dados assim que
        os HTMLs aprovados chegarem.
      </p>
    </div>
  );
}
