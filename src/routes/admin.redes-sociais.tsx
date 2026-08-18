import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  RefreshCw,
  Heart,
  MessageCircle,
  Eye,
  Users,
  Bookmark,
  Share2,
  BarChart3,
  UserPlus,
  Clock,
  ExternalLink,
  Instagram,
  Rocket,
} from "lucide-react";
import { getSocialOverview } from "@/lib/instagram/queries.functions";
import { listarImpulsionamentos } from "@/lib/ads/boosts.functions";
import {
  TurbinarDialog,
  DesempenhoDialog,
  STATUS_INFO,
  ROTULO_RESULTADO,
  brl,
  type Boost,
} from "@/components/admin/TurbinarPublicacao";


export const Route = createFileRoute("/admin/redes-sociais")({
  head: () => ({
    meta: [
      { title: "Redes sociais — Métricas | VIA AIR" },
      { name: "description", content: "Métricas de publicações, reels e stories das contas do Instagram da VIA AIR." },
      { property: "og:title", content: "Redes sociais — Métricas | VIA AIR" },
      { property: "og:description", content: "Painel de desempenho das publicações do Instagram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RedesSociaisPage,
});

type Filtro = "todos" | "feed" | "reels" | "stories";

function RedesSociaisPage() {
  const fetchOverview = useServerFn(getSocialOverview);
  const fetchBoosts = useServerFn(listarImpulsionamentos);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [conta, setConta] = useState<string>("todas");
  const [turbinar, setTurbinar] = useState<Item | null>(null);
  const [detalhe, setDetalhe] = useState<Boost | null>(null);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["social-overview"],
    queryFn: () => fetchOverview({ data: { limit: 18 } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: boosts } = useQuery({
    queryKey: ["meta-boosts"],
    queryFn: () => fetchBoosts() as Promise<Boost[]>,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const boostsPorMidia = useMemo(() => {
    const mapa = new Map<string, Boost[]>();
    for (const b of boosts ?? []) {
      const lista = mapa.get(b.ig_media_id) ?? [];
      lista.push(b);
      mapa.set(b.ig_media_id, lista);
    }
    return mapa;
  }, [boosts]);


  const contas = data?.contas ?? [];
  const visiveis = useMemo(
    () => contas.filter((c) => conta === "todas" || c.username === conta),
    [contas, conta],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Instagram className="h-5 w-5 text-[#F26B1F]" /> Redes sociais
          </h1>
          <p className="text-sm text-muted-foreground">
            Publicações, reels e stories das contas conectadas, com as métricas liberadas pela Meta.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["todos", "feed", "reels", "stories"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              filtro === f ? "bg-[#F26B1F] text-white" : "border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {f === "todos" ? "Tudo" : f}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <button
          onClick={() => setConta("todas")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            conta === "todas" ? "bg-slate-900 text-white" : "border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Todas as contas
        </button>
        {contas.map((c) => (
          <button
            key={c.account_id}
            onClick={() => setConta(c.username)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              conta === c.username ? "bg-slate-900 text-white" : "border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            @{c.username}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {isFetching && !data && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {visiveis.map((c) => {
        const itens = c.itens.filter((i) => {
          if (filtro === "todos") return true;
          if (filtro === "stories") return i.is_story;
          const reels = String(i.media_product_type ?? "").toUpperCase() === "REELS";
          if (filtro === "reels") return !i.is_story && reels;
          return !i.is_story && !reels;
        });

        const soma = (chave: string) => itens.reduce((t, i) => t + (i.insights[chave] ?? 0), 0);

        return (
          <section key={c.account_id} className="space-y-3">
            <div className="flex items-center gap-3">
              {c.avatar ? (
                <img src={c.avatar} alt={`Foto de perfil de @${c.username}`} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {c.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">@{c.username}</div>
                <div className="text-xs text-muted-foreground">{itens.length} itens no filtro atual</div>
              </div>
            </div>

            {c.erro && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">{c.erro}</p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Resumo label="Visualizações" valor={soma("views")} icone={Eye} />
              <Resumo label="Alcance" valor={soma("reach")} icone={Users} />
              <Resumo label="Curtidas" valor={soma("likes")} icone={Heart} />
              <Resumo label="Comentários" valor={soma("comments")} icone={MessageCircle} />
              <Resumo label="Salvamentos" valor={soma("saved")} icone={Bookmark} />
              <Resumo label="Interações" valor={soma("total_interactions")} icone={BarChart3} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {itens.map((i) => (
                <CardPost
                  key={i.id}
                  item={i}
                  boosts={boostsPorMidia.get(i.id) ?? []}
                  onTurbinar={() => setTurbinar(i)}
                  onVerDesempenho={(b: Boost) => setDetalhe(b)}
                />

              ))}

              {itens.length === 0 && !c.erro && (
                <p className="text-sm text-muted-foreground">Nada por aqui nesse filtro.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Resumo({
  label,
  valor,
  icone: Icone,
}: {
  label: string;
  valor: number;
  icone: typeof Eye;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{valor.toLocaleString("pt-BR")}</div>
    </div>
  );
}

type Item = {
  id: string;
  caption: string | null;
  media_type: string | null;
  media_product_type: string | null;
  permalink: string | null;
  thumbnail: string | null;
  timestamp: string | null;
  like_count: number | null;
  comments_count: number | null;
  is_story: boolean;
  insights: Record<string, number>;
};

function CardPost({
  item,
  boosts,
  onTurbinar,
  onVerDesempenho,
}: {
  item: Item;
  boosts: Boost[];
  onTurbinar: () => void;
  onVerDesempenho: (b: Boost) => void;
}) {
  const tipo = item.is_story
    ? "Story"
    : String(item.media_product_type ?? "").toUpperCase() === "REELS"
      ? "Reel"
      : String(item.media_type ?? "").toUpperCase() === "CAROUSEL_ALBUM"
        ? "Carrossel"
        : "Feed";

  const metricas: Array<{ icone: typeof Eye; label: string; valor: number | null | undefined; sufixo?: string }> = [
    { icone: Eye, label: "Visualizações", valor: item.insights.views },
    { icone: Users, label: "Alcance", valor: item.insights.reach },
    { icone: Heart, label: "Curtidas", valor: item.insights.likes ?? item.like_count },
    { icone: MessageCircle, label: "Comentários", valor: item.insights.comments ?? item.comments_count },
    { icone: Bookmark, label: "Salvamentos", valor: item.insights.saved },
    { icone: Share2, label: "Compartilhamentos", valor: item.insights.shares },
    { icone: BarChart3, label: "Interações", valor: item.insights.total_interactions },
    { icone: UserPlus, label: "Novos seguidores", valor: item.insights.follows },
    {
      icone: Clock,
      label: "Tempo médio assistido",
      valor:
        typeof item.insights.ig_reels_avg_watch_time === "number"
          ? Math.round(item.insights.ig_reels_avg_watch_time / 1000)
          : undefined,
      sufixo: "s",
    },
  ];

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex gap-3 p-3">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.caption?.slice(0, 60) || `Publicação ${tipo}`}
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            {tipo}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-[#F26B1F]">{tipo}</span>
            {item.timestamp && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(item.timestamp).toLocaleDateString("pt-BR")}
              </span>
            )}
            {item.permalink && (
              <a
                href={item.permalink}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-muted-foreground hover:text-foreground"
                title="Abrir no Instagram"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.caption || "Sem legenda"}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 border-t border-border p-2">
        {metricas
          .filter((m) => typeof m.valor === "number")
          .map((m) => (
            <span
              key={m.label}
              title={m.label}
              className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-foreground"
            >
              <m.icone className="h-3 w-3 text-muted-foreground" />
              {(m.valor as number).toLocaleString("pt-BR")}
              {m.sufixo}
            </span>
          ))}
      </div>
    </article>
  );
}
