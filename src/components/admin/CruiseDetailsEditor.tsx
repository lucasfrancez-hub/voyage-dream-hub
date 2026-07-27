/**
 * Editor estruturado de `packages.cruise_details`.
 * Substitui o textarea de JSON no admin de pacotes — cada bloco (cabines,
 * experiências, adicionais, inclui/não inclui, políticas, navio, itinerário)
 * tem UI própria com botões de adicionar/remover.
 */
import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Ship as ShipIcon,
  BedDouble,
  Sparkles,
  MapPin,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import {
  parseCruiseDetails,
  CABIN_TYPE_LABELS,
  type CruiseDetails,
  type CabinCategory,
  type CabinType,
  type Experience,
  type Addon,
  type ItineraryDay,
  type Ship,
  type Policy,
} from "@/lib/packages/cruise";

const INP =
  "w-full h-10 px-3 rounded-xl border border-border bg-background/70 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40";
const INP_SM =
  "w-full h-9 px-2 rounded-lg border border-border bg-background/70 text-xs focus:outline-none focus:ring-2 focus:ring-brand-orange/40";
const TXT =
  "w-full px-3 py-2 rounded-xl border border-border bg-background/70 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

type Props = {
  value: unknown;
  onChange: (next: CruiseDetails) => void;
};

export function CruiseDetailsEditor({ value, onChange }: Props) {
  const details = parseCruiseDetails(value);

  function patch(p: Partial<CruiseDetails>) {
    onChange({ ...details, ...p });
  }

  return (
    <div className="space-y-3">
      <Section title="Navio" icon={<ShipIcon className="h-4 w-4" />} defaultOpen>
        <ShipEditor value={details.ship} onChange={(ship) => patch({ ship })} />
      </Section>

      <Section
        title={`Cabines (${details.cabin_categories.length})`}
        icon={<BedDouble className="h-4 w-4" />}
        defaultOpen
      >
        <CabinList
          value={details.cabin_categories}
          onChange={(cabin_categories) => patch({ cabin_categories })}
        />
      </Section>

      <Section
        title={`Experiências (${details.experiences.length})`}
        icon={<Sparkles className="h-4 w-4" />}
      >
        <ExperienceList
          value={details.experiences}
          onChange={(experiences) => patch({ experiences })}
        />
      </Section>

      <Section
        title={`Adicionais opcionais (${details.addons.length})`}
        icon={<Plus className="h-4 w-4" />}
      >
        <AddonList value={details.addons} onChange={(addons) => patch({ addons })} />
      </Section>

      <Section title="Inclui / Não inclui" icon={<ListChecks className="h-4 w-4" />}>
        <div className="grid md:grid-cols-2 gap-3">
          <BulletList
            label="Está incluído"
            value={details.included}
            onChange={(included) => patch({ included })}
          />
          <BulletList
            label="Não está incluído"
            value={details.not_included}
            onChange={(not_included) => patch({ not_included })}
          />
        </div>
      </Section>

      <Section
        title={`Itinerário (${details.itinerary.length} dia${details.itinerary.length === 1 ? "" : "s"})`}
        icon={<MapPin className="h-4 w-4" />}
      >
        <ItineraryEditor
          days={details.itinerary}
          mapImage={details.map_image ?? ""}
          onDaysChange={(itinerary) => patch({ itinerary })}
          onMapChange={(map_image) => patch({ map_image })}
        />
      </Section>

      <Section title="Políticas & informações" icon={<ShieldCheck className="h-4 w-4" />}>
        <PoliciesEditor value={details.policies} onChange={(policies) => patch({ policies })} />
        <div className="mt-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Observações extras
          </label>
          <textarea
            rows={3}
            className={`${TXT} mt-1`}
            placeholder="Notas gerais sobre este cruzeiro (opcional)"
            value={details.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </div>
      </Section>
    </div>
  );
}

/* ─────────────────────────── Section wrapper ─────────────────────────── */

function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-brand-orange" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-brand-orange">{icon}</span>
        <span>{title}</span>
      </button>
      {open && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
}

/* ─────────────────────────── Ship ─────────────────────────── */

function ShipEditor({ value, onChange }: { value: Ship; onChange: (v: Ship) => void }) {
  function patch(p: Partial<Ship>) {
    onChange({ ...value, ...p });
  }
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nome do navio">
          <input
            className={INP}
            value={value.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="Companhia">
          <input
            className={INP}
            placeholder="Ex.: MSC, Costa, Royal Caribbean"
            value={value.line ?? ""}
            onChange={(e) => patch({ line: e.target.value })}
          />
        </Field>
      </div>
      <UrlList
        label="Galeria de fotos"
        value={value.gallery ?? []}
        onChange={(gallery) => patch({ gallery })}
      />
      <Field label="Plano de decks (URL da imagem)">
        <input
          className={INP}
          value={value.deck_plan_image ?? ""}
          onChange={(e) => patch({ deck_plan_image: e.target.value })}
        />
      </Field>
      <UrlList
        label="Vídeos (URLs)"
        value={value.videos ?? []}
        onChange={(videos) => patch({ videos })}
      />
      <AttractionsEditor
        value={value.attractions ?? []}
        onChange={(attractions) => patch({ attractions })}
      />
      <DataSheetEditor
        value={value.data_sheet ?? []}
        onChange={(data_sheet) => patch({ data_sheet })}
      />
    </div>
  );
}

function AttractionsEditor({
  value,
  onChange,
}: {
  value: Ship["attractions"];
  onChange: (v: Ship["attractions"]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Atrações do navio
        </span>
        <AddButton
          onClick={() => onChange([...value, { title: "", description: "", image: "" }])}
        />
      </div>
      <div className="space-y-2">
        {value.map((a, i) => (
          <div key={i} className="rounded-lg border border-border bg-background/50 p-2 space-y-1.5">
            <div className="flex gap-2">
              <input
                className={INP_SM}
                placeholder="Título"
                value={a.title}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = { ...a, title: e.target.value };
                  onChange(next);
                }}
              />
              <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            <input
              className={INP_SM}
              placeholder="URL da foto (https://…)"
              value={a.image ?? ""}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...a, image: e.target.value };
                onChange(next);
              }}
            />
            <textarea
              rows={2}
              className={`${TXT} text-xs`}
              placeholder="Descrição"
              value={a.description ?? ""}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...a, description: e.target.value };
                onChange(next);
              }}
            />
          </div>
        ))}
        {value.length === 0 && <EmptyHint text="Nenhuma atração adicionada" />}
      </div>
    </div>
  );
}

function DataSheetEditor({
  value,
  onChange,
}: {
  value: Ship["data_sheet"];
  onChange: (v: Ship["data_sheet"]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ficha técnica
        </span>
        <AddButton onClick={() => onChange([...value, { label: "", value: "" }])} />
      </div>
      <div className="space-y-1.5">
        {value.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={INP_SM}
              placeholder="Label (ex: Comprimento)"
              value={row.label}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...row, label: e.target.value };
                onChange(next);
              }}
            />
            <input
              className={INP_SM}
              placeholder="Valor (ex: 333 m)"
              value={row.value}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...row, value: e.target.value };
                onChange(next);
              }}
            />
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
        {value.length === 0 && <EmptyHint text="Sem itens na ficha técnica" />}
      </div>
    </div>
  );
}

/* ─────────────────────────── Cabines ─────────────────────────── */

function CabinList({
  value,
  onChange,
}: {
  value: CabinCategory[];
  onChange: (v: CabinCategory[]) => void;
}) {
  function add() {
    const idx = value.length + 1;
    onChange([
      ...value,
      {
        id: `cab-${Date.now()}`,
        type: "interna",
        code: "",
        name: `Cabine ${idx}`,
        description: "",
        size_m2: "",
        capacity: 2,
        photos: [],
        category_codes: [],
        pricing: {},
        taxes_total: 0,
      },
    ]);
  }

  return (
    <div className="space-y-3">
      {value.map((cab, i) => (
        <CabinRow
          key={cab.id || i}
          cabin={cab}
          onChange={(next) => {
            const arr = [...value];
            arr[i] = next;
            onChange(arr);
          }}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      {value.length === 0 && <EmptyHint text="Nenhuma cabine cadastrada" />}
      <button
        type="button"
        onClick={add}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-border hover:border-brand-orange hover:bg-brand-orange/5 text-sm font-semibold text-muted-foreground hover:text-brand-orange transition flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" /> Adicionar cabine
      </button>
    </div>
  );
}

function CabinRow({
  cabin,
  onChange,
  onRemove,
}: {
  cabin: CabinCategory;
  onChange: (v: CabinCategory) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  function patch(p: Partial<CabinCategory>) {
    onChange({ ...cabin, ...p });
  }
  function patchTier(occ: "occ2" | "occ3" | "occ4", field: string, val: number | undefined) {
    const tier = cabin.pricing?.[occ] ?? { per_person: 0 };
    onChange({
      ...cabin,
      pricing: {
        ...cabin.pricing,
        [occ]: { ...tier, [field]: val },
      },
    });
  }

  return (
    <div className="rounded-xl border border-border bg-background/50">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground hover:text-brand-orange"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <select
          className="h-9 px-2 rounded-lg border border-border bg-background text-xs font-semibold"
          value={cabin.type}
          onChange={(e) => patch({ type: e.target.value as CabinType })}
        >
          {(Object.keys(CABIN_TYPE_LABELS) as CabinType[]).map((k) => (
            <option key={k} value={k}>
              {CABIN_TYPE_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          className={`${INP_SM} flex-1`}
          placeholder="Nome"
          value={cabin.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <input
          className={`${INP_SM} w-24`}
          placeholder="Código"
          value={cabin.code}
          onChange={(e) => patch({ code: e.target.value })}
        />
        <input
          type="number"
          className={`${INP_SM} w-20`}
          placeholder="R$/pp"
          value={cabin.pricing?.occ2?.per_person ?? ""}
          onChange={(e) => patchTier("occ2", "per_person", Number(e.target.value) || 0)}
        />
        <RemoveButton onClick={onRemove} />
      </div>
      {open && (
        <div className="border-t border-border p-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <Field label="Tamanho (m²)">
              <input
                className={INP_SM}
                value={cabin.size_m2}
                onChange={(e) => patch({ size_m2: e.target.value })}
              />
            </Field>
            <Field label="Capacidade">
              <input
                type="number"
                min={1}
                max={8}
                className={INP_SM}
                value={cabin.capacity}
                onChange={(e) => patch({ capacity: Number(e.target.value) || 2 })}
              />
            </Field>
            <Field label="Taxas portuárias (total/cabine)">
              <input
                type="number"
                className={INP_SM}
                value={cabin.taxes_total}
                onChange={(e) => patch({ taxes_total: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <Field label="Descrição">
            <textarea
              rows={2}
              className={`${TXT} text-xs`}
              value={cabin.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Preços por ocupação (R$ por pessoa)
            </div>
            <div className="space-y-1.5">
              {(["occ2", "occ3", "occ4"] as const).map((occ) => {
                const tier = cabin.pricing?.[occ];
                const paxLabel = occ === "occ2" ? "2 pax" : occ === "occ3" ? "3 pax" : "4 pax";
                return (
                  <div key={occ} className="grid grid-cols-5 gap-2 items-center">
                    <span className="text-xs font-semibold text-muted-foreground">{paxLabel}</span>
                    <input
                      type="number"
                      placeholder="1ª/2ª pax"
                      className={INP_SM}
                      value={tier?.per_person ?? ""}
                      onChange={(e) =>
                        patchTier(occ, "per_person", Number(e.target.value) || 0)
                      }
                    />
                    <input
                      type="number"
                      placeholder="3ª pax"
                      className={INP_SM}
                      value={tier?.third ?? ""}
                      onChange={(e) =>
                        patchTier(occ, "third", e.target.value ? Number(e.target.value) : undefined)
                      }
                      disabled={occ === "occ2"}
                    />
                    <input
                      type="number"
                      placeholder="4ª pax"
                      className={INP_SM}
                      value={tier?.fourth ?? ""}
                      onChange={(e) =>
                        patchTier(occ, "fourth", e.target.value ? Number(e.target.value) : undefined)
                      }
                      disabled={occ !== "occ4"}
                    />
                    <input
                      type="number"
                      placeholder="Criança"
                      className={INP_SM}
                      value={tier?.child ?? ""}
                      onChange={(e) =>
                        patchTier(occ, "child", e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <UrlList
            label="Fotos da cabine"
            value={cabin.photos}
            onChange={(photos) => patch({ photos })}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Experiences ─────────────────────────── */

function ExperienceList({
  value,
  onChange,
}: {
  value: Experience[];
  onChange: (v: Experience[]) => void;
}) {
  function add() {
    onChange([
      ...value,
      {
        id: `exp-${Date.now()}`,
        name: "",
        description: "",
        benefits: [],
        delta_per_person: 0,
        recommended: false,
      },
    ]);
  }

  return (
    <div className="space-y-2">
      {value.map((exp, i) => (
        <div key={exp.id || i} className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              className={`${INP_SM} flex-1`}
              placeholder="Nome (ex: Free at Sea, Bella, Aurea)"
              value={exp.name}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...exp, name: e.target.value };
                onChange(next);
              }}
            />
            <input
              type="number"
              className={`${INP_SM} w-32`}
              placeholder="Δ R$/pax"
              value={exp.delta_per_person}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...exp, delta_per_person: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
            <label className="flex items-center gap-1 text-xs font-semibold">
              <input
                type="checkbox"
                checked={exp.recommended}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = { ...exp, recommended: e.target.checked };
                  onChange(next);
                }}
              />
              Destaque
            </label>
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          <textarea
            rows={2}
            className={`${TXT} text-xs`}
            placeholder="Descrição"
            value={exp.description}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...exp, description: e.target.value };
              onChange(next);
            }}
          />
          <BulletList
            label="Benefícios"
            value={exp.benefits}
            onChange={(benefits) => {
              const next = [...value];
              next[i] = { ...exp, benefits };
              onChange(next);
            }}
            compact
          />
        </div>
      ))}
      {value.length === 0 && <EmptyHint text="Nenhuma experiência (Free at Sea, Bella…) cadastrada" />}
      <button
        type="button"
        onClick={add}
        className="w-full py-2 rounded-xl border-2 border-dashed border-border hover:border-brand-orange text-xs font-semibold text-muted-foreground hover:text-brand-orange transition flex items-center justify-center gap-2"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar experiência
      </button>
    </div>
  );
}

/* ─────────────────────────── Addons ─────────────────────────── */

const ADDON_CATEGORIES: Addon["category"][] = [
  "bebidas",
  "wifi",
  "gorjeta",
  "transfer",
  "seguro",
  "excursao",
  "restaurante",
  "spa",
  "outro",
];
const ADDON_UNITS: Addon["price_unit"][] = [
  "per_person",
  "per_cabin",
  "per_day",
  "per_person_per_day",
  "fixed",
];
const UNIT_LABELS: Record<Addon["price_unit"], string> = {
  per_person: "por pessoa",
  per_cabin: "por cabine",
  per_day: "por dia",
  per_person_per_day: "por pessoa/dia",
  fixed: "fixo",
};

function AddonList({ value, onChange }: { value: Addon[]; onChange: (v: Addon[]) => void }) {
  function add() {
    onChange([
      ...value,
      {
        id: `add-${Date.now()}`,
        name: "",
        description: "",
        price: 0,
        price_unit: "per_person",
        category: "outro",
        optional: true,
      },
    ]);
  }
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={a.id || i} className="rounded-lg border border-border bg-background/50 p-2 space-y-1.5">
          <div className="flex gap-2">
            <select
              className="h-9 px-2 rounded-lg border border-border bg-background text-xs font-semibold"
              value={a.category}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...a, category: e.target.value as Addon["category"] };
                onChange(next);
              }}
            >
              {ADDON_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={`${INP_SM} flex-1`}
              placeholder="Nome (ex: Pacote Premium Plus)"
              value={a.name}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...a, name: e.target.value };
                onChange(next);
              }}
            />
            <input
              type="number"
              className={`${INP_SM} w-24`}
              placeholder="R$"
              value={a.price}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...a, price: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
            <select
              className="h-9 px-2 rounded-lg border border-border bg-background text-xs"
              value={a.price_unit}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...a, price_unit: e.target.value as Addon["price_unit"] };
                onChange(next);
              }}
            >
              {ADDON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          <input
            className={INP_SM}
            placeholder="Descrição curta (opcional)"
            value={a.description}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...a, description: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
      {value.length === 0 && <EmptyHint text="Nenhum adicional cadastrado" />}
      <button
        type="button"
        onClick={add}
        className="w-full py-2 rounded-xl border-2 border-dashed border-border hover:border-brand-orange text-xs font-semibold text-muted-foreground hover:text-brand-orange transition flex items-center justify-center gap-2"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar adicional
      </button>
    </div>
  );
}

/* ─────────────────────────── Itinerary ─────────────────────────── */

function ItineraryEditor({
  days,
  mapImage,
  onDaysChange,
  onMapChange,
}: {
  days: ItineraryDay[];
  mapImage: string;
  onDaysChange: (v: ItineraryDay[]) => void;
  onMapChange: (v: string) => void;
}) {
  function add() {
    onDaysChange([
      ...days,
      {
        day: days.length + 1,
        date: "",
        port: "",
        country: "",
        arrival: "",
        departure: "",
        description: "",
        photo: "",
      },
    ]);
  }
  return (
    <div className="space-y-3">
      <Field label="Mapa da rota (URL da imagem)">
        <input
          className={INP}
          placeholder="https://…/mapa-rota.png"
          value={mapImage}
          onChange={(e) => onMapChange(e.target.value)}
        />
      </Field>
      <div className="space-y-2">
        {days.map((d, i) => (
          <div key={i} className="rounded-lg border border-border bg-background/50 p-2 space-y-1.5">
            <div className="grid grid-cols-6 gap-2">
              <input
                type="number"
                className={INP_SM}
                placeholder="Dia"
                value={d.day}
                onChange={(e) => {
                  const next = [...days];
                  next[i] = { ...d, day: Number(e.target.value) || i + 1 };
                  onDaysChange(next);
                }}
              />
              <input
                type="date"
                className={`${INP_SM} col-span-1`}
                value={d.date}
                onChange={(e) => {
                  const next = [...days];
                  next[i] = { ...d, date: e.target.value };
                  onDaysChange(next);
                }}
              />
              <input
                className={`${INP_SM} col-span-2`}
                placeholder="Porto (ex: Nassau, Dia no mar)"
                value={d.port}
                onChange={(e) => {
                  const next = [...days];
                  next[i] = { ...d, port: e.target.value };
                  onDaysChange(next);
                }}
              />
              <input
                className={INP_SM}
                placeholder="Chegada HH:MM"
                value={d.arrival}
                onChange={(e) => {
                  const next = [...days];
                  next[i] = { ...d, arrival: e.target.value };
                  onDaysChange(next);
                }}
              />
              <div className="flex gap-1">
                <input
                  className={`${INP_SM} flex-1`}
                  placeholder="Partida"
                  value={d.departure}
                  onChange={(e) => {
                    const next = [...days];
                    next[i] = { ...d, departure: e.target.value };
                    onDaysChange(next);
                  }}
                />
                <RemoveButton onClick={() => onDaysChange(days.filter((_, j) => j !== i))} />
              </div>
            </div>
            <textarea
              rows={1}
              className={`${TXT} text-xs`}
              placeholder="O que fazer no porto (opcional)"
              value={d.description}
              onChange={(e) => {
                const next = [...days];
                next[i] = { ...d, description: e.target.value };
                onDaysChange(next);
              }}
            />
          </div>
        ))}
        {days.length === 0 && <EmptyHint text="Nenhum dia no roteiro" />}
      </div>
      <button
        type="button"
        onClick={add}
        className="w-full py-2 rounded-xl border-2 border-dashed border-border hover:border-brand-orange text-xs font-semibold text-muted-foreground hover:text-brand-orange transition flex items-center justify-center gap-2"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar dia
      </button>
    </div>
  );
}

/* ─────────────────────────── Policies ─────────────────────────── */

function PoliciesEditor({ value, onChange }: { value: Policy; onChange: (v: Policy) => void }) {
  const fields: { key: keyof Policy; label: string; ph: string }[] = [
    { key: "payment", label: "Pagamento", ph: "Formas de pagamento, parcelamento, entrada…" },
    { key: "cancellation", label: "Cancelamento", ph: "Prazos, multas, condições de reembolso" },
    { key: "boarding", label: "Embarque / desembarque", ph: "Horários, documentação de embarque" },
    { key: "documents", label: "Documentos", ph: "Passaporte, vistos, vacinas exigidas" },
    { key: "children_policy", label: "Política de crianças", ph: "Idade mínima, valores, berço" },
    { key: "other", label: "Outras informações", ph: "Qualquer observação adicional" },
  ];
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {fields.map((f) => (
        <Field key={f.key} label={f.label}>
          <textarea
            rows={3}
            className={`${TXT} text-xs`}
            placeholder={f.ph}
            value={value[f.key] ?? ""}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}

/* ─────────────────────────── Bits ─────────────────────────── */

function BulletList({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const t = draft.trim();
    if (!t) return;
    onChange([...value, t]);
    setDraft("");
  }
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className={`space-y-1 ${compact ? "" : "mb-2"}`}>
        {value.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-brand-orange">•</span>
            <input
              className={`${INP_SM} flex-1`}
              value={v}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
        {value.length === 0 && !compact && <EmptyHint text="Vazio" />}
      </div>
      <div className="flex gap-2">
        <input
          className={INP_SM}
          placeholder="Adicionar item + Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button
          type="button"
          onClick={commit}
          className="px-3 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function UrlList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const t = draft.trim();
    if (!t) return;
    onChange([...value, t]);
    setDraft("");
  }
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="space-y-1 mb-2">
        {value.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            {v && (
              <img
                src={v}
                alt=""
                className="h-8 w-8 rounded object-cover border border-border"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <input
              className={`${INP_SM} flex-1`}
              value={v}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={INP_SM}
          placeholder="Cole uma URL + Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button
          type="button"
          onClick={commit}
          className="px-3 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-2 rounded-lg bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange text-xs font-semibold flex items-center gap-1"
    >
      <Plus className="h-3 w-3" /> Adicionar
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 w-9 shrink-0 rounded-lg border border-border hover:border-destructive hover:bg-destructive/10 hover:text-destructive text-muted-foreground flex items-center justify-center transition"
      aria-label="Remover"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-xs text-muted-foreground italic py-2 text-center bg-muted/20 rounded-lg">
      {text}
    </div>
  );
}
