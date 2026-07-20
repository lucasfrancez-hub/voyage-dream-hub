import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, EyeOff, Loader2, X, Info, CalendarRange, Building2, Plane, ListChecks, Sparkles, Image as ImageIcon, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { HotelAutocomplete } from "@/components/HotelAutocomplete";
import { AirlineCombobox } from "@/components/AirlineCombobox";
import { FlightNumberInput } from "@/components/FlightNumberInput";
import { ClassSelect } from "@/components/ClassSelect";
import { FlightLookupButton } from "@/components/FlightLookupButton";
import { findAirline } from "@/lib/airlines";
import { iataCity } from "@/lib/iata-lookup";
import { CABIN_CLASSES, fareClassesFor } from "@/lib/airline-fares";
import { generatePackageSummary, searchCoverImages, extractFlightFromImage, extractPackageFromDocument } from "@/lib/packages/ai.functions";
import { searchTripAdvisorHotels, getTripAdvisorHotelDetails } from "@/lib/tripadvisor.functions";
import { FileUp, Upload } from "lucide-react";

export const Route = createFileRoute("/admin/pacotes")({
  component: AdminPackages,
});

type FlightSegment = {
  airline?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  layover?: string;
};

type FlightInfo = {
  airline?: string;
  airline_logo_url?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  stops?: number | string;
  cabin_class?: string;
  fare_class?: string;
  carry_on?: boolean;
  checked_bag?: boolean;
  personal_item?: boolean;
  segments?: FlightSegment[];
};

type PackageRow = {
  id: string;
  slug: string;
  title: string;
  destination: string;
  origin: string | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  price_per_person: number;
  taxes: number | null;
  image_url: string | null;
  summary: string | null;
  itinerary: string | null;
  includes: string[] | null;
  hotel_name: string | null;
  hotel_stars: number | null;
  meal_plan: string | null;
  room_type: string | null;
  room_category: string | null;
  bed_type: string | null;
  is_active: boolean;
  sort_order: number;
  base_occupancy: number;
  outbound_flight: FlightInfo | null;
  return_flight: FlightInfo | null;
  supplier_name: string | null;
  tripadvisor_location_id: string | null;
  tripadvisor_url: string | null;
  tripadvisor_address: string | null;
  tripadvisor_photos: string[] | null;
};

const emptyForm: Partial<PackageRow> = {
  slug: "",
  title: "",
  destination: "",
  origin: "",
  going_date: "",
  return_date: "",
  nights: 0,
  price_per_person: 0,
  taxes: 0,
  image_url: "",
  summary: "",
  itinerary: "",
  includes: [],
  hotel_name: "",
  hotel_stars: 3,
  meal_plan: "",
  room_type: "",
  room_category: "",
  bed_type: "",
  is_active: true,
  sort_order: 0,
  base_occupancy: 2,
  outbound_flight: null,
  return_flight: null,
  supplier_name: "",
};

function AdminPackages() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<PackageRow> | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: packages, isLoading } = useQuery({
    queryKey: ["admin", "packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PackageRow[];
    },
  });

  async function save() {
    if (!editing) return;
    if (!editing.slug || !editing.title || !editing.destination) {
      toast.error("Preencha slug, título e destino.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: editing.slug!,
        title: editing.title!,
        destination: editing.destination!,
        origin: editing.origin || null,
        image_url: editing.image_url || null,
        summary: editing.summary || null,
        itinerary: editing.itinerary || null,
        hotel_name: editing.hotel_name || null,
        meal_plan: editing.meal_plan || null,
        room_type: editing.room_type || null,
        room_category: editing.room_category || null,
        bed_type: editing.bed_type || null,
        is_active: editing.is_active ?? true,
        includes:
          typeof editing.includes === "string"
            ? (editing.includes as string).split("\n").map((s) => s.trim()).filter(Boolean)
            : editing.includes ?? [],
        price_per_person: Number(editing.price_per_person) || 0,
        taxes: Number(editing.taxes) || 0,
        nights: editing.nights ? Number(editing.nights) : null,
        hotel_stars: editing.hotel_stars ? Number(editing.hotel_stars) : null,
        sort_order: Number(editing.sort_order) || 0,
        going_date: editing.going_date || null,
        return_date: editing.return_date || null,
        base_occupancy: Number(editing.base_occupancy) || 2,
        outbound_flight: cleanFlight(editing.outbound_flight),
        return_flight: cleanFlight(editing.return_flight),
        supplier_name: editing.supplier_name || null,
        tripadvisor_location_id: editing.tripadvisor_location_id || null,
        tripadvisor_url: editing.tripadvisor_url || null,
        tripadvisor_address: editing.tripadvisor_address || null,
        tripadvisor_photos: editing.tripadvisor_photos && editing.tripadvisor_photos.length > 0 ? editing.tripadvisor_photos : null,
      };
      const { error } = editing.id
        ? await supabase.from("packages").update(payload).eq("id", editing.id)
        : await supabase.from("packages").insert(payload);
      if (error) throw error;
      toast.success(editing.id ? "Pacote atualizado" : "Pacote criado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: PackageRow) {
    const { error } = await supabase
      .from("packages")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin", "packages"] });
  }

  async function remove(p: PackageRow) {
    if (!confirm(`Excluir "${p.title}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("packages").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Pacote excluído");
    qc.invalidateQueries({ queryKey: ["admin", "packages"] });
  }

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-6 py-6 sm:py-10 text-[0.95em] selection:bg-brand-orange/30">
      {/* Command Center header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase text-foreground mb-2">
            Command Center <span className="text-brand-orange">/</span> Pacotes
          </h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            {packages?.length ?? 0} pacote(s) cadastrados no sistema via air
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...emptyForm })}
          className="inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-[#ff7b30] text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-sm transition-all active:scale-95 shadow-[4px_4px_0px_0px_rgba(242,107,31,0.2)]"
        >
          <Plus className="h-5 w-5" strokeWidth={3} /> Novo Pacote
        </button>
      </div>

      {/* Row Header */}
      <div className="hidden md:grid grid-cols-12 px-8 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/60">
        <div className="col-span-5">Identificação do Pacote</div>
        <div className="col-span-3 text-center">Período Operacional</div>
        <div className="col-span-2 text-right">Valor Base</div>
        <div className="col-span-2 text-right">Status / Gestão</div>
      </div>

      {/* List */}
      <div className="space-y-3 mt-2">
        {isLoading && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        )}
        {packages?.map((p) => (
          <div
            key={p.id}
            className="group bg-card/60 border border-border/60 rounded-2xl hover:border-brand-orange/50 transition-all"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 items-center p-4 md:px-6 md:py-4 gap-3 md:gap-2">
              {/* Info */}
              <div className="col-span-1 md:col-span-5 space-y-0.5 min-w-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-sm bg-brand-orange shrink-0" />
                  <h3 className="text-sm sm:text-[15px] font-bold text-foreground group-hover:text-brand-orange transition-colors truncate">
                    {p.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2 pl-4 text-[10px] text-muted-foreground uppercase min-w-0">
                  <span className="truncate">/{p.slug}</span>
                  <span className="text-muted-foreground/40 shrink-0">•</span>
                  <span className="text-muted-foreground/90 italic truncate">{p.destination}</span>
                </div>
              </div>

              {/* Dates */}
              <div className="col-span-1 md:col-span-3 flex md:justify-center">
                <div className="inline-flex items-center gap-2.5 text-[11px] sm:text-xs tracking-tight text-muted-foreground bg-background/60 px-3 py-1 border border-border/60 rounded-full">
                  <span>{p.going_date ? formatDate(p.going_date) : "—"}</span>
                  <span className="text-muted-foreground/40">→</span>
                  <span>{p.return_date ? formatDate(p.return_date) : "—"}</span>
                </div>
              </div>

              {/* Price */}
              <div className="col-span-1 md:col-span-2 md:text-right">
                <div className="text-[9px] text-muted-foreground uppercase mb-0.5">BRL</div>
                <div className="text-base sm:text-lg font-black text-foreground tabular-nums tracking-tight">
                  {formatBRLNoSymbol((Number(p.price_per_person) || 0) * (Number(p.base_occupancy) || 1))}
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Total {p.base_occupancy || 1} pax
                </div>
              </div>


              {/* Status + Actions */}
              <div className="col-span-1 md:col-span-2 flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3">
                <button
                  onClick={() => toggleActive(p)}
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    p.is_active
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                      : "bg-muted border-border text-muted-foreground"
                  }`}
                  title={p.is_active ? "Clique para ocultar" : "Clique para ativar"}
                >
                  {p.is_active ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {p.is_active ? "Ativo" : "Oculto"}
                </button>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setEditing(p)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="text-muted-foreground/60 hover:text-red-500 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PackageEditorModal
          editing={editing}
          setEditing={setEditing}
          saving={saving}
          save={save}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatBRLNoSymbol(n: number): string {
  return (n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PackageEditorModalProps = {
  editing: Partial<PackageRow>;
  setEditing: (v: Partial<PackageRow> | null) => void;
  saving: boolean;
  save: () => void;
};

type TabId = "dates" | "hotel" | "flights" | "extras" | "about";

function slugify(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const PT_MONTHS = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function deriveFromFlights(editing: Partial<PackageRow>): { originCity?: string; destCity?: string; title?: string; slug?: string } {
  const outSegs = editing.outbound_flight?.segments ?? [];
  const first = outSegs[0];
  const last = outSegs[outSegs.length - 1];
  const originCity = first?.from_city?.trim() || editing.origin?.trim() || undefined;
  const destCity = last?.to_city?.trim() || editing.destination?.trim() || undefined;
  const title = destCity && originCity ? `${destCity} - Saída de ${originCity}` : destCity ? destCity : undefined;
  let slug: string | undefined;
  if (destCity) {
    const going = editing.going_date;
    if (going) {
      const [y, m] = going.split("-");
      const monthName = PT_MONTHS[Number(m) - 1];
      slug = slugify(`${destCity}-${monthName ?? m}-${y}`);
    } else {
      slug = slugify(destCity);
    }
  }
  return { originCity, destCity, title, slug };
}

function PackageEditorModal({ editing, setEditing, saving, save }: PackageEditorModalProps) {
  const [tab, setTab] = useState<TabId>("dates");
  const [flightLeg, setFlightLeg] = useState<"outbound" | "return">("outbound");
  const [aiLoading, setAiLoading] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [imgQuery, setImgQuery] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgPage, setImgPage] = useState(1);
  const [imgHasMore, setImgHasMore] = useState(false);
  const [imgSource, setImgSource] = useState("");
  const [imgResults, setImgResults] = useState<Array<{ thumb: string; url: string; title: string; source: string; author: string }>>([]);

  const genSummary = useServerFn(generatePackageSummary);
  const searchImages = useServerFn(searchCoverImages);

  const derived = useMemo(() => deriveFromFlights(editing), [editing.outbound_flight, editing.going_date, editing.destination, editing.origin]);

  // Auto-fill empty fields when derived values become available
  useEffect(() => {
    const patch: Partial<PackageRow> = {};
    if (!editing.destination && derived.destCity) patch.destination = derived.destCity;
    if (!editing.origin && derived.originCity) patch.origin = derived.originCity;
    if (!editing.title && derived.title) patch.title = derived.title;
    if (!editing.slug && derived.slug) patch.slug = derived.slug;
    if (Object.keys(patch).length) setEditing({ ...editing, ...patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived.destCity, derived.originCity, derived.title, derived.slug]);

  // Auto-preencher "O que inclui" a partir dos dados: passagem ida/volta, hospedagem,
  // café da manhã (se meal_plan indicar) e bagagem despachada (se algum voo tiver).
  const derivedIncludes = useMemo(() => {
    const list: string[] = [];
    const hasOutbound = !!editing.outbound_flight;
    const hasReturn = !!editing.return_flight;
    if (hasOutbound && hasReturn) list.push("Passagem Aérea de Ida e Volta");
    else if (hasOutbound || hasReturn) list.push("Passagem Aérea");
    if (editing.hotel_name || editing.tripadvisor_location_id) list.push("Hospedagem");
    const meal = String(editing.meal_plan ?? "").toLowerCase();
    if (meal.includes("café") || meal.includes("cafe") || meal.includes("meia pensão") || meal.includes("pensão completa") || meal.includes("all inclusive")) {
      list.push("Café da Manhã");
    }
    const checked = !!(editing.outbound_flight?.checked_bag || editing.return_flight?.checked_bag);
    if (checked) list.push("Bagagem Despachada");
    return list;
  }, [editing.outbound_flight, editing.return_flight, editing.hotel_name, editing.tripadvisor_location_id, editing.meal_plan]);

  useEffect(() => {
    if (derivedIncludes.length === 0) return;
    const current = Array.isArray(editing.includes)
      ? editing.includes
      : typeof editing.includes === "string"
        ? (editing.includes as string).split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
    // Auto-preenche apenas se estiver vazio OU se contiver só itens do conjunto auto anterior.
    const autoRe = /^(passagem\s+a[eé]rea(\s+de\s+ida(\s+e\s+volta)?)?|a[eé]reo|hospedagem|caf[eé]\s+da\s+manh[aã]|bagagem\s+despachada)$/i;
    const isAutoOnly = current.every((s) => autoRe.test(s.trim()));
    if (current.length === 0 || isAutoOnly) {
      const same = current.length === derivedIncludes.length && current.every((v, i) => v === derivedIncludes[i]);
      if (!same) setEditing({ ...editing, includes: derivedIncludes });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedIncludes.join("|")]);

  function applyAuto() {
    const d = deriveFromFlights(editing);
    setEditing({
      ...editing,
      title: d.title ?? editing.title,
      slug: d.slug ?? editing.slug,
      destination: d.destCity ?? editing.destination,
      origin: d.originCity ?? editing.origin,
    });
    toast.success("Campos preenchidos a partir dos aéreos");
  }

  async function handleGenerateSummary() {
    const brief = (editing.summary ?? "").trim();
    const dest = (editing.destination ?? "").trim();
    // Se o usuário não digitou briefing, usa o destino direto com estrutura padrão.
    const finalBrief = brief.length >= 2
      ? brief
      : dest.length >= 2
        ? `Escreva um resumo de ${dest} para pacote de viagens, para vender pacote de viagens`
        : "";
    if (!finalBrief) {
      toast.error("Digite o destino ou escreva um resumo primeiro");
      return;
    }
    setAiLoading(true);
    try {
      const { text } = await genSummary({ data: { brief: finalBrief } });
      setEditing({ ...editing, summary: text });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar resumo");
    } finally {
      setAiLoading(false);
    }
  }

  // Auto-gerar resumo assim que houver destino e o resumo estiver vazio.
  const autoSummaryDoneRef = (function useAutoSummaryRef() {
    // usa useMemo pra manter uma ref estável entre renders sem importar useRef aqui.
    const box = useMemo(() => ({ destKey: "" as string }), []);
    return box;
  })();
  useEffect(() => {
    const dest = (editing.destination ?? "").trim();
    const summary = (editing.summary ?? "").trim();
    if (!dest || summary || aiLoading) return;
    if (autoSummaryDoneRef.destKey === dest) return;
    autoSummaryDoneRef.destKey = dest;
    const t = setTimeout(() => {
      if ((editing.summary ?? "").trim()) return;
      void (async () => {
        setAiLoading(true);
        try {
          const { text } = await genSummary({
            data: { brief: `Escreva um resumo de ${dest} para pacote de viagens, para vender pacote de viagens` },
          });
          setEditing({ ...editing, summary: text });
        } catch {
          /* silencioso — botão manual ainda funciona */
        } finally {
          setAiLoading(false);
        }
      })();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.destination]);

  async function handleSearchImages(nextPage = 1) {
    const q = imgQuery.trim() || editing.destination?.trim() || "";
    if (q.length < 2) {
      toast.error("Digite o que buscar (ex.: 'Aracaju praia')");
      return;
    }
    setImgLoading(true);
    try {
      const res: any = await searchImages({ data: { query: q, page: nextPage } });
      const newImgs = res.images ?? [];
      setImgResults((prev) => (nextPage === 1 ? newImgs : [...prev, ...newImgs]));
      setImgPage(nextPage);
      setImgHasMore(!!res.hasMore);
      setImgSource(res.sourceLabel ?? "");
      if (nextPage === 1 && newImgs.length === 0) toast("Nenhuma imagem encontrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na busca");
    } finally {
      setImgLoading(false);
    }
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "dates", label: "DATAS E PREÇOS", icon: <CalendarRange className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "hotel", label: "HOSPEDAGEM", icon: <Building2 className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "flights", label: "AÉREOS", icon: <Plane className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "extras", label: "EXTRAS E INCLUSOS", icon: <ListChecks className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "about", label: "SOBRE O PACOTE", icon: <Info className="h-4 w-4" strokeWidth={1.75} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[90vh] rounded-2xl bg-card/70 backdrop-blur-2xl border border-border shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 sm:px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-brand-orange rounded-full" />
            <h2 className="text-xl sm:text-2xl font-display font-bold">
              {editing.id ? "Editar pacote" : "Novo pacote"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <PackageImportButton
              onImported={(patch: Partial<PackageRow>) =>
                setEditing({ ...(editing ?? {}), ...patch })
              }
            />
            <button
              onClick={() => setEditing(null)}
              aria-label="Fechar"
              className="rounded-lg p-2 hover:bg-muted transition text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
          {/* Sidebar */}
          <aside className="w-full sm:w-64 bg-muted/20 border-b sm:border-b-0 sm:border-r border-border p-3 sm:p-4 flex sm:flex-col gap-1 shrink-0 overflow-x-auto sm:overflow-x-visible">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap transition-all ${
                    active
                      ? "bg-brand-orange/10 text-brand-orange border border-brand-orange/30 shadow-[0_0_0_1px_rgba(242,107,31,0.08)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                  }`}
                >
                  <span className={active ? "text-brand-orange" : "opacity-70"}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </aside>

          {/* Content */}
          <main className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">
            {tab === "about" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-brand-orange/25 bg-brand-orange/5 px-4 py-3">
                  <div className="text-xs text-muted-foreground">
                    Título, slug, destino e origem são preenchidos automaticamente a partir dos aéreos. Você pode editar se quiser.
                  </div>
                  <button
                    type="button"
                    onClick={applyAuto}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20 transition whitespace-nowrap"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Regenerar
                  </button>
                </div>

                <FormField label="Título (auto)" wide>
                  <input
                    className={inp}
                    value={editing.title ?? ""}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder={derived.title ?? "Ex: Aracaju - Saída de São Paulo"}
                  />
                </FormField>
                <FormField label="Slug (URL, auto)">
                  <input
                    className={inp}
                    value={editing.slug ?? ""}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    placeholder={derived.slug ?? "aracaju-abril-2027"}
                  />
                </FormField>
                <FormField label="Ordem de exibição">
                  <input
                    type="number"
                    className={inp}
                    value={editing.sort_order ?? 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Destino (auto)">
                  <input
                    className={inp}
                    value={editing.destination ?? ""}
                    onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
                    placeholder={derived.destCity ?? ""}
                  />
                </FormField>
                <FormField label="Origem (auto)">
                  <input
                    className={inp}
                    value={editing.origin ?? ""}
                    onChange={(e) => setEditing({ ...editing, origin: e.target.value })}
                    placeholder={derived.originCity ?? ""}
                  />
                </FormField>

                {/* Cover image with picker */}
                <div className="sm:col-span-2">
                  <div className="flex items-end gap-2">
                    <FormField label="URL da imagem de capa" wide>
                      <input
                        className={inp}
                        value={editing.image_url ?? ""}
                        onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                        placeholder="https://… ou use o buscador ao lado"
                      />
                    </FormField>
                    <button
                      type="button"
                      onClick={() => {
                        setImgOpen((v) => !v);
                        if (!imgQuery) setImgQuery(editing.destination ?? "");
                      }}
                      className="mb-0 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20 transition"
                    >
                      <ImageIcon className="h-4 w-4" /> Buscar imagens
                    </button>
                  </div>

                  {editing.image_url && (
                    <div className="mt-2 relative w-full h-32 rounded-xl overflow-hidden border border-border bg-muted/20">
                      <img src={editing.image_url} alt="capa" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {imgOpen && (
                    <div className="mt-3 rounded-xl border border-border bg-muted/10 p-3">
                      <div className="flex gap-2">
                        <input
                          className={inp}
                          value={imgQuery}
                          onChange={(e) => setImgQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSearchImages();
                            }
                          }}
                          placeholder="Ex.: Aracaju praia, Fernando de Noronha, Jalapão…"
                        />
                        <button
                          type="button"
                          onClick={() => handleSearchImages(1)}
                          disabled={imgLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-orange px-3 py-2 text-xs font-semibold text-white hover:bg-[#ff7b30] transition disabled:opacity-60 whitespace-nowrap"
                        >
                          {imgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          Buscar
                        </button>
                      </div>
                      {imgResults.length > 0 && (
                        <>
                          <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-96 overflow-y-auto pr-1">
                            {imgResults.map((r, idx) => (
                              <button
                                key={`${r.url}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setEditing({ ...editing, image_url: r.url });
                                  setImgOpen(false);
                                  toast.success("Imagem selecionada");
                                }}
                                className={`group relative aspect-video rounded-lg overflow-hidden border transition ${
                                  editing.image_url === r.url
                                    ? "border-brand-orange ring-2 ring-brand-orange/40"
                                    : "border-border hover:border-brand-orange/60"
                                }`}
                                title={`${r.title}${r.author ? " — " + r.author : ""}`}
                              >
                                <img src={r.thumb || r.url} alt={r.title} loading="lazy" className="w-full h-full object-cover" />
                                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/90">
                                  {r.source === "Pexels" ? "PX" : r.source === "Unsplash" ? "UN" : r.source === "Openverse" ? "OV" : "WC"}
                                </span>
                              </button>
                            ))}
                          </div>
                          {imgHasMore && (
                            <div className="mt-3 flex justify-center">
                              <button
                                type="button"
                                onClick={() => handleSearchImages(imgPage + 1)}
                                disabled={imgLoading}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20 transition disabled:opacity-60"
                              >
                                {imgLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                Carregar mais fotos
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        {imgSource || "Wikimedia Commons + Openverse"} — sempre confira licença e autoria.
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary with AI */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs text-muted-foreground">
                      Resumo curto — gerado automaticamente a partir do destino. Escreva algo específico e clique em Regerar para personalizar.
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateSummary}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-2.5 py-1 text-[11px] font-semibold text-brand-orange hover:bg-brand-orange/20 transition disabled:opacity-60"
                    >
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Gerar com IA
                    </button>
                  </div>
                  <textarea
                    className={`${inp} min-h-[110px]`}
                    value={editing.summary ?? ""}
                    onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                    placeholder='Ex.: "falar sobre Aracaju" — depois clique em Gerar com IA'
                  />
                </div>

                <FormField label="Fornecedor (interno)" wide>
                  <input
                    className={inp}
                    value={editing.supplier_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, supplier_name: e.target.value })}
                    placeholder="Ex: CVC, Nascimento, Flytour…"
                  />
                </FormField>
                <div className="sm:col-span-2 rounded-xl border border-border bg-muted/20 p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Ativo no site</div>
                    <div className="text-xs text-muted-foreground">Se desativado, não aparece na listagem pública.</div>
                  </div>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editing.is_active ?? true}
                      onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                    />
                    <span className="text-sm">Mostrar</span>
                  </label>
                </div>
              </div>
            )}

            {tab === "dates" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Data ida">
                  <input
                    type="date"
                    className={inp}
                    value={editing.going_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, going_date: e.target.value })}
                  />
                </FormField>
                <FormField label="Data volta">
                  <input
                    type="date"
                    className={inp}
                    value={editing.return_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, return_date: e.target.value })}
                  />
                </FormField>
                <FormField label="Noites">
                  <input
                    type="number"
                    className={inp}
                    value={editing.nights ?? 0}
                    onChange={(e) => setEditing({ ...editing, nights: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Ocupação base (adultos)">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className={inp}
                    value={editing.base_occupancy ?? 2}
                    onChange={(e) => setEditing({ ...editing, base_occupancy: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Preço por pessoa *">
                  <input
                    type="number"
                    step="0.01"
                    className={inp}
                    value={editing.price_per_person ?? 0}
                    onChange={(e) => setEditing({ ...editing, price_per_person: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Valor das taxas inclusas (informativo)">
                  <input
                    type="number"
                    step="0.01"
                    className={inp}
                    value={editing.taxes ?? 0}
                    onChange={(e) => setEditing({ ...editing, taxes: Number(e.target.value) })}
                  />
                </FormField>
              </div>
            )}

            {tab === "hotel" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Hotel" wide>
                  <HotelAutocomplete
                    value={editing.hotel_name ?? ""}
                    initialMode={editing.tripadvisor_location_id ? "live" : (editing.hotel_name ? "manual" : null)}
                    onChangeText={(v) => setEditing({ ...editing, hotel_name: v })}
                    onSelect={(h) => {
                      const automaticStars = h.rating != null
                        ? Math.min(5, Math.max(1, Math.round(h.rating)))
                        : h.hotel_class != null
                          ? Math.min(5, Math.max(1, Math.round(h.hotel_class)))
                          : 3;
                      setEditing({
                        ...editing,
                        hotel_name: h.name,
                        hotel_stars: automaticStars,
                        image_url: (editing.image_url && editing.image_url.length > 0) ? editing.image_url : (h.photos[0] ?? editing.image_url ?? ""),
                        tripadvisor_location_id: String(h.location_id),
                        tripadvisor_url: h.tripadvisor_url ?? null,
                        tripadvisor_address: h.address ?? null,
                        tripadvisor_photos: (h.photos && h.photos.length > 0) ? h.photos : null,
                      });
                    }}
                  />
                </FormField>
                <FormField label="Estrelas (1-5)">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className={inp}
                    value={editing.hotel_stars ?? 3}
                    onChange={(e) => setEditing({ ...editing, hotel_stars: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Regime de alimentação">
                  <select
                    className={inp}
                    value={editing.meal_plan ?? ""}
                    onChange={(e) => setEditing({ ...editing, meal_plan: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    <option value="Sem refeição">Sem refeição</option>
                    <option value="Café da manhã">Café da manhã</option>
                    <option value="Meia pensão">Meia pensão (café + 1 refeição)</option>
                    <option value="Pensão completa">Pensão completa (café + almoço + jantar)</option>
                    <option value="All inclusive">All inclusive</option>
                  </select>
                </FormField>
                <FormField label="Tipo de quarto">
                  <select
                    className={inp}
                    value={editing.room_type ?? ""}
                    onChange={(e) => setEditing({ ...editing, room_type: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    <option value="Standard">Standard</option>
                    <option value="Superior">Superior</option>
                    <option value="Luxo">Luxo</option>
                    <option value="Suíte">Suíte</option>
                    <option value="Suíte Master">Suíte Master</option>
                    <option value="Suíte Presidencial">Suíte Presidencial</option>
                    <option value="Bangalô">Bangalô</option>
                    <option value="Chalé">Chalé</option>
                  </select>
                </FormField>
                <FormField label="Categoria / vista">
                  <select
                    className={inp}
                    value={editing.room_category ?? ""}
                    onChange={(e) => setEditing({ ...editing, room_category: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    <option value="Vista interna">Vista interna</option>
                    <option value="Vista cidade">Vista cidade</option>
                    <option value="Vista jardim">Vista jardim</option>
                    <option value="Vista piscina">Vista piscina</option>
                    <option value="Vista parcial mar">Vista parcial mar</option>
                    <option value="Vista mar">Vista mar</option>
                    <option value="Frente mar">Frente mar</option>
                    <option value="Vista montanha">Vista montanha</option>
                  </select>
                </FormField>
                <FormField label="Tipo de cama">
                  <select
                    className={inp}
                    value={editing.bed_type ?? ""}
                    onChange={(e) => setEditing({ ...editing, bed_type: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    <option value="1 cama de casal">1 cama de casal</option>
                    <option value="1 cama king">1 cama king</option>
                    <option value="1 cama queen">1 cama queen</option>
                    <option value="2 camas de solteiro">2 camas de solteiro</option>
                    <option value="1 casal + 1 solteiro">1 casal + 1 solteiro</option>
                    <option value="1 casal + 2 solteiros">1 casal + 2 solteiros</option>
                    <option value="3 camas de solteiro">3 camas de solteiro</option>
                    <option value="Cama de casal + sofá-cama">Cama de casal + sofá-cama</option>
                  </select>
                </FormField>
              </div>
            )}

            {tab === "flights" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border/70 bg-muted/30">
                    {([
                      { id: "outbound", label: "Voo de ida", filled: !!editing.outbound_flight },
                      { id: "return", label: "Voo de volta", filled: !!editing.return_flight },
                    ] as const).map((t) => {
                      const active = flightLeg === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setFlightLeg(t.id)}
                          className={`px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-[0.18em] transition inline-flex items-center gap-2 ${
                            active
                              ? "bg-brand-orange text-white shadow-[0_2px_10px_rgba(242,107,31,0.35)]"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t.label}
                          {t.filled && (
                            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-brand-orange"}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <FlightImportButton
                    leg={flightLeg}
                    onImported={(flight) =>
                      setEditing(
                        flightLeg === "outbound"
                          ? { ...editing, outbound_flight: flight }
                          : { ...editing, return_flight: flight },
                      )
                    }
                  />
                </div>

                {flightLeg === "outbound" ? (
                  <FlightFieldset
                    title="Voo de ida"
                    value={editing.outbound_flight ?? null}
                    onChange={(f) => setEditing({ ...editing, outbound_flight: f })}
                  />
                ) : (
                  <FlightFieldset
                    title="Voo de volta"
                    value={editing.return_flight ?? null}
                    onChange={(f) => setEditing({ ...editing, return_flight: f })}
                  />
                )}
              </div>
            )}

            {tab === "extras" && (
              <div className="grid grid-cols-1 gap-3">
                <FormField label="Roteiro (uma linha por dia)" wide>
                  <textarea
                    className={`${inp} min-h-[140px]`}
                    value={editing.itinerary ?? ""}
                    onChange={(e) => setEditing({ ...editing, itinerary: e.target.value })}
                  />
                </FormField>
                <FormField label="O que inclui (um por linha)" wide>
                  <textarea
                    className={`${inp} min-h-[140px]`}
                    value={
                      Array.isArray(editing.includes)
                        ? editing.includes.join("\n")
                        : ((editing.includes as unknown as string) ?? "")
                    }
                    onChange={(e) => setEditing({ ...editing, includes: e.target.value as unknown as string[] })}
                  />
                </FormField>
              </div>
            )}
          </main>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 sm:px-8 py-4 shrink-0">
          <p className="text-xs text-muted-foreground hidden sm:block">* Campos obrigatórios</p>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setEditing(null)}
              className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar pacote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


const inp =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function FormField({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function cleanFlight(f: FlightInfo | null | undefined): FlightInfo | null {
  if (!f) return null;
  const segments = getCleanSegments(f);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const duration = formatMinutes(diffMinutes(first?.depart_at, last?.arrive_at)) || f.duration;
  const normalized: FlightInfo = {
    ...f,
    airline: f.airline || first?.airline,
    flight_number: f.flight_number || first?.flight_number,
    from_iata: first?.from_iata ?? f.from_iata,
    from_city: first?.from_city ?? f.from_city,
    to_iata: last?.to_iata ?? f.to_iata,
    to_city: last?.to_city ?? f.to_city,
    depart_at: first?.depart_at ?? f.depart_at,
    arrive_at: last?.arrive_at ?? f.arrive_at,
    duration,
    stops: Math.max(0, segments.length - 1),
    segments,
  };
  const entries = Object.entries(normalized).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== "" && v !== null && v !== undefined;
  });
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as FlightInfo;
}

function getCleanSegments(f: FlightInfo): FlightSegment[] {
  const filledSegments = (f.segments ?? []).map(cleanSegment).filter(hasSegmentData);
  if (filledSegments.length > 0) return filledSegments;

  const fallbackSegment = cleanSegment({
    airline: f.airline,
    flight_number: f.flight_number,
    from_iata: f.from_iata,
    from_city: f.from_city,
    to_iata: f.to_iata,
    to_city: f.to_city,
    depart_at: f.depart_at,
    arrive_at: f.arrive_at,
    duration: f.duration,
  });

  return hasSegmentData(fallbackSegment) ? [fallbackSegment] : [];
}

function cleanSegment(segment: FlightSegment): FlightSegment {
  return Object.fromEntries(
    Object.entries(segment).filter(([, v]) => v !== "" && v !== null && v !== undefined),
  ) as FlightSegment;
}

function hasSegmentData(segment: FlightSegment): boolean {
  return Object.values(segment).some((value) => value !== "" && value !== null && value !== undefined);
}

function FlightFieldset({
  title,
  value,
  onChange,
}: {
  title: string;
  value: FlightInfo | null;
  onChange: (f: FlightInfo | null) => void;
}) {
  const f = value ?? {};
  const segments: FlightSegment[] = getEditorSegments(f);
  const patch = (p: Partial<FlightInfo>) => onChange({ ...f, ...p });
  const patchSeg = (i: number, p: Partial<FlightSegment>) =>
    patch({ segments: segments.map((s, idx) => (idx === i ? { ...s, ...p } : s)) });
  const addSeg = () => patch({ segments: [...segments, {}] });
  const removeSeg = (i: number) =>
    patch({ segments: segments.filter((_, idx) => idx !== i) });

  const first = segments[0];
  const last = segments[segments.length - 1];
  const totalMin = diffMinutes(first?.depart_at, last?.arrive_at);
  const stopsCount = Math.max(0, segments.length - 1);

  return (
    <div className="sm:col-span-2 rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Informações comuns da jornada */}
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Companhia aérea (padrão)">
          <AirlineCombobox
            value={f.airline ?? ""}
            onChange={(name) => {
              const a = findAirline(name);
              patch({
                airline: name,
                // Logo do registro é resolvida automaticamente no voucher; só limpa
                // o campo manual se a nova cia estiver no registro.
                airline_logo_url: a ? "" : f.airline_logo_url,
              });
            }}
          />
        </FormField>
        {f.airline && !findAirline(f.airline) ? (
          <FormField label="Logo da companhia (URL)">
            <input
              className={inp}
              value={f.airline_logo_url ?? ""}
              onChange={(e) => patch({ airline_logo_url: e.target.value })}
              placeholder="https://…logo.png"
            />
          </FormField>
        ) : null}
        <FormField label="Classe (cabine)">
          <ClassSelect
            value={f.cabin_class ?? ""}
            onChange={(v) => patch({ cabin_class: v })}
            options={CABIN_CLASSES}
          />
        </FormField>
        <FormField label="Classe tarifária">
          <ClassSelect
            value={f.fare_class ?? ""}
            onChange={(v) => patch({ fare_class: v })}
            options={fareClassesFor(findAirline(f.airline)?.iata)}
          />
        </FormField>
        <FormField label="Bagagens inclusas">
          <div className="flex flex-wrap gap-4 text-sm pt-1.5">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!f.personal_item}
                onChange={(e) => patch({ personal_item: e.target.checked })}
              />
              Item pessoal
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!f.carry_on}
                onChange={(e) => patch({ carry_on: e.target.checked })}
              />
              Bagagem de mão
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!f.checked_bag}
                onChange={(e) => patch({ checked_bag: e.target.checked })}
              />
              Bagagem despachada
            </label>
          </div>
        </FormField>
      </div>

      {/* Resumo automático */}
      <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span className="text-muted-foreground">Rota: </span>
          <strong>{first?.from_iata || "—"} → {last?.to_iata || "—"}</strong>
        </span>
        <span>
          <span className="text-muted-foreground">Conexões: </span>
          <strong>{stopsCount === 0 ? "Direto" : `${stopsCount} conexão${stopsCount > 1 ? "es" : ""}`}</strong>
        </span>
        <span>
          <span className="text-muted-foreground">Tempo total: </span>
          <strong>{formatMinutes(totalMin) || "—"}</strong>
        </span>
        <span className="text-muted-foreground italic">
          (calculado automaticamente a partir dos trechos)
        </span>
      </div>

      {/* Trechos */}
      <div className="space-y-3">
        {segments.map((s, i) => {
          const nextDepart = segments[i + 1]?.depart_at;
          const layoverMin = i < segments.length - 1 ? diffMinutes(s.arrive_at, nextDepart) : null;
          const segMin = diffMinutes(s.depart_at, s.arrive_at);
          return (
            <div key={i}>
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-orange uppercase tracking-widest">
                    {i === 0 && segments.length === 1
                      ? "Voo direto"
                      : i === 0
                      ? "Trecho 1"
                      : `Trecho ${i + 1} (conexão)`}
                    {segMin != null && (
                      <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
                        · {formatMinutes(segMin)}
                      </span>
                    )}
                  </span>
                  {segments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSeg(i)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remover trecho
                    </button>
                  )}
                </div>
                <div className="flex justify-end">
                  <FlightLookupButton
                    airline={s.airline}
                    flightNumber={s.flight_number}
                    departAt={s.depart_at}
                    onApply={(r) => patchSeg(i, {
                      ...(r.airline ? { airline: r.airline } : {}),
                      ...(r.flightNumber ? { flight_number: r.flightNumber } : {}),
                      ...(r.fromIata ? { from_iata: r.fromIata } : {}),
                      ...(r.fromCity ? { from_city: r.fromCity } : {}),
                      ...(r.toIata ? { to_iata: r.toIata } : {}),
                      ...(r.toCity ? { to_city: r.toCity } : {}),
                      ...(r.departAtLocal ? { depart_at: r.departAtLocal } : {}),
                      ...(r.arriveAtLocal ? { arrive_at: r.arriveAtLocal } : {}),
                    })}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <AirlineCombobox
                    value={s.airline ?? ""}
                    onChange={(name) => {
                      const a = findAirline(name);
                      const curr = String(s.flight_number ?? "").trim();
                      let nextNo = curr;
                      if (curr) {
                        const upper = curr.toUpperCase();
                        const m = /^\d+$/.test(upper)
                          ? null
                          : upper.match(/^(?=[A-Z0-9]{2,3}\s)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,3}\s*(.+)$/);
                        const suffix = m && /\d/.test(m[1]) ? m[1].trim() : curr.toUpperCase();
                        nextNo = a ? `${a.iata} ${suffix}` : suffix;
                      }
                      patchSeg(i, { airline: name, flight_number: nextNo });
                    }}
                    placeholder="Companhia (opcional, se diferente)"
                  />
                  <FlightNumberInput
                    airline={s.airline}
                    value={s.flight_number}
                    onChange={(v) => patchSeg(i, { flight_number: v })}
                  />

                  <input
                    className={inp}
                    value={s.from_iata ?? ""}
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase();
                      const city = iataCity(code);
                      patchSeg(i, {
                        from_iata: code,
                        ...(city ? { from_city: city } : {}),
                      });
                    }}
                    placeholder="Origem (IATA) — ex.: SDU"
                    maxLength={4}
                  />
                  <input
                    className={inp}
                    value={s.from_city ?? ""}
                    onChange={(e) => patchSeg(i, { from_city: e.target.value })}
                    placeholder="Cidade origem — ex.: Rio de Janeiro"
                  />
                  <input
                    className={inp}
                    value={s.to_iata ?? ""}
                    onChange={(e) => {
                      const code = e.target.value.toUpperCase();
                      const city = iataCity(code);
                      patchSeg(i, {
                        to_iata: code,
                        ...(city ? { to_city: city } : {}),
                      });
                    }}
                    placeholder="Destino (IATA) — ex.: GRU"
                    maxLength={4}
                  />
                  <input
                    className={inp}
                    value={s.to_city ?? ""}
                    onChange={(e) => patchSeg(i, { to_city: e.target.value })}
                    placeholder="Cidade destino — ex.: São Paulo"
                  />
                  <FormField label="Partida (data e hora)">
                    <input
                      type="datetime-local"
                      className={inp}
                      value={s.depart_at ?? ""}
                      onChange={(e) => patchSeg(i, { depart_at: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Chegada (data e hora)">
                    <input
                      type="datetime-local"
                      className={inp}
                      value={s.arrive_at ?? ""}
                      onChange={(e) => patchSeg(i, { arrive_at: e.target.value })}
                    />
                  </FormField>
                </div>
              </div>
              {i < segments.length - 1 && (
                <div className="my-2 pl-4 text-xs text-muted-foreground flex items-center gap-2">
                  <span>⏱</span>
                  <span>
                    Conexão em <strong className="text-foreground">{s.to_iata || "—"}</strong>:{" "}
                    <strong className="text-foreground">
                      {formatMinutes(layoverMin) || "—"}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addSeg}
          className="w-full rounded-lg border border-dashed border-brand-orange/40 text-brand-orange text-sm py-2 hover:bg-brand-orange/10 transition"
        >
          + Adicionar conexão
        </button>
      </div>
    </div>
  );
}

function getEditorSegments(f: FlightInfo): FlightSegment[] {
  const filledSegments = f.segments && f.segments.length > 0 ? f.segments : [];
  if (filledSegments.length > 0) return filledSegments;

  const fallbackSegment: FlightSegment = {
    airline: f.airline,
    flight_number: f.flight_number,
    from_iata: f.from_iata,
    from_city: f.from_city,
    to_iata: f.to_iata,
    to_city: f.to_city,
    depart_at: f.depart_at,
    arrive_at: f.arrive_at,
    duration: f.duration,
  };

  return hasSegmentData(fallbackSegment) ? [fallbackSegment] : [{}];
}

function diffMinutes(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb) || tb <= ta) return null;
  return Math.round((tb - ta) / 60000);
}

function formatMinutes(m: number | null): string {
  if (m == null) return "";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}min`;
}

function FlightImportButton({
  leg,
  onImported,
}: {
  leg: "outbound" | "return";
  onImported: (flight: FlightInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const extract = useServerFn(extractFlightFromImage);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (PNG, JPG)");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      setPreview(`data:${file.type};base64,${base64}`);
      const { flight } = await extract({
        data: { image_base64: base64, mime_type: file.type },
      });
      const normalized: FlightInfo = {
        ...flight,
        segments: Array.isArray(flight?.segments) ? flight.segments : [],
      };
      onImported(normalized);
      toast.success(`Voo de ${leg === "outbound" ? "ida" : "volta"} importado!`);
      setOpen(false);
      setPreview(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao ler o print");
    } finally {
      setBusy(false);
    }
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) await handleFile(file);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-orange hover:bg-brand-orange/20 transition"
      >
        <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} />
        Importar do print
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onPaste={handlePaste}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">
                  Importar voo de {leg === "outbound" ? "ida" : "volta"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Cole (Ctrl/⌘ + V) ou envie o print. A IA extrai horários, conexões e bagagem.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted"
                disabled={busy}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {preview && (
              <div className="mb-4 rounded-lg overflow-hidden border border-border/70 bg-muted/30">
                <img src={preview} alt="Prévia" className="w-full max-h-48 object-contain" />
              </div>
            )}

            <label
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!busy) setDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!busy) setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
                if (busy) return;
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition ${
                busy
                  ? "border-brand-orange/40 bg-brand-orange/5"
                  : dragging
                    ? "border-brand-orange bg-brand-orange/10 scale-[1.01]"
                    : "border-border hover:border-brand-orange/60 hover:bg-brand-orange/5"
              }`}
            >
              {busy ? (
                <>
                  <Loader2 className="h-6 w-6 text-brand-orange animate-spin" />
                  <span className="text-sm font-medium">Lendo o print com IA…</span>
                </>
              ) : (
                <>
                  <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium">
                    {dragging ? "Solte a imagem aqui" : "Arraste, clique para enviar ou cole (⌘V)"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">PNG, JPG · até ~10 MB</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>

          </div>
        </div>
      )}
    </>
  );
}

function PackageImportButton({
  onImported,
}: {
  onImported: (patch: Partial<PackageRow>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const extract = useServerFn(extractPackageFromDocument);
  const searchHotels = useServerFn(searchTripAdvisorHotels);
  const hotelDetails = useServerFn(getTripAdvisorHotelDetails);

  async function handleFile(file: File) {
    const ok = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!ok) {
      toast.error("Envie um PDF ou uma imagem (PNG/JPG)");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 15 MB)");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64 = btoa(binary);
      const { pkg } = await extract({
        data: {
          file_base64: base64,
          mime_type: file.type || "application/pdf",
          filename: file.name || "orcamento.pdf",
        },
      });
      if (!pkg || typeof pkg !== "object") throw new Error("Documento sem dados reconhecíveis");

      // Normalizar payload em Partial<PackageRow>
      const patch: Partial<PackageRow> = {};
      const p: any = pkg;
      if (p.destination) patch.destination = String(p.destination);
      if (p.origin) patch.origin = String(p.origin);
      if (p.going_date) patch.going_date = String(p.going_date);
      if (p.return_date) patch.return_date = String(p.return_date);
      if (p.nights != null) patch.nights = Number(p.nights) || 0;
      if (p.base_occupancy != null) patch.base_occupancy = Number(p.base_occupancy) || 2;
      if (p.price_per_person != null) patch.price_per_person = Number(p.price_per_person) || 0;
      if (p.taxes != null) patch.taxes = Number(p.taxes) || 0;
      if (p.hotel_name) patch.hotel_name = String(p.hotel_name);
      if (p.hotel_stars != null) {
        const n = Math.round(Number(p.hotel_stars));
        if (Number.isFinite(n)) patch.hotel_stars = Math.max(1, Math.min(5, n));
      }
      if (p.meal_plan) patch.meal_plan = String(p.meal_plan);
      if (p.room_type) patch.room_type = String(p.room_type);
      if (p.room_category) patch.room_category = String(p.room_category);
      if (p.bed_type) patch.bed_type = String(p.bed_type);
      // Não usar includes do documento — a derivação automática monta na ordem correta
      // (Passagem Aérea → Hospedagem → Café da Manhã → Bagagem Despachada).
      patch.includes = [];
      if (p.supplier_name) patch.supplier_name = String(p.supplier_name);
      if (p.outbound_flight && typeof p.outbound_flight === "object") {
        patch.outbound_flight = {
          ...p.outbound_flight,
          segments: Array.isArray(p.outbound_flight.segments) ? p.outbound_flight.segments : [],
        };
      }
      if (p.return_flight && typeof p.return_flight === "object") {
        patch.return_flight = {
          ...p.return_flight,
          segments: Array.isArray(p.return_flight.segments) ? p.return_flight.segments : [],
        };
      }

      // Tenta enriquecer o hotel automaticamente com dados do TripAdvisor.
      if (patch.hotel_name) {
        try {
          const city = patch.destination ?? "";
          const q = city ? `${patch.hotel_name} ${city}` : patch.hotel_name;
          const results = await searchHotels({ data: { query: q } });
          const best = results?.[0];
          if (best) {
            const full = await hotelDetails({ data: { locationId: best.location_id, photoLimit: 5 } });
            const rating = full.rating ?? best.rating ?? null;
            const cls = full.hotel_class ?? null;
            const stars = rating != null
              ? Math.min(5, Math.max(1, Math.round(rating)))
              : cls != null
                ? Math.min(5, Math.max(1, Math.round(cls)))
                : patch.hotel_stars ?? 3;
            patch.hotel_name = full.name || best.name || patch.hotel_name;
            patch.hotel_stars = stars;
            patch.tripadvisor_location_id = String(best.location_id);
            patch.tripadvisor_url = full.tripadvisor_url ?? best.tripadvisor_url ?? null;
            patch.tripadvisor_address = full.address ?? best.address ?? null;
            const photos = (full.photos && full.photos.length > 0) ? full.photos : null;
            if (photos) patch.tripadvisor_photos = photos;
          }
        } catch (err) {
          console.warn("[import] falha ao enriquecer hotel via TripAdvisor", err);
        }
      }

      onImported(patch);
      toast.success("Pacote importado! Confira os campos e complete o que faltar.");
      setOpen(false);
      setFileName(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao ler o documento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const f = e.dataTransfer.files?.[0];
          if (f) {
            setOpen(true);
            void handleFile(f);
          }
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-orange hover:bg-brand-orange/20 transition"
      >
        <FileUp className="h-3.5 w-3.5" strokeWidth={2} />
        Importar
      </button>


      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Importar pacote de um documento</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Envie um PDF de orçamento / voucher ou uma imagem. A IA extrai destino, datas, hotel, refeição, valores e voos (ida + volta com conexões).
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted"
                disabled={busy}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!busy) setDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!busy) setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition ${
                dragging
                  ? "border-brand-orange bg-brand-orange/10"
                  : "border-border hover:border-brand-orange/60 hover:bg-muted/40"
              } ${busy ? "opacity-60 pointer-events-none" : ""}`}
            >
              {busy ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
                  <span className="text-sm font-medium">Lendo {fileName ?? "documento"}…</span>
                  <span className="text-[11px] text-muted-foreground">Pode levar alguns segundos</span>
                </>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-brand-orange" />
                  <span className="text-sm font-semibold">Solte o arquivo aqui ou clique para escolher</span>
                  <span className="text-[11px] text-muted-foreground">PDF, PNG ou JPG · até 15 MB</span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
          </div>
        </div>
      )}
    </>
  );
}



