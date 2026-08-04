import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Car,
  CalendarDays,
  MapPin,
  Search,
  Users,
  Briefcase,
  Snowflake,
  Cog,
  Gauge,
  ShieldCheck,
  Loader2,
  ChevronDown,
  Plane,
  Copy,
  ShoppingCart,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createOrder } from "@/lib/orders.functions";
import { DateRangeField } from "@/components/search/DateRangeField";
import { SearchSkeleton } from "@/components/search/SearchSkeleton";
import { onerCarLocations, onerCarSearch, onerCreateCarCart } from "@/lib/onertravel-cars.functions";
import {
  onerCarLocationsPublic,
  onerCarSearchPublic,
  onerCreateCarCartPublic,
} from "@/lib/onertravel-public-extras.functions";
import { useIsPublicEngine } from "@/lib/public-engine";

import type {
  OnerCar,
  OnerCarLocation,
  OnerCarSearchResult,
} from "@/lib/onertravel-cars.server";

export const Route = createFileRoute("/admin/carros")({
  head: () => ({
    meta: [
      { title: "Motor de Carros — Locação | VIA AIR" },
      {
        name: "description",
        content:
          "Busque carros de locação em tempo real na operadora: categorias, locadoras, proteção inclusa e preço total.",
      },
      { property: "og:title", content: "Motor de Carros — Locação | VIA AIR" },
      { property: "og:description", content: "Locação de carros em tempo real na operadora VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CarrosPage />,
});

const fmtMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const chipCls = (active: boolean) =>
  `rounded-full px-4 py-2 text-xs font-medium transition ${
    active
      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
      : "border border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
  }`;

// ---------------------------------------------------------------- autocomplete

function LocationInput({
  value,
  onSelect,
  placeholder,
}: {
  value: OnerCarLocation | null;
  onSelect: (l: OnerCarLocation | null) => void;
  placeholder: string;
}) {
  const searchLoc = useServerFn(useIsPublicEngine() ? onerCarLocationsPublic : onerCarLocations);
  const [text, setText] = useState(value?.locationName ?? "");
  const [options, setOptions] = useState<OnerCarLocation[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const typing = useRef(false);



  useEffect(() => {
    const q = text.trim();
    if (!typing.current || q.length < 3) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setOptions(await searchLoc({ data: { query: q } }));
        setOpen(true);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text, searchLoc]);

  return (
    <div className="relative">
      <div className="flex h-11 items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <input
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            typing.current = true;
            setText(e.target.value);
            setHighlight(0);
            onSelect(null);
          }}
          onBlur={() => {
            typing.current = false;
            setTimeout(() => setOpen(false), 160);
          }}
          onKeyDown={(e) => {
            if (!open || !options.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const o = options[highlight];
              onSelect(o);
              setText(o.locationName);
              setOpen(false);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          onFocus={() => options.length && setOpen(true)}

          className="w-full bg-transparent text-sm outline-none"
        />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {open && options.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 min-w-[18rem] overflow-auto rounded-2xl border border-border/60 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {options.map((o, i) => (
            <button
              key={`${o.type}-${o.value}-${o.locationName}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                onSelect(o);
                setText(o.locationName);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                i === highlight ? "bg-primary/15" : "hover:bg-muted/60"
              }`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                {o.type === 1 ? <Plane className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{o.locationName}</span>
                {o.locationDescription && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {o.locationDescription}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------- detalhes

/** Normaliza textos que a operadora envia em CAIXA ALTA para leitura confortável. */
function prettyText(raw?: string | null) {
  if (!raw) return "";
  const t = raw.replace(/\s+/g, " ").trim();
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upperRatio = letters ? letters.replace(/[^A-ZÀ-Þ]/g, "").length / letters.length : 0;
  if (upperRatio < 0.7) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Quebra um parágrafo longo em tópicos legíveis. */
function toBullets(raw?: string | null) {
  const t = prettyText(raw);
  if (!t) return [];
  const parts = t
    .split(/(?<=[.;])\s+|\s+(?=(?:proteção|cobertura|o cliente|na hipótese|nessa modalidade)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  return parts.length > 1 ? parts : [t];
}

function SpecItem({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}

function CarDetailsDialog({ car, onClose }: { car: OnerCar | null; onClose: () => void }) {
  return (
    <Dialog open={!!car} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-base">Todos os detalhes</DialogTitle>
        </DialogHeader>
        {car && (
          <div className="max-h-[62vh] space-y-7 overflow-auto px-6 py-6">
            <div className="flex items-start gap-4">
              {car.vendor.logoUrl && (
                <img
                  src={car.vendor.logoUrl}
                  alt={car.vendor.name}
                  className="h-12 w-20 shrink-0 rounded-lg object-contain"
                />
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-tight">{prettyText(car.name)}</h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {car.categoryDescription}
                  {car.providerCarCode ? ` · ${car.providerCarCode}` : ""}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Características do veículo
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <SpecItem icon={Users} label={`${car.passengerCount} lugares`} />
                <SpecItem icon={Briefcase} label={`${car.bagCount} malas`} />
                <SpecItem
                  icon={Snowflake}
                  label={car.airConditioning ? "Ar condicionado" : "Sem ar"}
                />
                <SpecItem icon={Cog} label={car.transmissionDescription || "Câmbio n/d"} />
                <SpecItem
                  icon={Gauge}
                  label={car.unlimitedMileage ? "KM ilimitada" : "KM limitada"}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/60">
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Retirada e devolução
                </span>
              </div>
              <div className="space-y-4 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold">{prettyText(car.pickup.name)}</p>
                  {car.pickup.address && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {prettyText(car.pickup.address)}
                    </p>
                  )}
                  {!car.sameLocation && (
                    <p className="mt-2 text-sm font-semibold">
                      Devolução: {prettyText(car.dropoff.name)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Retirada
                    </p>
                    <p className="text-sm font-semibold">
                      {car.pickup.date} às {car.pickup.time?.slice(0, 5)}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Devolução
                    </p>
                    <p className="text-sm font-semibold">
                      {car.dropoff.date} às {car.dropoff.time?.slice(0, 5)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {car.coverages.map((c) => (
              <div key={c.name} className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h4 className="text-sm font-bold">{prettyText(c.name)}</h4>
                </div>
                <ul className="space-y-2">
                  {toBullets(c.description)
                    .slice(0, 4)
                    .map((b, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"
                      >
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="text-xs leading-relaxed text-muted-foreground">{b}</span>
                      </li>
                    ))}
                </ul>
                {toBullets(c.description).length > 4 && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:underline">
                      Ver texto completo da proteção
                      <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      {prettyText(c.description)}
                    </p>
                  </details>
                )}
              </div>
            ))}

            {car.guarantees.length > 0 && (
              <div className="space-y-2 border-t border-border/60 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Termos e condições da reserva
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {car.guarantees.map((g) => (
                    <div key={g.name} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {prettyText(g.name)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed">{prettyText(g.description)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {car && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Preço total
              </p>
              <p className="text-2xl font-bold text-primary">{fmtMoney(car.finalPrice)}</p>
            </div>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------- resumo da seleção (modal)

function CarSummaryDialog({
  car,
  open,
  onOpenChange,
}: {
  car: OnerCar | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isPublic = useIsPublicEngine();
  const createCart = useServerFn(isPublic ? onerCreateCarCartPublic : onerCreateCarCart);
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);

  useEffect(() => {
    setCartUrl(null);
  }, [car?.carKey]);

  const cartMut = useMutation({
    mutationFn: () =>
      createCart({
        data: {
          searchKey: car!.searchKey,
          carKey: car!.carKey,
          pickupName: car!.pickup.name,
          pickupDate: car!.pickup.date,
          pickupTime: car!.pickup.time,
          returnDate: car!.dropoff.date,
          returnTime: car!.dropoff.time,
        },
      }),
    onSuccess: (r) => {
      setCartUrl(r.url);
      if (isPublic) {
        window.location.href = r.url;
        return;
      }
      window.open(r.url, "_blank", "noopener");
      toast.success("Link do Comprar Viagem gerado");
    },

    onError: (e: Error) => toast.error(e.message),
  });

  if (!car) return null;

  const summaryText = [
    `Carro: ${car.name} (${car.categoryDescription}) • ${car.vendor.name}`,
    `Retirada: ${car.pickup.date} ${car.pickup.time?.slice(0, 5)} — ${car.pickup.name}`,
    `Devolução: ${car.dropoff.date} ${car.dropoff.time?.slice(0, 5)} — ${car.dropoff.name}`,
    `${car.passengerCount} lugares • ${car.bagCount} malas • ${car.transmissionDescription} • ${
      car.unlimitedMileage ? "KM ilimitada" : "KM limitada"
    }`,
    car.coverages[0] ? `Proteção: ${car.coverages[0].name}` : null,
    `Total: ${fmtMoney(car.finalPrice)} (${fmtMoney(car.pricePerDay)} /dia)`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-[460px] flex-col gap-0 overflow-hidden rounded-3xl border-border/60 bg-card p-0">
          <DialogHeader className="border-b border-border/50 bg-background/40 px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <Car className="h-3.5 w-3.5 text-primary" /> Carro selecionado
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-background/40 p-4">
              {car.imageUrl ? (
                <img src={car.imageUrl} alt={car.name} className="h-16 w-24 shrink-0 object-contain" />
              ) : (
                <Car className="h-10 w-10 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase tracking-tight">{car.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {car.categoryDescription} · {car.vendor.name}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    `${car.passengerCount} lugares`,
                    `${car.bagCount} malas`,
                    car.transmissionDescription,
                    car.unlimitedMileage ? "KM ilimitada" : "KM limitada",
                  ]
                    .filter(Boolean)
                    .map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { l: "Retirada", d: car.pickup.date, t: car.pickup.time, p: car.pickup.name },
                { l: "Devolução", d: car.dropoff.date, t: car.dropoff.time, p: car.dropoff.name },
              ].map((b) => (
                <div key={b.l} className="rounded-2xl border border-border/50 bg-background/40 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {b.l}
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {b.d} · {b.t?.slice(0, 5)}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{b.p}</div>
                </div>
              ))}
            </div>

            {car.coverages[0] && (
              <p className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs text-primary">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {car.coverages[0].name}
              </p>
            )}

            <div className="border-t border-border/50 pt-4">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Valor total
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  {fmtMoney(car.pricePerDay)} / dia
                </span>
              </div>
              <div className="text-3xl font-black leading-none tracking-tight">
                {fmtMoney(car.finalPrice)}
              </div>
            </div>

            {cartUrl && (
              <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs font-semibold">Link do carrinho</div>
                <div className="break-all text-[11px] text-muted-foreground">{cartUrl}</div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      navigator.clipboard.writeText(cartUrl);
                      toast.success("Link copiado");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://wa.me/?text=${encodeURIComponent(
                          `Segue o link para concluir a reserva do carro:\n${cartUrl}`,
                        )}`,
                        "_blank",
                        "noopener",
                      )
                    }
                  >
                    WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border/50 bg-background/40 p-5">
            <Button
              onClick={() => setOrderOpen(true)}
              className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
            >
              <ShoppingCart className="h-4 w-4" /> Fazer pedido
            </Button>
            <Button
              variant="outline"
              disabled={cartMut.isPending}
              onClick={() => cartMut.mutate()}
              className="w-full py-5 text-[10px] font-black uppercase tracking-[0.15em]"
            >
              {cartMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Comprar viagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NewOrderFromCarDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        total={car.finalPrice}
        pax={car.passengerCount || 1}
        summary={summaryText}
      />
    </>
  );
}

/** Cria o pedido interno já com o valor e o resumo do carro escolhido. */
function NewOrderFromCarDialog({
  open,
  onOpenChange,
  total,
  pax,
  summary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  pax: number;
  summary: string;
}) {
  const navigate = useNavigate();
  const create = useServerFn(createOrder);
  const [form, setForm] = useState({ full_name: "", cpf: "", email: "", phone: "" });

  const mut = useMutation({
    mutationFn: async () =>
      create({
        data: {
          full_name: form.full_name,
          cpf: form.cpf,
          email: form.email,
          phone: form.phone,
          payment_method: "other",
          expected_total: total,
          total_price: total,
          adults: pax,
          notes: summary,
          supplier_name: "Comprar Viagem",
        },
      }),
    onSuccess: (r: { id: string; order_number: string | number }) => {
      toast.success(`Pedido ${r.order_number} criado`);
      onOpenChange(false);
      navigate({ to: "/admin/pedidos/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar pedido"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fazer pedido</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="whitespace-pre-line rounded-xl border border-border/60 bg-muted/40 p-3 text-xs">
            {summary}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
            <span className="text-sm text-muted-foreground">Total do pedido</span>
            <span className="text-lg font-bold text-primary">{fmtMoney(total)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nome completo</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={mut.isPending}
            onClick={() => {
              if (!form.full_name.trim()) return toast.error("Preencha o nome completo");
              if (!form.cpf.trim()) return toast.error("Informe o CPF");
              mut.mutate();
            }}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Criar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ---------------------------------------------------------------- card

function CarCard({
  car,
  cheapest,
  selected,
  onSelect,
  onDetails,
}: {
  car: OnerCar;
  cheapest: boolean;
  selected: boolean;
  onSelect: () => void;
  onDetails: () => void;
}) {
  const specs = [
    { icon: Users, label: `${car.passengerCount} passageiros` },
    { icon: Briefcase, label: `${car.bagCount} malas` },
    {
      icon: Cog,
      label: `${car.transmissionDescription || "Câmbio n/d"}${car.airConditioning ? " / AC" : ""}`,
    },
    { icon: Gauge, label: car.unlimitedMileage ? "KM ilimitada" : "KM limitada" },
  ];

  return (
    <article
      className={`relative overflow-hidden rounded-[2rem] border bg-card/40 shadow-2xl backdrop-blur-2xl transition ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border/50 hover:border-primary/40"
      }`}
    >
      <div className="flex flex-col md:flex-row">
        {/* imagem + locadora */}
        <div className="flex flex-col items-center justify-center gap-4 border-border/40 bg-foreground/[0.02] p-6 md:w-56 md:border-r">
          {car.imageUrl ? (
            <img
              src={car.imageUrl}
              alt={car.name}
              loading="lazy"
              className="h-24 w-full rounded-xl object-contain"
            />
          ) : (
            <Car className="h-12 w-12 text-muted-foreground" />
          )}
          {car.vendor.logoUrl ? (
            <div className="flex items-center rounded-full border border-border/40 bg-foreground/5 px-3 py-1.5">
              <img src={car.vendor.logoUrl} alt={car.vendor.name} className="h-4 w-auto opacity-80" />
            </div>
          ) : (
            <span className="rounded-full border border-border/40 bg-foreground/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {car.vendor.name}
            </span>
          )}
        </div>

        {/* informações */}
        <div className="flex-1 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold tracking-tight text-foreground">{prettyText(car.name)}</h3>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {car.categoryDescription}
                {car.providerCarCode ? ` • ${car.providerCarCode}` : ""}
              </p>
            </div>
            {cheapest && (
              <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                Menor preço
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {specs.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-[11px] font-medium text-foreground">{s.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 sm:col-span-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {car.sameLocation ? "Retirada e devolução" : "Retirada"}: {prettyText(car.pickup.name)}
              </span>
            </div>
            {!car.sameLocation && (
              <div className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  Devolução: {prettyText(car.dropoff.name)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* preço */}
        <div className="flex flex-col justify-between border-border/40 bg-primary/[0.03] p-6 md:w-56 md:border-l">
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Preço total
            </p>
            <p className="mt-0.5 text-xl font-bold text-foreground">{fmtMoney(car.finalPrice)}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-primary">
              {fmtMoney(car.pricePerDay)} / dia
            </p>
          </div>
          <Button
            onClick={onSelect}
            variant={selected ? "secondary" : "default"}
            className="mt-6 w-full rounded-2xl py-6 text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
          >
            {selected ? "Selecionado" : "Selecionar"}
          </Button>
        </div>
      </div>

      {/* proteções e termos */}
      <div className="border-t border-border/40 bg-background/40 p-6">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-foreground">
              <span className="h-3 w-1 rounded-full bg-primary" />
              Proteções incluídas
            </h4>
            <ul className="space-y-3">
              {car.coverages.slice(0, 3).map((c) => (
                <li key={c.name} className="flex items-center gap-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-[11px] text-foreground">{prettyText(c.name)}</span>
                </li>
              ))}
              {car.coverages.length === 0 && (
                <li className="text-[11px] text-muted-foreground">Sem proteções informadas</li>
              )}
            </ul>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <h4 className="mb-4 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Termos importantes
              </h4>
              <p className="line-clamp-3 text-[10px] leading-relaxed text-muted-foreground">
                {car.guarantees.length > 0
                  ? car.guarantees.map((g) => prettyText(g.name)).join(" • ")
                  : car.unlimitedMileage
                    ? "Quilometragem livre. Caução no cartão do condutor. Condutor com CNH definitiva."
                    : "Caução no cartão do condutor. Condutor com CNH definitiva."}
              </p>
            </div>
            <button
              type="button"
              onClick={onDetails}
              className="mt-4 self-start text-[10px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              Ver todos os detalhes da locadora
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- página

export type CarPreset = {
  pickupDate: string;
  returnDate: string;
};

export function CarrosPage({ header }: { header?: React.ReactNode } = {}) {
  const searchCars = useServerFn(onerCarSearch);

  const [pickup, setPickup] = useState<OnerCarLocation | null>(null);
  const [dropoff, setDropoff] = useState<OnerCarLocation | null>(null);
  const [diffReturn, setDiffReturn] = useState(false);
  const [form, setForm] = useState({
    pickupDate: "",
    pickupTime: "10:00",
    returnDate: "",
    returnTime: "10:00",
  });

  const [result, setResult] = useState<OnerCarSearchResult | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [details, setDetails] = useState<OnerCar | null>(null);
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    startPrice: null as number | null,
    endPrice: null as number | null,
    unlimitedMilage: null as boolean | null,
    airConditioning: null as boolean | null,
    availableBagsCount: [] as number[],
    categories: [] as number[],
    fuelTypes: [] as number[],
    transmissionTypes: [] as number[],
    vendors: [] as string[],
  });

  const canSearch = !!pickup && !!form.pickupDate && !!form.returnDate;

  const payload = (targetPage: number, searchKey: string | null) => ({
    pickup: {
      type: pickup!.type,
      iata: pickup!.type === 1 ? pickup!.value : null,
      locationName: pickup!.locationName,
      point: pickup!.point,
    },
    dropoff:
      diffReturn && dropoff
        ? {
            type: dropoff.type,
            iata: dropoff.type === 1 ? dropoff.value : null,
            locationName: dropoff.locationName,
            point: dropoff.point,
          }
        : null,
    pickupDate: form.pickupDate,
    pickupTime: form.pickupTime,
    returnDate: form.returnDate,
    returnTime: form.returnTime,
    page: targetPage,
    pageSize: 10,
    ordination: 1,
    searchKey,
    filters,
  });

  const mut = useMutation({
    mutationFn: () => searchCars({ data: payload(1, null) }),
    onSuccess: (r) => {
      setResult(r);
      setPage(1);
      setSelected(null);
      if (!r.cars.length) toast.warning("Nenhum carro retornado para esses parâmetros");
      else toast.success(`${r.count} opções de carros encontradas`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro na busca de carros"),
  });

  const filterMut = useMutation({
    mutationFn: () => searchCars({ data: payload(1, result?.searchKey ?? null) }),
    onSuccess: (r) => {
      setResult((prev) => (prev ? { ...r, searchKey: prev.searchKey } : r));
      setPage(1);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao filtrar"),
  });

  const moreMut = useMutation({
    mutationFn: () => searchCars({ data: payload(page + 1, result?.searchKey ?? null) }),
    onSuccess: (r) => {
      setPage((p) => p + 1);
      setResult((prev) => {
        if (!prev) return r;
        const seen = new Set(prev.cars.map((c) => c.carKey));
        const novos = r.cars.filter((c) => !seen.has(c.carKey));
        if (!novos.length) toast.info("Não há mais carros para carregar");
        return { ...prev, haveMore: r.haveMore && novos.length > 0, cars: [...prev.cars, ...novos] };
      });
    },
  });

  // refaz a busca (mesma searchKey) quando um filtro muda
  const filtersSig = JSON.stringify(filters);
  const firstFilter = useRef(true);
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false;
      return;
    }
    if (!result?.searchKey) return;
    const t = setTimeout(() => filterMut.mutate(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersSig]);

  const allCars = result?.cars ?? [];
  const categories = useMemo(
    () => [...new Set(allCars.map((c) => c.categoryDescription).filter(Boolean))],
    [allCars],
  );
  const vendors = useMemo(
    () => [...new Set(allCars.map((c) => c.vendor.name).filter(Boolean))],
    [allCars],
  );
  const cars = useMemo(
    () =>
      catFilter.length
        ? allCars.filter((c) => catFilter.includes(c.categoryDescription))
        : allCars,
    [allCars, catFilter],
  );
  const cheapest = cars.length ? Math.min(...cars.map((c) => c.finalPrice)) : null;

  const activeFilterCount =
    (filters.startPrice != null ? 1 : 0) +
    (filters.endPrice != null ? 1 : 0) +
    (filters.unlimitedMilage != null ? 1 : 0) +
    (filters.airConditioning != null ? 1 : 0) +
    filters.availableBagsCount.length +
    filters.transmissionTypes.length +
    filters.vendors.length +
    catFilter.length;

  const toggleTransmission = (v: number) =>
    setFilters((f) => ({
      ...f,
      transmissionTypes: f.transmissionTypes.includes(v)
        ? f.transmissionTypes.filter((x) => x !== v)
        : [...f.transmissionTypes, v],
    }));

  const toggleCategory = (c: string) =>
    setCatFilter((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const toggleVendor = (v: string) =>
    setFilters((f) => ({
      ...f,
      vendors: f.vendors.includes(v) ? f.vendors.filter((x) => x !== v) : [...f.vendors, v],
    }));


  return (
    <div className={header ? "" : "min-h-screen bg-background"}>
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6">
            {header ?? (
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Car className="h-6 w-6 text-primary" /> Motor de Carros
              </h1>
            )}
          </div>

          <div className="rounded-[32px] border border-border/50 bg-card/60 p-6 shadow-2xl backdrop-blur-xl">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto]">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Local de retirada
                  </Label>
                  <LocationInput
                    value={pickup}
                    onSelect={setPickup}
                    placeholder="Cidade, aeroporto ou endereço"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                    Devolução
                    <button
                      type="button"
                      className="normal-case text-primary"
                      onClick={() => setDiffReturn((v) => !v)}
                    >
                      {diffReturn ? "usar o mesmo local" : "devolver em outro local"}
                    </button>
                  </Label>
                  {diffReturn ? (
                    <LocationInput
                      value={dropoff}
                      onSelect={setDropoff}
                      placeholder="Local de devolução"
                    />
                  ) : (
                    <div className="flex h-11 items-center rounded-lg border border-dashed border-border/70 px-3 text-sm text-muted-foreground">
                      Mesmo local da retirada
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-3 w-3" /> Retirada e devolução
                </Label>
                <DateRangeField
                  departureDate={form.pickupDate}
                  returnDate={form.returnDate}
                  allowOneWay={false}
                  labels={{ start: "Retirada", end: "Devolução" }}
                  onChange={(pickupDate, returnDate) => setForm({ ...form, pickupDate, returnDate })}
                />
                <div className="flex gap-2 pt-1">
                  <Input
                    className="h-9"
                    type="time"
                    value={form.pickupTime}
                    onChange={(e) => setForm({ ...form, pickupTime: e.target.value })}
                  />
                  <Input
                    className="h-9"
                    type="time"
                    value={form.returnTime}
                    onChange={(e) => setForm({ ...form, returnTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  size="lg"
                  className="h-11 w-full lg:w-auto"
                  disabled={!canSearch || mut.isPending}
                  onClick={() => mut.mutate()}
                >
                  {mut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar carros
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {mut.isPending && !result && <SearchSkeleton kind="car" rows={4} />}

        {result && (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="self-start overflow-hidden rounded-[24px] border border-border/50 bg-card/60 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Filtros</span>
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-primary hover:underline"
                  onClick={() => {
                    setCatFilter([]);
                    setFilters({
                      startPrice: null,
                      endPrice: null,
                      unlimitedMilage: null,
                      airConditioning: null,
                      availableBagsCount: [],
                      categories: [],
                      fuelTypes: [],
                      transmissionTypes: [],
                      vendors: [],
                    });
                  }}
                >
                  Limpar tudo
                </button>
              </div>

              <div className="space-y-7 px-5 py-5">
                <section>
                  <div className="mb-3 flex items-baseline justify-between">
                    <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Preço total
                    </Label>
                    {result.priceRange && (
                      <span className="text-[10px] text-muted-foreground">
                        {fmtMoney(result.priceRange.lowest)} — {fmtMoney(result.priceRange.highest)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="h-10 rounded-xl bg-muted/30 text-xs"
                      type="number"
                      placeholder="De R$"
                      value={filters.startPrice ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          startPrice: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    />
                    <Input
                      className="h-10 rounded-xl bg-muted/30 text-xs"
                      type="number"
                      placeholder="Até R$"
                      value={filters.endPrice ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          endPrice: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    />
                  </div>
                </section>

                <section>
                  <Label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Transmissão
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 1, l: "Automático" },
                      { v: 2, l: "Manual" },
                    ].map((t) => (
                      <button
                        key={t.v}
                        type="button"
                        onClick={() => toggleTransmission(t.v)}
                        className={chipCls(filters.transmissionTypes.includes(t.v))}
                      >
                        {t.l}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <Label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Quantidade de malas
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[2, 3, 4, 5].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            availableBagsCount: f.availableBagsCount.includes(b)
                              ? f.availableBagsCount.filter((x) => x !== b)
                              : [...f.availableBagsCount, b],
                          }))
                        }
                        className={`h-9 w-9 rounded-full text-xs font-semibold transition ${
                          filters.availableBagsCount.includes(b)
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                            : "border border-border/60 text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                    <span className="self-center text-[10px] text-muted-foreground">malas</span>
                  </div>
                </section>

                <section>
                  <Label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Quilometragem
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: true, l: "Ilimitada" },
                      { v: false, l: "Limitada" },
                    ].map((k) => (
                      <button
                        key={String(k.v)}
                        type="button"
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            unlimitedMilage: f.unlimitedMilage === k.v ? null : k.v,
                          }))
                        }
                        className={chipCls(filters.unlimitedMilage === k.v)}
                      >
                        {k.l}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <Label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Ar-condicionado
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: true, l: "Com ar" },
                      { v: false, l: "Sem ar" },
                    ].map((k) => (
                      <button
                        key={String(k.v)}
                        type="button"
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            airConditioning: f.airConditioning === k.v ? null : k.v,
                          }))
                        }
                        className={chipCls(filters.airConditioning === k.v)}
                      >
                        {k.l}
                      </button>
                    ))}
                  </div>
                </section>

                {categories.length > 0 && (
                  <section>
                    <Label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Categorias
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleCategory(c)}
                          className={chipCls(catFilter.includes(c))}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {vendors.length > 0 && (
                  <section>
                    <Label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Locadoras
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {vendors.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleVendor(v)}
                          className={chipCls(filters.vendors.includes(v))}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </aside>


            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Exibindo {cars.length} de {result.count} opções de carros encontradas
                </p>
                {filterMut.isPending && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> atualizando
                  </span>
                )}
              </div>

              {cars.map((c) => (
                <CarCard
                  key={c.carKey}
                  car={c}
                  cheapest={c.finalPrice === cheapest}
                  selected={selected === c.carKey}
                  onSelect={() => {
                    setSelected(c.carKey);
                    setSummaryOpen(true);
                  }}

                  onDetails={() => setDetails(c)}
                />
              ))}

              {!cars.length && !mut.isPending && (
                <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nenhum carro com esses filtros.
                </p>
              )}

              {result.haveMore && (
                <div className="pt-2 text-center">
                  <Button variant="outline" disabled={moreMut.isPending} onClick={() => moreMut.mutate()}>
                    {moreMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Ver mais carros
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}

        {!result && !mut.isPending && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Car className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Informe o local e as datas de retirada e devolução para ver os carros disponíveis.
            </p>
          </div>
        )}
      </main>

      <CarDetailsDialog car={details} onClose={() => setDetails(null)} />
      <CarSummaryDialog
        car={cars.find((c) => c.carKey === selected) ?? null}
        open={summaryOpen && !!selected}
        onOpenChange={setSummaryOpen}
      />

    </div>
  );
}
