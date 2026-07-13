import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { HotelAutocomplete } from "@/components/HotelAutocomplete";

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
  is_active: boolean;
  sort_order: number;
  base_occupancy: number;
  outbound_flight: FlightInfo | null;
  return_flight: FlightInfo | null;
  supplier_name: string | null;
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
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Pacotes</h1>
          <p className="text-sm text-muted-foreground">
            {packages?.length ?? 0} pacote(s) cadastrado(s)
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...emptyForm })}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo pacote
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Pacote</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Período</th>
              <th className="text-right px-4 py-3">Preço</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {packages?.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    /{p.slug} · {p.destination}
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                  {formatDateRange(p.going_date, p.return_date)}
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatBRL(p.price_per_person)}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${
                      p.is_active
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {p.is_active ? "Ativo" : "Oculto"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(p)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[92vh] rounded-2xl bg-card border border-border flex flex-col overflow-hidden">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
              <h2 className="text-xl font-semibold">
                {editing.id ? "Editar pacote" : "Novo pacote"}
              </h2>
              <button
                onClick={() => setEditing(null)}
                aria-label="Fechar"
                className="rounded-full p-1.5 hover:bg-muted transition text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid sm:grid-cols-2 gap-3">
              <FormField label="Slug (URL) *">
                <input
                  className={inp}
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="jalapao-abril-2027"
                />
              </FormField>
              <FormField label="Ordem">
                <input
                  type="number"
                  className={inp}
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Título *" wide>
                <input
                  className={inp}
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
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
              <FormField label="Hotel">
                <HotelAutocomplete
                  value={editing.hotel_name ?? ""}
                  onChangeText={(v) => setEditing({ ...editing, hotel_name: v })}
                  onSelect={(h) => {
                    setEditing((prev) => ({
                      ...(prev ?? {}),
                      hotel_name: h.name,
                      hotel_stars: h.rating != null ? Math.round(h.rating) : (prev?.hotel_stars ?? 3),
                      image_url: (prev?.image_url && prev.image_url.length > 0) ? prev.image_url : (h.photos[0] ?? prev?.image_url ?? ""),
                    }));
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
              <FormField label="URL da imagem" wide>
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
              <FormField label="Roteiro (uma linha por dia)" wide>
                <textarea
                  className={`${inp} min-h-[120px]`}
                  value={editing.itinerary ?? ""}
                  onChange={(e) => setEditing({ ...editing, itinerary: e.target.value })}
                />
              </FormField>
              <FormField label="O que inclui (um por linha)" wide>
                <textarea
                  className={`${inp} min-h-[100px]`}
                  value={
                    Array.isArray(editing.includes)
                      ? editing.includes.join("\n")
                      : ((editing.includes as unknown as string) ?? "")
                  }
                  onChange={(e) => setEditing({ ...editing, includes: e.target.value as unknown as string[] })}
                />
              </FormField>

              <FlightFieldset
                title="Voo de ida"
                value={editing.outbound_flight ?? null}
                onChange={(f) => setEditing({ ...editing, outbound_flight: f })}
              />
              <FlightFieldset
                title="Voo de volta"
                value={editing.return_flight ?? null}
                onChange={(f) => setEditing({ ...editing, return_flight: f })}
              />

              <FormField label="Fornecedor (interno — não aparece pro cliente)" wide>
                <input
                  className={inp}
                  value={editing.supplier_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, supplier_name: e.target.value })}
                  placeholder="Ex: CVC, Nascimento, Flytour…"
                />
              </FormField>


              <FormField label="Ativo" wide>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.is_active ?? true}
                    onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  />
                  <span className="text-sm">Mostrar no site</span>
                </label>
              </FormField>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
              <button
                onClick={() => setEditing(null)}
                className="rounded-full border border-border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
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
          <input
            className={inp}
            value={f.airline ?? ""}
            onChange={(e) => patch({ airline: e.target.value })}
            placeholder="LATAM, GOL, Azul…"
          />
        </FormField>
        <FormField label="Logo da companhia (URL)">
          <input
            className={inp}
            value={f.airline_logo_url ?? ""}
            onChange={(e) => patch({ airline_logo_url: e.target.value })}
            placeholder="https://…logo.png"
          />
        </FormField>
        <FormField label="Classe">
          <select
            className={inp}
            value={f.cabin_class ?? ""}
            onChange={(e) => patch({ cabin_class: e.target.value })}
          >
            <option value="">—</option>
            <option value="Econômica">Econômica</option>
            <option value="Premium Economy">Premium Economy</option>
            <option value="Executiva">Executiva</option>
            <option value="Primeira classe">Primeira classe</option>
          </select>
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
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    className={inp}
                    value={s.airline ?? ""}
                    onChange={(e) => patchSeg(i, { airline: e.target.value })}
                    placeholder="Companhia (opcional, se diferente)"
                  />
                  <input
                    className={inp}
                    value={s.flight_number ?? ""}
                    onChange={(e) => patchSeg(i, { flight_number: e.target.value })}
                    placeholder="Nº do voo (ex.: LA 3456)"
                  />
                  <input
                    className={inp}
                    value={s.from_iata ?? ""}
                    onChange={(e) => patchSeg(i, { from_iata: e.target.value.toUpperCase() })}
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
                    onChange={(e) => patchSeg(i, { to_iata: e.target.value.toUpperCase() })}
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


