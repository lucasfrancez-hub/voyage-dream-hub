import { useState } from "react";
import {
  MapPin,
  Ship as ShipIcon,
  Sparkles,
  BedDouble,
  Map,
  Image as ImageIcon,
  Video,
  FileText,
  X,
  Menu,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CruiseDetails, CabinType } from "@/lib/packages/cruise";
import { CABIN_TYPE_LABELS } from "@/lib/packages/cruise";

type TabKey =
  | "itinerary"
  | "ship"
  | "attractions"
  | "cabins"
  | "deck"
  | "photos"
  | "videos"
  | "data";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "itinerary", label: "Itinerário", icon: MapPin },
  { key: "ship", label: "O Navio", icon: ShipIcon },
  { key: "attractions", label: "Atrações", icon: Sparkles },
  { key: "cabins", label: "Cabines", icon: BedDouble },
  { key: "deck", label: "Deck Plan", icon: Map },
  { key: "photos", label: "Fotos", icon: ImageIcon },
  { key: "videos", label: "Vídeos", icon: Video },
  { key: "data", label: "Ficha técnica", icon: FileText },
];

export function CruiseMoreModal({
  open,
  onClose,
  details,
  cruiseTitle,
  initialTab = "itinerary",
}: {
  open: boolean;
  onClose: () => void;
  details: CruiseDetails;
  cruiseTitle: string;
  initialTab?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!open) return null;

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="fixed inset-0 z-[90] bg-background/85 backdrop-blur-xl animate-in fade-in duration-200 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1400px] bg-card md:my-4 md:rounded-3xl overflow-hidden border border-border shadow-2xl">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex-col border-r border-border bg-muted/40 w-72 shrink-0",
            "hidden md:flex",
            sidebarOpen && "!flex absolute md:relative inset-y-0 left-0 z-10",
          )}
        >
          <div className="px-5 py-5 border-b border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cruzeiro</div>
            <div className="mt-1 font-display text-sm font-semibold leading-tight">{cruiseTitle}</div>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition text-left",
                    active
                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold"
                      : "text-foreground/70 hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between border-b border-border px-5 md:px-8 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md:hidden rounded-full p-2 hover:bg-muted"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="font-display text-xl md:text-2xl font-bold">{activeTab.label}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-5 md:p-8">
            {tab === "itinerary" && <ItineraryTab details={details} />}
            {tab === "ship" && <ShipTab details={details} />}
            {tab === "attractions" && <AttractionsTab details={details} />}
            {tab === "cabins" && <CabinsTab details={details} />}
            {tab === "deck" && <DeckTab details={details} />}
            {tab === "photos" && <PhotosTab details={details} />}
            {tab === "videos" && <VideosTab details={details} />}
            {tab === "data" && <DataTab details={details} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
      {label} — em breve.
    </div>
  );
}

function ItineraryTab({ details }: { details: CruiseDetails }) {
  const items = details.itinerary ?? [];
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        {details.map_image ? (
          <div className="rounded-2xl overflow-hidden border border-border">
            <img
              src={details.map_image}
              alt="Mapa do itinerário"
              className="w-full h-auto object-cover"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Mapa do itinerário indisponível.
          </div>
        )}
        <ol className="relative border-l-2 border-sky-500/30 ml-3 space-y-6 pl-6">
          {items.map((day) => (
            <li key={day.day} className="relative">
              <span className="absolute -left-[35px] top-1 grid place-items-center h-6 w-6 rounded-full bg-sky-600 text-[10px] font-bold text-white">
                {String(day.day).padStart(2, "0")}
              </span>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {day.date}
              </div>
              <div className="font-semibold text-sm">
                {day.port}
                {day.country ? `, ${day.country}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {day.arrival && <>Chegada {day.arrival}</>}
                {day.arrival && day.departure && " · "}
                {day.departure && <>Saída {day.departure}</>}
              </div>
            </li>
          ))}
          {items.length === 0 && <EmptyState label="Itinerário" />}
        </ol>
      </div>
      <div className="space-y-6">
        {items
          .filter((d) => d.description || d.photo)
          .map((d) => (
            <div key={d.day} className="space-y-3">
              {d.photo && (
                <div className="rounded-2xl overflow-hidden aspect-[16/9] bg-muted">
                  <img src={d.photo} alt={d.port} className="w-full h-full object-cover" />
                </div>
              )}
              <h3 className="font-display text-lg font-bold">{d.port}</h3>
              {d.description && (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {d.description}
                </p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function ShipTab({ details }: { details: CruiseDetails }) {
  const s = details.ship;
  if (!s?.name && (s?.gallery ?? []).length === 0) return <EmptyState label="Informações do navio" />;
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {s.line || "Companhia"}
        </div>
        <h3 className="font-display text-2xl font-bold">{s.name}</h3>
      </div>
      {(s.gallery ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.gallery.map((src, i) => (
            <div key={i} className="rounded-xl overflow-hidden aspect-[4/3] bg-muted">
              <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttractionsTab({ details }: { details: CruiseDetails }) {
  const items = details.ship?.attractions ?? [];
  if (items.length === 0) return <EmptyState label="Atrações" />;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a, i) => (
        <div key={i} className="rounded-2xl border border-border overflow-hidden bg-card">
          {a.image && (
            <div className="aspect-[4/3] bg-muted">
              <img src={a.image} alt={a.title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4">
            <h4 className="font-semibold text-sm">{a.title}</h4>
            {a.description && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{a.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CabinsTab({ details }: { details: CruiseDetails }) {
  const [filter, setFilter] = useState<CabinType | "all">("all");
  const cats = details.cabin_categories ?? [];
  if (cats.length === 0) return <EmptyState label="Cabines" />;

  const groups: Array<{ key: CabinType | "all"; label: string; count: number }> = [
    { key: "suite", label: "Suíte", count: cats.filter((c) => c.type === "suite").length },
    { key: "varanda", label: "Varanda", count: cats.filter((c) => c.type === "varanda").length },
    { key: "externa", label: "Externa", count: cats.filter((c) => c.type === "externa").length },
    { key: "interna", label: "Interna", count: cats.filter((c) => c.type === "interna").length },
    { key: "all", label: "Todos", count: cats.length },
  ];

  const filtered = filter === "all" ? cats : cats.filter((c) => c.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {groups
          .filter((g) => g.count > 0)
          .map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setFilter(g.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm border transition",
                filter === g.key
                  ? "bg-sky-600 text-white border-sky-600"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {g.label} <span className="opacity-70">({g.count})</span>
            </button>
          ))}
      </div>

      <div className="divide-y divide-border">
        {filtered.map((c) => (
          <div key={c.id} className="py-6 grid gap-5 md:grid-cols-[minmax(0,340px)_1fr] first:pt-0">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
              {c.photos?.[0] ? (
                <img src={c.photos[0]} alt={c.name} className="w-full h-full object-cover" />
              ) : (
                <div className="grid place-items-center h-full text-muted-foreground text-xs">
                  Sem foto
                </div>
              )}
            </div>
            <div>
              {c.category_codes?.length ? (
                <div className="text-xs text-muted-foreground">
                  Categorias: {c.category_codes.join(", ")}
                </div>
              ) : null}
              <h4 className="font-display text-lg font-bold mt-1">{c.name}</h4>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Capacidade
                  </div>
                  <div className="font-semibold">Até {c.capacity} pessoas</div>
                </div>
                {c.size_m2 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      Tamanho
                    </div>
                    <div className="font-semibold">{c.size_m2}</div>
                  </div>
                )}
              </div>
              {c.description && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {c.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeckTab({ details }: { details: CruiseDetails }) {
  const img = details.ship?.deck_plan_image;
  if (!img) return <EmptyState label="Deck plan" />;
  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <img src={img} alt="Deck plan" className="w-full h-auto" />
    </div>
  );
}

function PhotosTab({ details }: { details: CruiseDetails }) {
  const photos = details.ship?.gallery ?? [];
  if (photos.length === 0) return <EmptyState label="Fotos" />;
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {photos.map((src, i) => (
        <div key={i} className="rounded-xl overflow-hidden aspect-square bg-muted">
          <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function VideosTab({ details }: { details: CruiseDetails }) {
  const videos = details.ship?.videos ?? [];
  if (videos.length === 0) return <EmptyState label="Vídeos" />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {videos.map((url, i) => (
        <div key={i} className="aspect-video rounded-xl overflow-hidden border border-border bg-black">
          <iframe
            src={url}
            title={`Vídeo ${i + 1}`}
            className="w-full h-full"
            frameBorder={0}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ))}
    </div>
  );
}

function DataTab({ details }: { details: CruiseDetails }) {
  const rows = details.ship?.data_sheet ?? [];
  if (rows.length === 0) return <EmptyState label="Ficha técnica" />;
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-4 px-5 py-3 text-sm">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-semibold text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { ChevronRight };
