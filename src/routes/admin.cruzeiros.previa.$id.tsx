import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Ship, Eye, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCruisePreview } from "@/lib/cruises/admin.functions";

export const Route = createFileRoute("/admin/cruzeiros/previa/$id")({
  head: () => ({
    meta: [
      { title: "Prévia do cruzeiro — VIA AIR" },
      {
        name: "description",
        content:
          "Prévia interna do cruzeiro importado: confira itinerário, cabines, preços, navio e mídias antes de publicar.",
      },
      { property: "og:title", content: "Prévia do cruzeiro — VIA AIR" },
      {
        property: "og:description",
        content: "Conferência interna dos dados importados do cruzeiro antes da publicação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviaCruzeiro,
});

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const brl = (v?: number | null) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (v?: string | null) => {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : String(v);
};

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];

const TIPOS: Record<string, string> = {
  interna: "Interna",
  externa: "Externa",
  varanda: "Varanda",
  suite: "Suíte",
  outro: "Outras",
};

function Secao({
  titulo,
  contador,
  children,
}: {
  titulo: string;
  contador?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {contador !== undefined && (
          <Badge variant={contador ? "secondary" : "outline"}>
            {contador ? `${contador} item(ns)` : "não importado"}
          </Badge>
        )}
      </div>
      {children}
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

function Foto({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`h-full w-full rounded-lg object-cover ${className}`}
    />
  );
}

function PreviaCruzeiro() {
  const { id } = Route.useParams();
  const fetchPreview = useServerFn(getCruisePreview);
  const q = useQuery({
    queryKey: ["cruise-preview", id],
    queryFn: () => fetchPreview({ data: { id } }),
  });
  const [tipoAtivo, setTipoAtivo] = useState<string | null>(null);

  const d = q.data;

  const precoPorOferta = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const p of (d?.prices ?? []) as Row[]) {
      const list = map.get(p.offer_id) ?? [];
      list.push(p);
      map.set(p.offer_id, list);
    }
    return map;
  }, [d]);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    for (const o of (d?.offers ?? []) as Row[]) set.add(o.cabin_type || "outro");
    return [...set];
  }, [d]);

  const ofertasVisiveis = ((d?.offers ?? []) as Row[]).filter(
    (o) => !tipoAtivo || (o.cabin_type || "outro") === tipoAtivo,
  );

  const fotos = [...((d?.media ?? []) as Row[]), ...((d?.shipMedia ?? []) as Row[])].filter(
    (m) => m.media_type !== "video",
  );
  const videos = [...((d?.media ?? []) as Row[]), ...((d?.shipMedia ?? []) as Row[])].filter(
    (m) => m.media_type === "video",
  );

  const specs = ((d?.ship?.specs ?? {}) as Record<string, string | number>) || {};

  const pendencias = useMemo(() => {
    if (!d) return [] as string[];
    const faltas: string[] = [];
    if (!d.cruise.departure_date) faltas.push("data de saída");
    if (!d.cruise.ship_name && !d.ship) faltas.push("navio");
    if (!(d.itinerary ?? []).length) faltas.push("itinerário");
    if (!(d.offers ?? []).length) faltas.push("cabines/ofertas");
    if (!(d.prices ?? []).length) faltas.push("preços vigentes");
    if (!(d.attractions ?? []).length) faltas.push("atrações");
    if (!(d.shipCabins ?? []).length) faltas.push("cabines do navio");
    if (!(d.decks ?? []).length) faltas.push("deck plan");
    if (!Object.keys(specs).length) faltas.push("ficha técnica");
    if (!fotos.length) faltas.push("fotos");
    if (!(d.additionals ?? []).length) faltas.push("adicionais");
    if (!(d.insurances ?? []).length) faltas.push("seguro");
    return faltas;
  }, [d, fotos.length, specs]);

  const capa =
    (d?.ship?.main_image_url as string | undefined) ||
    (fotos[0]?.hires_url as string | undefined) ||
    (fotos[0]?.source_url as string | undefined) ||
    "";

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-900 sm:-mx-6 sm:px-6">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">
          Prévia interna — nada disso está publicado no site do cliente
        </span>
        <Link to="/admin/cruzeiros" className="ml-auto">
          <Button size="sm" variant="outline" className="h-8">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
        </Link>
      </div>

      {q.isLoading && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Montando a prévia…
        </Card>
      )}

      {q.isError && (
        <Card className="p-6 text-sm text-destructive">
          Não foi possível carregar a prévia: {(q.error as Error)?.message}
        </Card>
      )}

      {d && (
        <>
          {/* Capa */}
          <Card className="overflow-hidden">
            {capa ? (
              <div className="relative h-56 w-full sm:h-72">
                <img src={capa} alt={d.cruise.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 p-5 text-white">
                  <div className="text-xs font-bold uppercase tracking-widest opacity-90">
                    {d.cruise.operator || "Cruzeiro"}
                  </div>
                  <h1 className="text-2xl font-semibold sm:text-3xl">{d.cruise.name}</h1>
                  <p className="text-sm opacity-90">
                    {d.cruise.ship_name || d.ship?.name || "navio a definir"} •{" "}
                    {dataBR(d.cruise.departure_date)}
                    {d.cruise.nights ? ` • ${d.cruise.nights} noites` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-5">
                <Ship className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-xl font-semibold">{d.cruise.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {d.cruise.ship_name || "navio a definir"} • {dataBR(d.cruise.departure_date)}
                    {d.cruise.nights ? ` • ${d.cruise.nights} noites` : ""}
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Conferência */}
          <Card className="p-5">
            {pendencias.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Todas as seções foram importadas.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4" /> Ainda falta importar
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pendencias.map((p) => (
                    <span
                      key={p}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-900"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Itinerário */}
          <Secao titulo="Itinerário" contador={(d.itinerary as Row[]).length}>
            {(d.itinerary as Row[]).length === 0 ? (
              <Vazio texto="Abra a aba Itinerário no portal da operadora e faça uma nova captura." />
            ) : (
              <ol className="space-y-2">
                {(d.itinerary as Row[]).map((p) => (
                  <li
                    key={`${p.day}-${p.port}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {p.day}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {p.port}
                        {p.country ? `, ${p.country}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dataBR(p.date)}
                        {p.arrival ? ` • chegada ${p.arrival}` : ""}
                        {p.departure ? ` • saída ${p.departure}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Secao>

          {/* Cabines e preços */}
          <Secao titulo="Cabines e preços" contador={(d.offers as Row[]).length}>
            {tipos.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTipoAtivo(null)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                    !tipoAtivo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  Todas
                </button>
                {tipos.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoAtivo(t)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                      tipoAtivo === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {TIPOS[t] ?? t}
                  </button>
                ))}
              </div>
            )}
            {ofertasVisiveis.length === 0 ? (
              <Vazio texto="Nenhuma cabine importada para este filtro." />
            ) : (
              <div className="space-y-3">
                {ofertasVisiveis.map((o) => {
                  const precos = precoPorOferta.get(o.id) ?? [];
                  return (
                    <div key={o.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row">
                      {o.image_url && (
                        <div className="h-28 w-full shrink-0 sm:w-44">
                          <Foto src={o.image_url} alt={o.name} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{o.name}</span>
                          <Badge variant="outline">{TIPOS[o.cabin_type] ?? o.cabin_type}</Badge>
                          {o.fare_name && <Badge variant="secondary">{o.fare_name}</Badge>}
                          {o.availability && (
                            <span className="text-xs text-muted-foreground">{o.availability}</span>
                          )}
                        </div>
                        {arr(o.amenities).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {arr(o.amenities).slice(0, 8).map((a) => (
                              <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                        {precos.length === 0 ? (
                          <div className="text-xs text-amber-700">Sem preço vigente capturado.</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {precos.map((p) => (
                              <div key={p.id} className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
                                <span className="font-semibold">{brl(p.total)}</span>{" "}
                                <span className="text-muted-foreground">
                                  ({p.adults}A
                                  {p.children ? ` ${p.children}C` : ""}
                                  {p.young ? ` ${p.young}J` : ""}
                                  {p.infants ? ` ${p.infants}B` : ""}
                                  {p.taxes ? ` • taxas ${brl(p.taxes)}` : ""})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Secao>

          {/* Navio + ficha técnica */}
          <Secao titulo="Navio e ficha técnica" contador={Object.keys(specs).length}>
            {!d.ship ? (
              <Vazio texto="O navio ainda não foi vinculado. Capture a aba 'O Navio' no portal." />
            ) : (
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="font-medium">{d.ship.name}</span>
                  {d.ship.line ? ` • ${d.ship.line}` : ""}
                </div>
                {d.ship.description && (
                  <p className="text-sm text-muted-foreground">{String(d.ship.description)}</p>
                )}
                {Object.keys(specs).length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(specs).map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-border px-3 py-2 text-sm">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
                        <div className="font-medium">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {d.ship.technical_image_url && (
                  <img
                    src={String(d.ship.technical_image_url)}
                    alt={`Desenho técnico do ${d.ship.name}`}
                    className="w-full rounded-lg border border-border"
                  />
                )}
              </div>
            )}
          </Secao>

          {/* Atrações */}
          <Secao titulo="Atrações a bordo" contador={(d.attractions as Row[]).length}>
            {(d.attractions as Row[]).length === 0 ? (
              <Vazio texto="Capture a aba 'Atrações' no portal da operadora." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(d.attractions as Row[]).map((a) => (
                  <div key={a.id} className="overflow-hidden rounded-xl border border-border">
                    {arr(a.images)[0] && (
                      <div className="h-32">
                        <Foto src={arr(a.images)[0]} alt={a.name} className="rounded-none" />
                      </div>
                    )}
                    <div className="space-y-1 p-3">
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.category}
                        {a.deck ? ` • deck ${a.deck}` : ""}
                      </div>
                      {a.description && (
                        <p className="line-clamp-3 text-xs text-muted-foreground">{a.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {/* Cabines do navio */}
          <Secao titulo="Cabines do navio" contador={(d.shipCabins as Row[]).length}>
            {(d.shipCabins as Row[]).length === 0 ? (
              <Vazio texto="Capture a aba 'Cabines' no portal da operadora." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(d.shipCabins as Row[]).map((c) => (
                  <div key={c.id} className="overflow-hidden rounded-xl border border-border">
                    {arr(c.photos)[0] && (
                      <div className="h-32">
                        <Foto src={arr(c.photos)[0]} alt={c.name} className="rounded-none" />
                      </div>
                    )}
                    <div className="space-y-1 p-3">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {TIPOS[c.cabin_type] ?? c.cabin_type}
                        {c.size_m2 ? ` • ${c.size_m2}` : ""}
                        {c.capacity ? ` • até ${c.capacity} hóspedes` : ""}
                      </div>
                      {c.description && (
                        <p className="line-clamp-3 text-xs text-muted-foreground">{c.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {/* Deck plan */}
          <Secao titulo="Deck plan" contador={(d.decks as Row[]).length}>
            {(d.decks as Row[]).length === 0 ? (
              <Vazio texto="Capture a aba 'Deck Plan' no portal da operadora." />
            ) : (
              <div className="space-y-3">
                {(d.decks as Row[]).map((dk) => (
                  <div key={dk.id} className="space-y-1">
                    <div className="text-sm font-medium">{dk.deck_label}</div>
                    {dk.image_url && (
                      <img
                        src={dk.image_url}
                        alt={dk.deck_label}
                        className="w-full rounded-lg border border-border"
                        loading="lazy"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {/* Galeria */}
          <Secao titulo="Fotos" contador={fotos.length}>
            {fotos.length === 0 ? (
              <Vazio texto="Capture a aba 'Fotos' no portal da operadora." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fotos.slice(0, 40).map((m) => (
                  <div key={m.id} className="h-28">
                    <Foto src={m.thumbnail_url || m.source_url} alt={m.title || m.alt || "Foto"} />
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {/* Vídeos */}
          <Secao titulo="Vídeos" contador={videos.length}>
            {videos.length === 0 ? (
              <Vazio texto="Nenhum vídeo importado." />
            ) : (
              <ul className="space-y-2 text-sm">
                {videos.map((v) => (
                  <li key={v.id} className="rounded-lg border border-border p-3">
                    <div className="font-medium">{v.title || "Vídeo"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {v.embed_url || v.source_url}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {/* Adicionais */}
          <Secao titulo="Adicionais" contador={(d.additionals as Row[]).length}>
            {(d.additionals as Row[]).length === 0 ? (
              <Vazio texto="Capture os adicionais (bebidas, wi-fi, excursões) no portal." />
            ) : (
              <div className="space-y-2">
                {(d.additionals as Row[]).map((a) => (
                  <div key={a.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{a.name}</span>
                      <Badge variant="outline">{a.category_name || "Outros"}</Badge>
                    </div>
                    {a.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                    )}
                    {(a.prices as Row[])?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(a.prices as Row[]).map((p) => (
                          <span key={p.id} className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs">
                            {p.profile}: <b>{brl(p.price)}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {/* Seguros */}
          <Secao titulo="Seguro" contador={(d.insurances as Row[]).length}>
            {(d.insurances as Row[]).length === 0 ? (
              <Vazio texto="Nenhum seguro importado." />
            ) : (
              <ul className="space-y-2 text-sm">
                {(d.insurances as Row[]).map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span>{s.name}</span>
                    <b>{brl(s.price_per_person)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </>
      )}
    </div>
  );
}
