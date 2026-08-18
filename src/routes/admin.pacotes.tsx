import { createFileRoute, Link } from "@tanstack/react-router";
import { CruiseDetailsEditor } from "@/components/admin/CruiseDetailsEditor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listCruises } from "@/lib/cruises/admin.functions";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  EyeOff,
  Loader2,
  X,
  Info,
  CalendarRange,
  Building2,
  Plane,
  ListChecks,
  Sparkles,
  Image as ImageIcon,
  Search,
  Wand2,
  Link as LinkIcon,
  Download,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Ticket,
  Ship,
  Package as PackageIcon,
  MapPin,
  type LucideIcon,
} from "lucide-react";

import { TourDatesEditor } from "@/components/packages/TourDatesEditor";
import { TourInfoEditor } from "@/components/packages/TourInfoEditor";
import { SupplierInput } from "@/components/packages/SupplierInput";
import { TourImportWizard } from "@/components/packages/TourImportWizard";
import { type BulkImportedTourDraft } from "@/components/packages/TourBulkImporter";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
import {
  generatePackageSummary,
  searchCoverImages,
  extractFlightFromImage,
  extractPackageFromDocument,
  extractMultiplePackagesFromDocument,
} from "@/lib/packages/ai.functions";
import { normalizeFlightBaggage } from "@/lib/packages/flight-baggage";
import { classifyMealPlan, mealPlanLabel, detectMealPlanMismatch } from "@/lib/packages/meal-plan";
import { searchTripAdvisorHotels, getTripAdvisorHotelDetails } from "@/lib/tripadvisor.functions";
import { persistPackageHotelPhotos } from "@/lib/package-hotel-photos.functions";
import {
  FileUp,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles as SparklesIcon,
  List as ListIcon,
  Bell,
  RefreshCw,
} from "lucide-react";
import { useIgnoredHotels } from "@/lib/ignored-hotels";

import { CurationTab } from "@/components/packages/CurationTab";
import { CativaTab, CativaCountBadge } from "@/components/packages/CativaTab";
import { arquivarPacotesCativa } from "@/lib/cativa/cativa.functions";
import { HotelOptionsPanel } from "@/components/packages/HotelOptionsPanel";
import { HotelStaysList, normalizeStays } from "@/components/packages/HotelStaysList";
import { gerarRoteiro, nomeCurtoServico as nomeItem } from "@/lib/packages/itinerary";

import {
  PackageSocialDialog,
  WhatsAppIcon,
  InstagramIcon,
} from "@/components/packages/PackageSocialDialog";
import { confirm } from "@/lib/confirm";
import { dedupeOrigins, originKey } from "@/lib/packages/origin";
import { buildPackagesCsv, downloadCsv, type ExportDatePrice } from "@/lib/packages/export-csv";
import { cleanRoomLabel } from "@/lib/packages/room";
import type { PackageServices, SeguroMoeda } from "@/lib/packages/feed-art-data";
import { formatSeguroCobertura } from "@/lib/packages/feed-art-data";
import {
  importCruiseFromUrl,
  getFrtCredentials,
  saveFrtCredentials,
} from "@/lib/packages/cruise-import.functions";

import { Shield, Bus, MapPin as MapPinIcon } from "lucide-react";

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

type PackageKind = "package" | "service" | "cruise" | "tour";

type PackageRow = {
  id: string;
  slug: string;
  title: string;
  kind: PackageKind;
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
  /** Hospedagens alternativas (mesmos voos/datas) — a 1ª é a mais barata/padrão */
  hotel_options: Array<{
    hotel_name: string;
    room_type?: string | null;
    room_category?: string | null;
    bed_type?: string | null;
    meal_plan?: string | null;
    price_per_person?: number | null;
    opcao?: number | null;
    hotel_stars?: number | null;
    tripadvisor_location_id?: string | null;
    tripadvisor_url?: string | null;
    tripadvisor_address?: string | null;
    tripadvisor_photos?: string[] | null;
    stays?: any[] | null;
  }> | null;

  /** Hospedagens sequenciais do roteiro (2+ hotéis na mesma viagem) */
  hotel_stays: any[] | null;

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
  services: PackageServices | null;
  date_mode: "fixed" | "flexible";
  flexible_dates: boolean;

  pricing_mode: "per_occupancy" | "per_unit";
  max_units: number;
  cruise_details: unknown | null;
  meeting_point: string | null;
  tour_times: string[] | null;
  tour_modalities: string[] | null;
  ai_summary: string | null;
};


const emptyForm: Partial<PackageRow> = {
  slug: "",
  title: "",
  kind: "package",
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
  services: {},
  date_mode: "fixed",
  flexible_dates: false,

  pricing_mode: "per_occupancy",
  max_units: 9,
};

function AdminPackages() {
  const qc = useQueryClient();
  const [editing, setEditingState] = useState<Partial<PackageRow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const searchHotelsFn = useServerFn(searchTripAdvisorHotels);
  const hotelDetailsFn = useServerFn(getTripAdvisorHotelDetails);
  const persistHotelPhotosFn = useServerFn(persistPackageHotelPhotos);
  const arquivarCativaFn = useServerFn(arquivarPacotesCativa);
  // Multi-import drafts: array of partial packages open in tabs
  const [drafts, setDrafts] = useState<Partial<PackageRow>[] | null>(null);
  const [draftIndex, setDraftIndex] = useState(0);
  const draftIndexRef = useRef(0);
  // Global hashtag number(s) reserved for the currently-open new package(s)
  const [pendingNumbers, setPendingNumbers] = useState<number[] | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | PackageKind>("all");
  const [expiredView, setExpiredView] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [sortMode, setSortMode] = useState<
    "manual" | "price_asc" | "price_desc" | "date_asc" | "date_desc"
  >("manual");
  const [view, setView] = useState<"list" | "curadoria" | "cativa">("list");
  const [cruiseImportOpen, setCruiseImportOpen] = useState(false);
  const [socialPkg, setSocialPkg] = useState<any | null>(null);
  const [socialChannel, setSocialChannel] = useState<"whatsapp" | "instagram" | undefined>(
    undefined,
  );


  // Cada rascunho ganha um identificador estável. Toda a sincronização é feita
  // por esse id (nunca pelo índice da aba), senão uma atualização assíncrona
  // (IA, debounce de digitação) grava no passeio errado depois de trocar de aba.
  const withDraftIds = (list: Partial<PackageRow>[]) =>
    list.map((d) => ({
      ...d,
      __draftId:
        (d as any).__draftId ??
        (globalThis.crypto?.randomUUID?.() ?? `draft-${Math.random().toString(36).slice(2)}`),
    })) as Partial<PackageRow>[];

  const openDrafts = (list: Partial<PackageRow>[]) => {
    const withIds = withDraftIds(list);
    setDrafts(withIds);
    draftIndexRef.current = 0;
    setDraftIndex(0);
    setEditingState(withIds[0]);
  };

  // Wrap setEditing to keep the drafts array in sync with edits.
  // Accepts a value OR an updater function (use updater to avoid stale closures
  // clobbering concurrent edits — e.g. auto-summary finishing after generate-includes).
  const setEditing = (
    v:
      | Partial<PackageRow>
      | null
      | ((prev: Partial<PackageRow> | null) => Partial<PackageRow> | null),
  ) => {
    if (v === null) {
      setEditingState(null);
      setDrafts(null);
      draftIndexRef.current = 0;
      setDraftIndex(0);
      return;
    }
    setEditingState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (next === null) return null;
      const nextId = (next as any).__draftId ?? (prev as any)?.__draftId;
      const patched = nextId ? ({ ...next, __draftId: nextId } as Partial<PackageRow>) : next;
      setDrafts((prevDrafts) => {
        if (!prevDrafts) return prevDrafts;
        const idx = nextId
          ? prevDrafts.findIndex((d) => (d as any).__draftId === nextId)
          : draftIndexRef.current;
        if (idx < 0) return prevDrafts;
        const copy = prevDrafts.slice();
        copy[idx] = patched;
        return copy;
      });
      return patched;
    });
  };

  function switchDraft(newIdx: number) {
    if (!drafts) return;
    if (newIdx < 0 || newIdx >= drafts.length) return;
    // persist current edits into drafts[draftIndex] first
    const snapshot = drafts.slice();
    const currentId = (editing as any)?.__draftId;
    if (editing) {
      const idx = currentId
        ? snapshot.findIndex((d) => (d as any).__draftId === currentId)
        : draftIndexRef.current;
      if (idx >= 0) snapshot[idx] = editing;
    }
    setDrafts(snapshot);
    draftIndexRef.current = newIdx;
    setDraftIndex(newIdx);
    setEditingState(snapshot[newIdx]);
  }

  function updateTourDraftRows(
    targetDraftId: string,
    rows: { date: string; modality: string; price_per_person: number; taxes: number }[],
  ) {
    if (!targetDraftId) return;
    setDrafts((currentDrafts) => {
      if (!currentDrafts) return currentDrafts;
      const idx = currentDrafts.findIndex((d) => (d as any).__draftId === targetDraftId);
      if (idx < 0) return currentDrafts;
      const nextDrafts = currentDrafts.slice();
      nextDrafts[idx] = { ...nextDrafts[idx], __pendingPrices: rows } as Partial<PackageRow>;
      return nextDrafts;
    });
    setEditingState((current) =>
      current && (current as any).__draftId === targetDraftId
        ? ({ ...current, __pendingPrices: rows } as Partial<PackageRow>)
        : current,
    );
  }


  function closeCurrentDraft() {
    if (!drafts) {
      setEditing(null);
      return;
    }
    const remaining = drafts.filter((_, i) => i !== draftIndex);
    if (remaining.length === 0) {
      setDrafts(null);
      draftIndexRef.current = 0;
      setDraftIndex(0);
      setEditingState(null);
      return;
    }
    const nextIdx = Math.min(draftIndex, remaining.length - 1);
    setDrafts(remaining);
    draftIndexRef.current = nextIdx;
    setDraftIndex(nextIdx);
    setEditingState(remaining[nextIdx]);
  }

  const listCruisesFn = useServerFn(listCruises);
  const { data: cruisesData } = useQuery({
    queryKey: ["admin", "cruises-count"],
    queryFn: () => listCruisesFn(),
  });

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

  const MONTH_NAMES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const origins = useMemo(() => dedupeOrigins((packages || []).map((p) => p.origin)), [packages]);
  const destinations = useMemo(
    () =>
      Array.from(
        new Set((packages || []).map((p) => p.destination).filter(Boolean) as string[]),
      ).sort(),
    [packages],
  );
  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const p of packages || []) {
      if (!p.going_date) continue;
      const d = new Date(String(p.going_date) + "T12:00:00");
      if (isNaN(d.getTime())) continue;
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(keys)
      .sort()
      .map((k) => {
        const [y, m] = k.split("-");
        return { value: k, label: `${MONTH_NAMES[Number(m) - 1]} ${y}` };
      });
  }, [packages]);

  const hojeISO = new Date().toISOString().slice(0, 10);
  const isExpired = (p: { going_date?: string | null }) =>
    !!p.going_date && String(p.going_date) < hojeISO;

  const displayPackages = useMemo(() => {
    const filtered = (packages || []).filter((p) => {
      if (expiredView !== isExpired(p)) return false;
      if (!expiredView && kindFilter !== "all" && (p.kind ?? "package") !== kindFilter) return false;
      if (originFilter !== "all" && originKey(p.origin) !== originKey(originFilter)) return false;
      if (destinationFilter !== "all" && p.destination !== destinationFilter) return false;
      if (monthFilter !== "all") {
        if (!p.going_date) return false;
        const d = new Date(String(p.going_date) + "T12:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== monthFilter) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "price_asc" || sortMode === "price_desc") {
        const at = Number(a.price_per_person) * (a.base_occupancy ?? 2);
        const bt = Number(b.price_per_person) * (b.base_occupancy ?? 2);
        return sortMode === "price_asc" ? at - bt : bt - at;
      }
      if (sortMode === "date_asc" || sortMode === "date_desc") {
        const ad = a.going_date
          ? new Date(String(a.going_date) + "T12:00:00").getTime()
          : Number.POSITIVE_INFINITY;
        const bd = b.going_date
          ? new Date(String(b.going_date) + "T12:00:00").getTime()
          : Number.POSITIVE_INFINITY;
        return sortMode === "date_asc" ? ad - bd : bd - ad;
      }
      const av = a.sort_order ?? 0;
      const bv = b.sort_order ?? 0;
      if (av !== bv) return sortDir === "asc" ? av - bv : bv - av;
      const ac = (a as any).created_at ? new Date((a as any).created_at).getTime() : 0;
      const bc = (b as any).created_at ? new Date((b as any).created_at).getTime() : 0;
      return sortDir === "asc" ? bc - ac : ac - bc;
    });
    return sorted;
  }, [packages, originFilter, destinationFilter, monthFilter, kindFilter, expiredView, sortDir, sortMode]);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!displayPackages.length) {
      toast.error("Nada para exportar com os filtros atuais");
      return;
    }
    setExporting(true);
    try {
      const ids = displayPackages.map((p) => p.id);
      const dates: ExportDatePrice[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("package_date_prices")
          .select("package_id,date,modality,price_per_person,taxes,seats,is_available")
          .in("package_id", ids.slice(i, i + 200))
          .order("date");
        if (error) throw error;
        dates.push(...((data ?? []) as unknown as ExportDatePrice[]));
      }
      const csv = buildPackagesCsv(
        displayPackages as unknown as Record<string, unknown>[],
        dates,
        typeof window !== "undefined" ? window.location.origin : "",
      );
      const kindSlug =
        kindFilter === "all"
          ? "todos"
          : kindFilter === "service"
            ? "ingressos"
            : kindFilter === "tour"
              ? "passeios"
              : kindFilter === "cruise"
                ? "cruzeiros"
                : "pacotes";
      downloadCsv(`viaair-${kindSlug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success(`Exportado: ${displayPackages.length} registro(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };


  const hasActiveFilters =
    originFilter !== "all" ||
    destinationFilter !== "all" ||
    monthFilter !== "all" ||
    sortMode !== "manual";

  useEffect(() => {
    setPage(1);
  }, [originFilter, destinationFilter, monthFilter, sortDir, sortMode]);

  function errMsg(e: unknown): string {
    if (!e) return "Erro desconhecido";
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    const o = e as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean) as string[];
    if (parts.length > 0) return `${parts.join(" — ")}${o.code ? ` (${o.code})` : ""}`;
    try {
      return JSON.stringify(e);
    } catch {
      return "Erro desconhecido";
    }
  }

  async function nextPackageBaseNumber(): Promise<number> {
    const { count, error } = await supabase
      .from("packages")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return (count ?? 0) + 1;
  }


  async function persistPackage(
    pkg: Partial<PackageRow>,
    numbering?: { number: number },
  ): Promise<void> {
    const derived = deriveFromFlights(pkg);
    const normalized = {
      ...pkg,
      destination: pkg.destination?.trim() || derived.destCity || "",
      origin: pkg.origin?.trim() || derived.originCity || "",
      title: pkg.title?.trim() || derived.title || "",
      slug: pkg.slug?.trim() || derived.slug || "",
    };
    if (!normalized.slug || !normalized.title || !normalized.destination) {
      throw new Error(`Preencha slug, título e destino${pkg.title ? ` (${pkg.title})` : ""}.`);
    }

    // Global hashtag numbering: applied ONLY to slug of new packages (no id).
    if (!pkg.id && numbering) {
      const n = numbering.number;
      normalized.title = normalized.title.replace(/\s*#\d+\s*$/, "").trim();
      const cleanSlug = normalized.slug.replace(/[-#]\d+$/, "");
      normalized.slug = `${cleanSlug}-${n}`;
    }

    // Duplicate detection: só é duplicado quando ORIGEM + DESTINO + DATAS + VALOR batem.
    // Origens diferentes (ex.: Chapecó x Curitiba) ou valores diferentes (mesmo pacote
    // com benefícios distintos) nunca são duplicidade.
    if (pkg.going_date && pkg.return_date && normalized.destination) {
      const { data: dupRows } = await supabase
        .from("packages")
        .select("id, title, hotel_name, going_date, return_date, destination, origin, price_per_person")
        .ilike("destination", normalized.destination.trim())
        .eq("going_date", pkg.going_date)
        .eq("return_date", pkg.return_date);
      const hotelTrim = (pkg.hotel_name || "").trim().toLowerCase();
      const originTrim = originKey((pkg as any).origin);
      const priceKey = Math.round(Number((pkg as any).price_per_person) || 0);
      const matches = (dupRows ?? []).filter((r: any) => {
        if (pkg.id && r.id === pkg.id) return false;
        if (originKey(r.origin) !== originTrim) return false;
        if (Math.round(Number(r.price_per_person) || 0) !== priceKey) return false;
        if (!hotelTrim) return true;
        return (r.hotel_name || "").trim().toLowerCase() === hotelTrim;
      });
      if (matches.length > 0) {
        const list = matches
          .slice(0, 3)
          .map((r: any) => `• ${r.title}${r.origin ? ` — saindo de ${r.origin}` : ""}${r.hotel_name ? ` — ${r.hotel_name}` : ""}`)
          .join("\n");
        const proceed = await confirm({
          title: "Pacote duplicado?",
          description: `Já existe ${matches.length === 1 ? "1 pacote" : `${matches.length} pacotes`} com a mesma origem, destino, datas e valor${hotelTrim ? " (e hotel)" : ""}:\n\n${list}\n\nSalvar mesmo assim?`,
          confirmText: "Salvar mesmo assim",
          cancelText: "Cancelar",
          destructive: true,
        });
        if (!proceed) throw new Error("Duplicado — salvamento cancelado");
      }
    }

    const baseSlug = normalized.slug;
    const { data: existingSlugs, error: slugLookupError } = await supabase
      .from("packages")
      .select("id, slug")
      .like("slug", `${baseSlug}%`);
    if (slugLookupError) throw slugLookupError;
    const usedSlugs = new Set(
      (existingSlugs ?? []).filter((row) => row.id !== pkg.id).map((row) => row.slug),
    );
    let availableSlug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(availableSlug)) {
      availableSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const payload = {
      slug: availableSlug,
      title: normalized.title,
      destination: normalized.destination,
      origin: normalized.origin || null,
      image_url: pkg.image_url || null,
      summary: pkg.summary || null,
      itinerary: pkg.itinerary || null,
      hotel_name: pkg.hotel_name || null,
      hotel_options:
        Array.isArray((pkg as any).hotel_options) && (pkg as any).hotel_options.length > 1
          ? (pkg as any).hotel_options
          : null,
      hotel_stays:
        Array.isArray((pkg as any).hotel_stays) && (pkg as any).hotel_stays.length > 1
          ? (pkg as any).hotel_stays
          : null,

      meal_plan: pkg.meal_plan || null,
      room_type: cleanRoomLabel(pkg.room_type),
      room_category: cleanRoomLabel(pkg.room_category),
      bed_type: pkg.bed_type || null,
      is_active: pkg.is_active ?? true,
      includes:
        typeof pkg.includes === "string"
          ? (pkg.includes as string)
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : (pkg.includes ?? []),
      price_per_person: Number(pkg.price_per_person) || 0,
      taxes: Number(pkg.taxes) || 0,
      nights: pkg.nights ? Number(pkg.nights) : null,
      hotel_stars: pkg.hotel_stars ? Number(pkg.hotel_stars) : null,
      sort_order: Number(pkg.sort_order) || 0,
      going_date:
        (pkg.kind ?? "package") === "tour" || (pkg.date_mode ?? "fixed") === "flexible"
          ? null
          : (pkg.going_date || null),
      return_date:
        (pkg.kind ?? "package") === "tour" || (pkg.date_mode ?? "fixed") === "flexible"
          ? null
          : (pkg.return_date || null),
      base_occupancy: Number(pkg.base_occupancy) || 2,
      outbound_flight: cleanFlight(pkg.outbound_flight),
      return_flight: cleanFlight(pkg.return_flight),
      supplier_name: pkg.supplier_name || null,
      tripadvisor_location_id: pkg.tripadvisor_location_id || null,
      tripadvisor_url: pkg.tripadvisor_url || null,
      tripadvisor_address: pkg.tripadvisor_address || null,
      tripadvisor_photos:
        pkg.tripadvisor_photos && pkg.tripadvisor_photos.length > 0 ? pkg.tripadvisor_photos : null,
      services: (pkg.services ?? {}) as any,
      meeting_point: pkg.meeting_point || null,
      tour_times: Array.isArray(pkg.tour_times) ? pkg.tour_times : [],
      tour_modalities: Array.isArray(pkg.tour_modalities) ? pkg.tour_modalities : [],
      ai_summary: pkg.ai_summary || null,
      kind: (pkg.kind ?? "package") as PackageKind,
      flexible_dates: (pkg.kind ?? "package") === "package" ? !!pkg.flexible_dates : false,

      // Passeio: sempre cliente escolhe a data e preço individual por unidade.
      date_mode: ((pkg.kind ?? "package") === "tour"
        ? "flexible"
        : (pkg.date_mode ?? "fixed")) as "fixed" | "flexible",
      pricing_mode: ((pkg.kind ?? "package") === "tour"
        ? "per_unit"
        : (pkg.pricing_mode ?? "per_occupancy")) as "per_occupancy" | "per_unit",
      max_units: Math.min(9, Math.max(1, Number(pkg.max_units) || 9)),
      // cruise_details só existe em cruzeiro; pacote/ingresso nunca grava esse campo
      cruise_details:
        (pkg.kind ?? "package") === "cruise" ? ((pkg.cruise_details ?? {}) as any) : null,
    } as any;
    // Isolamento por tipo: pacote, ingresso/serviço e cruzeiro não compartilham campos.
    const payloadKind: PackageKind = payload.kind;
    if (payloadKind === "service" || payloadKind === "tour") {
      // Ingresso/serviço: sem hospedagem, sem aéreo, sem cruzeiro
      payload.hotel_name = null;
      payload.hotel_options = null;
      payload.hotel_stays = null;

      payload.hotel_stars = null;
      payload.meal_plan = null;
      payload.room_type = null;
      payload.room_category = null;
      payload.bed_type = null;
      payload.nights = null;
      payload.outbound_flight = null;
      payload.return_flight = null;
      payload.tripadvisor_location_id = null;
      payload.tripadvisor_url = null;
      payload.tripadvisor_address = null;
      payload.cruise_details = null;
    } else if (payloadKind === "cruise") {
      // Cruzeiro: sem aéreo
      payload.outbound_flight = null;
      payload.return_flight = null;
    } else {
      // Pacote: sem dados de cruzeiro
      payload.cruise_details = null;
    }
    const savedPackage = pkg.id
      ? await supabase.from("packages").update(payload).eq("id", pkg.id).select("id").single()
      : await supabase.from("packages").insert(payload).select("id").single();
    const { error } = savedPackage;
    if (error) throw error;
    // Passeio novo: grava o calendário importado que ainda estava só na prévia.
    const pendingPrices = (pkg as any).__pendingPrices as
      | { date: string; modality: string; price_per_person: number; taxes?: number }[]
      | undefined;
    if (payloadKind === "tour" && pendingPrices?.length && savedPackage.data?.id) {
      const { error: priceErr } = await supabase.from("package_date_prices").upsert(
        pendingPrices.map((r) => ({
          package_id: savedPackage.data.id,
          date: r.date,
          modality: r.modality ?? "",
          price_per_person: Number(r.price_per_person) || 0,
          taxes: Number(r.taxes) || 0,
          seats: null,
          is_available: true,
        })),

        { onConflict: "package_id,date,modality" },
      );
      if (priceErr) throw priceErr;
    }
    // Só arquiva o pacote na Cativa depois que ele foi realmente gravado.
    const cativaId = (pkg as any).cativa_pacote_id as string | undefined;
    if (cativaId) {
      try {
        await arquivarCativaFn({ data: { ids: [cativaId], arquivar: true } });
      } catch (e) {
        console.warn("[packages] não foi possível arquivar o pacote Cativa", e);
      }
    }
    const sourcePhotos: string[] = (payload as any).tripadvisor_photos ?? [];
    if (
      sourcePhotos.length > 0 &&
      sourcePhotos.some((url: string) => !url.includes("/api/public/package-hotel-photo/"))
    ) {
      const persisted = await persistHotelPhotosFn({
        data: { packageId: savedPackage.data.id, photos: sourcePhotos.slice(0, 5) },
      });
      if (persisted.photos.length === 0) {
        console.warn("[packages] não foi possível criar a cópia permanente das fotos do hotel");
      }
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const numbering = editing.id ? undefined : { number: await nextPackageBaseNumber() };
      await persistPackage(editing, numbering);
      toast.success(editing.id ? "Pacote atualizado" : "Pacote criado");
      if (drafts && drafts.length > 1) {
        closeCurrentDraft();
      } else {
        setEditing(null);
      }
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
    } catch (err) {
      const message = errMsg(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (!drafts || drafts.length === 0) return;
    // persist current edits into the draft list before iterating
    const list = drafts.slice();
    if (editing) {
      const currentId = (editing as any).__draftId;
      const idx = currentId
        ? list.findIndex((d) => (d as any).__draftId === currentId)
        : draftIndexRef.current;
      if (idx >= 0) list[idx] = editing;
    }

    setSaving(true);
    let ok = 0;
    const errors: string[] = [];
    try {
      const base = await nextPackageBaseNumber();
      let newIdx = 0;
      for (let i = 0; i < list.length; i++) {
        try {
          const numbering = list[i].id ? undefined : { number: base + newIdx };
          if (!list[i].id) newIdx += 1;
          await persistPackage(list[i], numbering);
          ok += 1;
        } catch (e) {
          console.error("[packages] falha ao salvar draft", i + 1, e);
          const label = list[i].title?.trim() || list[i].destination?.trim() || `#${i + 1}`;
          errors.push(`${label}: ${errMsg(e)}`);
        }

      }
      if (ok > 0) toast.success(`${ok} pacote(s) salvo(s)`);
      if (errors.length > 0) toast.error(errors.join(" • "));
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
      if (errors.length === 0) {
        setDrafts(null);
        draftIndexRef.current = 0;
        setDraftIndex(0);
        setEditingState(null);
      }
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
    const ok = await confirm({
      title: "Excluir pacote?",
      description: `"${p.title}" será excluído. Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
    });
    if (!ok) return;
    const { error } = await supabase.from("packages").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Pacote excluído");
    qc.invalidateQueries({ queryKey: ["admin", "packages"] });
  }

  async function backfillHotelPhotos() {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const { data: rows, error } = await supabase
        .from("packages")
        .select("id,hotel_name,destination,hotel_stars,tripadvisor_photos,tripadvisor_location_id")
        .not("hotel_name", "is", null);
      if (error) throw error;
      const targets = (rows ?? []).filter((r: any) => r.hotel_name);
      if (targets.length === 0) {
        toast.info("Nenhum pacote precisa de atualização.");
        return;
      }
      toast.info(`Atualizando fotos de ${targets.length} pacote(s)…`);
      let ok = 0;
      for (const r of targets as any[]) {
        try {
          const existing = Array.isArray(r.tripadvisor_photos)
            ? r.tripadvisor_photos.filter(Boolean)
            : [];
          const alreadyStored =
            existing.length > 0 &&
            existing.every((url: string) => url.includes("/api/public/package-hotel-photo/"));
          if (alreadyStored) {
            ok++;
            continue;
          }

          let best: Awaited<ReturnType<typeof searchHotelsFn>>[number] | undefined;
          let full: Awaited<ReturnType<typeof hotelDetailsFn>> | undefined;
          let sourcePhotos = existing;
          if (sourcePhotos.length === 0) {
            const q = r.destination ? `${r.hotel_name} ${r.destination}` : r.hotel_name;
            let results = await searchHotelsFn({ data: { query: q } });
            if (!results?.length && q !== r.hotel_name) {
              results = await searchHotelsFn({ data: { query: r.hotel_name } });
            }
            best = results?.[0];
            if (!best) continue;
            full = await hotelDetailsFn({ data: { locationId: best.location_id, photoLimit: 5 } });
            sourcePhotos = full.photos ?? [];
          }
          if (sourcePhotos.length === 0) continue;
          const saved = await persistHotelPhotosFn({
            data: { packageId: r.id, photos: sourcePhotos.slice(0, 5) },
          });
          if (saved.photos.length === 0) continue;
          const rating = full?.rating ?? best?.rating ?? null;
          const cls = full?.hotel_class ?? null;
          const stars =
            rating != null
              ? Math.min(5, Math.max(1, Math.round(rating)))
              : cls != null
                ? Math.min(5, Math.max(1, Math.round(cls)))
                : (r.hotel_stars ?? 3);
          const { error: upErr } = await supabase
            .from("packages")
            .update({
              hotel_name: full?.name || best?.name || r.hotel_name,
              hotel_stars: stars,
              tripadvisor_location_id: best?.location_id
                ? String(best.location_id)
                : r.tripadvisor_location_id,
              tripadvisor_url: full?.tripadvisor_url ?? best?.tripadvisor_url ?? null,
              tripadvisor_address: full?.address ?? best?.address ?? null,
              tripadvisor_photos: saved.photos,
            })
            .eq("id", r.id);
          if (!upErr) ok++;
        } catch (err) {
          console.warn("[backfill] falhou", r.id, err);
        }
      }
      toast.success(`Fotos atualizadas em ${ok}/${targets.length} pacote(s).`);
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar fotos");
    } finally {
      setBackfilling(false);
    }
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
        <div className="flex items-center gap-2">
          <MultiPackageImportButton
            onExtracted={async (raw) => {
              if (!raw.length) return;
              // Importador de PACOTES: nunca cria ingresso nem cruzeiro
              const list = raw.map((d) => ({
                ...d,
                kind: "package" as PackageKind,
                cruise_details: null,
              }));
              try {
                const base = await nextPackageBaseNumber();
                setPendingNumbers(list.map((_, i) => base + i));
              } catch {
                setPendingNumbers(null);
              }
              openDrafts(list);

            }}
          />
          <IgnoredHotelsBell packages={packages || []} />
          <button
            type="button"
            onClick={backfillHotelPhotos}
            disabled={backfilling}
            title="Atualizar fotos dos hotéis (busca no TripAdvisor as fotos dos pacotes sem imagens)"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-brand-orange transition-colors disabled:opacity-60"
          >
            {backfilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Novo cadastro"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-orange hover:bg-[#ff7b30] text-white transition-all active:scale-95 shadow-[3px_3px_0px_0px_rgba(242,107,31,0.2)]"
              >
                <Plus className="h-4 w-4" strokeWidth={3} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {([
                { k: "package", label: "Pacote", Icon: PackageIcon },
                { k: "service", label: "Ingresso / Serviço", Icon: Ticket },
                { k: "tour", label: "Passeio", Icon: MapPin },
              ] as { k: PackageKind; label: string; Icon: typeof PackageIcon }[]).map(({ k, label, Icon }) => (
                <DropdownMenuItem
                  key={k}
                  onSelect={async () => {

                    try {
                      const base = await nextPackageBaseNumber();
                      setPendingNumbers([base]);
                    } catch {
                      setPendingNumbers(null);
                    }
                    setEditing(
                      k === "tour"
                        ? {
                            ...emptyForm,
                            kind: k,
                            date_mode: "flexible",
                            pricing_mode: "per_unit",
                          }
                        : { ...emptyForm, kind: k },
                    );
                  }}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4 text-brand-orange" /> {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem asChild className="gap-2">
                <Link to="/admin/cruzeiros">
                  <Ship className="h-4 w-4 text-brand-orange" /> Cruzeiro
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>

      </div>

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setView("list")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${view === "list" ? "bg-brand-orange text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ListIcon className="h-3.5 w-3.5" /> Pacotes
        </button>
        <button
          type="button"
          onClick={() => setView("curadoria")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${view === "curadoria" ? "bg-brand-orange text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
        >
          <SparklesIcon className="h-3.5 w-3.5" /> Curadoria IA
        </button>
        <button
          type="button"
          onClick={() => setView("cativa")}
          title="Catálogo Cativa — pacotes disponíveis para importar"
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${view === "cativa" ? "bg-brand-orange text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
        >
          <PackageIcon className="h-3.5 w-3.5" /> Pacotes Cativa
          <CativaCountBadge active={view === "cativa"} />
        </button>
      </div>

      {view === "list" && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {([
            { k: "all", label: "Todos", Icon: ListIcon },
            { k: "package", label: "Pacotes", Icon: PackageIcon },
            { k: "service", label: "Ingressos", Icon: Ticket },
            { k: "tour", label: "Passeios", Icon: MapPin },
          ] as { k: "all" | PackageKind; label: string; Icon: typeof ListIcon }[]).map(({ k, label, Icon }) => {
            const active = !expiredView && kindFilter === k;
            const vigentes = (packages || []).filter((p) => !isExpired(p));
            const count = k === "all"
              ? vigentes.length
              : vigentes.filter((p) => (p.kind ?? "package") === k).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setExpiredView(false);
                  setKindFilter(k);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${active ? "bg-brand-orange text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-muted"}`}>{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            title="Pacotes com data de ida já passada — não aparecem mais no portal"
            onClick={() => {
              setExpiredView(true);
              setPage(1);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${expiredView ? "bg-brand-orange text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <CalendarRange className="h-3.5 w-3.5" /> Expirados
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${expiredView ? "bg-white/20" : "bg-muted"}`}>
              {(packages || []).filter((p) => isExpired(p)).length}
            </span>
          </button>
          <Link
            to="/admin/cruzeiros"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
            title="Cruzeiros são cadastrados e importados pelo plugin Exportar Cruzeiro"
          >
            <Ship className="h-3.5 w-3.5" /> Cruzeiros
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
              {(cruisesData?.cruises ?? []).length}
            </span>
          </Link>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground disabled:opacity-60"
          title="Exportar em CSV os registros da aba/filtros atuais"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Exportar CSV
        </button>

        </div>
      )}



      {view === "cativa" ? (
        <CativaTab
          onImport={async (list) => {
            if (!list.length) return;
            const drafts = list.map((d) => ({
              ...emptyForm,
              ...d,
              kind: "package" as PackageKind,
              cruise_details: null,
            })) as Partial<PackageRow>[];
            try {
              const base = await nextPackageBaseNumber();
              setPendingNumbers(drafts.map((_, i) => base + i));
            } catch {
              setPendingNumbers(null);
            }
            openDrafts(drafts);
          }}
        />
      ) : view === "curadoria" ? (
        <CurationTab
          packages={((packages || []) as any[]).filter(
            (p) => !p?.kind || p.kind === "package",
          ) as any}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["admin", "packages"] })}
        />
      ) : (
        <>
          <UnlinkedHotelsAlert
            packages={(packages || []) as PackageRow[]}
            onOpen={(p) => setEditingState(p)}
          />
          <MissingIncludesAlert
            packages={(packages || []) as PackageRow[]}
            onOpen={(p) => setEditingState(p)}
          />
          <MealPlanMismatchAlert
            packages={(packages || []) as PackageRow[]}
            onOpen={(p) => setEditingState(p)}
          />
          <MissingSupplierAlert
            packages={(packages || []) as PackageRow[]}
            onOpen={(p) => setEditingState(p)}
          />
          <DuplicatePackagesAlert
            packages={(packages || []) as PackageRow[]}
            onOpen={(p) => setEditingState(p)}
            onDelete={(p) => remove(p)}
          />


          <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-end">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:pb-2.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-brand-orange" /> Filtrar
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Origem
              </label>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas as origens" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {origins.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Destino
              </label>
              <Select value={destinationFilter} onValueChange={setDestinationFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos os destinos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os destinos</SelectItem>
                  {destinations.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Data da viagem
              </label>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos os meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Ordenar por
              </label>
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as typeof sortMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ordem manual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Ordem manual (#)</SelectItem>
                  <SelectItem value="price_asc">Menor preço</SelectItem>
                  <SelectItem value="price_desc">Maior preço</SelectItem>
                  <SelectItem value="date_asc">Data mais próxima</SelectItem>
                  <SelectItem value="date_desc">Data mais distante</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={
                sortDir === "asc"
                  ? "Ordem crescente (1 → N). Clique para inverter."
                  : "Ordem decrescente (N → 1). Clique para inverter."
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:border-brand-orange"
            >
              {sortDir === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 text-brand-orange" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-brand-orange" />
              )}
              {sortDir === "asc" ? "Crescente" : "Decrescente"}
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setOriginFilter("all");
                  setDestinationFilter("all");
                  setMonthFilter("all");
                }}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Limpar filtros"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              {displayPackages.length} de {packages?.length ?? 0} pacote(s)
            </div>
          )}

          {/* Row Header */}
          <div className="hidden md:grid grid-cols-12 px-8 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/60">
            <div className="col-span-4">Identificação do Pacote</div>
            <div className="col-span-3 text-center">Período Operacional</div>
            <div className="col-span-2 text-right">Valor Base</div>
            <div className="col-span-3 text-right">Status / Gestão</div>
          </div>


          {/* List */}
          <div className="space-y-3 mt-2">
            {isLoading && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Carregando…
              </div>
            )}
            {displayPackages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p, idx) => (
              <div
                key={p.id}
                className="group bg-card/60 border border-border/60 rounded-2xl hover:border-brand-orange/50 transition-all"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 items-center p-4 md:px-6 md:py-4 gap-3 md:gap-2">
                  {/* Info */}
                  <div className="col-span-1 md:col-span-4 space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-md border border-brand-orange/30 bg-brand-orange/10 px-1.5 text-[11px] font-bold tabular-nums text-brand-orange shrink-0"
                        title="Posição na lista"
                      >
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </span>
                      <h3 className="text-sm sm:text-[15px] font-bold text-foreground group-hover:text-brand-orange transition-colors truncate">
                        {p.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 pl-[34px] text-[10px] text-muted-foreground uppercase min-w-0">
                      <span className="truncate">/{p.slug}</span>
                      <span className="text-muted-foreground/40 shrink-0">•</span>
                      <span className="text-muted-foreground/90 italic truncate">
                        {p.destination}
                      </span>
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
                      {formatBRLNoSymbol(Number(p.price_per_person) || 0)}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">Total 1 pax</div>
                  </div>

                  {/* Status + Actions */}
                  <div className="col-span-1 md:col-span-3 flex flex-row md:flex-col flex-wrap items-center md:items-end justify-between md:justify-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!p.is_active}
                      onClick={() => toggleActive(p)}
                      title={
                        p.is_active ? "Ativo · toque para ocultar" : "Oculto · toque para ativar"
                      }
                      className="group inline-flex items-center gap-1.5 select-none focus:outline-none"
                    >
                      <span
                        className={`relative inline-flex h-[18px] w-[34px] shrink-0 items-center rounded-full border transition-colors duration-200 ${
                          p.is_active
                            ? "bg-brand-orange/10 border-brand-orange"
                            : "bg-muted border-border"
                        } group-focus-visible:ring-2 group-focus-visible:ring-brand-orange/40`}
                      >
                        <span
                          className={`absolute top-[2px] left-[2px] h-[12px] w-[12px] rounded-full shadow-sm transition-transform duration-300 ease-out ${
                            p.is_active
                              ? "translate-x-[16px] bg-brand-orange"
                              : "translate-x-0 bg-muted-foreground/60"
                          }`}
                        />
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider ${
                          p.is_active ? "text-brand-orange" : "text-muted-foreground"
                        }`}
                      >
                        {p.is_active ? "Ativo" : "Oculto"}
                      </span>
                    </button>

                    <div className="flex flex-nowrap items-center justify-end gap-1">
                      {/* Divulgação */}
                      <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/50 px-1 py-0.5">

                        <button
                          type="button"
                          onClick={() => {
                            setSocialChannel("whatsapp");
                            setSocialPkg(p);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-[#25D366] transition-colors hover:bg-[#25D366]/15"
                          title="Gerar texto para WhatsApp"
                        >
                          <WhatsAppIcon className="h-[14px] w-[14px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSocialChannel("instagram");
                            setSocialPkg(p);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-[#E1306C] transition-colors hover:bg-[#E1306C]/15"
                          title="Gerar legenda para Instagram"
                        >
                          <InstagramIcon className="h-[14px] w-[14px]" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-orange/15 hover:text-brand-orange"
                              title="Baixar arte para redes sociais"
                            >
                              <Download className="h-[14px] w-[14px]" strokeWidth={2} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={async () => {
                                const t = toast.loading("Gerando arte do story…");
                                try {
                                  const { generatePackageStoryArt } =
                                    await import("@/lib/packages/story-art");
                                  const delivery = await generatePackageStoryArt(p);
                                  toast.success(
                                    delivery === "shared"
                                      ? "Arte pronta para salvar ou compartilhar!"
                                      : delivery === "cancelled"
                                        ? "Compartilhamento cancelado."
                                        : "Arte baixada!",
                                    { id: t },
                                  );
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : "Falha ao gerar arte",
                                    { id: t },
                                  );
                                }
                              }}
                            >
                              Story (1080×1920)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                const t = toast.loading("Gerando arte do feed…");
                                try {
                                  const { generatePackageFeedArt } =
                                    await import("@/lib/packages/feed-art");
                                  const delivery = await generatePackageFeedArt(p);
                                  toast.success(
                                    delivery === "shared"
                                      ? "Arte pronta para salvar ou compartilhar!"
                                      : delivery === "cancelled"
                                        ? "Compartilhamento cancelado."
                                        : "Arte baixada!",
                                    { id: t },
                                  );
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : "Falha ao gerar arte",
                                    { id: t },
                                  );
                                }
                              }}
                            >
                              Feed (1080×1440)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Gestão */}
                      <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/50 px-1 py-0.5">
                        <a
                          href={`/pacotes/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-orange/15 hover:text-brand-orange"
                          title="Abrir página do pacote"
                        >
                          <LinkIcon className="h-[14px] w-[14px]" strokeWidth={2} />
                        </a>
                        <button
                          onClick={() => setEditing(p)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="h-[14px] w-[14px]" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => {
                            const { id: _id, slug: _slug, created_at: _c, updated_at: _u, ...rest } = p as any;
                            setEditing({
                              ...rest,
                              id: undefined,
                              slug: "",
                              title: p.title,
                            } as any);
                            toast.info("Duplicando pacote — ajuste as datas e salve.");
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-orange/15 hover:text-brand-orange"
                          title="Duplicar"
                        >
                          <Copy className="h-[14px] w-[14px]" strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => remove(p)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-red-500/15 hover:text-red-500"
                          title="Excluir"
                        >
                          <Trash2 className="h-[14px] w-[14px]" strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            ))}
          </div>

          {(() => {
            const total = displayPackages.length;
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            const current = Math.min(page, totalPages);
            if (total <= PAGE_SIZE) return null;
            const from = (current - 1) * PAGE_SIZE + 1;
            const to = Math.min(current * PAGE_SIZE, total);
            return (
              <div className="mt-6 flex items-center justify-between gap-3 px-2">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {from}–{to} de {total}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={current === 1}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-border bg-card hover:border-brand-orange disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === totalPages || Math.abs(n - current) <= 1)
                    .map((n, i, arr) => (
                      <span key={n} className="flex items-center">
                        {i > 0 && arr[i - 1] !== n - 1 && (
                          <span className="px-1 text-muted-foreground">…</span>
                        )}
                        <button
                          onClick={() => setPage(n)}
                          className={`min-w-[32px] px-2 py-1.5 text-xs font-semibold rounded-lg border transition ${
                            n === current
                              ? "bg-brand-orange text-white border-brand-orange"
                              : "border-border bg-card hover:border-brand-orange"
                          }`}
                        >
                          {n}
                        </button>
                      </span>
                    ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={current === totalPages}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-border bg-card hover:border-brand-orange disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      <PackageSocialDialog
        pkg={socialPkg}
        open={!!socialPkg}
        initialChannel={socialChannel}
        onOpenChange={(v) => {
          if (!v) setSocialPkg(null);
        }}
      />



      {editing && (
        <PackageEditorModal
          editing={editing}
          setEditing={setEditing}
          saving={saving}
          save={save}
          saveAll={saveAll}
          drafts={drafts}
          draftIndex={draftIndex}
          switchDraft={switchDraft}
          closeCurrentDraft={closeCurrentDraft}
          updateTourDraftRows={updateTourDraftRows}
          nextNumber={pendingNumbers?.[draftIndex] ?? pendingNumbers?.[0] ?? null}
          onBulkToursImported={(savedTours) => {
            const list = savedTours as Partial<PackageRow>[];
            setPendingNumbers(null);
            openDrafts(list);

          }}
        />
      )}

      {cruiseImportOpen && (
        <NewCruiseImportDialog
          onClose={() => setCruiseImportOpen(false)}
          onImported={async ({ cruise_details, package_fields }) => {
            try {
              const base = await nextPackageBaseNumber();
              setPendingNumbers([base]);
            } catch {
              setPendingNumbers(null);
            }
            setCruiseImportOpen(false);
            setEditing({
              ...emptyForm,
              kind: "cruise",
              cruise_details: cruise_details as any,
              title: package_fields.title || emptyForm.title,
              destination: package_fields.destination || emptyForm.destination,
              origin: package_fields.origin || emptyForm.origin,
              going_date: package_fields.going_date || emptyForm.going_date,
              return_date: package_fields.return_date || emptyForm.return_date,
              nights: package_fields.nights || emptyForm.nights,
              price_per_person: package_fields.price_from || emptyForm.price_per_person,
              supplier_name: package_fields.supplier || emptyForm.supplier_name,
            } as Partial<PackageRow>);
          }}
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
  setEditing: (
    v:
      | Partial<PackageRow>
      | null
      | ((prev: Partial<PackageRow> | null) => Partial<PackageRow> | null),
  ) => void;
  saving: boolean;
  save: () => void;
  saveAll?: () => void;
  drafts?: Partial<PackageRow>[] | null;
  draftIndex?: number;
  switchDraft?: (newIdx: number) => void;
  closeCurrentDraft?: () => void;
  updateTourDraftRows?: (
    targetDraftId: string,
    rows: { date: string; modality: string; price_per_person: number; taxes: number }[],
  ) => void;

  nextNumber?: number | null;
  onBulkToursImported?: (drafts: BulkImportedTourDraft[]) => void;
};

type TabId = "dates" | "tourDetails" | "hotel" | "flights" | "extras" | "about";

function slugify(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const PT_MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function deriveFromFlights(editing: Partial<PackageRow>): {
  originCity?: string;
  destCity?: string;
  title?: string;
  slug?: string;
} {
  const outSegs = editing.outbound_flight?.segments ?? [];
  const first = outSegs[0];
  const last = outSegs[outSegs.length - 1];
  const originCity = first?.from_city?.trim() || editing.origin?.trim() || undefined;
  const destCity = last?.to_city?.trim() || editing.destination?.trim() || undefined;
  const title =
    destCity && originCity
      ? `${destCity} - Saída de ${originCity}`
      : destCity
        ? destCity
        : undefined;
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

function PackageEditorModal({
  editing,
  setEditing,
  saving,
  save,
  saveAll,
  drafts,
  draftIndex = 0,
  switchDraft,
  closeCurrentDraft,
  updateTourDraftRows,
  nextNumber,
  onBulkToursImported,
}: PackageEditorModalProps) {
  const [tab, setTab] = useState<TabId>("dates");
  const [tourImportDone, setTourImportDone] = useState(false);
  
  const [flightLeg, setFlightLeg] = useState<"outbound" | "return">("outbound");
  const [aiLoading, setAiLoading] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [imgQuery, setImgQuery] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgPage, setImgPage] = useState(1);
  const [imgHasMore, setImgHasMore] = useState(false);
  const [imgSource, setImgSource] = useState("");
  const [imgResults, setImgResults] = useState<
    Array<{ thumb: string; url: string; title: string; source: string; author: string }>
  >([]);
  const draftsScrollRef = useRef<HTMLDivElement | null>(null);
  const [hotelOptIdx, setHotelOptIdx] = useState(0);
  const [hotelMode, setHotelMode] = useState<"live" | "manual" | null>(
    editing.tripadvisor_location_id ? "live" : editing.hotel_name ? "manual" : null,
  );

  // Sincroniza o modo do hotel sempre que o pacote em edição muda (ex.: abrir
  // pacote salvo, importar por IA, etc.) — evita "voltar pro manual" após picar TA.
  useEffect(() => {
    if (editing.tripadvisor_location_id) {
      if (hotelMode !== "live") setHotelMode("live");
    } else if (editing.hotel_name && hotelMode === null) {
      setHotelMode("manual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.tripadvisor_location_id, editing.id]);


  // Hospedagem: quando há múltiplas opções, os campos abaixo editam a opção
  // selecionada. A opção base (índice 0) também espelha no pacote.
  const hotelOpts: any[] = Array.isArray((editing as any).hotel_options)
    ? ((editing as any).hotel_options as any[])
    : [];
  const hotelSelIdx = hotelOpts.length > 1 ? Math.min(hotelOptIdx, hotelOpts.length - 1) : -1;
  const hv: any = hotelSelIdx >= 0 ? hotelOpts[hotelSelIdx] : editing;
  const setHotel = (p: Record<string, any>) => {
    if (hotelSelIdx < 0) {
      setEditing({ ...editing, ...p });
      return;
    }
    const next = hotelOpts.map((o, i) => (i === hotelSelIdx ? { ...o, ...p } : o));
    setEditing({ ...editing, hotel_options: next as any, ...(hotelSelIdx === 0 ? p : {}) });
  };

  function handleGenerateItinerary() {
    const passeios = [
      ...(Array.isArray((editing.services as any)?.passeios)
        ? ((editing.services as any).passeios as string[])
        : []),
      ...(Array.isArray((editing.services as any)?.tickets?.parks)
        ? ((editing.services as any).tickets.parks as string[])
        : []),
    ];
    const texto = gerarRoteiro({
      destino: editing.destination ?? "",
      noites: Number(editing.nights) || 0,
      temTransfer: !!(editing.services as any)?.transfer?.enabled,
      passeios,
    });
    setEditing({ ...editing, itinerary: texto });
    toast.success("Roteiro gerado em linha do tempo");
  }

  const genSummary = useServerFn(generatePackageSummary);
  const searchImages = useServerFn(searchCoverImages);


  const derived = useMemo(
    () => deriveFromFlights(editing),
    [editing.outbound_flight, editing.going_date, editing.destination, editing.origin],
  );

  // Auto-fill empty fields when derived values become available
  useEffect(() => {
    const patch: Partial<PackageRow> = {};
    if (!editing.destination && derived.destCity) patch.destination = derived.destCity;
    if (!editing.origin && derived.originCity) patch.origin = derived.originCity;
    if (!editing.title && derived.title) patch.title = derived.title;
    const currentSlug = editing.slug || derived.slug || "";
    if (currentSlug && !editing.id) {
      const base = currentSlug.replace(/[-#]\d+$/, "");
      if (nextNumber) {
        const desired = `${base}-${nextNumber}`;
        if (currentSlug !== desired) patch.slug = desired;
      } else if (!editing.slug && derived.slug) {
        patch.slug = derived.slug;
      }
    } else if (currentSlug && !editing.slug && derived.slug) {
      patch.slug = derived.slug;
    }

    if (Object.keys(patch).length) setEditing({ ...editing, ...patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived.destCity, derived.originCity, derived.title, derived.slug, nextNumber]);


  // Auto-preencher seguro quando fornecedor é GTA (padrão BRONZE AL = US$ 12.000 por pessoa).
  useEffect(() => {
    const supplier = String(editing.supplier_name ?? "").toLowerCase();
    if (!/\bgta\b/.test(supplier)) return;
    const svc = (editing.services ?? {}) as PackageServices;
    const cob = String(svc.seguro?.cobertura ?? "").trim();
    if (svc.seguro?.enabled && cob) return;
    setEditing({
      ...editing,
      services: {
        ...svc,
        seguro: {
          ...(svc.seguro ?? {}),
          enabled: true,
          moeda: (svc.seguro?.moeda ?? "USD") as SeguroMoeda,
          cobertura: cob || "12000",
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.supplier_name]);

  // Montar "O que inclui" a partir dos campos efetivamente preenchidos/marcados.
  // Só o nome do serviço — nada de textão do operador.

  const derivedIncludes = useMemo(() => {
    const list: string[] = [];
    const hasOutbound = !!editing.outbound_flight;
    const hasReturn = !!editing.return_flight;
    if (hasOutbound && hasReturn) list.push("Passagem Aérea de Ida e Volta");
    else if (hasOutbound || hasReturn) list.push("Passagem Aérea");
    if (editing.hotel_name || editing.tripadvisor_location_id) list.push("Hospedagem");
    const mealLabel = mealPlanLabel(classifyMealPlan(editing.meal_plan));
    if (mealLabel) list.push(mealLabel);
    const checked = !!(editing.outbound_flight?.checked_bag || editing.return_flight?.checked_bag);
    if (checked) list.push("Bagagem Despachada");
    const svc = (editing.services ?? {}) as PackageServices;
    if (svc.seguro?.enabled) {
      const cob = formatSeguroCobertura(svc.seguro.cobertura, svc.seguro.moeda ?? "USD");
      list.push(cob ? `Seguro Viagem — Cobertura ${cob} por pessoa` : "Seguro Viagem");
    }
    // Legado: registros antigos guardavam cancelamento dentro de seguro.
    const legacyCanc = formatSeguroCobertura(
      svc.seguro?.cancelamento,
      svc.seguro?.cancelamento_moeda,
    );
    if (svc.cancelamento?.enabled) {
      const canc = formatSeguroCobertura(svc.cancelamento.cobertura, svc.cancelamento.moeda ?? "BRL");
      list.push(
        canc
          ? `Cobertura de cancelamento involuntário de viagem — ${canc} por pessoa`
          : "Cobertura de cancelamento involuntário de viagem",
      );
    } else if (legacyCanc) {
      list.push(`Cobertura de cancelamento involuntário de viagem — ${legacyCanc} por pessoa`);
    }
    if (svc.transfer?.enabled) {
      const sentido = svc.transfer.sentido;
      const label =
        sentido === "in_out"
          ? "IN/OUT"
          : sentido === "in"
            ? "IN"
            : sentido === "out"
              ? "OUT"
              : "IN/OUT";
      list.push(`Transfer ${label} (Aeroporto ↔ Hotel)`);
      // Só o nome do serviço na lista pública — os detalhes ficam no serviço.
    }
    if (svc.city_tour?.enabled) list.push("City Tour");
    if (svc.tickets?.enabled) {
      const parks = (svc.tickets.parks ?? []).map((p) => String(p ?? "").trim()).filter(Boolean);
      for (const park of parks) list.push(`Ingresso para ${nomeItem(park)}`);
    }
    for (const o of svc.outros ?? []) {
      const t = nomeItem(o);
      if (t) list.push(t);
    }


    return list;
  }, [
    editing.outbound_flight,
    editing.return_flight,
    editing.hotel_name,
    editing.tripadvisor_location_id,
    editing.meal_plan,
    editing.services,
  ]);

  function handleGenerateIncludes() {
    if (derivedIncludes.length === 0) {
      toast.error("Preencha os aéreos e a hospedagem antes de gerar");
      return;
    }
    setEditing((prev) => (prev ? { ...prev, includes: derivedIncludes } : prev));
    toast.success("Itens inclusos gerados a partir do pacote");
  }

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
    const finalBrief =
      brief.length >= 2
        ? brief
        : dest.length >= 2
          ? `Resumo autoral sobre ${dest}, focado no que torna o lugar único.`
          : "";
    if (!finalBrief) {
      toast.error("Digite o destino ou escreva um resumo primeiro");
      return;
    }
    setAiLoading(true);
    try {
      const { text } = await genSummary({
        data: { brief: finalBrief, destination: dest || undefined },
      });
      setEditing({ ...editing, summary: text });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar resumo");
    } finally {
      setAiLoading(false);
    }
  }

  // Auto-gerar resumo assim que houver destino e o resumo estiver vazio.
  // Dispara também em cada troca de draft (pacote diferente com destino igual).
  useEffect(() => {
    const dest = (editing.destination ?? "").trim();
    const summary = (editing.summary ?? "").trim();
    if (!dest || summary || aiLoading) return;
    const t = setTimeout(() => {
      if ((editing.summary ?? "").trim()) return;
      void (async () => {
        setAiLoading(true);
        try {
          const { text } = await genSummary({
            data: {
              brief: `Resumo autoral sobre ${dest}, focado no que torna o lugar único.`,
              destination: dest,
            },
          });

          setEditing((prev) => (prev ? { ...prev, summary: text } : prev));
        } catch (err) {
          console.warn("[auto-summary] falhou", err);
        } finally {
          setAiLoading(false);
        }
      })();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.destination, editing.slug, draftIndex]);

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

  const kind: PackageKind = (editing.kind ?? "package") as PackageKind;
  const allTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "dates",
      label: "DATAS E PREÇOS",
      icon: <CalendarRange className="h-4 w-4" strokeWidth={1.75} />,
    },
    {
      id: "tourDetails",
      label: "DETALHES DO PASSEIO",
      icon: <MapPin className="h-4 w-4" strokeWidth={1.75} />,
    },
    {
      id: "hotel",
      label: kind === "cruise" ? "CRUZEIRO" : "HOSPEDAGEM",
      icon: kind === "cruise"
        ? <Ship className="h-4 w-4" strokeWidth={1.75} />
        : <Building2 className="h-4 w-4" strokeWidth={1.75} />,
    },
    { id: "flights", label: "AÉREOS", icon: <Plane className="h-4 w-4" strokeWidth={1.75} /> },
    {
      id: "extras",
      label: kind === "service" || kind === "tour" ? "SERVIÇOS INCLUSOS" : "EXTRAS E INCLUSOS",
      icon: <ListChecks className="h-4 w-4" strokeWidth={1.75} />,
    },
    {
      id: "about",
      label:
        kind === "tour"
          ? "SOBRE O PASSEIO"
          : kind === "service"
            ? "SOBRE O INGRESSO"
            : kind === "cruise"
              ? "SOBRE O CRUZEIRO"
              : "SOBRE O PACOTE",
      icon: <Info className="h-4 w-4" strokeWidth={1.75} />,
    },
  ];
  const tabs = allTabs.filter((t) => {
    if (kind === "tour") return t.id !== "hotel" && t.id !== "flights";
    if (kind === "service") return t.id !== "hotel" && t.id !== "flights" && t.id !== "tourDetails";
    if (kind === "cruise") return t.id !== "flights" && t.id !== "tourDetails";
    return t.id !== "tourDetails";
  });
  useEffect(() => {
    if (!tabs.find((t) => t.id === tab)) setTab(tabs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const kindLabel =
    kind === "service" ? "ingresso ou serviço" : kind === "tour" ? "passeio" : kind === "cruise" ? "cruzeiro" : "pacote";
  const dialogTitle = `${editing.id ? "Editar" : "Novo"} ${kindLabel}`;

  // Passeio novo: uma janela curta de importação; depois, editor completo em abas.
  const showTourGate =
    kind === "tour" && !editing.id && !tourImportDone && !(drafts && drafts.length > 0);
  if (showTourGate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card/70 backdrop-blur-2xl border border-border shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 bg-brand-orange rounded-full" />
              <h2 className="text-xl sm:text-2xl font-display font-bold">Importar passeio</h2>
            </div>
            <button
              type="button"
              onClick={() => closeCurrentDraft?.()}
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-4 p-6">
            <TourImportWizard
              destination={editing.destination}
              supplier={editing.supplier_name}
              onImported={(drafts) => onBulkToursImported?.(drafts)}
              onSkip={() => setTourImportDone(true)}
            />
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[1400px] h-[92vh] rounded-2xl bg-card/70 backdrop-blur-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 sm:px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-brand-orange rounded-full" />
            <h2 className="text-xl sm:text-2xl font-display font-bold">{dialogTitle}</h2>
          </div>

          <div className="flex items-center gap-2">
            <PackageImportButton
              onImported={(patch: Partial<PackageRow>) => {
                const previousServices = (editing?.services ?? {}) as PackageServices;
                const importedServices = (patch.services ?? {}) as PackageServices;
                setEditing({
                  ...(editing ?? {}),
                  ...patch,
                  services: {
                    ...previousServices,
                    ...importedServices,
                    seguro: {
                      ...(previousServices.seguro ?? {}),
                      ...(importedServices.seguro ?? {}),
                    },
                    cancelamento: {
                      ...(previousServices.cancelamento ?? {}),
                      ...(importedServices.cancelamento ?? {}),
                    },
                    transfer: {
                      ...(previousServices.transfer ?? {}),
                      ...(importedServices.transfer ?? {}),
                    },
                    city_tour: {
                      ...(previousServices.city_tour ?? {}),
                      ...(importedServices.city_tour ?? {}),
                    },
                    tickets: {
                      ...(previousServices.tickets ?? {}),
                      ...(importedServices.tickets ?? {}),
                      parks:
                        (importedServices.tickets?.parks && importedServices.tickets.parks.length
                          ? importedServices.tickets.parks
                          : previousServices.tickets?.parks) ?? [],
                    },
                    ticket_rules:
                      (importedServices.ticket_rules && importedServices.ticket_rules.length
                        ? importedServices.ticket_rules
                        : previousServices.ticket_rules) ?? [],
                    outros: importedServices.outros ?? previousServices.outros ?? [],

                  },
                });
              }}
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

        {drafts && drafts.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 sm:px-4 py-2.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground shrink-0 hidden md:inline">
              Importação múltipla
            </span>
            <button
              type="button"
              onClick={() => draftsScrollRef.current?.scrollBy({ left: -240, behavior: "smooth" })}
              aria-label="Rolar abas para a esquerda"
              className="shrink-0 grid place-items-center h-7 w-7 rounded-full border border-border bg-background hover:bg-muted text-foreground/70 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              ref={draftsScrollRef}
              className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin flex-1"
            >
              {drafts.map((d, i) => {
                const active = i === draftIndex;
                const label = d.destination?.trim() || d.title?.trim() || `Pacote ${i + 1}`;
                return (
                  <div key={i} className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => switchDraft?.(i)}
                      className={`px-3 py-1.5 rounded-l-lg text-[11px] font-bold uppercase tracking-wider transition ${
                        active
                          ? "bg-brand-orange text-white"
                          : "bg-background hover:bg-muted text-foreground/70 border border-border"
                      }`}
                    >
                      <span className="opacity-70 mr-1.5">#{i + 1}</span>
                      <span className="truncate max-w-[160px] inline-block align-bottom">
                        {label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (i === draftIndex) closeCurrentDraft?.();
                      }}
                      aria-label={`Descartar pacote ${i + 1}`}
                      title={active ? "Descartar este pacote" : "Selecione para descartar"}
                      className={`px-1.5 py-1.5 rounded-r-lg text-[11px] transition ${
                        active
                          ? "bg-brand-orange/80 hover:bg-brand-orange text-white"
                          : "bg-background hover:bg-muted text-foreground/40 border border-l-0 border-border cursor-not-allowed opacity-60"
                      }`}
                      disabled={!active}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => draftsScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
              aria-label="Rolar abas para a direita"
              className="shrink-0 grid place-items-center h-7 w-7 rounded-full border border-border bg-background hover:bg-muted text-foreground/70 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

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
                    Título, slug, destino e origem são preenchidos automaticamente a partir dos
                    aéreos. Você pode editar se quiser.
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
                    value={editing.title || derived.title || ""}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="Ex: Aracaju - Saída de São Paulo"
                  />
                </FormField>
                <FormField label="Slug (URL, auto)">
                  <input
                    className={inp}
                    value={
                      editing.slug ||
                      (derived.slug
                        ? !editing.id && nextNumber
                          ? `${derived.slug.replace(/[-#]\d+$/, "")}-${nextNumber}`
                          : derived.slug
                        : "")
                    }
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    placeholder="aracaju-abril-2027"
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
                    onBlur={() => {
                      const dest = (editing.destination ?? "").trim();
                      const summary = (editing.summary ?? "").trim();
                      if (dest.length >= 2 && !summary && !aiLoading) {
                        void handleGenerateSummary();
                      }
                    }}
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
                      <img
                        src={editing.image_url}
                        alt="capa"
                        className="w-full h-full object-cover"
                      />
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
                          {imgLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
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
                                <img
                                  src={r.thumb || r.url}
                                  alt={r.title}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/90">
                                  {r.source === "Pexels"
                                    ? "PX"
                                    : r.source === "Unsplash"
                                      ? "UN"
                                      : r.source === "Openverse"
                                        ? "OV"
                                        : "WC"}
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
                                {imgLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                Carregar mais fotos
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        {imgSource || "Wikimedia Commons + Openverse"} — sempre confira licença e
                        autoria.
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary with AI */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs text-muted-foreground">
                      Resumo curto — gerado automaticamente a partir do destino. Escreva algo
                      específico e clique em Regerar para personalizar.
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateSummary}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-2.5 py-1 text-[11px] font-semibold text-brand-orange hover:bg-brand-orange/20 transition disabled:opacity-60"
                    >
                      {aiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
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
                  <SupplierInput
                    value={editing.supplier_name ?? ""}
                    onChange={(v) => setEditing({ ...editing, supplier_name: v })}
                    placeholder="Ex: CVC, Nascimento, Flytour…"
                  />
                </FormField>
                <div className="sm:col-span-2 rounded-xl border border-border bg-muted/20 p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Ativo no site</div>
                    <div className="text-xs text-muted-foreground">
                      Se desativado, não aparece na listagem pública.
                    </div>
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

            {tab === "tourDetails" && kind === "tour" && (
              <TourInfoEditor
                value={editing as any}
                onChange={(patch) => setEditing({ ...editing, ...patch } as any)}
              />
            )}

            {tab === "dates" && kind === "tour" && (
              <div className="mb-4 space-y-4">
                <TourDatesEditor
                  key={editing.id ?? (editing as any).__draftId ?? `draft-${draftIndex}`}
                  packageId={editing.id}

                  modalities={(editing as any).tour_modalities ?? []}
                  pendingRows={(editing as any).__pendingPrices ?? []}
                  onRowsChange={(rows) => {
                    const draftId = (editing as any).__draftId as string | undefined;
                    if (drafts?.length && updateTourDraftRows && draftId) {
                      updateTourDraftRows(draftId, rows);
                      return;
                    }
                    setEditing((prev: any) => ({ ...prev, __pendingPrices: rows }));
                  }}

                />

              </div>
            )}

            {tab === "dates" && (
              <div className="grid sm:grid-cols-2 gap-3">
                {kind === "package" && (
                  <FormField label="Flexibilidade de datas" wide>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ ...editing, flexible_dates: !(editing.flexible_dates ?? false) })
                      }
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        editing.flexible_dates
                          ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                          : "border-border hover:border-brand-orange/50"
                      }`}
                    >
                      {editing.flexible_dates ? "✓ Data flexível" : "Data flexível"}
                    </button>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Exibe o aviso: datas sujeitas à disponibilidade e alteração de valor sem aviso prévio.
                    </p>
                  </FormField>
                )}

                {kind !== "package" && kind !== "tour" && (
                <FormField label="Modo de data" wide>
                  <div className="flex gap-2">
                    {([
                      { v: "fixed", label: "Data fixa" },
                      { v: "flexible", label: "Cliente escolhe a data" },
                    ] as const).map((o) => {
                      const active = (editing.date_mode ?? "fixed") === o.v;
                      return (
                        <button
                          type="button"
                          key={o.v}
                          onClick={() => setEditing({ ...editing, date_mode: o.v })}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                            active
                              ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                              : "border-border hover:border-brand-orange/50"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
                )}

                {kind !== "tour" && (editing.date_mode ?? "fixed") === "fixed" && (
                  kind === "service" ? (
                    <FormField label="Data do evento / uso">
                      <input
                        type="date"
                        className={inp}
                        value={editing.going_date ?? ""}
                        onChange={(e) => setEditing({ ...editing, going_date: e.target.value, return_date: e.target.value })}
                      />
                    </FormField>
                  ) : (
                    <>
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
                    </>
                  )
                )}
                {kind !== "service" && kind !== "tour" && (
                  <FormField label="Noites">
                    <input
                      type="number"
                      className={inp}
                      value={editing.nights ?? 0}
                      onChange={(e) => setEditing({ ...editing, nights: Number(e.target.value) })}
                    />
                  </FormField>
                )}

                {kind !== "package" && kind !== "tour" && (
                <FormField label="Modo de preço" wide>
                  <div className="flex gap-2">
                    {([
                      { v: "per_occupancy", label: "Por ocupação (pacote fechado)" },
                      { v: "per_unit", label: "Individual (por unidade)" },
                    ] as const).map((o) => {
                      const active = (editing.pricing_mode ?? "per_occupancy") === o.v;
                      return (
                        <button
                          type="button"
                          key={o.v}
                          onClick={() => setEditing({ ...editing, pricing_mode: o.v })}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                            active
                              ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                              : "border-border hover:border-brand-orange/50"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
                )}

                {(editing.pricing_mode ?? "per_occupancy") === "per_occupancy" ? (
                  <FormField label="Ocupação base (adultos)">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className={inp}
                      value={editing.base_occupancy ?? 2}
                      onChange={(e) =>
                        setEditing({ ...editing, base_occupancy: Number(e.target.value) })
                      }
                    />
                  </FormField>
                ) : (
                  <FormField label="Máx. por reserva (1 a 9)">
                    <input
                      type="number"
                      min={1}
                      max={9}
                      className={inp}
                      value={editing.max_units ?? 9}
                      onChange={(e) =>
                        setEditing({ ...editing, max_units: Math.min(9, Math.max(1, Number(e.target.value) || 1)) })
                      }
                    />
                  </FormField>
                )}
                {kind !== "tour" && (
                  <FormField label="Preço por pessoa *">
                    <input
                      type="number"
                      step="0.01"
                      className={inp}
                      value={editing.price_per_person ?? 0}
                      onChange={(e) =>
                        setEditing({ ...editing, price_per_person: Number(e.target.value) })
                      }
                    />
                  </FormField>
                )}
                <FormField
                  label={
                    kind === "tour"
                      ? "Valor das taxas (somado ao preço do HTML)"
                      : "Valor das taxas inclusas (informativo)"
                  }
                >
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

            {tab === "hotel" && kind === "cruise" && (
              <div className="space-y-4">
                {/* Importador rápido da FRT — fica no topo pra atalho */}
                <CruiseUrlImporter
                  inpClass={inp}
                  onImported={(details) => setEditing({ ...editing, cruise_details: details })}
                />

                {/* Editor estruturado dos detalhes do cruzeiro */}
                <CruiseDetailsEditor
                  value={editing.cruise_details}
                  onChange={(details) => setEditing({ ...editing, cruise_details: details as any })}
                />

                {/* Serviços adicionais do pacote (transfer, seguro, etc.) — igual pacote */}
                <details className="rounded-2xl border border-border bg-muted/30 p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Serviços extras do pacote (transfer, seguro, city tour…)
                  </summary>
                  <div className="mt-3">
                    <CruiseEditor
                      value={(editing.services ?? {}) as PackageServices}
                      onChange={(next) => setEditing({ ...editing, services: next })}
                      inpClass={inp}
                    />
                  </div>
                </details>

                {/* JSON bruto — só pra troubleshooting */}
                <details className="rounded-2xl border border-dashed border-border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Ver / editar JSON bruto (avançado)
                  </summary>
                  <textarea
                    className={`${inp} mt-2 font-mono text-[11px]`}
                    rows={12}
                    value={
                      editing.cruise_details == null
                        ? ""
                        : typeof editing.cruise_details === "string"
                          ? (editing.cruise_details as string)
                          : JSON.stringify(editing.cruise_details, null, 2)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw.trim()) {
                        setEditing({ ...editing, cruise_details: null });
                        return;
                      }
                      try {
                        setEditing({ ...editing, cruise_details: JSON.parse(raw) });
                      } catch {
                        setEditing({ ...editing, cruise_details: raw as any });
                      }
                    }}
                  />
                </details>
              </div>
            )}


            {tab === "hotel" && kind !== "cruise" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <HotelOptionsPanel
                  options={(Array.isArray((editing as any).hotel_options) ? (editing as any).hotel_options : []) as any}
                  occupancy={Number(editing.base_occupancy) || 2}
                  selectedIndex={hotelSelIdx < 0 ? 0 : hotelSelIdx}
                  onSelectIndex={setHotelOptIdx}

                  onChange={(next, base) =>
                    setEditing({
                      ...editing,
                      hotel_options: next as any,
                      ...(base
                        ? {
                            hotel_name: base.hotel_name,
                            room_type: base.room_type ?? editing.room_type,
                            room_category: (base as any).room_category ?? editing.room_category,
                            bed_type: (base as any).bed_type ?? editing.bed_type,
                            meal_plan: base.meal_plan ?? editing.meal_plan,
                            hotel_stays:
                              Array.isArray((base as any).stays) && (base as any).stays.length > 1
                                ? ((base as any).stays as any[])
                                : null,
                            price_per_person: Number(base.price_per_person) || editing.price_per_person,
                            ...(base.tripadvisor_location_id
                              ? {
                                  hotel_stars: base.hotel_stars ?? editing.hotel_stars,
                                  tripadvisor_location_id: base.tripadvisor_location_id,
                                  tripadvisor_url: base.tripadvisor_url ?? null,
                                  tripadvisor_address: base.tripadvisor_address ?? null,
                                  tripadvisor_photos: base.tripadvisor_photos ?? null,
                                }
                              : {}),
                          }
                        : {}),
                    })
                  }

                />

                {normalizeStays((editing as any).hotel_stays).length > 1 && (
                  <div className="sm:col-span-2 rounded-2xl border border-border bg-muted/30 p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Roteiro com {normalizeStays((editing as any).hotel_stays).length} hospedagens
                    </div>
                    <HotelStaysList stays={normalizeStays((editing as any).hotel_stays)} />
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Todas as hospedagens acima aparecem para o cliente na página do pacote.
                    </p>
                  </div>
                )}

                <FormField
                  label={
                    hotelSelIdx >= 0
                      ? `Hotel — opção ${hotelSelIdx + 1}${hotelSelIdx === 0 ? " (base)" : ""}`
                      : "Hotel"
                  }
                  wide
                >
                  <HotelAutocomplete
                    key={`hotel-${hotelSelIdx}`}
                    value={hv.hotel_name ?? ""}
                    mode={hotelSelIdx >= 0 ? (hv.tripadvisor_location_id ? "live" : hotelMode) : hotelMode}
                    onModeChange={setHotelMode}
                    onChangeText={(v) => setHotel({ hotel_name: v })}
                    onSelect={(h) => {
                      const automaticStars =
                        h.rating != null
                          ? Math.min(5, Math.max(1, Math.round(h.rating)))
                          : h.hotel_class != null
                            ? Math.min(5, Math.max(1, Math.round(h.hotel_class)))
                            : 3;
                      setHotel({
                        hotel_name: h.name,
                        hotel_stars: automaticStars,
                        tripadvisor_location_id: String(h.location_id),
                        tripadvisor_url: h.tripadvisor_url ?? null,
                        tripadvisor_address: h.address ?? null,
                        tripadvisor_photos: h.photos && h.photos.length > 0 ? h.photos : null,
                      });
                      if (hotelSelIdx <= 0 && !(editing.image_url && editing.image_url.length > 0)) {
                        setEditing((prev: any) =>
                          prev ? { ...prev, image_url: h.photos[0] ?? prev.image_url ?? "" } : prev,
                        );
                      }
                    }}
                  />
                </FormField>
                <FormField label="Estrelas (1-5)">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className={inp}
                    value={hv.hotel_stars ?? 3}
                    onChange={(e) => setHotel({ hotel_stars: Number(e.target.value) })}
                  />
                </FormField>

                <FormField label="Regime de alimentação">
                  <select
                    className={inp}
                    value={hv.meal_plan ?? ""}
                    onChange={(e) => setHotel({ meal_plan: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    {hv.meal_plan &&
                      ![
                        "Sem refeição",
                        "Café da manhã",
                        "Meia pensão",
                        "Pensão completa",
                        "All inclusive",
                      ].includes(hv.meal_plan) && <option value={hv.meal_plan}>{hv.meal_plan}</option>}
                    <option value="Sem refeição">Sem refeição</option>
                    <option value="Café da manhã">Café da manhã</option>
                    <option value="Meia pensão">Meia pensão (café + 1 refeição)</option>
                    <option value="Pensão completa">
                      Pensão completa (café + almoço + jantar)
                    </option>
                    <option value="All inclusive">All inclusive</option>
                  </select>
                </FormField>
                <FormField label="Tipo de quarto">
                  <select
                    className={inp}
                    value={hv.room_type ?? ""}
                    onChange={(e) => setHotel({ room_type: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    {hv.room_type &&
                      ![
                        "Standard",
                        "Superior",
                        "Luxo",
                        "Suíte",
                        "Suíte Master",
                        "Suíte Presidencial",
                        "Bangalô",
                        "Chalé",
                      ].includes(hv.room_type) && <option value={hv.room_type}>{hv.room_type}</option>}
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
                    value={hv.room_category ?? ""}
                    onChange={(e) => setHotel({ room_category: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    {hv.room_category &&
                      ![
                        "Vista interna",
                        "Vista cidade",
                        "Vista jardim",
                        "Vista piscina",
                        "Vista parcial mar",
                        "Vista mar",
                        "Frente mar",
                        "Vista montanha",
                      ].includes(hv.room_category) && (
                        <option value={hv.room_category}>{hv.room_category}</option>
                      )}
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
                    value={hv.bed_type ?? ""}
                    onChange={(e) => setHotel({ bed_type: e.target.value })}
                  >
                    <option value="">— Não informado —</option>
                    {hv.bed_type &&
                      ![
                        "1 cama de casal",
                        "1 cama king",
                        "1 cama queen",
                        "2 camas de solteiro",
                        "2 camas queen",
                        "2 camas de casal",
                        "1 casal + 1 solteiro",
                        "1 casal + 2 solteiros",
                        "3 camas de solteiro",
                        "Cama de casal + sofá-cama",
                      ].includes(hv.bed_type) && <option value={hv.bed_type}>{hv.bed_type}</option>}
                    <option value="1 cama de casal">1 cama de casal</option>
                    <option value="1 cama king">1 cama king</option>
                    <option value="1 cama queen">1 cama queen</option>
                    <option value="2 camas de solteiro">2 camas de solteiro</option>
                    <option value="2 camas queen">2 camas queen</option>
                    <option value="2 camas de casal">2 camas de casal</option>
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
                    {(
                      [
                        { id: "outbound", label: "Voo de ida", filled: !!editing.outbound_flight },
                        { id: "return", label: "Voo de volta", filled: !!editing.return_flight },
                      ] as const
                    ).map((t) => {
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
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-brand-orange"}`}
                            />
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
                <div className="sm:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      Roteiro (linha do tempo — um dia por linha)
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateItinerary}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-semibold text-brand-orange transition hover:bg-brand-orange/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Gerar roteiro
                    </button>
                  </div>
                  <textarea
                    className={`${inp} min-h-[140px]`}
                    value={editing.itinerary ?? ""}
                    onChange={(e) => setEditing({ ...editing, itinerary: e.target.value })}
                  />
                </div>


                <ServicesEditor
                  value={(editing.services ?? {}) as PackageServices}
                  onChange={(next) => setEditing({ ...editing, services: next })}
                  inpClass={inp}
                  kind={kind}
                />


                <div className="sm:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      O que inclui (um por linha)
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateIncludes}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-semibold text-brand-orange transition hover:bg-brand-orange/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Gerar
                    </button>
                  </div>
                  <textarea
                    className={`${inp} min-h-[140px]`}
                    value={
                      Array.isArray(editing.includes)
                        ? editing.includes.join("\n")
                        : ((editing.includes as unknown as string) ?? "")
                    }
                    onChange={(e) =>
                      setEditing({ ...editing, includes: e.target.value as unknown as string[] })
                    }
                  />
                </div>
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
            {drafts && drafts.length > 1 ? (
              <>
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-orange/60 px-4 py-2 text-sm font-semibold text-brand-orange hover:bg-brand-orange/10 disabled:opacity-60"
                  title={`Salvar apenas este ${kind === "tour" ? "passeio" : "pacote"} e ir para o próximo`}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar este
                </button>
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar todos os {kind === "tour" ? "passeios" : "pacotes"} ({drafts.length})
                </button>
              </>
            ) : (
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar {kind === "tour" ? "passeio" : kind === "service" ? "ingresso" : kind === "cruise" ? "cruzeiro" : "pacote"}
              </button>
            )}
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

function Detail({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {hint ? (
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{hint}</p>
        ) : (
          <span className="sr-only">{title}</span>
        )}
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function ServicesEditor({
  value,
  onChange,
  inpClass,
  kind = "package",
}: {
  value: PackageServices;
  onChange: (next: PackageServices) => void;
  inpClass: string;
  kind?: PackageKind;
}) {
  const v = value ?? {};
  const seguro = v.seguro ?? {};
  const transfer = v.transfer ?? {};
  const cityTour = v.city_tour ?? {};
  const tickets = v.tickets ?? {};
  const parks = (tickets.parks ?? []) as string[];
  const ticketRules = (v.ticket_rules ?? []) as NonNullable<PackageServices["ticket_rules"]>;
  const outros = v.outros ?? [];
  const showCancelamento = kind === "package" || kind === "cruise";
  const showCityTour = kind === "package";
  const showTickets = kind === "package" || kind === "service" || kind === "tour";
  const showOutros = kind !== "service";
  const birthday = ((v as any).birthday ?? {}) as { enabled?: boolean; condicao?: string };
  const [sel, setSel] = useState<string>("seguro");

  function patch(p: Partial<PackageServices>) {
    onChange({ ...v, ...p });
  }

  type ServiceItem = {
    id: string;
    label: string;
    icon: LucideIcon;
    show: boolean;
    enabled?: boolean;
    count?: number;
    toggle?: (checked: boolean) => void;
  };

  const allItems: ServiceItem[] = [
    {
      id: "seguro",
      label: "Seguro viagem",
      icon: Shield,
      show: true,
      enabled: !!seguro.enabled,
      toggle: (c) => patch({ seguro: { ...seguro, enabled: c } }),
    },
    {
      id: "cancelamento",
      label: "Cancelamento involuntário",
      icon: Shield,
      show: showCancelamento,
      enabled: !!v.cancelamento?.enabled,
      toggle: (c) => patch({ cancelamento: { ...(v.cancelamento ?? {}), enabled: c } }),
    },
    {
      id: "transfer",
      label: kind === "service" ? "Transfer hotel ↔ evento" : "Transfer aeroporto ↔ hotel",
      icon: Bus,
      show: true,
      enabled: !!transfer.enabled,
      toggle: (c) => patch({ transfer: { ...transfer, enabled: c, sentido: transfer.sentido ?? "in_out" } }),
    },
    {
      id: "city_tour",
      label: "City tour / passeios",
      icon: MapPinIcon,
      show: showCityTour,
      enabled: !!cityTour.enabled,
      toggle: (c) => patch({ city_tour: { ...cityTour, enabled: c } }),
    },
    {
      id: "tickets",
      label: "Ingressos (parques)",
      icon: Ticket,
      show: showTickets,
      enabled: !!tickets.enabled,
      toggle: (c) => patch({ tickets: { ...tickets, enabled: c, parks: parks.length ? parks : [""] } }),
    },
    {
      id: "birthday",
      label: "Cortesia aniversariante",
      icon: Sparkles,
      show: showTickets,
      enabled: !!birthday.enabled,
      toggle: (c) => patch({ birthday: { ...birthday, enabled: c } } as Partial<PackageServices>),
    },
    {
      id: "ticket_rules",
      label: "Regras dos ingressos",
      icon: ListChecks,
      show: showTickets,
      count: ticketRules.length,
    },
    {
      id: "outros",
      label: "Outros serviços",
      icon: ListChecks,
      show: showOutros,
      count: outros.length,
    },
    {
      id: "addons",
      label: "Opcionais (checkout)",
      icon: Sparkles,
      show: true,
      count: (v.addons ?? []).length,
    },
  ];
  const items = allItems.filter((i) => i.show);



  const detail = (() => {
    switch (sel) {
      case "seguro":
        return (
          <Detail title="Seguro viagem" hint="Cobertura médica por pessoa, exibida no checkout e no flyer.">
            <div className="grid grid-cols-1 sm:grid-cols-[140px_110px_1fr] gap-2 items-center">
              <span className="text-xs text-muted-foreground">Cobertura médica</span>
              <select
                className={inpClass}
                value={(seguro.moeda ?? "USD") as SeguroMoeda}
                onChange={(e) => patch({ seguro: { ...seguro, enabled: true, moeda: e.target.value as SeguroMoeda } })}
              >
                <option value="BRL">R$ (Real)</option>
                <option value="USD">US$ (Dólar)</option>
                <option value="EUR">€ (Euro)</option>
              </select>
              <input
                className={inpClass}
                placeholder="Ex.: 30.000 · 40.000 · 12.000"
                value={seguro.cobertura ?? ""}
                onChange={(e) => patch({ seguro: { ...seguro, enabled: true, cobertura: e.target.value } })}
              />
            </div>
            {seguro.cobertura && (
              <div className="text-[11px] text-muted-foreground">
                Prévia: Cobertura médica {formatSeguroCobertura(seguro.cobertura, seguro.moeda)} por pessoa
              </div>
            )}
          </Detail>
        );
      case "cancelamento":
        return (
          <Detail title="Cancelamento involuntário" hint="Valor de cobertura por pessoa.">
            <div className="grid grid-cols-1 sm:grid-cols-[140px_110px_1fr] gap-2 items-center">
              <span className="text-xs text-muted-foreground">Cobertura</span>
              <select
                className={inpClass}
                value={(v.cancelamento?.moeda ?? "BRL") as SeguroMoeda}
                onChange={(e) =>
                  patch({ cancelamento: { ...(v.cancelamento ?? {}), enabled: true, moeda: e.target.value as SeguroMoeda } })
                }
              >
                <option value="BRL">R$ (Real)</option>
                <option value="USD">US$ (Dólar)</option>
                <option value="EUR">€ (Euro)</option>
              </select>
              <input
                className={inpClass}
                placeholder="Ex.: 5.000 · 8.000 · 10.000"
                value={v.cancelamento?.cobertura ?? ""}
                onChange={(e) =>
                  patch({ cancelamento: { ...(v.cancelamento ?? {}), enabled: true, cobertura: e.target.value } })
                }
              />
            </div>
            {v.cancelamento?.cobertura && (
              <div className="text-[11px] text-muted-foreground">
                Prévia: Cobertura de cancelamento involuntário de viagem —{" "}
                {formatSeguroCobertura(v.cancelamento.cobertura, v.cancelamento.moeda)} por pessoa
              </div>
            )}
          </Detail>
        );
      case "transfer":
        return (
          <Detail
            title={kind === "service" ? "Transfer hotel ↔ evento" : "Transfer aeroporto ↔ hotel"}
            hint="Defina o sentido e os pontos de embarque."
          >
            <div className="flex flex-wrap gap-2">
              {(
                kind === "service"
                  ? ([
                      { id: "in", label: "Só ida (hotel → evento)" },
                      { id: "out", label: "Só volta (evento → hotel)" },
                      { id: "in_out", label: "Ida e volta" },
                    ] as const)
                  : ([
                      { id: "in", label: "Só ida (IN)" },
                      { id: "out", label: "Só volta (OUT)" },
                      { id: "in_out", label: "Ida e volta (IN/OUT)" },
                    ] as const)
              ).map((opt) => {
                const active = (transfer.sentido ?? "in_out") === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ transfer: { ...transfer, enabled: true, sentido: opt.id } })}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active ? "bg-brand-orange text-white border-brand-orange" : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {kind === "service"
                  ? "Pontos de saída (um por linha) — o cliente escolhe no checkout"
                  : "Pontos de saída / embarque (um por linha)"}
              </label>
              <textarea
                rows={3}
                value={transfer.pickup_points ?? ""}
                onChange={(e) => patch({ transfer: { ...transfer, enabled: true, pickup_points: e.target.value } })}
                placeholder={
                  kind === "service"
                    ? "Ex.:\nHotel Copacabana Palace\nWindsor Barra"
                    : "Ex.:\nSão Paulo — Terminal Tietê\nCampinas — Shopping Iguatemi"
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
              />
            </div>
          </Detail>
        );
      case "city_tour":
        return (
          <Detail title="City tour / passeios inclusos" hint="Descreva rapidamente o que está incluso.">
            <input
              className={inpClass}
              placeholder="Ex.: City tour panorâmico de meio período"
              value={cityTour.detalhe ?? ""}
              onChange={(e) => patch({ city_tour: { ...cityTour, enabled: true, detalhe: e.target.value } })}
            />
          </Detail>
        );
      case "tickets":
        return (
          <Detail title="Ingressos (parques / atrações)" hint="Ex.: Disney, Universal, SeaWorld.">
            {(parks.length ? parks : [""]).map((park, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className={inpClass}
                  placeholder="Nome do parque / atração"
                  value={park ?? ""}
                  onChange={(e) => {
                    const next = [...(parks.length ? parks : [""])];
                    next[idx] = e.target.value;
                    patch({ tickets: { ...tickets, enabled: true, parks: next } });
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = (parks.length ? parks : [""]).filter((_, i) => i !== idx);
                    patch({ tickets: { ...tickets, enabled: next.length > 0, parks: next } });
                  }}
                  className="rounded-lg border border-border px-2 hover:bg-muted"
                  aria-label="Remover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch({ tickets: { ...tickets, enabled: true, parks: [...(parks.length ? parks : [""]), ""] } })}
              className="self-start text-xs text-brand-orange hover:underline"
            >
              + Adicionar parque
            </button>
          </Detail>
        );
      case "ticket_rules":
        return (
          <Detail
            title="Regras dos ingressos"
            hint="Resumo curto que aparece na página do cliente."
            action={
              <button
                type="button"
                onClick={() => patch({ ticket_rules: [...ticketRules, { name: "", usage_date: "", validity: "", rules: [] }] })}
                className="text-xs text-brand-orange hover:underline"
              >
                + Adicionar ingresso
              </button>
            }
          >
            {ticketRules.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma regra. Ao importar um orçamento em PDF, a IA resume as condições automaticamente.
              </p>
            ) : (
              ticketRules.map((rule, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-border p-2">
                  <div className="flex gap-2">
                    <input
                      className={inpClass}
                      placeholder="Nome do ingresso (ex.: Cortesia de aniversariante — 1 dia)"
                      value={rule?.name ?? ""}
                      onChange={(e) => {
                        const next = [...ticketRules];
                        next[idx] = { ...next[idx], name: e.target.value };
                        patch({ ticket_rules: next });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => patch({ ticket_rules: ticketRules.filter((_, i) => i !== idx) })}
                      className="rounded-lg border border-border px-2 hover:bg-muted"
                      aria-label="Remover ingresso"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className={inpClass}
                      placeholder="Utilização (DD/MM/AAAA)"
                      value={rule?.usage_date ?? ""}
                      onChange={(e) => {
                        const next = [...ticketRules];
                        next[idx] = { ...next[idx], usage_date: e.target.value };
                        patch({ ticket_rules: next });
                      }}
                    />
                    <input
                      className={inpClass}
                      placeholder="Validade (DD/MM/AAAA)"
                      value={rule?.validity ?? ""}
                      onChange={(e) => {
                        const next = [...ticketRules];
                        next[idx] = { ...next[idx], validity: e.target.value };
                        patch({ ticket_rules: next });
                      }}
                    />
                  </div>
                  <textarea
                    rows={4}
                    className={inpClass}
                    placeholder={"Uma regra por linha"}
                    value={(rule?.rules ?? []).join("\n")}
                    onChange={(e) => {
                      const next = [...ticketRules];
                      next[idx] = {
                        ...next[idx],
                        rules: e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                      };
                      patch({ ticket_rules: next });
                    }}
                  />
                </div>
              ))
            )}
          </Detail>
        );
      case "outros":
        return (
          <Detail
            title="Outros serviços"
            hint="Ex.: assistência 24h, bagagem extra, eSIM."
            action={
              <button
                type="button"
                onClick={() => patch({ outros: [...outros, ""] })}
                className="text-xs text-brand-orange hover:underline"
              >
                + Adicionar
              </button>
            }
          >
            {outros.length === 0 && <p className="text-xs text-muted-foreground">Nenhum serviço extra.</p>}
            {outros.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className={inpClass}
                  placeholder="Nome do serviço"
                  value={item ?? ""}
                  onChange={(e) => {
                    const next = [...outros];
                    next[idx] = e.target.value;
                    patch({ outros: next });
                  }}
                />
                <button
                  type="button"
                  onClick={() => patch({ outros: outros.filter((_, i) => i !== idx) })}
                  className="rounded-lg border border-border px-2 hover:bg-muted"
                  aria-label="Remover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Detail>
        );
      case "birthday":
        return (
          <Detail
            title="Cortesia de aniversariante"
            hint="Opcional e sem custo — o cliente marca no checkout e informa a data de nascimento."
          >
            <input
              className={inpClass}
              placeholder="Condição resumida (ex.: grátis com 3 acompanhantes pagantes)"
              value={birthday.condicao ?? ""}
              onChange={(e) => patch({ birthday: { ...birthday, enabled: true, condicao: e.target.value } })}
            />
            <p className="text-[11px] text-muted-foreground">
              No checkout aparece “Sou aniversariante (cortesia)” com valor R$ 0, sem somar no total.
            </p>
          </Detail>
        );
      case "addons":
        return (
          <AddonsEditor
            value={(v.addons ?? []) as NonNullable<PackageServices["addons"]>}
            onChange={(next) => patch({ addons: next })}
            inpClass={inpClass}
            kind={kind}
          />
        );
      default:
        return null;
    }
  })();

  const current = items.find((i) => i.id === sel);

  return (
    <div className="sm:col-span-2 overflow-hidden rounded-2xl border border-border bg-background/40 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.5)]">
      <div className="grid items-stretch md:grid-cols-[288px_1fr]">
        {/* Sidebar */}
        <aside className="flex flex-col border-b border-border bg-muted/20 md:border-b-0 md:border-r">
          <div className="border-b border-border/60 px-5 py-4">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Serviços incluídos
            </h4>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {items.map((it) => {
              const Icon = it.icon;
              const active = sel === it.id;
              const on = !!it.enabled;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSel(it.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    active
                      ? "border border-brand-orange/25 bg-brand-orange/10 text-foreground"
                      : "border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        on
                          ? "bg-brand-orange shadow-[0_0_8px_hsl(var(--brand-orange))]"
                          : "bg-border"
                      }`}
                    />
                    <Icon className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate text-sm font-medium">{it.label}</span>
                  </span>

                  {it.toggle ? (
                    <span
                      role="switch"
                      aria-checked={on}
                      onClick={(e) => {
                        e.stopPropagation();
                        it.toggle?.(!on);
                        setSel(it.id);
                      }}
                      className={`relative h-4 w-8 shrink-0 cursor-pointer rounded-full transition ${
                        on ? "bg-brand-orange" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-2 w-2 rounded-full transition-all ${
                          on ? "right-1 bg-white" : "left-1 bg-muted-foreground/40"
                        }`}
                      />
                    </span>
                  ) : it.count ? (
                    <span className="shrink-0 rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-bold text-brand-orange">
                      {it.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Painel de detalhe */}
        <main className="flex min-h-[520px] flex-col bg-card/40">
          <header className="flex h-16 items-center justify-between gap-3 border-b border-border/60 px-6">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">{current?.label ?? "Serviços"}</h3>
              {current?.toggle && (
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    current.enabled
                      ? "border border-brand-orange/30 bg-brand-orange/15 text-brand-orange"
                      : "border border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {current.enabled ? "Ativado" : "Desativado"}
                </span>
              )}
            </div>
          </header>

          <div className="max-h-[65vh] flex-1 overflow-y-auto p-6">
            <div className="w-full">{detail}</div>
          </div>
        </main>
      </div>
    </div>
  );
}


function AddonsEditor({
  value,
  onChange,
  inpClass,
  kind,
}: {
  value: NonNullable<PackageServices["addons"]>;
  onChange: (next: NonNullable<PackageServices["addons"]>) => void;
  inpClass: string;
  kind: PackageKind;
}) {
  const addons = value ?? [];
  const patchAt = (idx: number, p: Partial<NonNullable<PackageServices["addons"]>[number]>) => {
    const next = addons.map((a, i) => (i === idx ? { ...a, ...p } : a));
    onChange(next);
  };
  return (
    <div className="sm:col-span-2 rounded-xl border border-dashed border-brand-orange/40 bg-brand-orange/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-orange" />
          <span className="text-sm font-medium">Serviços adicionais (opcionais)</span>
          <span className="text-[11px] text-muted-foreground">
            — o cliente marca no checkout e o valor soma no total
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange([...addons, { name: "", description: "", price: 0, per: kind === "service" ? "unit" : "order" }])
          }
          className="text-xs text-brand-orange hover:underline"
        >
          + Adicionar opcional
        </button>
      </div>
      {addons.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Ex.: fura-fila, foto oficial, refeição extra, upgrade de assento. Ficam ocultos se não houver nenhum.
        </p>
      )}
      <div className="space-y-2">
        {addons.map((a, idx) => (
          <div key={idx} className="rounded-lg border border-border bg-background p-2 space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_auto]">
              <input
                className={inpClass}
                placeholder="Nome (ex.: Fura-fila Universal)"
                value={a.name ?? ""}
                onChange={(e) => patchAt(idx, { name: e.target.value })}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                className={inpClass}
                placeholder="Preço (R$)"
                value={a.price ?? 0}
                onChange={(e) => patchAt(idx, { price: Number(e.target.value) || 0 })}
              />
              <select
                className={inpClass}
                value={a.per ?? "unit"}
                onChange={(e) => patchAt(idx, { per: e.target.value as "unit" | "order" })}
              >
                <option value="unit">por pessoa/ingresso</option>
                <option value="order">por reserva</option>
              </select>
              <button
                type="button"
                onClick={() => onChange(addons.filter((_, i) => i !== idx))}
                className="rounded-lg border border-border px-2 hover:bg-muted"
                aria-label="Remover"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              className={inpClass}
              placeholder="Descrição curta (opcional) — ex.: acesso preferencial em todas as atrações"
              value={a.description ?? ""}
              onChange={(e) => patchAt(idx, { description: e.target.value })}
            />
            <div className="grid gap-2 sm:grid-cols-[auto_1fr] items-center">
              <label className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-emerald-600"
                  checked={!!a.recommended}
                  onChange={(e) => patchAt(idx, { recommended: e.target.checked })}
                />
                Recomendado
              </label>
              <input
                className={inpClass}
                placeholder="Motivo (opcional) — ex.: Combo 2 parques sai mais barato"
                value={a.recommended_reason ?? ""}
                onChange={(e) => patchAt(idx, { recommended_reason: e.target.value })}
                disabled={!a.recommended}
              />
            </div>
            <WeekdayPricingEditor
              tiers={a.price_by_weekday ?? []}
              onChange={(next) => patchAt(idx, { price_by_weekday: next })}
              inpClass={inpClass}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// (marker) 

type WeekdayTier = NonNullable<NonNullable<PackageServices["addons"]>[number]["price_by_weekday"]>[number];

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function WeekdayPricingEditor({
  tiers,
  onChange,
  inpClass,
}: {
  tiers: WeekdayTier[];
  onChange: (next: WeekdayTier[]) => void;
  inpClass: string;
}) {
  const enabled = tiers.length > 0;
  const patchTier = (idx: number, p: Partial<WeekdayTier>) =>
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...p } : t)));
  const toggleDay = (idx: number, day: number) => {
    const cur = new Set(tiers[idx].days ?? []);
    if (cur.has(day)) cur.delete(day);
    else {
      // remove esse dia de qualquer outra faixa (um dia só numa faixa)
      tiers.forEach((t, i) => {
        if (i !== idx) t.days = (t.days ?? []).filter((d) => d !== day);
      });
      cur.add(day);
    }
    const next = tiers.map((t, i) =>
      i === idx ? { ...t, days: Array.from(cur).sort() } : { ...t, days: t.days ?? [] },
    );
    onChange(next);
  };
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-brand-orange"
            checked={enabled}
            onChange={(e) =>
              onChange(e.target.checked ? [{ label: "", days: [], price: 0 }] : [])
            }
          />
          Variar preço por dia da semana
        </label>
        {enabled && (
          <button
            type="button"
            className="text-xs text-brand-orange hover:underline"
            onClick={() => onChange([...tiers, { label: "", days: [], price: 0 }])}
          >
            + Nova faixa
          </button>
        )}
      </div>
      {enabled && (
        <div className="mt-2 space-y-2">
          {tiers.map((t, idx) => (
            <div key={idx} className="rounded-md border border-border bg-background p-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                <input
                  className={inpClass}
                  placeholder="Rótulo (ex.: Sábado, Dom–Ter, Qua–Sex)"
                  value={t.label ?? ""}
                  onChange={(e) => patchTier(idx, { label: e.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inpClass}
                  placeholder="Preço (R$)"
                  value={t.price ?? 0}
                  onChange={(e) => patchTier(idx, { price: Number(e.target.value) || 0 })}
                />
                <button
                  type="button"
                  onClick={() => onChange(tiers.filter((_, i) => i !== idx))}
                  className="rounded-md border border-border px-2 hover:bg-muted"
                  aria-label="Remover faixa"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((wl, day) => {
                  const active = (t.days ?? []).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(idx, day)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition ${
                        active
                          ? "border-brand-orange bg-brand-orange text-white"
                          : "border-border bg-background hover:border-brand-orange/50"
                      }`}
                    >
                      {wl}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Se a data escolhida no checkout cair em um dos dias marcados, esse preço substitui o valor base.
          </p>
        </div>
      )}
    </div>
  );
}

function CruiseUrlImporter({
  inpClass,
  onImported,
}: {
  inpClass: string;
  onImported: (details: unknown) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const importFn = useServerFn(importCruiseFromUrl);

  async function run() {
    setMsg(null);
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await importFn({
        data: { url: url.trim() },
      });
      onImported(res.cruise_details);
      const parts: string[] = [];
      const cd = res.cruise_details;
      if (cd.cabin_categories?.length) parts.push(`${cd.cabin_categories.length} cabine(s)`);
      if (cd.experiences?.length) parts.push(`${cd.experiences.length} experiência(s)`);
      if (cd.itinerary?.length) parts.push(`${cd.itinerary.length} dia(s) de roteiro`);
      setMsg({
        kind: "ok",
        text: `Importado de ${res.sources.length} página(s): ${parts.join(", ") || "dados básicos"}.${
          res.warnings.length ? ` Avisos: ${res.warnings.join(" | ")}` : ""
        }`,
      });
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-foreground">
        <Wand2 className="h-3.5 w-3.5 text-brand-orange" />
        Importar cruzeiro por URL
      </div>

      <div className="grid gap-2">
        <input
          type="url"
          className={inpClass}
          placeholder="Cole aqui o link público da página do cruzeiro"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button
          type="button"
          onClick={run}
          disabled={loading || !url.trim()}
          className="rounded-xl bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Extraindo…" : "Importar cruzeiro"}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-2 text-xs ${
            msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}




function CruiseEditor({

  value,
  onChange,
  inpClass,
}: {
  value: PackageServices;
  onChange: (next: PackageServices) => void;
  inpClass: string;
}) {
  const cruise = value?.cruise ?? {};
  const patch = (p: Partial<NonNullable<PackageServices["cruise"]>>) =>
    onChange({ ...value, cruise: { ...cruise, ...p } });
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <FormField label="Companhia do cruzeiro">
        <input
          className={inpClass}
          placeholder="Ex.: MSC Cruzeiros, Costa Cruzeiros"
          value={cruise.company ?? ""}
          onChange={(e) => patch({ company: e.target.value })}
        />
      </FormField>
      <FormField label="Navio">
        <input
          className={inpClass}
          placeholder="Ex.: MSC Seaview"
          value={cruise.ship ?? ""}
          onChange={(e) => patch({ ship: e.target.value })}
        />
      </FormField>
      <FormField label="Tipo de cabine">
        <select
          className={inpClass}
          value={cruise.cabin_type ?? ""}
          onChange={(e) => patch({ cabin_type: e.target.value })}
        >
          <option value="">— Não informado —</option>
          <option value="Interna">Interna</option>
          <option value="Externa">Externa (com vista)</option>
          <option value="Externa com varanda">Externa com varanda</option>
          <option value="Suíte">Suíte</option>
          <option value="Suíte com varanda">Suíte com varanda</option>
          <option value="Yacht Club">Yacht Club</option>
        </select>
      </FormField>
      <FormField label="Regime a bordo">
        <select
          className={inpClass}
          value={cruise.board_regime ?? ""}
          onChange={(e) => patch({ board_regime: e.target.value })}
        >
          <option value="">— Não informado —</option>
          <option value="Pensão completa">Pensão completa</option>
          <option value="All inclusive">All inclusive</option>
          <option value="Bebidas inclusas">Bebidas inclusas</option>
        </select>
      </FormField>
    </div>
  );
}


function cleanFlight(f: FlightInfo | null | undefined): FlightInfo | null {
  if (!f) return null;
  const normalizedBaggage = normalizeFlightBaggage(f) as FlightInfo;
  const segments = getCleanSegments(normalizedBaggage);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const duration =
    formatMinutes(diffMinutes(first?.depart_at, last?.arrive_at)) || normalizedBaggage.duration;
  const normalized: FlightInfo = {
    ...normalizedBaggage,
    airline: normalizedBaggage.airline || first?.airline,
    flight_number: normalizedBaggage.flight_number || first?.flight_number,
    from_iata: first?.from_iata ?? normalizedBaggage.from_iata,
    from_city: first?.from_city ?? normalizedBaggage.from_city,
    to_iata: last?.to_iata ?? normalizedBaggage.to_iata,
    to_city: last?.to_city ?? normalizedBaggage.to_city,
    depart_at: first?.depart_at ?? normalizedBaggage.depart_at,
    arrive_at: last?.arrive_at ?? normalizedBaggage.arrive_at,
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
  return Object.values(segment).some(
    (value) => value !== "" && value !== null && value !== undefined,
  );
}

// Auto-preenche fare_class a partir das bagagens: sem despachada = LIGHT, com despachada = STANDARD.
// Só sobrescreve se o usuário ainda não editou manualmente (fare_class_manual).
function autoFareFromBags(f: FlightInfo, patch: Partial<FlightInfo>): Partial<FlightInfo> {
  const next = { ...f, ...patch } as FlightInfo & { fare_class_manual?: boolean };
  if (next.fare_class_manual) return patch;
  const hasChecked = !!next.checked_bag;
  const desired = hasChecked ? "STANDARD" : "LIGHT";
  const current = String(next.fare_class ?? "").toUpperCase();
  if (current === "" || current === "LIGHT" || current === "STANDARD") {
    return { ...patch, fare_class: desired };
  }
  return patch;
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
  const removeSeg = (i: number) => patch({ segments: segments.filter((_, idx) => idx !== i) });

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
            onChange={(v) => patch({ fare_class: v, fare_class_manual: true } as any)}
            options={fareClassesFor(findAirline(f.airline)?.iata)}
          />
        </FormField>
        <FormField label="Bagagens inclusas">
          <div className="flex flex-wrap gap-4 text-sm pt-1.5">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!f.personal_item}
                onChange={(e) => patch(autoFareFromBags(f, { personal_item: e.target.checked }))}
              />
              Item pessoal
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!f.carry_on}
                onChange={(e) => patch(autoFareFromBags(f, { carry_on: e.target.checked }))}
              />
              Bagagem de mão
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!f.checked_bag}
                onChange={(e) => patch(autoFareFromBags(f, { checked_bag: e.target.checked }))}
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
          <strong>
            {first?.from_iata || "—"} → {last?.to_iata || "—"}
          </strong>
        </span>
        <span>
          <span className="text-muted-foreground">Conexões: </span>
          <strong>
            {stopsCount === 0 ? "Direto" : `${stopsCount} conexão${stopsCount > 1 ? "es" : ""}`}
          </strong>
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
                    onApply={(r) =>
                      patchSeg(i, {
                        ...(r.airline ? { airline: r.airline } : {}),
                        ...(r.flightNumber ? { flight_number: r.flightNumber } : {}),
                        ...(r.fromIata ? { from_iata: r.fromIata } : {}),
                        ...(r.fromCity ? { from_city: r.fromCity } : {}),
                        ...(r.toIata ? { to_iata: r.toIata } : {}),
                        ...(r.toCity ? { to_city: r.toCity } : {}),
                        ...(r.departAtLocal ? { depart_at: r.departAtLocal } : {}),
                        ...(r.arriveAtLocal ? { arrive_at: r.arriveAtLocal } : {}),
                      })
                    }
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
                          : upper.match(
                              /^(?=[A-Z0-9]{2,3}\s)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,3}\s*(.+)$/,
                            );
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
                    <strong className="text-foreground">{formatMinutes(layoverMin) || "—"}</strong>
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
      const normalized: FlightInfo = normalizeFlightBaggage({
        ...flight,
        segments: Array.isArray(flight?.segments) ? flight.segments : [],
      });
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

function PackageImportButton({ onImported }: { onImported: (patch: Partial<PackageRow>) => void }) {
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
      if (p.room_type) { const v = cleanRoomLabel(String(p.room_type)); if (v) patch.room_type = v; }
      if (p.room_category) { const v = cleanRoomLabel(String(p.room_category)); if (v) patch.room_category = v; }
      if (p.bed_type) patch.bed_type = String(p.bed_type);
      // Não usar includes do documento — a derivação automática monta na ordem correta
      // (Passagem Aérea → Hospedagem → Café da Manhã → Bagagem Despachada).
      patch.includes = [];
      // A importação deve substituir fornecedor antigo (inclusive por vazio,
      // quando a operadora não for identificada) e sempre entregar serviços.
      patch.supplier_name = String(p.supplier_name ?? "");
      patch.services =
        p.services && typeof p.services === "object" ? (p.services as PackageServices) : {};
      if (p.outbound_flight && typeof p.outbound_flight === "object") {
        patch.outbound_flight = normalizeFlightBaggage({
          ...p.outbound_flight,
          segments: Array.isArray(p.outbound_flight.segments) ? p.outbound_flight.segments : [],
        });
      }
      if (p.return_flight && typeof p.return_flight === "object") {
        patch.return_flight = normalizeFlightBaggage({
          ...p.return_flight,
          segments: Array.isArray(p.return_flight.segments) ? p.return_flight.segments : [],
        });
      }

      // Tenta enriquecer o hotel automaticamente com dados do TripAdvisor.
      if (patch.hotel_name) {
        try {
          const city = patch.destination ?? "";
          const q = city ? `${patch.hotel_name} ${city}` : patch.hotel_name;
          const results = await searchHotels({ data: { query: q } });
          const best = results?.[0];
          if (best) {
            const full = await hotelDetails({
              data: { locationId: best.location_id, photoLimit: 5 },
            });
            const rating = full.rating ?? best.rating ?? null;
            const cls = full.hotel_class ?? null;
            const stars =
              rating != null
                ? Math.min(5, Math.max(1, Math.round(rating)))
                : cls != null
                  ? Math.min(5, Math.max(1, Math.round(cls)))
                  : (patch.hotel_stars ?? 3);
            patch.hotel_name = full.name || best.name || patch.hotel_name;
            patch.hotel_stars = stars;
            patch.tripadvisor_location_id = String(best.location_id);
            patch.tripadvisor_url = full.tripadvisor_url ?? best.tripadvisor_url ?? null;
            patch.tripadvisor_address = full.address ?? best.address ?? null;
            const photos = full.photos && full.photos.length > 0 ? full.photos : null;
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
                  Envie um PDF de orçamento / voucher ou uma imagem. A IA extrai destino, datas,
                  hotel, refeição, valores e voos (ida + volta com conexões).
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
                  <span className="text-[11px] text-muted-foreground">
                    Pode levar alguns segundos
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-brand-orange" />
                  <span className="text-sm font-semibold">
                    Solte o arquivo aqui ou clique para escolher
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    PDF, PNG ou JPG · até 15 MB
                  </span>
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

function MultiPackageImportButton({
  onExtracted,
}: {
  onExtracted: (list: Partial<PackageRow>[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const extractMany = useServerFn(extractMultiplePackagesFromDocument);
  const searchHotels = useServerFn(searchTripAdvisorHotels);
  const hotelDetails = useServerFn(getTripAdvisorHotelDetails);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("Envie um PDF ou imagem");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 20 MB)");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    setStatus("Lendo documento…");
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64 = btoa(binary);
      const { packages: extracted } = await extractMany({
        data: {
          file_base64: base64,
          mime_type: file.type || "application/pdf",
          filename: file.name || "orcamentos.pdf",
        },
      });
      const rawList = Array.isArray(extracted)
        ? extracted.filter((p) => p && typeof p === "object")
        : [];
      if (rawList.length === 0) throw new Error("Nenhum orçamento reconhecido no documento");

      // Deduplica pacotes idênticos vindos no mesmo documento (mesmo destino+origem+datas+hotel+preço)
      const norm = (v: any) =>
        String(v ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const seen = new Set<string>();
      const list: any[] = [];
      let duplicatesSkipped = 0;
      for (const p of rawList as any[]) {
        const dest = norm(p.destination || p?.outbound_flight?.to_city);
        const orig = norm(p.origin || p?.outbound_flight?.from_city || p?.return_flight?.to_city);
        const going = norm(p.going_date);
        const ret = norm(p.return_date);
        const hotel = norm(p.hotel_name);
        const price = Math.round(Number(p.price_per_person) || 0);
        const key = [dest, orig, going, ret, hotel, price].join("|");
        if (seen.has(key)) {
          duplicatesSkipped++;
          continue;
        }
        seen.add(key);
        list.push(p);
      }
      if (duplicatesSkipped > 0) {
        toast.info(`${duplicatesSkipped} pacote(s) duplicado(s) ignorado(s) na importação.`);
      }

      const drafts: Partial<PackageRow>[] = list.map((raw, i) => {
        const p: any = raw;
        const destination =
          String(p.destination || "").trim() || String(p?.outbound_flight?.to_city || "").trim();
        const origin =
          String(p.origin || "").trim() ||
          String(p?.outbound_flight?.from_city || "").trim() ||
          String(p?.return_flight?.to_city || "").trim();
        const going = p.going_date ? String(p.going_date) : "";
        const ret = p.return_date ? String(p.return_date) : "";
        const title =
          destination && origin ? `${destination} - Saída de ${origin}` : destination || "";
        const baseSlug = (destination || "pacote")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        return {
          ...emptyForm,
          slug: baseSlug,
          title: title || "",

          destination,
          origin,
          going_date: going,
          return_date: ret,
          nights: p.nights != null ? Number(p.nights) || 0 : 0,
          base_occupancy: p.base_occupancy != null ? Number(p.base_occupancy) || 2 : 2,
          price_per_person: Number(p.price_per_person) || 0,
          taxes: Number(p.taxes) || 0,
          hotel_name: p.hotel_name || "",
          hotel_stars:
            p.hotel_stars != null
              ? Math.max(1, Math.min(5, Math.round(Number(p.hotel_stars))))
              : null,
          meal_plan: p.meal_plan || "",
          room_type: cleanRoomLabel(p.room_type as string) ?? "",
          room_category: cleanRoomLabel(p.room_category as string) ?? "",
          bed_type: p.bed_type || "",
          supplier_name: p.supplier_name || "",
          services: ((p as any).services && typeof (p as any).services === "object"
            ? (p as any).services
            : {}) as PackageServices,
          includes: [],
          is_active: true,
          sort_order: 0,
          image_url: "",
          summary: "",
          itinerary: "",
          outbound_flight: p.outbound_flight ? normalizeFlightBaggage(p.outbound_flight) : null,
          return_flight: p.return_flight ? normalizeFlightBaggage(p.return_flight) : null,
        } as Partial<PackageRow>;
      });

      setStatus("Buscando hotéis no TripAdvisor…");
      await Promise.allSettled(
        drafts.map(async (d) => {
          if (!d.hotel_name) return;
          try {
            const q = d.destination ? `${d.hotel_name} ${d.destination}` : String(d.hotel_name);
            const results = await searchHotels({ data: { query: q } });
            const best = results?.[0];
            if (!best) return;
            const full = await hotelDetails({
              data: { locationId: best.location_id, photoLimit: 5 },
            });
            const rating = full.rating ?? best.rating ?? null;
            const cls = full.hotel_class ?? null;
            const stars =
              rating != null
                ? Math.min(5, Math.max(1, Math.round(rating)))
                : cls != null
                  ? Math.min(5, Math.max(1, Math.round(cls)))
                  : (d.hotel_stars ?? 3);
            d.hotel_name = full.name || best.name || d.hotel_name;
            d.hotel_stars = stars;
            (d as any).tripadvisor_location_id = String(best.location_id);
            (d as any).tripadvisor_url = full.tripadvisor_url ?? best.tripadvisor_url ?? null;
            (d as any).tripadvisor_address = full.address ?? best.address ?? null;
            if (full.photos && full.photos.length > 0) (d as any).tripadvisor_photos = full.photos;
          } catch (err) {
            console.warn("[multi-import] TripAdvisor enrich falhou", err);
          }
        }),
      );

      toast.success(
        `${drafts.length} pacote(s) reconhecido(s) — revise nas abas acima e salve cada um.`,
      );
      onExtracted(drafts);
      setOpen(false);
      setFileName(null);
      setStatus("");
    } catch (e: any) {
      toast.error(e?.message || "Falha na importação múltipla");
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
        className={`inline-flex items-center justify-center gap-1.5 bg-transparent hover:bg-brand-orange/10 text-brand-orange border border-brand-orange/60 h-9 px-3 rounded-full font-bold uppercase tracking-wider text-[11px] transition-all active:scale-95 ${
          dragging ? "ring-2 ring-brand-orange bg-brand-orange/10" : ""
        }`}
        title="Importar pacote(s) — clique ou arraste o PDF aqui"
      >
        <FileUp className="h-3.5 w-3.5" strokeWidth={2.5} /> {busy ? "Importando…" : "Importar"}

      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border/70 bg-card/80 backdrop-blur-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Importar pacote</h3>

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
                  <span className="text-sm font-medium">
                    {status || `Lendo ${fileName ?? "documento"}…`}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Pode levar alguns segundos por pacote
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-7 w-7 text-brand-orange" />
                  <span className="text-sm font-semibold">
                    Solte o PDF aqui ou clique para escolher
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    PDF · até 20 MB · vários orçamentos em um só arquivo
                  </span>
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

function IgnoredHotelsBell({ packages }: { packages: PackageRow[] }) {
  const { ids, restore, restoreAll } = useIgnoredHotels();
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => (packages || []).filter((p) => ids.has(p.id)),
    [packages, ids],
  );
  const count = items.length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={
            count > 0
              ? `${count} alerta(s) ignorado(s) — clique para ver`
              : "Nenhum alerta ignorado"
          }
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-brand-orange transition-colors"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-brand-orange text-white text-[9px] font-bold flex items-center justify-center shadow-[0_2px_6px_rgba(242,107,31,0.45)]">
              {count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <div className="px-3 py-2 flex items-center justify-between border-b border-border">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Alertas ignorados
          </span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => {
                restoreAll();
                setOpen(false);
              }}
              className="text-[10px] font-semibold text-brand-orange hover:text-[#ff8846]"
            >
              Restaurar todos
            </button>
          )}
        </div>
        {count === 0 ? (
          <div className="px-3 py-6 text-[11px] text-muted-foreground text-center">
            Nenhuma notificação ignorada.
          </div>
        ) : (
          <div className="max-h-[280px] overflow-auto py-1">
            {items.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 group"
              >
                <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate">{p.hotel_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.destination}</p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(p.id)}
                  title="Restaurar no alerta"
                  className="opacity-60 group-hover:opacity-100 text-brand-orange hover:text-[#ff8846] p-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function UnlinkedHotelsAlert({

  packages,
  onOpen,
}: {
  packages: PackageRow[];
  onOpen: (p: PackageRow) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { ids: ignored, ignore, restoreAll } = useIgnoredHotels();


  const unlinked = useMemo(
    () =>
      (packages || []).filter(
        (p) => p.is_active && !!p.hotel_name && !p.tripadvisor_location_id && !ignored.has(p.id),
      ),
    [packages, ignored],
  );
  const hasIgnored = ignored.size > 0;
  if (dismissed || unlinked.length === 0) return null;


  if (!expanded) {
    return (
      <div className="mb-3 flex items-center gap-2 bg-[#1C252E] border border-slate-800 rounded-full pl-2 pr-2 py-1.5 shadow-xl shadow-black/20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shrink-0">
            {unlinked.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase truncate">
            Hotel(is) sem vínculo com TripAdvisor
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 hover:text-white transition-colors shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-slate-700/50 rounded-full transition-colors"
          title="Ocultar"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-[#1C252E] border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shadow-lg shadow-[#F26B1F]/20">
            {unlinked.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">
            Hotel(is) sem vínculo com TripAdvisor
          </span>
          <ChevronDown className="w-4 h-4 text-[#F26B1F] rotate-180 transition-transform" />
        </button>
        <div className="flex items-center gap-1">
          {hasIgnored && (
            <button
              type="button"
              onClick={restoreAll}
              className="text-[10px] font-semibold text-slate-400 hover:text-[#F26B1F] px-2 py-1 rounded-lg hover:bg-slate-700/40 transition-colors"
              title="Restaurar hotéis ignorados"
            >
              Restaurar ({ignored.size})
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Ocultar"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-5 space-y-4">
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          Cadastrados manualmente. Abra e reconecte para puxar fotos, estrelas e endereço oficial —
          ou clique no × para ignorar hotéis que não constam no TripAdvisor.
        </p>
        <div className="flex flex-wrap gap-2">
          {unlinked.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-full hover:border-[#F26B1F]/50 transition-all group"
            >
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="flex items-center gap-2 pl-3 pr-1 py-1.5 cursor-pointer"
                title={`${p.hotel_name} — ${p.destination}`}
              >
                <Building2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#F26B1F]" />
                <span className="text-[11px] font-medium text-slate-300 max-w-[220px] truncate">
                  {p.hotel_name}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-[#F26B1F]/80 uppercase text-[10px] font-bold">
                  {p.destination}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  ignore(p.id);
                }}
                className="p-1 mr-1 rounded-full text-slate-500 hover:text-white hover:bg-slate-700/60 transition-colors"
                title="Ignorar este hotel"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function DuplicatePackagesAlert({
  packages,
  onOpen,
  onDelete,
}: {
  packages: PackageRow[];
  onOpen: (p: PackageRow) => void;
  onDelete: (p: PackageRow) => void | Promise<any>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => {
    const norm = (v: any) =>
      String(v ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const map = new Map<string, PackageRow[]>();
    for (const p of packages || []) {
      if (!p.is_active) continue;
      if (!p.destination || !p.going_date || !p.return_date) continue;
      const key = [
        norm(p.destination),
        originKey(p.origin),
        String(p.going_date),
        String(p.return_date),
        String(Math.round(Number((p as any).price_per_person) || 0)),
      ].join("|");
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    }
    return Array.from(map.values()).filter((arr) => arr.length > 1);
  }, [packages]);

  const total = useMemo(() => groups.reduce((acc, arr) => acc + (arr.length - 1), 0), [groups]);

  if (dismissed || groups.length === 0) return null;

  if (!expanded) {
    return (
      <div className="mb-3 flex items-center gap-2 bg-[#1C252E] border border-slate-800 rounded-full pl-2 pr-2 py-1.5 shadow-xl shadow-black/20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shrink-0">
            {total}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase truncate">
            Pacote(s) duplicado(s) detectado(s)
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 hover:text-white transition-colors shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-slate-700/50 rounded-full transition-colors"
          title="Ocultar"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-[#1C252E] border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shadow-lg shadow-[#F26B1F]/20">
            {total}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">
            Pacote(s) duplicado(s) detectado(s)
          </span>
          <ChevronDown className="w-4 h-4 text-[#F26B1F] rotate-180 transition-transform" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Ocultar"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <div className="px-4 pb-5 space-y-4">
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          Mesma origem, mesmo destino e mesmas datas. Abra e exclua as cópias que não quiser

          manter.
        </p>
        <div className="space-y-3">
          {groups.map((arr, gi) => (
            <div key={gi} className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B1F]/80">
                {arr[0].destination} · {arr[0].going_date} → {arr[0].return_date}
              </div>
              <div className="flex flex-wrap gap-2">
                {arr.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-full hover:border-[#F26B1F]/50 transition-all overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(p)}
                      className="flex items-center gap-2 pl-3 pr-2 py-1.5 cursor-pointer"
                      title={`${p.title} — abrir para editar`}
                    >
                      <span className="text-[11px] font-medium text-slate-300 max-w-[260px] truncate">
                        {p.title}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-[#F26B1F]/80 uppercase text-[10px] font-bold">
                        {p.origin || "—"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      className="flex items-center justify-center h-full px-2.5 py-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 border-l border-slate-700/50 transition-colors"
                      title={`Excluir "${p.title}"`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MissingSupplierAlert({
  packages,
  onOpen,
}: {
  packages: PackageRow[];
  onOpen: (p: PackageRow) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const missing = useMemo(
    () => (packages || []).filter((p) => p.is_active && !String(p.supplier_name ?? "").trim()),
    [packages],
  );
  if (dismissed || missing.length === 0) return null;

  if (!expanded) {
    return (
      <div className="mb-3 flex items-center gap-2 bg-[#1C252E] border border-slate-800 rounded-full pl-2 pr-2 py-1.5 shadow-xl shadow-black/20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shrink-0">
            {missing.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase truncate">
            Pacote(s) sem fornecedor
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 hover:text-white transition-colors shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-slate-700/50 rounded-full transition-colors"
          title="Ocultar"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-[#1C252E] border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shadow-lg shadow-[#F26B1F]/20">
            {missing.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">
            Pacote(s) sem fornecedor
          </span>
          <ChevronDown className="w-4 h-4 text-[#F26B1F] rotate-180 transition-transform" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Ocultar"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <div className="px-4 pb-5 space-y-4">
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          Abra o pacote e preencha o campo <span className="text-[#F26B1F] font-semibold">Fornecedor</span> — ele
          define regras de parcelamento e o controle interno.
        </p>
        <div className="flex flex-wrap gap-2">
          {missing.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 border border-slate-700/50 rounded-full hover:border-[#F26B1F]/50 transition-all cursor-pointer group"
              title={`${p.title} — abrir para editar`}
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#F26B1F]" />
              <span className="text-[11px] font-medium text-slate-300 max-w-[220px] truncate">
                {p.title}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-[#F26B1F]/80 uppercase text-[10px] font-bold">
                {p.destination}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MissingIncludesAlert({
  packages,
  onOpen,
}: {
  packages: PackageRow[];
  onOpen: (p: PackageRow) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const missing = useMemo(
    () =>
      (packages || []).filter(
        (p) => p.is_active && (!Array.isArray(p.includes) || p.includes.length === 0),
      ),
    [packages],
  );
  if (dismissed || missing.length === 0) return null;

  if (!expanded) {
    return (
      <div className="mb-3 flex items-center gap-2 bg-[#1C252E] border border-slate-800 rounded-full pl-2 pr-2 py-1.5 shadow-xl shadow-black/20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shrink-0">
            {missing.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase truncate">
            Pacote(s) sem "O que inclui"
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 hover:text-white transition-colors shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-slate-700/50 rounded-full transition-colors"
          title="Ocultar"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-[#1C252E] border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shadow-lg shadow-[#F26B1F]/20">
            {missing.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">
            Pacote(s) sem "O que inclui"
          </span>
          <ChevronDown className="w-4 h-4 text-[#F26B1F] rotate-180 transition-transform" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Ocultar"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <div className="px-4 pb-5 space-y-4">
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          Abra o pacote, vá em "Extras e inclusos" e clique em <span className="text-[#F26B1F] font-semibold">Gerar</span> para preencher automaticamente a partir dos aéreos, hospedagem e serviços.
        </p>
        <div className="flex flex-wrap gap-2">
          {missing.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 border border-slate-700/50 rounded-full hover:border-[#F26B1F]/50 transition-all cursor-pointer group"
              title={`${p.title} — abrir para editar`}
            >
              <ListChecks className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#F26B1F]" />
              <span className="text-[11px] font-medium text-slate-300 max-w-[220px] truncate">
                {p.title}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-[#F26B1F]/80 uppercase text-[10px] font-bold">
                {p.destination}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MealPlanMismatchAlert({
  packages,
  onOpen,
}: {
  packages: PackageRow[];
  onOpen: (p: PackageRow) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const conflicts = useMemo(
    () =>
      (packages || [])
        .filter((p) => p.is_active)
        .map((p) => {
          const mm = detectMealPlanMismatch(
            (p as unknown as { meal_plan?: string | null }).meal_plan ?? null,
            (p.includes ?? []) as string[],
          );
          return mm ? { pkg: p, mismatch: mm } : null;
        })
        .filter((x): x is { pkg: PackageRow; mismatch: { expected: string; found: string[] } } => x !== null),
    [packages],
  );
  if (dismissed || conflicts.length === 0) return null;

  if (!expanded) {
    return (
      <div className="mb-3 flex items-center gap-2 bg-[#1C252E] border border-slate-800 rounded-full pl-2 pr-2 py-1.5 shadow-xl shadow-black/20">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shrink-0">
            {conflicts.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase truncate">
            Regime x "O que inclui" divergente
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 hover:text-white transition-colors shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-slate-700/50 rounded-full transition-colors"
          title="Ocultar"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-[#1C252E] border border-slate-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F26B1F] text-white text-[11px] font-bold shadow-lg shadow-[#F26B1F]/20">
            {conflicts.length}
          </span>
          <span className="text-[11px] font-bold text-slate-200 tracking-wide uppercase">
            Regime x "O que inclui" divergente
          </span>
          <ChevronDown className="w-4 h-4 text-[#F26B1F] rotate-180 transition-transform" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Ocultar"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <div className="px-4 pb-5 space-y-3">
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          O regime selecionado não bate com o rótulo listado em "O que inclui". Abra o pacote, vá em "Extras e inclusos" e clique em <span className="text-[#F26B1F] font-semibold">Gerar</span> para corrigir.
        </p>
        <div className="flex flex-wrap gap-2">
          {conflicts.map(({ pkg, mismatch }) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onOpen(pkg)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 border border-slate-700/50 rounded-full hover:border-[#F26B1F]/50 transition-all cursor-pointer group"
              title={`${pkg.title} — regime ${mismatch.expected}, mas inclui ${mismatch.found.join(", ")}`}
            >
              <ListChecks className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#F26B1F]" />
              <span className="text-[11px] font-medium text-slate-300 max-w-[220px] truncate">
                {pkg.title}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-[#F26B1F]/80 uppercase text-[10px] font-bold">
                {mismatch.expected}
              </span>
              <span className="text-slate-600">≠</span>
              <span className="text-slate-400 text-[10px] font-semibold">
                {mismatch.found.join(", ")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewCruiseImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (r: {
    cruise_details: unknown;
    package_fields: {
      title: string;
      destination: string;
      origin: string;
      going_date: string;
      return_date: string;
      nights: number;
      price_from: number;
      supplier: string;
    };
  }) => void;
}) {
  const [url, setUrl] = useState("");
  const [kzToken, setKzToken] = useState("");
  const [jsessionId, setJsessionId] = useState("");
  const [savedInfo, setSavedInfo] = useState<
    { hasCookie: boolean; preview?: string; updated_at?: string } | null
  >(null);
  const [showCookieEditor, setShowCookieEditor] = useState(false);
  const [savingCookie, setSavingCookie] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const importFn = useServerFn(importCruiseFromUrl);
  const getCreds = useServerFn(getFrtCredentials);
  const saveCreds = useServerFn(saveFrtCredentials);

  useEffect(() => {
    getCreds().then(setSavedInfo).catch(() => setSavedInfo({ hasCookie: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aceita colar "kz-token=eyJ..." ou só "eyJ..." — tira o prefixo e ponto-e-vírgula final
  function cleanValue(raw: string, name: string): string {
    let v = raw.trim();
    const prefix = new RegExp(`^${name}\\s*=\\s*`, "i");
    v = v.replace(prefix, "");
    v = v.replace(/;\s*$/, "");
    return v.trim();
  }

  function buildCookieString(): string {
    const kz = cleanValue(kzToken, "kz-token");
    const js = cleanValue(jsessionId, "JSESSIONID");
    const parts: string[] = [];
    if (kz) parts.push(`kz-token=${kz}`);
    if (js) parts.push(`JSESSIONID=${js}`);
    return parts.join("; ");
  }

  const canSubmitCookie = Boolean(cleanValue(kzToken, "kz-token"));

  async function saveCookie() {
    const cookie = buildCookieString();
    if (!cookie) return;
    setSavingCookie(true);
    setMsg(null);
    try {
      await saveCreds({ data: { cookie } });
      const info = await getCreds();
      setSavedInfo(info);
      setKzToken("");
      setJsessionId("");
      setShowCookieEditor(false);
      setMsg({ kind: "ok", text: "Cookie salvo." });
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setSavingCookie(false);
    }
  }

  const hasSaved = savedInfo?.hasCookie === true;

  async function run() {
    setMsg(null);
    if (!url.trim()) return;
    const cookie = buildCookieString();
    setLoading(true);
    try {
      const res = (await importFn({
        data: { url: url.trim(), cookie: cookie || undefined },
      })) as {
        cruise_details: unknown;
        package_fields: {
          title: string;
          destination: string;
          origin: string;
          going_date: string;
          return_date: string;
          nights: number;
          price_from: number;
          supplier: string;
        };
      };
      onImported(res);
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={loading ? undefined : onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-brand-orange" />
            <h2 className="text-base font-bold">Novo cruzeiro — importar da FRT</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              URL do cruzeiro na FRT
            </label>
            <input
              type="url"
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="https://frtoperadora.krooze.com.br/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
          </div>

          <div
            className={`rounded-lg p-3 text-xs ${
              hasSaved
                ? "bg-emerald-500/10 border border-emerald-500/30"
                : "bg-amber-500/10 border border-amber-500/30"
            }`}
          >
            {hasSaved && !showCookieEditor ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-emerald-700 dark:text-emerald-300">
                  🔓 Cookie da FRT salvo
                  {savedInfo?.updated_at && (
                    <span className="opacity-70">
                      {" "}
                      ({new Date(savedInfo.updated_at).toLocaleString("pt-BR")})
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCookieEditor(true)}
                  className="text-brand-orange font-semibold hover:underline"
                  disabled={loading}
                >
                  Atualizar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="font-semibold text-foreground">
                  {hasSaved ? "Atualizar cookie da FRT" : "Cole os dois valores do FRT (primeira vez)"}
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    kz-token <span className="opacity-60 normal-case">(obrigatório — token de login)</span>
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-mono"
                    rows={3}
                    placeholder="eyJhbGciOi..."
                    value={kzToken}
                    onChange={(e) => setKzToken(e.target.value)}
                    disabled={savingCookie || loading}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    JSESSIONID <span className="opacity-60 normal-case">(opcional — identifica a sessão)</span>
                  </label>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-mono"
                    placeholder="f90bc033ea27f172"
                    value={jsessionId}
                    onChange={(e) => setJsessionId(e.target.value)}
                    disabled={savingCookie || loading}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveCookie}
                    disabled={savingCookie || !canSubmitCookie}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingCookie ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Salvar cookie
                  </button>
                  {hasSaved && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCookieEditor(false);
                        setKzToken("");
                        setJsessionId("");
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancelar
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground leading-snug">
                  F12 → <b>Application</b> → Cookies → <code>frtoperadora.krooze.com.br</code> → copia só o <b>Value</b> de cada um.
                  Pode colar com ou sem o <code>nome=</code> na frente que a gente limpa.
                </p>
              </div>
            )}
          </div>


          {msg && (
            <p
              className={`text-xs ${
                msg.kind === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive"
              }`}
            >
              {msg.text}
            </p>
          )}

          <button
            type="button"
            onClick={run}
            disabled={loading || !url.trim() || (!hasSaved && !canSubmitCookie)}
            className="w-full rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extraindo dados… (pode levar 1 min)
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Importar e abrir cadastro
              </>
            )}
          </button>

          <p className="text-[11px] text-muted-foreground text-center">
            A IA lê a página, cabines, itinerário e preços — depois abre o cadastro já preenchido.
          </p>
        </div>
      </div>
    </div>
  );
}
