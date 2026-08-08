import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ship as ShipIcon,
  MapPin,
  Calendar as CalendarIcon,
  Info,
  Plus,
  Minus,
  Check,
  ChevronRight,
  Sparkles,
  BedDouble,
  ArrowRight,
  Loader2,
  X,
  QrCode,
  Mail,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";
import { formatBRL, formatDateBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { criarPixCobranca } from "@/lib/pix.functions";
import { notifyPixOrder } from "@/lib/pix-notify.functions";
import { PixQrOverlay } from "@/components/PixQrOverlay";
import { PIX_FEE } from "@/lib/checkout-config";
import { CruiseMoreModal } from "./CruiseMoreModal";
import {
  CABIN_TYPE_LABELS,
  calcCruisePrice,
  parseCruiseDetails,
  type CabinCategory,
  type CabinType,
  type Experience,
} from "@/lib/packages/cruise";

type Pkg = {
  id: string;
  slug: string;
  title: string;
  destination: string | null;
  origin: string | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  image_url: string | null;
  summary: string | null;
  cruise_details?: unknown;
};

export function CruiseDetailsView({ pkg }: { pkg: Pkg }) {
  const details = useMemo(() => parseCruiseDetails((pkg as any).cruise_details), [pkg]);
  const cabins = details.cabin_categories;
  const experiences = details.experiences;

  // types available
  const typesAvailable = useMemo(() => {
    const set = new Set<CabinType>();
    for (const c of cabins) set.add(c.type);
    return (["interna", "externa", "varanda", "suite"] as CabinType[]).filter((t) => set.has(t));
  }, [cabins]);

  const [type, setType] = useState<CabinType | null>(typesAvailable[0] ?? null);
  useEffect(() => {
    if (!type && typesAvailable[0]) setType(typesAvailable[0]);
  }, [typesAvailable, type]);

  const cabinsOfType = useMemo(
    () => (type ? cabins.filter((c) => c.type === type) : []),
    [cabins, type],
  );

  const [cabinId, setCabinId] = useState<string | null>(cabinsOfType[0]?.id ?? null);
  useEffect(() => {
    setCabinId(cabinsOfType[0]?.id ?? null);
  }, [type, cabinsOfType]);
  const cabin = cabins.find((c) => c.id === cabinId);

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  useEffect(() => {
    if (!cabin) return;
    if (adults + children > cabin.capacity) {
      setChildren(Math.max(0, cabin.capacity - adults));
    }
  }, [cabin, adults, children]);

  const [expId, setExpId] = useState<string | null>(experiences[0]?.id ?? null);
  const experience = experiences.find((e) => e.id === expId) ?? undefined;

  const pricing = useMemo(
    () => calcCruisePrice(cabin, adults, children, experience),
    [cabin, adults, children, experience],
  );

  const [moreOpen, setMoreOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const heroImage = pkg.image_url ?? details.ship?.gallery?.[0] ?? null;
  const cruiseDateLabel = pkg.going_date
    ? `${formatDateBR(pkg.going_date)}${pkg.return_date ? ` — ${formatDateBR(pkg.return_date)}` : ""}${
        pkg.nights ? ` · ${pkg.nights} noites` : ""
      }`
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backTo="/cruzeiros" backLabel="Todos os cruzeiros" />

      {/* Hero */}
      <div className="relative w-full aspect-[16/6] max-h-[360px] overflow-hidden bg-muted">
        {heroImage && (
          <img
            src={heroImage}
            alt={pkg.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-7xl px-6 pb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-1.5 text-xs uppercase tracking-widest text-white">
              <ShipIcon className="h-3.5 w-3.5" /> Cruzeiro
              {pkg.destination && <> · {pkg.destination}</>}
            </div>
            <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold max-w-3xl">{pkg.title}</h1>
            {cruiseDateLabel && (
              <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                <CalendarIcon className="h-4 w-4" /> {cruiseDateLabel}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          {/* Ship strip + "Ver mais" */}
          <div className="rounded-3xl border border-border bg-card p-5 flex items-center gap-5">
            <div className="hidden sm:block h-16 w-24 rounded-xl bg-muted overflow-hidden shrink-0">
              {details.ship?.gallery?.[0] ? (
                <img
                  src={details.ship.gallery[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid place-items-center h-full text-muted-foreground">
                  <ShipIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {details.ship?.line || "Companhia"}
              </div>
              <div className="font-display text-lg font-bold truncate">
                {details.ship?.name || pkg.title}
              </div>
              {pkg.going_date && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Embarque: {pkg.origin || "—"} · {formatDateBR(pkg.going_date)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition"
            >
              Ver mais <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Escolha o tipo de cabine */}
          {typesAvailable.length > 0 && (
            <section>
              <h2 className="font-display text-2xl font-bold">Escolha o tipo da cabine</h2>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {typesAvailable.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition",
                      type === t
                        ? "border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/40"
                        : "border-border hover:border-sky-400/60",
                    )}
                  >
                    <BedDouble className="h-5 w-5 text-sky-600" />
                    <div className="mt-2 font-semibold text-sm">{CABIN_TYPE_LABELS[t]}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {cabins.filter((c) => c.type === t).length} opções
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Escolha a cabine */}
          {cabinsOfType.length > 0 && (
            <section>
              <h2 className="font-display text-2xl font-bold">Escolha a cabine</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {cabinsOfType.map((c) => (
                  <CabinCard
                    key={c.id}
                    cabin={c}
                    selected={c.id === cabinId}
                    onSelect={() => setCabinId(c.id)}
                    onDetails={() => setMoreOpen(true)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Escolha uma experiência */}
          {experiences.length > 0 && (
            <section>
              <h2 className="font-display text-2xl font-bold">Escolha uma experiência</h2>
              <div className="mt-4 grid gap-3">
                {experiences.map((exp) => (
                  <ExperienceCard
                    key={exp.id}
                    exp={exp}
                    selected={exp.id === expId}
                    onSelect={() => setExpId(exp.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Adicionais opcionais */}
          {details.addons.length > 0 && (
            <section>
              <h2 className="font-display text-2xl font-bold">Adicionais opcionais</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Serviços extras que você pode contratar à parte.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {details.addons.map((addon) => (
                  <div
                    key={addon.id}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-brand-orange font-semibold">
                          {ADDON_CATEGORY_LABELS[addon.category] ?? "Adicional"}
                        </div>
                        <div className="font-semibold truncate">{addon.name}</div>
                        {addon.description && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {addon.description}
                          </p>
                        )}
                      </div>
                      {addon.price > 0 && (
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm">{formatBRL(addon.price)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {ADDON_UNIT_LABELS[addon.price_unit]}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inclui / Não inclui */}
          {(details.included.length > 0 || details.not_included.length > 0) && (
            <section className="grid gap-4 sm:grid-cols-2">
              {details.included.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <Check className="h-4 w-4" /> Está incluído
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {details.included.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {details.not_included.length > 0 && (
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <X className="h-4 w-4 text-muted-foreground" /> Não está incluído
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {details.not_included.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <X className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Políticas */}
          {hasPolicies(details.policies) && (
            <section>
              <h2 className="font-display text-2xl font-bold">Informações importantes</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PolicyBlock label="Pagamento" text={details.policies.payment} />
                <PolicyBlock label="Cancelamento" text={details.policies.cancellation} />
                <PolicyBlock label="Embarque" text={details.policies.boarding} />
                <PolicyBlock label="Documentos" text={details.policies.documents} />
                <PolicyBlock label="Crianças" text={details.policies.children_policy} />
                <PolicyBlock label="Outras informações" text={details.policies.other} />
              </div>
            </section>
          )}


          {/* Fallback: sem cabines cadastradas */}
          {cabins.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border bg-muted/40 p-10 text-center">
              <Info className="mx-auto h-8 w-8 text-brand-orange" />
              <h3 className="mt-3 font-semibold">Cabines em atualização</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Fale com nossa equipe para valores atualizados deste cruzeiro.
              </p>
            </div>
          )}
        </div>

        {/* Mini-checkout sticky */}
        <MiniCheckout
          cabin={cabin}
          adults={adults}
          children={children}
          setAdults={setAdults}
          setChildren={setChildren}
          experience={experience}
          pricing={pricing}
          onPay={() => setPayOpen(true)}
          onQuote={() => setQuoteOpen(true)}
        />
      </div>

      <ContactFooter />

      <CruiseMoreModal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        details={details}
        cruiseTitle={pkg.title}
      />

      {payOpen && pricing && cabin && (
        <CruiseCheckoutDialog
          mode="pix"
          pkg={pkg}
          cabin={cabin}
          adults={adults}
          childrenCount={children}
          experience={experience}
          total={pricing.total}
          onClose={() => setPayOpen(false)}
        />
      )}
      {quoteOpen && pricing && cabin && (
        <CruiseCheckoutDialog
          mode="quote"
          pkg={pkg}
          cabin={cabin}
          adults={adults}
          childrenCount={children}
          experience={experience}
          total={pricing.total}
          onClose={() => setQuoteOpen(false)}
        />
      )}
    </div>
  );
}

function CabinCard({
  cabin,
  selected,
  onSelect,
  onDetails,
}: {
  cabin: CabinCategory;
  selected: boolean;
  onSelect: () => void;
  onDetails: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left rounded-2xl border overflow-hidden bg-card transition group",
        selected ? "border-sky-500 ring-2 ring-sky-500/40" : "border-border hover:border-sky-400/60",
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {cabin.photos?.[0] ? (
          <img
            src={cabin.photos[0]}
            alt={cabin.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="grid place-items-center h-full text-muted-foreground text-xs">
            Sem foto
          </div>
        )}
        {selected && (
          <div className="absolute top-2 right-2 rounded-full bg-sky-600 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 flex items-center gap-1">
            <Check className="h-3 w-3" /> Selecionado
          </div>
        )}
        {cabin.category_codes?.length ? (
          <div className="absolute bottom-2 left-2 rounded-full bg-black/60 text-white text-[10px] px-2 py-0.5">
            {cabin.category_codes.join(", ")}
          </div>
        ) : null}
      </div>
      <div className="p-4">
        <div className="font-semibold text-sm">{cabin.name}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Até {cabin.capacity} pessoas{cabin.size_m2 ? ` · ${cabin.size_m2}` : ""}
        </div>
        {cabin.upgrade_from_base != null && cabin.upgrade_from_base > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-orange/10 text-brand-orange text-[11px] px-2 py-0.5">
            Upgrade por {formatBRL(cabin.upgrade_from_base)}
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDetails();
          }}
          className="mt-2 text-[11px] text-sky-600 hover:underline"
        >
          Ver detalhes desta cabine
        </div>
      </div>
    </button>
  );
}

function ExperienceCard({
  exp,
  selected,
  onSelect,
}: {
  exp: Experience;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left rounded-2xl border p-5 transition",
        selected
          ? "border-sky-500 ring-2 ring-sky-500/40 bg-sky-500/5"
          : "border-border hover:border-sky-400/60 bg-card",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "h-10 w-10 rounded-full grid place-items-center shrink-0",
            selected ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-sm">{exp.name}</div>
            {exp.recommended && (
              <span className="rounded-full bg-emerald-500/15 text-emerald-600 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">
                Recomendado
              </span>
            )}
            {exp.delta_per_person > 0 && (
              <span className="ml-auto text-xs text-brand-orange font-semibold">
                +{formatBRL(exp.delta_per_person)} p/p
              </span>
            )}
          </div>
          {exp.description && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{exp.description}</p>
          )}
          {exp.benefits.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {exp.benefits.map((b, i) => (
                <li
                  key={i}
                  className="rounded-full bg-muted text-[11px] text-foreground/80 px-2 py-0.5"
                >
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </button>
  );
}

function MiniCheckout({
  cabin,
  adults,
  children,
  setAdults,
  setChildren,
  experience,
  pricing,
  onPay,
  onQuote,
}: {
  cabin: CabinCategory | undefined;
  adults: number;
  children: number;
  setAdults: (n: number) => void;
  setChildren: (n: number) => void;
  experience: Experience | undefined;
  pricing: ReturnType<typeof calcCruisePrice>;
  onPay: () => void;
  onQuote: () => void;
}) {
  const maxCap = cabin?.capacity ?? 4;
  const canAddAdult = adults + children < maxCap && adults < 4;
  const canRemoveAdult = adults > 1;
  const supportsChild = !!cabin && !!cabin.pricing.occ2?.child;
  const canAddChild = supportsChild && adults + children < maxCap;
  const canRemoveChild = children > 0;

  return (
    <aside className="lg:sticky lg:top-24 h-fit rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="bg-gradient-brand p-5 text-primary-foreground">
        <div className="text-[11px] uppercase tracking-widest opacity-90">Seu cruzeiro</div>
        <div className="mt-1 font-display text-lg font-bold leading-tight">
          {cabin?.name ?? "Selecione uma cabine"}
        </div>
        {cabin && (
          <div className="text-xs opacity-90 mt-1">
            {CABIN_TYPE_LABELS[cabin.type]}
            {cabin.size_m2 ? ` · ${cabin.size_m2}` : ""}
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">Ocupação</div>
          <PaxStepper
            label="Adultos"
            value={adults}
            onDec={canRemoveAdult ? () => setAdults(adults - 1) : undefined}
            onInc={canAddAdult ? () => setAdults(Math.min(4, adults + 1)) : undefined}
          />
          {supportsChild && (
            <PaxStepper
              label="Crianças"
              hint="valor reduzido"
              value={children}
              onDec={canRemoveChild ? () => setChildren(children - 1) : undefined}
              onInc={canAddChild ? () => setChildren(children + 1) : undefined}
            />
          )}
          {cabin && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Capacidade da cabine: até {cabin.capacity} pessoas
            </div>
          )}
        </div>

        {pricing ? (
          <div className="space-y-2 text-sm">
            <PriceRow
              label={`${adults} adulto${adults > 1 ? "s" : ""}`}
              value={pricing.adultsSubtotal}
            />
            {children > 0 && (
              <PriceRow
                label={`${children} criança${children > 1 ? "s" : ""}`}
                value={pricing.childrenSubtotal}
              />
            )}
            {experience && experience.delta_per_person > 0 && (
              <PriceRow label={experience.name} value={pricing.experienceDelta} />
            )}
            {pricing.taxes > 0 && <PriceRow label="Taxas e impostos" value={pricing.taxes} />}
            <div className="border-t border-border pt-3 flex items-baseline justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Total</div>
              <div className="text-2xl font-display font-bold text-brand-orange">
                {formatBRL(pricing.total)}
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              ou entrada + 12x sem juros de {formatBRL(pricing.total / 13)}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">
            Selecione uma cabine para ver os valores.
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            disabled={!pricing}
            onClick={onPay}
            className="w-full rounded-full bg-brand-orange text-white py-3 text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            <QrCode className="h-4 w-4" /> Realizar pagamento
          </button>
          <button
            type="button"
            disabled={!pricing}
            onClick={onQuote}
            className="w-full rounded-full border border-border py-3 text-sm font-semibold hover:bg-muted transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            <Mail className="h-4 w-4" /> Incluir no orçamento
          </button>
        </div>
      </div>
    </aside>
  );
}

function PaxStepper({
  label,
  value,
  hint,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  hint?: string;
  onDec?: () => void;
  onInc?: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!onDec}
          onClick={onDec}
          className="h-8 w-8 rounded-full border border-border grid place-items-center disabled:opacity-30 hover:bg-muted"
          aria-label={`Diminuir ${label}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <div className="w-6 text-center text-sm font-semibold">{value}</div>
        <button
          type="button"
          disabled={!onInc}
          onClick={onInc}
          className="h-8 w-8 rounded-full border border-border grid place-items-center disabled:opacity-30 hover:bg-muted"
          aria-label={`Aumentar ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{formatBRL(value)}</span>
    </div>
  );
}

/**
 * Dialog compacto para capturar contato + endereço e disparar Pix (ou orçamento).
 * Reaproveita a lógica de `pacotes.$slug.checkout.tsx` mas simplificada pro cruzeiro.
 */
function CruiseCheckoutDialog({
  mode,
  pkg,
  cabin,
  adults,
  childrenCount,
  experience,
  total,
  onClose,
}: {
  mode: "pix" | "quote";
  pkg: Pkg;
  cabin: CabinCategory;
  adults: number;
  childrenCount: number;
  experience: Experience | undefined;
  total: number;
  onClose: () => void;
}) {
  const criarPix = useServerFn(criarPixCobranca);
  const notifyPix = useServerFn(notifyPixOrder);
  // taxa Pix embutida no valor cobrado — nunca exibida como linha separada
  const chargedTotal = mode === "pix" ? total + PIX_FEE : total;

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    cpf: "",
    cep: "",
    address: "",
    number: "",
    city: "",
    state: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [pix, setPix] = useState<{ qrCode: string; valor: number; expiraEm: string } | null>(null);
  const [done, setDone] = useState(false);

  async function lookupCep(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (!j.erro) {
        setForm((f) => ({
          ...f,
          address: j.logradouro || f.address,
          city: j.localidade || f.city,
          state: j.uf || f.state,
        }));
      }
    } catch {
      /* silencioso */
    }
  }

  async function submit() {
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.error("Preencha nome, e-mail e telefone.");
      return;
    }
    if (mode === "pix") {
      if (!form.cep.trim() || !form.address.trim() || !form.number.trim() || !form.city.trim() || !form.state.trim()) {
        toast.error("Preencha o endereço de cobrança para o Pix.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const newId = crypto.randomUUID();
      const orderNumber = `#${String(parseInt(newId.replace(/-/g, "").slice(0, 12), 16) % 100000000).padStart(8, "0")}`;

      const snapshot = {
        slug: pkg.slug,
        title: pkg.title,
        destination: pkg.destination ?? null,
        origin: pkg.origin ?? null,
        going_date: pkg.going_date ?? null,
        return_date: pkg.return_date ?? null,
        nights: pkg.nights ?? null,
        kind: "cruise",
        cabin: {
          id: cabin.id,
          type: cabin.type,
          name: cabin.name,
          code: cabin.code,
          category_codes: cabin.category_codes,
        },
        experience: experience
          ? { id: experience.id, name: experience.name, delta_per_person: experience.delta_per_person }
          : null,
        adults,
        children: childrenCount,
        taxes: cabin.taxes_total,
        total: chargedTotal,
      };

      if (mode === "pix") {
        const { error } = await supabase.from("orders").insert({
          id: newId,
          package_id: pkg.id,
          package_snapshot: {
            ...snapshot,
            pix_capture: {
              billing: {
                zip: form.cep,
                address: form.address,
                number: form.number,
                city: form.city,
                state: form.state,
              },
            },
          },
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          cpf: form.cpf || null,
          adults,
          children: childrenCount,
          payment_method: "pix",
          total_price: chargedTotal,
          notes: form.notes || null,
          payer_full_name: form.full_name,
          payer_cpf: form.cpf || null,
          payer_email: form.email,
          payer_phone: form.phone,
          payer_zip: form.cep,
          payer_address: form.address,
          payer_number: form.number,
          payer_city: form.city,
          payer_state: form.state,
        } as any);
        if (error) throw error;

        try {
          await notifyPix({
            data: {
              orderNumber,
              productKind: "Cruzeiro",
              productTitle: `${pkg.title} — ${cabin.name}`,
              adults,
              children: childrenCount,
              totalPrice: formatBRL(chargedTotal),
              customerName: form.full_name,
              customerEmail: form.email,
              customerPhone: form.phone,
              notes: form.notes || undefined,
            },
          });
        } catch (err) {
          console.error("[cruise] notify falhou", err);
        }

        try {
          const cob = await criarPix({ data: { orderId: newId, valorEsperado: chargedTotal } });
          setPix(cob);
        } catch (err) {
          console.error("[cruise] pix falhou", err);
          toast.warning("Pedido registrado! Nossa equipe vai enviar o QR Pix por e-mail em instantes.");
          setDone(true);
        }
      } else {
        // Orçamento: só notifica admin (sem gravar order)
        try {
          await notifyPix({
            data: {
              orderNumber: `ORC-${orderNumber.replace("#", "")}`,
              productKind: "Cruzeiro (orçamento)",
              productTitle: `${pkg.title} — ${cabin.name}`,
              adults,
              children: childrenCount,
              totalPrice: formatBRL(chargedTotal),
              customerName: form.full_name,
              customerEmail: form.email,
              customerPhone: form.phone,
              notes: form.notes || undefined,
            },
          });
          toast.success("Orçamento enviado! Nossa equipe vai retornar em breve.");
          setDone(true);
        } catch (err) {
          console.error("[cruise] orçamento falhou", err);
          toast.error("Erro ao enviar orçamento. Tente novamente.");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (pix) {
    return <PixQrOverlay qrCode={pix.qrCode} valor={pix.valor} expiraEm={pix.expiraEm} onClose={onClose} />;
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
            <Check className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold">Recebemos sua solicitação</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Nossa equipe vai retornar por e-mail e WhatsApp em instantes.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-brand-orange text-white py-2.5 text-sm font-semibold"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 md:p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">
              {mode === "pix" ? "Pagamento via Pix" : "Solicitar orçamento"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {cabin.name} · {adults} adulto{adults > 1 ? "s" : ""}
              {childrenCount > 0 ? ` + ${childrenCount} criança${childrenCount > 1 ? "s" : ""}` : ""} ·{" "}
              <span className="font-semibold text-foreground">{formatBRL(chargedTotal)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome completo *">
              <input
                className={input}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </Field>
            <Field label="CPF">
              <input
                className={input}
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              />
            </Field>
            <Field label="E-mail *">
              <input
                type="email"
                className={input}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Telefone *">
              <input
                className={input}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>

          {mode === "pix" && (
            <>
              <div className="grid gap-3 sm:grid-cols-[140px_1fr_120px]">
                <Field label="CEP *">
                  <input
                    className={input}
                    value={form.cep}
                    onChange={(e) => setForm({ ...form, cep: e.target.value })}
                    onBlur={(e) => lookupCep(e.target.value)}
                  />
                </Field>
                <Field label="Endereço *">
                  <input
                    className={input}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
                <Field label="Número *">
                  <input
                    className={input}
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <Field label="Cidade *">
                  <input
                    className={input}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Field>
                <Field label="UF *">
                  <input
                    className={input}
                    maxLength={2}
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  />
                </Field>
              </div>
            </>
          )}

          <Field label="Observações">
            <textarea
              rows={2}
              className={input}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Datas preferidas, comemorações, dúvidas…"
            />
          </Field>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="mt-6 w-full rounded-full bg-brand-orange text-white py-3 text-sm font-semibold hover:opacity-90 transition inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Processando…
            </>
          ) : mode === "pix" ? (
            <>
              <QrCode className="h-4 w-4" /> Gerar QR Pix
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" /> Enviar solicitação
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-widest">
        {label}
      </div>
      {children}
    </label>
  );
}

const ADDON_CATEGORY_LABELS: Record<string, string> = {
  bebidas: "Bebidas",
  wifi: "Wi-Fi",
  gorjeta: "Gorjeta",
  transfer: "Transfer",
  seguro: "Seguro",
  excursao: "Excursão",
  restaurante: "Restaurante",
  spa: "Spa",
  outro: "Adicional",
};

const ADDON_UNIT_LABELS: Record<string, string> = {
  per_person: "por pessoa",
  per_cabin: "por cabine",
  per_day: "por dia",
  per_person_per_day: "por pessoa/dia",
  fixed: "valor total",
};

function hasPolicies(p: {
  payment: string;
  cancellation: string;
  boarding: string;
  documents: string;
  children_policy: string;
  other: string;
}): boolean {
  return Boolean(
    p.payment || p.cancellation || p.boarding || p.documents || p.children_policy || p.other,
  );
}

function PolicyBlock({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-brand-orange font-semibold">
        {label}
      </div>
      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{text}</p>
    </div>
  );
}
