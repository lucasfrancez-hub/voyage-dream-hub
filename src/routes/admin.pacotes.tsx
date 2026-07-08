import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";

export const Route = createFileRoute("/admin/pacotes")({
  component: AdminPackages,
});

type FlightInfo = {
  airline?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  stops?: number | string;
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
  is_active: boolean;
  sort_order: number;
  base_occupancy: number;
  outbound_flight: FlightInfo | null;
  return_flight: FlightInfo | null;
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
  is_active: true,
  sort_order: 0,
  base_occupancy: 2,
  outbound_flight: null,
  return_flight: null,
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-card border border-border p-6 my-8">
            <h2 className="text-xl font-semibold">
              {editing.id ? "Editar pacote" : "Novo pacote"}
            </h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
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
              <FormField label="Taxas">
                <input
                  type="number"
                  step="0.01"
                  className={inp}
                  value={editing.taxes ?? 0}
                  onChange={(e) => setEditing({ ...editing, taxes: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Hotel">
                <input
                  className={inp}
                  value={editing.hotel_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, hotel_name: e.target.value })}
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

            <div className="mt-6 flex justify-end gap-2">
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
  const entries = Object.entries(f).filter(([, v]) => v !== "" && v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as FlightInfo;
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
  const patch = (p: Partial<FlightInfo>) => onChange({ ...f, ...p });
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
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Companhia aérea">
          <input
            className={inp}
            value={f.airline ?? ""}
            onChange={(e) => patch({ airline: e.target.value })}
            placeholder="LATAM, GOL, Azul…"
          />
        </FormField>
        <FormField label="Número do voo">
          <input
            className={inp}
            value={f.flight_number ?? ""}
            onChange={(e) => patch({ flight_number: e.target.value })}
            placeholder="LA 3456"
          />
        </FormField>
        <FormField label="Origem (IATA)">
          <input
            className={inp}
            value={f.from_iata ?? ""}
            onChange={(e) => patch({ from_iata: e.target.value.toUpperCase() })}
            placeholder="RIO"
            maxLength={4}
          />
        </FormField>
        <FormField label="Cidade origem">
          <input
            className={inp}
            value={f.from_city ?? ""}
            onChange={(e) => patch({ from_city: e.target.value })}
            placeholder="Rio de Janeiro"
          />
        </FormField>
        <FormField label="Destino (IATA)">
          <input
            className={inp}
            value={f.to_iata ?? ""}
            onChange={(e) => patch({ to_iata: e.target.value.toUpperCase() })}
            placeholder="PMW"
            maxLength={4}
          />
        </FormField>
        <FormField label="Cidade destino">
          <input
            className={inp}
            value={f.to_city ?? ""}
            onChange={(e) => patch({ to_city: e.target.value })}
            placeholder="Palmas"
          />
        </FormField>
        <FormField label="Partida (data e hora)">
          <input
            type="datetime-local"
            className={inp}
            value={f.depart_at ?? ""}
            onChange={(e) => patch({ depart_at: e.target.value })}
          />
        </FormField>
        <FormField label="Chegada (data e hora)">
          <input
            type="datetime-local"
            className={inp}
            value={f.arrive_at ?? ""}
            onChange={(e) => patch({ arrive_at: e.target.value })}
          />
        </FormField>
        <FormField label="Duração">
          <input
            className={inp}
            value={f.duration ?? ""}
            onChange={(e) => patch({ duration: e.target.value })}
            placeholder="2h 30min"
          />
        </FormField>
        <FormField label="Escalas (0 = direto)">
          <input
            type="number"
            min={0}
            className={inp}
            value={f.stops ?? ""}
            onChange={(e) => patch({ stops: e.target.value === "" ? "" : Number(e.target.value) })}
          />
        </FormField>
      </div>
    </div>
  );
}

