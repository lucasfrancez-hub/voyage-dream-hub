import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Search,
  Loader2,
  ExternalLink,
  Copy,
  CalendarDays,
  MapPin,
  Users,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { useIsPublicEngine } from "@/lib/public-engine";
import { SearchSkeleton } from "@/components/search/SearchSkeleton";
import {
  onerExclusiveCriteriaPublic,
  onerExclusiveSearchPublic,
} from "@/lib/onertravel-public-extras.functions";


import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  onerExclusiveCriteria,
  onerExclusiveSearch,
} from "@/lib/onertravel-extras.functions";
import type {
  ExclusiveCriteria,
  ExclusiveProduct,
  ExclusiveSearchResult,
} from "@/lib/onertravel-extras.server";

export const Route = createFileRoute("/admin/exclusivos")({
  head: () => ({
    meta: [
      { title: "Produtos exclusivos — VIA AIR" },
      {
        name: "description",
        content: "Eventos, ingressos e pacotes exclusivos por categoria, cidade e data.",
      },
      { property: "og:title", content: "Produtos exclusivos — VIA AIR" },
      {
        property: "og:description",
        content: "Eventos, ingressos e pacotes exclusivos por categoria, cidade e data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ExclusivosPage />,
});

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function field(children: React.ReactNode) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 backdrop-blur">
      {children}
    </div>
  );
}

function ProductCard({
  product,
  onOpen,
}: {
  product: ExclusiveProduct;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-border/60 bg-card/70 text-left backdrop-blur transition hover:border-primary/50 hover:shadow-xl"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Sparkles className="h-8 w-8" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {product.category && <Badge className="bg-primary/90">{product.category}</Badge>}
          {product.lastUnits && <Badge variant="destructive">Últimas unidades</Badge>}
          {product.soldOut && <Badge variant="secondary">Esgotado</Badge>}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <p className="line-clamp-2 text-sm font-semibold">{product.title}</p>
        {product.subTitle && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{product.subTitle}</p>
        )}
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {product.place && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {product.place}
            </span>
          )}
          {product.initialDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {fmtDate(product.initialDate)}
              {product.finalDate ? ` – ${fmtDate(product.finalDate)}` : ""}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {product.participants}
          </span>
        </div>
        <p className="pt-1 text-lg font-bold text-primary">
          {fmtBRL(product.price)}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">a partir de</span>
        </p>
      </div>
    </button>
  );
}

export function ExclusivosPage({ header }: { header?: React.ReactNode } = {}) {
  const [criteria, setCriteria] = useState<ExclusiveCriteria | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [cityId, setCityId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [participants, setParticipants] = useState("");
  const [result, setResult] = useState<ExclusiveSearchResult | null>(null);
  const [detail, setDetail] = useState<ExclusiveProduct | null>(null);

  const isPublic = useIsPublicEngine();
  const loadCriteria = useServerFn(isPublic ? onerExclusiveCriteriaPublic : onerExclusiveCriteria);
  const search = useServerFn(isPublic ? onerExclusiveSearchPublic : onerExclusiveSearch);


  useEffect(() => {
    loadCriteria()
      .then(setCriteria)
      .catch(() => toast.error("Não foi possível carregar as categorias"));
  }, [loadCriteria]);

  const categoryName = useMemo(
    () => criteria?.categories.find((c) => c.id === categoryId)?.description ?? "",
    [criteria, categoryId],
  );
  const cityName = useMemo(
    () => criteria?.cities.find((c) => c.id === cityId)?.description ?? "",
    [criteria, cityId],
  );

  const run = useMutation({
    mutationFn: async () =>
      search({
        data: {
          categoryId: categoryId || null,
          categoryName: categoryName || null,
          cityId: cityId || null,
          cityName: cityName || null,
          eventDate: eventDate || null,
          participants: participants ? Number(participants) : null,
          page: 1,
          pageSize: 24,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      if (!r.products.length) toast.info("Nenhum produto exclusivo para esses filtros");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na busca"),
  });

  useEffect(() => {
    if (criteria && !result && !run.isPending) run.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria]);

  return (
    <div className={header ? "" : "min-h-screen bg-background"}>
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {header ?? (
            <div className="px-2">
              <h1 className="text-4xl font-bold tracking-tight">
                O que temos de <span className="text-primary">exclusivo</span>?
              </h1>
            </div>
          )}

          <div className="mt-6 grid gap-3 rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl md:grid-cols-[1.1fr_1.1fr_0.9fr_0.7fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              {field(
                <>
                  <Tag className="h-4 w-4 shrink-0 text-primary" />
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    <option value="">Todas</option>
                    {(criteria?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.description}
                      </option>
                    ))}
                  </select>
                </>,
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Local de destino</Label>
              {field(
                <>
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <select
                    value={cityId}
                    onChange={(e) => setCityId(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    <option value="">Todos</option>
                    {(criteria?.cities ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.description}
                      </option>
                    ))}
                  </select>
                </>,
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Data do evento</Label>
              {field(
                <>
                  <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                  <select
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    <option value="">Qualquer</option>
                    {(criteria?.dates ?? []).map((d) => (
                      <option key={d} value={d}>
                        {fmtDate(d) || d}
                      </option>
                    ))}
                  </select>
                </>,
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Pessoas</Label>
              {field(
                <>
                  <Users className="h-4 w-4 shrink-0 text-primary" />
                  <select
                    value={participants}
                    onChange={(e) => setParticipants(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                  >
                    <option value="">—</option>
                    {(criteria?.participants ?? []).map((p) => (
                      <option key={p} value={String(p)}>
                        {p}
                      </option>
                    ))}
                  </select>
                </>,
              )}
            </div>

            <div className="flex items-end">
              <Button
                className="h-11 w-full rounded-xl px-6 md:w-auto"
                onClick={() => run.mutate()}
                disabled={run.isPending}
              >
                {run.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {run.isPending && <SearchSkeleton kind="exclusive" rows={4} />}

        {!result && !run.isPending && (
          <div data-empty-state className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Sparkles className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Escolha o destino e as datas. Os filtros aparecem na lateral depois da pesquisa.
            </p>
          </div>
        )}

        {result && !run.isPending && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {result.count} produto(s) exclusivo(s)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(result.url);
                    toast.success("Link copiado");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar link
                </Button>
                <Button size="sm" asChild>
                  <a href={result.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir no Comprar Viagem
                  </a>
                </Button>
              </div>
            </div>
            {result.products.length === 0 ? (
              <NoResults
                title="Desculpe, nenhum exclusivo foi encontrado."
                hint="Nenhuma opção com esses filtros. Selecione outra opção de filtro."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.products.map((p) => (
                  <ProductCard key={p.uuid} product={p} onOpen={() => setDetail(p)} />
                ))}
              </div>
            )}

          </>
        )}
      </main>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left">{detail?.title}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              {detail.images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {detail.images.slice(0, 6).map((img) => (
                    <img
                      key={img}
                      src={img}
                      alt={detail.title}
                      loading="lazy"
                      className="h-40 w-64 shrink-0 rounded-xl object-cover"
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {detail.place && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {detail.place}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {fmtDate(detail.initialDate)} –{" "}
                  {fmtDate(detail.finalDate)}
                </span>
                <span className="text-base font-bold text-primary">{fmtBRL(detail.price)}</span>
              </div>
              <div
                className="prose prose-sm max-w-none text-sm text-muted-foreground [&_a]:text-primary [&_strong]:text-foreground"
                dangerouslySetInnerHTML={{ __html: detail.description }}
              />
              {result && (
                <Button asChild className="w-full">
                  <a href={result.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Ver no Comprar Viagem
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
