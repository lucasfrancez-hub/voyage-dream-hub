import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";

type Alt = {
  id: string;
  slug: string;
  title: string;
  origin: string | null;
  destination: string | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  hotel_name: string | null;
  price_per_person: number | null;
  base_occupancy: number | null;
};

export type CurrentPkg = {
  id: string;
  slug: string;
  origin?: string | null;
  destination?: string | null;
  going_date?: string | null;
  return_date?: string | null;
  nights?: number | null;
  hotel_name?: string | null;
  price_per_person?: number | null;
  base_occupancy?: number | null;
};

const ddmm = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const ts = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);

/**
 * "Outras datas para esta viagem" — mesma origem + mesmo destino, datas diferentes.
 * A troca é client-side (mesma tela, URL atualizada, sem reload).
 */
export function OtherDatesBlock({ pkg }: { pkg: CurrentPkg }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [switchingSlug, setSwitchingSlug] = useState<string | null>(null);

  const occ = pkg.base_occupancy ?? 2;

  const { data: alts = [], refetch } = useQuery({
    queryKey: ["package-other-dates", pkg.origin, pkg.destination, occ],
    enabled: !!pkg.origin && !!pkg.destination,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select(
          "id,slug,title,origin,destination,going_date,return_date,nights,hotel_name,price_per_person,base_occupancy",
        )
        .eq("is_active", true)
        .eq("kind", "package")
        .eq("origin", pkg.origin!)
        .eq("destination", pkg.destination!)
        .not("going_date", "is", null)
        .gte("going_date", new Date().toISOString().slice(0, 10))
        .order("going_date");
      if (error) throw error;
      return (data ?? []) as Alt[];
    },
  });

  const list = useMemo(() => {
    const others = alts
      .filter((a) => a.id !== pkg.id)
      .filter((a) => (a.base_occupancy ?? 2) === occ)
      .filter((a) => a.going_date !== pkg.going_date);

    const byDate = new Map<string, Alt>();
    for (const a of others) {
      const k = `${a.going_date}|${a.return_date}`;
      const prev = byDate.get(k);
      if (!prev || (Number(a.price_per_person) || 0) < (Number(prev.price_per_person) || 0)) byDate.set(k, a);
    }
    const uniq = [...byDate.values()];

    const cheapest = [...uniq].sort(
      (a, b) => (Number(a.price_per_person) || 0) - (Number(b.price_per_person) || 0),
    )[0];

    const rest = uniq
      .filter((a) => a.id !== cheapest?.id)
      .sort((a, b) => Math.abs(ts(a.going_date) - ts(pkg.going_date)) - Math.abs(ts(b.going_date) - ts(pkg.going_date)));

    return [...(cheapest ? [cheapest] : []), ...rest].slice(0, 4);
  }, [alts, pkg.id, pkg.going_date, occ]);

  if (list.length === 0) return null;

  const precoAtual = (Number(pkg.price_per_person) || 0) * occ;
  const bestId = [...list].sort(
    (a, b) => (Number(a.price_per_person) || 0) - (Number(b.price_per_person) || 0),
  )[0]?.id;

  const prefetch = (slug: string) => {
    void qc.prefetchQuery({
      queryKey: ["package", slug, "public"],
      queryFn: async () => {
        const { data } = await supabase.from("packages").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
        return data;
      },
    });
  };

  const trocar = async (a: Alt) => {
    if (switchingSlug) return;
    setSwitchingSlug(a.slug);
    try {
      const { data } = await supabase
        .from("packages")
        .select("id")
        .eq("id", a.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) {
        toast.error("Esta opção acabou de ficar indisponível. Escolha outra data.");
        await refetch();
        return;
      }
      await navigate({ to: "/pacotes/$slug", params: { slug: a.slug }, resetScroll: false });
    } finally {
      setSwitchingSlug(null);
    }
  };

  return (
    <section className="border-t border-border pt-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-[9px] border border-brand-orange/40 bg-brand-orange/10 text-brand-orange flex items-center justify-center">
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight">Outras datas para esta viagem</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Compare o mesmo destino em outros períodos
            </div>
          </div>
        </div>
        <span className="hidden sm:inline-block whitespace-nowrap rounded-full border border-border px-2 py-[5px] text-[10px] text-muted-foreground">
          {pkg.origin} → {pkg.destination}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1.5 snap-x">
        {/* Data atual */}
        <div className="min-w-[190px] flex-[0_0_190px] snap-start rounded-[13px] border border-brand-orange bg-brand-orange/10 px-3 py-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-extrabold uppercase tracking-[0.08em] text-brand-orange">
              Data atual
            </span>
            {pkg.nights != null && <span className="text-[9px] text-muted-foreground">{pkg.nights} noites</span>}
          </div>
          <div className="mt-[7px] text-[13px] font-bold tracking-tight">
            {ddmm(pkg.going_date)}
            <span className="mx-1 text-brand-orange">→</span>
            {ddmm(pkg.return_date)}
          </div>
          <div className="mt-[3px] truncate text-[9.5px] text-muted-foreground">{pkg.hotel_name || "—"}</div>
          <div className="mt-[9px] flex items-end justify-between gap-2 border-t border-border pt-2">
            <div>
              <div className="text-[8px] text-muted-foreground">
                {occ} {occ === 1 ? "adulto" : "adultos"}
              </div>
              <div className="mt-px text-[15px] font-extrabold text-brand-orange">{formatBRL(precoAtual)}</div>
            </div>
          </div>
        </div>

        {list.map((a) => {
          const total = (Number(a.price_per_person) || 0) * occ;
          const dif = total - precoAtual;
          const loading = switchingSlug === a.slug;
          return (
            <button
              key={a.id}
              type="button"
              disabled={!!switchingSlug}
              onMouseEnter={() => prefetch(a.slug)}
              onClick={() => void trocar(a)}
              className="min-w-[190px] flex-[0_0_190px] snap-start rounded-[13px] border border-border bg-transparent px-3 py-[11px] text-left transition hover:border-brand-orange/40 hover:bg-brand-orange/5 disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] font-extrabold uppercase tracking-[0.08em] text-brand-orange">
                  {a.id === bestId && dif < 0 ? "Melhor preço" : "Outra"}
                </span>
                {a.nights != null && <span className="text-[9px] text-muted-foreground">{a.nights} noites</span>}
              </div>
              <div className="mt-[7px] text-[13px] font-bold tracking-tight">
                {ddmm(a.going_date)}
                <span className="mx-1 text-brand-orange">→</span>
                {ddmm(a.return_date)}
              </div>
              <div className="mt-[3px] truncate text-[9.5px] text-muted-foreground">{a.hotel_name || "—"}</div>
              <div className="mt-[9px] flex items-end justify-between gap-2 border-t border-border pt-2">
                <div>
                  <div className="text-[8px] text-muted-foreground">
                    {occ} {occ === 1 ? "adulto" : "adultos"}
                  </div>
                  <div className="mt-px text-[15px] font-extrabold">{formatBRL(total)}</div>
                </div>
                {dif !== 0 && (
                  <div
                    className={
                      "whitespace-nowrap text-right text-[8px] font-bold " +
                      (dif < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-brand-orange")
                    }
                  >
                    {dif < 0 ? "− " : "+ "}
                    {formatBRL(Math.abs(dif))}
                    <br />
                    {dif < 0 ? "mais barato" : "mais"}
                  </div>
                )}

              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-brand-orange">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {loading ? "Carregando…" : "Ver esta data →"}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[9px] text-muted-foreground">
        Valores sujeitos à disponibilidade de voos e hospedagem.
      </p>
    </section>
  );
}
