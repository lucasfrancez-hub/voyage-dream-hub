import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, EyeOff, Loader2, X, Info, CalendarRange, Building2, Plane, ListChecks } from "lucide-react";
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
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 sm:py-12 selection:bg-brand-orange/30">
      {/* Command Center header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase text-foreground mb-2">
            Command Center <span className="text-brand-orange">/</span> Pacotes
          </h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            {packages?.length ?? 0} pacote(s) cadastrados no sistema via air
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...emptyForm })}
          className="inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-[#ff7b30] text-white px-6 py-3 rounded-none font-bold uppercase tracking-wider text-sm transition-all active:scale-95 shadow-[4px_4px_0px_0px_rgba(242,107,31,0.2)]"
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
            className="group bg-card/60 border border-border/60 hover:border-brand-orange/50 transition-all"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 items-center p-5 md:px-8 md:py-6 gap-4 md:gap-2">
              {/* Info */}
              <div className="col-span-1 md:col-span-5 space-y-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-brand-orange shrink-0" />
                  <h3 className="text-base sm:text-lg font-bold text-foreground group-hover:text-brand-orange transition-colors truncate">
                    {p.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2 pl-5 text-[11px] text-muted-foreground uppercase min-w-0">
                  <span className="truncate">/{p.slug}</span>
                  <span className="text-muted-foreground/40 shrink-0">•</span>
                  <span className="text-muted-foreground/90 italic truncate">{p.destination}</span>
                </div>
              </div>

              {/* Dates */}
              <div className="col-span-1 md:col-span-3 flex md:justify-center">
                <div className="inline-flex items-center gap-3 text-xs sm:text-sm tracking-tight text-muted-foreground bg-background/60 px-3 py-1.5 border border-border/60">
                  <span>{p.going_date ? formatDate(p.going_date) : "—"}</span>
                  <span className="text-muted-foreground/40">→</span>
                  <span>{p.return_date ? formatDate(p.return_date) : "—"}</span>
                </div>
              </div>

              {/* Price */}
              <div className="col-span-1 md:col-span-2 md:text-right">
                <div className="text-[10px] text-muted-foreground uppercase mb-0.5">BRL</div>
                <div className="text-lg sm:text-xl font-black text-foreground tabular-nums tracking-tight">
                  {formatBRLNoSymbol((Number(p.price_per_person) || 0) * (Number(p.base_occupancy) || 1))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Total {p.base_occupancy || 1} pax
                </div>
              </div>

              {/* Status + Actions */}
              <div className="col-span-1 md:col-span-2 flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3">
                <button
                  onClick={() => toggleActive(p)}
                  className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-widest transition-colors ${
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

type TabId = "about" | "dates" | "hotel" | "flights" | "extras";

function PackageEditorModal({ editing, setEditing, saving, save }: PackageEditorModalProps) {
  const [tab, setTab] = useState<TabId>("about");
  const [flightLeg, setFlightLeg] = useState<"outbound" | "return">("outbound");

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "about", label: "SOBRE O PACOTE", icon: <Info className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "dates", label: "DATAS E PREÇOS", icon: <CalendarRange className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "hotel", label: "HOSPEDAGEM", icon: <Building2 className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "flights", label: "AÉREOS", icon: <Plane className="h-4 w-4" strokeWidth={1.75} /> },
    { id: "extras", label: "EXTRAS E INCLUSOS", icon: <ListChecks className="h-4 w-4" strokeWidth={1.75} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-card border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 sm:px-8 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-brand-orange rounded-full" />
            <h2 className="text-xl sm:text-2xl font-display font-bold">
              {editing.id ? "Editar pacote" : "Novo pacote"}
            </h2>
          </div>
          <button
            onClick={() => setEditing(null)}
            aria-label="Fechar"
            className="rounded-lg p-2 hover:bg-muted transition text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
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
                <FormField label="Título *" wide>
                  <input
                    className={inp}
                    value={editing.title ?? ""}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="Ex: Jalapão Místico"
                  />
                </FormField>
                <FormField label="Slug (URL) *">
                  <input
                    className={inp}
                    value={editing.slug ?? ""}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    placeholder="jalapao-abril-2027"
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
                <FormField label="Destino *">
                  <input
                    className={inp}
                    value={editing.destination ?? ""}
                    onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
                  />
                </FormField>
                <FormField label="Origem">
                  <input
                    className={inp}
                    value={editing.origin ?? ""}
                    onChange={(e) => setEditing({ ...editing, origin: e.target.value })}
                  />
                </FormField>
                <FormField label="URL da imagem de capa" wide>
                  <input
                    className={inp}
                    value={editing.image_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                    placeholder="https://…"
                  />
                </FormField>
                <FormField label="Resumo curto" wide>
                  <textarea
                    className={`${inp} min-h-[70px]`}
                    value={editing.summary ?? ""}
                    onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                  />
                </FormField>
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
                    onChangeText={(v) => setEditing({ ...editing, hotel_name: v })}
                    onSelect={(h) => {
                      setEditing({
                        ...editing,
                        hotel_name: h.name,
                        hotel_stars: h.rating != null ? Math.round(h.rating) : (editing.hotel_stars ?? 3),
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
                        const m = curr.toUpperCase().match(/^[A-Z0-9]{2,3}\s*(.+)$/);
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


