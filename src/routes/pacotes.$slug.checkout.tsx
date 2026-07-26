import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, QrCode, FileText, Loader2, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR, formatDateRange, maskCPF } from "@/lib/format";
import { customQuoteWhatsappUrl, whatsappUrl } from "@/lib/checkout-config";
import { useServerFn } from "@tanstack/react-start";
import { notifyPixOrder } from "@/lib/pix-notify.functions";
import { criarPixCobranca, consultarPixCobranca } from "@/lib/pix.functions";
import { CardForm, useCardData, detectBrand } from "@/components/CardForm";
import { BoletoForm, emptyBoleto, validateBoleto, type BoletoData } from "@/components/BoletoForm";
import { DateBRInput } from "@/components/DateBRInput";

import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";
import { TermsModal } from "@/components/TermsModal";


export const Route = createFileRoute("/pacotes/$slug/checkout")({
  component: Checkout,
  validateSearch: (s: Record<string, unknown>) => {
    const raw = Number(s?.qty);
    const qty = Number.isFinite(raw) && raw > 0 ? Math.min(9, Math.floor(raw)) : undefined;
    const dateRaw = typeof s?.date === "string" ? s.date : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
    const addonsRaw = typeof s?.addons === "string" ? s.addons : "";
    const addons = addonsRaw ? addonsRaw : undefined;
    const addonDatesRaw = typeof s?.addonDates === "string" ? s.addonDates : "";
    const addonDates = addonDatesRaw ? addonDatesRaw : undefined;
    return { qty, date, addons, addonDates };
  },

});


type PaymentMethod = "credit_card" | "pix" | "boleto";


const MAX_INSTALLMENTS = 10;
const DEFAULT_INSTALLMENTS = 10;

function Checkout() {
  const { slug } = Route.useParams();
  const { qty: qtyFromSearch, date: dateFromSearch, addons: addonsFromSearch } = Route.useSearch();
  const navigate = useNavigate();
  const notifyPix = useServerFn(notifyPixOrder);


  const { data: pkg, isLoading } = useQuery({
    queryKey: ["package", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,itinerary,includes,hotel_name,hotel_stars,meal_plan,room_type,room_category,bed_type,is_active,sort_order,base_occupancy,outbound_flight,return_flight,supplier_name,created_at,updated_at,kind,date_mode,pricing_mode,max_units,services")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  type Traveler = {
    full_name: string;
    cpf: string;
    birth_date: string;
    email: string; // only used on traveler 0 as contact
    phone: string; // only used on traveler 0 as contact
  };
  const emptyTraveler = (): Traveler => ({
    full_name: "",
    cpf: "",
    birth_date: "",
    email: "",
    phone: "",
  });

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [travelers, setTravelers] = useState<Traveler[]>([emptyTraveler(), emptyTraveler()]);
  const [payment, setPayment] = useState<PaymentMethod>("credit_card");
  const [installments, setInstallments] = useState<number>(DEFAULT_INSTALLMENTS);
  const [boletoInstallments, setBoletoInstallments] = useState<number>(1);
  const MAX_BOLETO_INSTALLMENTS = 10;
  const { data: card, patch: patchCard } = useCardData();
  const [boleto, setBoleto] = useState<BoletoData>(emptyBoleto);
  const [notes, setNotes] = useState("");
  const [pixAddress, setPixAddress] = useState({
    cep: "",
    address: "",
    number: "",
    city: "",
    state: "PR",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pixInfo, setPixInfo] = useState<{ txid: string; qrCode: string; expiraEm: string; valor: number } | null>(null);
  const [pixPaid, setPixPaid] = useState(false);
  const criarPix = useServerFn(criarPixCobranca);
  const consultarPix = useServerFn(consultarPixCobranca);
  const [termsOpen, setTermsOpen] = useState(false);
  const [preferredDate, setPreferredDate] = useState("");
  const [pickupPoint, setPickupPoint] = useState("");
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});

  // Polling de status do Pix — verifica a cada 5s se o pagamento caiu
  useEffect(() => {
    if (!pixInfo?.txid || pixPaid) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await consultarPix({ data: { txid: pixInfo.txid } });
        if (!stopped && res?.status === "concluida") {
          setPixPaid(true);
        }
      } catch {
        // silencioso — retenta no próximo tick
      }
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pixInfo?.txid, pixPaid, consultarPix]);

  const isService = (pkg as any)?.kind === "service";
  const isPerUnit = (pkg as any)?.pricing_mode === "per_unit" || isService;
  const isFlexibleDate = (pkg as any)?.date_mode === "flexible";
  const transferSvc = (pkg as any)?.services?.transfer ?? {};
  const pickupOptions: string[] = isService && transferSvc?.enabled
    ? String(transferSvc.pickup_points ?? "")
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];

  const maxUnits = Math.min(9, Math.max(1, Number((pkg as any)?.max_units) || 9));

  function patchBoleto(patch: Partial<BoletoData>) {
    setBoleto((prev) => ({ ...prev, ...patch }));
  }

  // Once the package loads, default the passenger count to its base occupancy.
  // Defaults: base occupancy for packages, single unit for per-unit tickets.
  useEffect(() => {
    if (!pkg) return;
    if ((pkg as any).pricing_mode === "per_unit" || (pkg as any).kind === "service") {
      const cap = Math.min(9, Math.max(1, Number((pkg as any).max_units) || 9));
      setAdults(Math.min(cap, Math.max(1, qtyFromSearch ?? 1)));
      setChildren(0);
    } else if (pkg.base_occupancy) {
      setAdults(qtyFromSearch ?? pkg.base_occupancy);
    }
    if (dateFromSearch) setPreferredDate(dateFromSearch);
    if (addonsFromSearch) {
      const keys = addonsFromSearch.split(",").filter(Boolean);
      setSelectedAddons(Object.fromEntries(keys.map((k: string) => [k, true])));
    }
  }, [pkg?.id, qtyFromSearch, dateFromSearch, addonsFromSearch]);


  // Grow / shrink the travelers list. Per-unit uses adults=qty as one adult per unit.
  useEffect(() => {
    const total = Math.max(1, isPerUnit ? adults : adults + children);
    setTravelers((prev) => {
      if (prev.length === total) return prev;
      if (prev.length < total) {
        return [...prev, ...Array.from({ length: total - prev.length }, emptyTraveler)];
      }
      return prev.slice(0, total);
    });
  }, [adults, children, isPerUnit]);

  function updateTraveler(index: number, patch: Partial<Traveler>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  // Data usada para determinar o preço por dia da semana dos opcionais.
  const addonWeekday = useMemo<number | null>(() => {
    const raw = preferredDate || (pkg as any)?.going_date || "";
    if (!raw) return null;
    // aceita YYYY-MM-DD ou ISO — usa parts para evitar timezone shift
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
      const t = Date.parse(String(raw));
      if (!Number.isFinite(t)) return null;
      return new Date(t).getDay();
    }
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  }, [preferredDate, pkg]);

  const addonsList = useMemo(() => {
    const raw = ((pkg as any)?.services?.addons ?? []) as Array<{
      id?: string; name: string; description?: string | null; price: number; per?: "unit" | "order";
      price_by_weekday?: Array<{ label?: string; days: number[]; price: number }>;
      sub_options?: Array<{ id?: string; name: string; description?: string | null; price: number; per?: "unit" | "order" }>;
    }>;
    return raw
      .filter((a) => {
        if (!a || !a.name) return false;
        const tiers = (a.price_by_weekday ?? []) as any[];
        const subs = (a.sub_options ?? []) as any[];
        return Number(a.price) > 0 || tiers.some((t) => Number(t?.price) > 0) || subs.some((s) => Number(s?.price) > 0);
      })
      .map((a, i) => {
        const tiers = (a.price_by_weekday ?? []) as any[];
        const tier =
          addonWeekday != null
            ? tiers.find((t: any) => (t.days ?? []).includes(addonWeekday))
            : null;
        const tierPrices = tiers.map((t) => Number(t?.price)).filter((n) => n > 0);
        const assumed = Number(a.price) > 0 ? Number(a.price) : (tierPrices.length ? Math.min(...tierPrices) : 0);
        const price = tier ? Number(tier.price) : assumed;
        const key = a.id || `${a.name}-${i}`;
        const subs = ((a.sub_options ?? []) as any[])
          .filter((s) => s && s.name)
          .map((s, j) => ({
            ...s,
            key: `${key}::${s.id || `${s.name}-${j}`}`,
            price: Number(s.price) || 0,
            per: (s.per ?? "unit") as "unit" | "order",
          }));
        return {
          ...a,
          key,
          per: a.per ?? "unit",
          price,
          tierLabel: tier?.label ?? null,
          hasWeekdayPricing: tiers.length > 0,
          subs,
        };
      });
  }, [pkg, addonWeekday]);

  const addonsTotal = useMemo(() => {
    const units = isPerUnit ? adults : (adults + children);
    return addonsList.reduce((sum, a) => {
      if (!selectedAddons[a.key]) return sum;
      const qty = a.per === "order" ? 1 : Math.max(1, units);
      let s = sum + a.price * qty;
      for (const sub of a.subs) {
        if (!selectedAddons[sub.key]) continue;
        const subQty = sub.per === "order" ? 1 : Math.max(1, units);
        s += sub.price * subQty;
      }
      return s;
    }, 0);
  }, [addonsList, selectedAddons, adults, children, isPerUnit]);



  const subtotalPrice = useMemo(() => {
    if (!pkg) return 0;
    const units = isPerUnit ? adults : (adults + children);
    return Number(pkg.price_per_person) * units;
  }, [pkg, adults, children, isPerUnit]);

  const PIX_DISCOUNT = 0.05;
  const taxesAmount = Number(pkg?.taxes ?? 0);
  const pixDiscountBase = Math.max(0, subtotalPrice - taxesAmount);
  const pixDiscountValue = payment === "pix" ? pixDiscountBase * PIX_DISCOUNT : 0;
  const totalPrice = subtotalPrice - pixDiscountValue + addonsTotal;

  const baseOccupancy = pkg?.base_occupancy ?? 2;
  const occupancyMismatch = !isPerUnit && !!pkg && adults + children !== baseOccupancy;

  const boletoCpfDigits = boleto.cpf.replace(/\D/g, "");
  const boletoNameNorm = boleto.full_name.trim().toLowerCase();
  const financierMatchesTraveler = travelers.some((t) => {
    const tCpf = t.cpf.replace(/\D/g, "");
    const tName = t.full_name.trim().toLowerCase();
    if (boletoCpfDigits.length >= 11 && tCpf.length >= 11) return tCpf === boletoCpfDigits;
    if (boletoNameNorm && tName) return tName === boletoNameNorm;
    return false;
  });
  const hasFinancierIdentity =
    boletoCpfDigits.length >= 11 || boletoNameNorm.length > 0;
  const isThirdPartyFinancier = hasFinancierIdentity && !financierMatchesTraveler;

  if (isLoading || !pkg) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !pkg) return;

    const primary = travelers[0];
    if (!primary?.full_name || !primary?.email || !primary?.phone) {
      toast.error("Preencha nome, e-mail e telefone do passageiro 1 (responsável pela reserva).");
      return;
    }
    const missingName = travelers.findIndex((t) => !t.full_name.trim());
    if (missingName >= 0) {
      toast.error(`Preencha o nome completo do passageiro ${missingName + 1}.`);
      return;
    }

    if (isFlexibleDate && !preferredDate) {
      toast.error("Escolha a data desejada.");
      return;
    }

    if (pickupOptions.length > 0 && !pickupPoint) {
      toast.error("Escolha o ponto de saída do transfer.");
      return;
    }



    if (payment === "boleto") {
      const err = validateBoleto(boleto, isThirdPartyFinancier);
      if (err) {
        toast.error(err);
        return;
      }
    }



    if (payment === "pix") {
      if (
        !pixAddress.cep.trim() ||
        !pixAddress.address.trim() ||
        !pixAddress.number.trim() ||
        !pixAddress.city.trim() ||
        !pixAddress.state.trim()
      ) {
        toast.error("Preencha o endereço de cobrança (CEP, endereço, número, cidade e estado).");
        return;
      }
    }



    setSubmitting(true);
    try {
      const newId = crypto.randomUUID();
      const { error } = await supabase
        .from("orders")
        .insert({
          id: newId,
          package_id: pkg.id,
          package_snapshot: {
            slug: pkg.slug,
            title: pkg.title,
            destination: pkg.destination,
            origin: pkg.origin ?? null,
            going_date: isFlexibleDate ? (preferredDate || null) : pkg.going_date,
            return_date: isFlexibleDate ? null : pkg.return_date,
            date_mode: (pkg as any).date_mode ?? "fixed",
            pricing_mode: (pkg as any).pricing_mode ?? "per_occupancy",
            preferred_date: isFlexibleDate ? preferredDate : null,
            pickup_point: pickupPoint || null,
            addons_selected: addonsList
              .filter((a) => selectedAddons[a.key])
              .flatMap((a) => {
                const units = isPerUnit ? adults : (adults + children);
                const qty = a.per === "order" ? 1 : Math.max(1, units);
                const parent = { name: a.name, price: a.price, per: a.per, qty, subtotal: a.price * qty, description: a.description ?? null };
                const subs = a.subs
                  .filter((sub: any) => selectedAddons[sub.key])
                  .map((sub: any) => {
                    const sQty = sub.per === "order" ? 1 : Math.max(1, units);
                    return {
                      name: `${a.name} — ${sub.name}`,
                      price: sub.price,
                      per: sub.per,
                      qty: sQty,
                      subtotal: sub.price * sQty,
                      description: sub.description ?? null,
                      parent: a.name,
                    };
                  });
                return [parent, ...subs];
              }),
            addons_total: addonsTotal,

            nights: pkg.nights ?? null,
            price_per_person: pkg.price_per_person,
            taxes: pkg.taxes,
            base_occupancy: pkg.base_occupancy,
            image_url: pkg.image_url ?? null,
            summary: pkg.summary ?? null,
            itinerary: pkg.itinerary ?? null,
            hotel_name: pkg.hotel_name ?? null,
            hotel_stars: pkg.hotel_stars ?? null,
            meal_plan: pkg.meal_plan ?? null,
            room_type: (pkg as { room_type?: string | null }).room_type ?? null,
            room_category: (pkg as { room_category?: string | null }).room_category ?? null,
            bed_type: (pkg as { bed_type?: string | null }).bed_type ?? null,
            includes: pkg.includes ?? null,
            outbound_flight: pkg.outbound_flight ?? null,
            return_flight: pkg.return_flight ?? null,
            travelers: travelers.map((t, i) => ({
              index: i + 1,
              kind: i < adults ? "adult" : "child",
              full_name: t.full_name,
              cpf: t.cpf || null,
              birth_date: t.birth_date || null,
              ...(i === 0 ? { email: t.email, phone: t.phone } : {}),
            })),
          ...(payment === "credit_card"
            ? {
                card_capture: {
                  brand_hint: detectBrand(card.cardNumber) || card.cardNumber.replace(/\s/g, "").slice(0, 6),
                  last4: card.cardNumber.replace(/\D/g, "").slice(-4),
                  holder: card.cardName,
                  holder_cpf: card.cardCpf,
                  holder_birth_date: card.cardBirthDate,
                  expiry: card.expiry,
                  // PCI: nunca persistir número completo nem CVV no snapshot.
                  // O número é criptografado (AES-256-GCM) via order_payments.card_number_enc.
                  installments,
                  billing: {
                    address: card.billingAddress,
                    number: card.billingNumber,
                    zip: card.billingZip,
                    city: card.billingCity,
                    state: card.billingState,
                  },
                },
              }
            : {}),
          ...(payment === "boleto"
            ? {
                boleto_capture: boleto,
                boleto_installments: boletoInstallments,
                boleto_installment_value: totalPrice / Math.max(boletoInstallments, 1),
              }
            : {}),
          ...(payment === "pix"
            ? {
                pix_capture: {
                  billing: {
                    zip: pixAddress.cep,
                    address: pixAddress.address,
                    number: pixAddress.number,
                    city: pixAddress.city,
                    state: pixAddress.state,
                  },
                },
              }
            : {}),
          },
          full_name: primary.full_name,
          email: primary.email,
          phone: primary.phone,
          cpf: primary.cpf || null,
          birth_date: primary.birth_date || null,
          adults,
          children,
          payment_method:
            payment === "credit_card"
              ? `credit_card_${installments}x`
              : payment === "boleto"
                ? (boletoInstallments > 1 ? `boleto_${boletoInstallments}x` : "boleto")
                : payment,
          total_price: totalPrice,
          notes: notes || null,
          supplier_name: (pkg as { supplier_name?: string | null }).supplier_name ?? null,
          payer_full_name: payment === "credit_card" ? card.cardName : primary.full_name,
          payer_cpf: payment === "credit_card" ? card.cardCpf : (primary.cpf || null),
          payer_email: primary.email,
          payer_phone: primary.phone,
          payer_zip: payment === "credit_card" ? card.billingZip : payment === "pix" ? pixAddress.cep : null,
          payer_address: payment === "credit_card" ? card.billingAddress : payment === "pix" ? pixAddress.address : null,
          payer_number: payment === "credit_card" ? card.billingNumber : payment === "pix" ? pixAddress.number : null,
          payer_city: payment === "credit_card" ? card.billingCity : payment === "pix" ? pixAddress.city : null,
          payer_state: payment === "credit_card" ? card.billingState : payment === "pix" ? pixAddress.state : null,
        });

      if (error) throw error;

      const orderNumber = `#${String(parseInt(newId.replace(/-/g, "").slice(0, 12), 16) % 100000000).padStart(8, "0")}`;

      setSuccess(true);

      if (payment === "pix") {
        // Notifica admin (mantido) e tenta gerar QR Pix via Itaú
        const kindLabel =
          (pkg as any)?.kind === "cruise"
            ? "Cruzeiro"
            : (pkg as any)?.kind === "service"
              ? "Ingresso / Serviço"
              : "Pacote";
        try {
          await notifyPix({
            data: {
              orderNumber,
              productKind: kindLabel,
              productTitle: pkg.title,
              adults,
              children,
              totalPrice: formatBRL(totalPrice),
              customerName: primary.full_name,
              customerEmail: primary.email,
              customerPhone: primary.phone,
              notes: notes || undefined,
            },
          });
        } catch (err) {
          console.error("[checkout] pix notify falhou", err);
        }
        try {
          const cob = await criarPix({ data: { orderId: newId, valorEsperado: totalPrice } });
          setPixInfo(cob);
        } catch (err) {
          console.error("[checkout] pix cobrança falhou", err);
          toast.warning(
            "Pedido registrado! Nossa equipe vai enviar o QR Pix por e-mail em instantes.",
          );
        }
      }



    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Erro ao enviar reserva.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backTo="/pacotes/$slug" backParams={{ slug }} backLabel="Voltar ao pacote" />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-3xl md:text-4xl font-bold">
          Falta pouco para concluir <span className="text-brand-orange">sua reserva</span>
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Preencha seus dados e escolha a forma de pagamento. Nosso time confirma sua reserva em seguida.
        </p>

        {!isPerUnit && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">

            Este pacote foi montado para{" "}
            <span className="text-foreground font-medium">
              {baseOccupancy} adulto{baseOccupancy > 1 ? "s" : ""}
            </span>
            . Para outra quantidade de viajantes, prefira solicitar um orçamento personalizado{" "}
            <a
              href={customQuoteWhatsappUrl(pkg.title)}
              target="_blank"
              rel="noreferrer"
              className="text-brand-orange hover:underline font-medium inline-flex items-center gap-1"
            >
              <MessageCircle className="h-3 w-3" /> pelo WhatsApp
            </a>
            .
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 grid lg:grid-cols-[1fr_360px] gap-8">
          {/* Left: form */}
          <div className="space-y-6">
            {isFlexibleDate && !isService && (
              <Card title="Data desejada">
                <Field label="Escolha a data para a sua reserva *">
                  <input
                    type="date"
                    required
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className={inputCls}
                  />
                </Field>
                <p className="mt-2 text-xs text-muted-foreground">
                  Nosso time confirma a disponibilidade para essa data ao processar a reserva.
                </p>
              </Card>
            )}
            {pickupOptions.length > 0 && (
              <Card title="Ponto de saída do transfer">
                <Field label="De onde você quer sair? *">
                  <select
                    required
                    value={pickupPoint}
                    onChange={(e) => setPickupPoint(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Selecione o ponto de saída…</option>
                    {pickupOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <p className="mt-2 text-xs text-muted-foreground">
                  O transfer sai do local escolhido em direção ao evento.
                </p>
              </Card>

            )}
            {addonsList.length > 0 && (
              <Card title="Serviços adicionais">
                <p className="mb-3 text-xs text-muted-foreground">
                  Selecione o que deseja incluir na sua reserva. O valor é somado ao total automaticamente.
                </p>
                <div className="space-y-2">
                  {addonsList.map((a) => {
                    const checked = !!selectedAddons[a.key];
                    const units = isPerUnit ? adults : (adults + children);
                    const qty = a.per === "order" ? 1 : Math.max(1, units);
                    const line = a.price * qty;
                    return (
                      <Fragment key={a.key}>
                      <label
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                          checked
                            ? "border-brand-orange bg-brand-orange/5 shadow-[0_0_0_1px_hsl(var(--brand-orange)/0.35)]"
                            : "border-border bg-background hover:border-brand-orange/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-brand-orange"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedAddons((prev) => ({ ...prev, [a.key]: e.target.checked }))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold">{a.name}</span>
                            <span className="text-sm font-bold text-brand-orange">
                              + {formatBRL(line)}
                              {a.per !== "order" && qty > 1 && (
                                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                                  ({formatBRL(a.price)} × {qty})
                                </span>
                              )}
                            </span>
                          </div>
                          {a.description && (
                            <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                          )}
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {a.per === "order" ? "Valor único por reserva" : "Por pessoa/ingresso"}
                            {a.hasWeekdayPricing && addonWeekday == null && (
                              <> · <span className="text-amber-600">o preço varia por dia da semana — escolha a data acima</span></>
                            )}
                          </p>

                        </div>
                      </label>
                      {checked && a.subs.length > 0 && (
                        <div className="ml-6 mt-1 mb-2 space-y-1.5 border-l-2 border-brand-orange/30 pl-3">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                            Complementos para “{a.name}”
                          </div>
                          {a.subs.map((sub: any) => {
                            const subChecked = !!selectedAddons[sub.key];
                            const subQty = sub.per === "order" ? 1 : Math.max(1, units);
                            const subLine = sub.price * subQty;
                            return (
                              <label
                                key={sub.key}
                                className={`flex cursor-pointer gap-2 rounded-lg border p-2 transition text-xs ${
                                  subChecked
                                    ? "border-brand-orange bg-brand-orange/5"
                                    : "border-border bg-background hover:border-brand-orange/50"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-3.5 w-3.5 accent-brand-orange"
                                  checked={subChecked}
                                  onChange={(e) =>
                                    setSelectedAddons((prev) => ({ ...prev, [sub.key]: e.target.checked }))
                                  }
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-semibold">{sub.name}</span>
                                    <span className="font-bold text-brand-orange">
                                      + {formatBRL(subLine)}
                                      {sub.per !== "order" && subQty > 1 && (
                                        <span className="ml-1 font-normal text-muted-foreground">
                                          ({formatBRL(sub.price)} × {subQty})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {sub.description && (
                                    <p className="mt-0.5 text-muted-foreground">{sub.description}</p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      </Fragment>
                    );
                  })}
                </div>
              </Card>
            )}
            {/* Viajantes / quantidade */}
            <Card title={isPerUnit ? "Quantidade" : "Quantos viajantes?"}>
              {isPerUnit ? (
                <>
                  <Field label={`Quantidade de ingressos (1 a ${maxUnits})`}>
                    <input
                      type="number"
                      min={1}
                      max={maxUnits}
                      value={adults}
                      onChange={(e) =>
                        setAdults(Math.min(maxUnits, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className={inputCls}
                    />
                  </Field>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cada ingresso é individual. Preencha os dados de cada pessoa abaixo. Máximo de {maxUnits} por pedido — para mais, faça um novo pedido.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label={`Adultos (pacote para ${baseOccupancy})`}>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={adults}
                        onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Crianças* (até 12 anos)">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={children}
                        onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Preencha os dados de cada passageiro abaixo.
                  </p>
                  {occupancyMismatch && (
                    <div className="mt-3 rounded-lg border border-brand-orange/40 bg-brand-orange/5 p-3 text-xs">
                      Este pacote foi montado para{" "}
                      <strong>{baseOccupancy} adulto{baseOccupancy > 1 ? "s" : ""}</strong>. Você
                      selecionou {adults} adulto{adults > 1 ? "s" : ""}
                      {children > 0 && ` + ${children} criança${children > 1 ? "s" : ""}`}. O valor
                      pode variar — recomendamos{" "}
                      <a
                        href={customQuoteWhatsappUrl(pkg.title)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-orange hover:underline font-medium"
                      >
                        solicitar um orçamento personalizado no WhatsApp
                      </a>
                      .
                    </div>
                  )}
                </>
              )}
            </Card>


            {/* Um formulário por passageiro */}
            {travelers.map((t, i) => {
              const isPrimary = i === 0;
              const isChild = !isPerUnit && i >= adults;
              const title = isPrimary
                ? (isPerUnit ? "Ingresso 1 (responsável pela reserva)" : "Passageiro 1 (responsável pela reserva)")
                : (isPerUnit ? `Ingresso ${i + 1}` : `Passageiro ${i + 1}${isChild ? " (criança)" : ""}`);
              return (
                <Card key={i} title={title}>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Nome completo *">
                      <input
                        required
                        value={t.full_name}
                        onChange={(e) => updateTraveler(i, { full_name: e.target.value })}
                        className={inputCls}
                        placeholder="Como no documento"
                        maxLength={120}
                      />
                    </Field>
                    <Field label="CPF">
                      <input
                        value={t.cpf}
                        onChange={(e) => updateTraveler(i, { cpf: maskCPF(e.target.value) })}
                        className={inputCls}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        maxLength={14}
                      />
                    </Field>
                    <Field label="Data de nascimento">
                      <DateBRInput
                        value={t.birth_date}
                        onChange={(iso) => updateTraveler(i, { birth_date: iso })}
                        className={inputCls}
                      />
                    </Field>

                    {isPrimary && (
                      <>
                        <Field label="E-mail *">
                          <input
                            required
                            type="email"
                            value={t.email}
                            onChange={(e) => updateTraveler(i, { email: e.target.value })}
                            className={inputCls}
                            placeholder="voce@email.com"
                            maxLength={160}
                          />
                        </Field>
                        <Field label="Telefone / WhatsApp *">
                          <input
                            required
                            value={t.phone}
                            onChange={(e) => updateTraveler(i, { phone: e.target.value })}
                            className={inputCls}
                            placeholder="(00) 00000-0000"
                            maxLength={30}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}

            {/* Pagamento */}
            <Card title="Pagamento">
              <p className="text-sm text-muted-foreground mb-4">Como prefere pagar?</p>
              <div className={`grid gap-3 ${isService ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                <PaymentOption
                  active={payment === "credit_card"}
                  onClick={() => setPayment("credit_card")}
                  icon={CreditCard}
                  title="Cartão de crédito"
                  desc="Parcele em até 10x sem juros em ambiente seguro e criptografado."
                />
                <PaymentOption
                  active={payment === "pix"}
                  onClick={() => setPayment("pix")}
                  icon={QrCode}
                  title="Pix"
                  desc="Realize o pagamento via Pix. Nosso time envia a chave/QR Code por e-mail em seguida."
                  badge="-5% de desconto"
                />
                {!isService && (
                  <PaymentOption
                    active={payment === "boleto"}
                    onClick={() => setPayment("boleto")}
                    icon={FileText}
                    title="Boleto bancário"
                    desc="Parcelamos em até 10x sem juros no boleto. Finalização feita via WhatsApp com nosso consultor."
                  />
                )}
              </div>

              {payment === "boleto" && (
                <div className="mt-6 pt-6 border-t border-border space-y-5">
                  <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
                    <p className="text-sm text-foreground font-semibold">
                      Parcelamos em até 10x sem juros no boleto.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Como funciona:</span> ao enviar, os dados são encaminhados para <span className="text-foreground font-semibold">análise de crédito</span>. A finalização não é concluída online — um consultor entra em contato pelo WhatsApp com o resultado e as próximas etapas.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Quem pode financiar:</span> o financiamento deve estar no nome de um dos viajantes ou de um parente de primeiro grau (pai, mãe, irmão(ã), cônjuge). Em casos específicos, aceitamos avó(ô) como financiador.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Boleto pré-pago (quitação até a data da viagem):</span> essa modalidade <span className="text-foreground font-semibold">não passa por análise de crédito</span> e não pode ser solicitada pelo portal. A reserva deve ser feita diretamente com nosso consultor pelo WhatsApp.
                    </p>

                    <p>
                      <span className="text-foreground font-semibold">Todos os campos abaixo são obrigatórios.</span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">
                        Em quantas vezes deseja parcelar? (sem juros)
                      </span>
                      <select
                        value={boletoInstallments}
                        onChange={(e) => setBoletoInstallments(Number(e.target.value))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                      >
                        {Array.from({ length: MAX_BOLETO_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x de {formatBRL(totalPrice / n)} sem juros
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Total: <strong className="text-foreground">{formatBRL(totalPrice)}</strong>
                      {boletoInstallments > 1 && (
                        <> · {boletoInstallments} boletos mensais de <strong className="text-foreground">{formatBRL(totalPrice / boletoInstallments)}</strong>, sem juros.</>
                      )}
                    </p>
                  </div>

                  <BoletoForm data={boleto} onChange={patchBoleto} isThirdParty={isThirdPartyFinancier} />
                </div>
              )}


              {payment === "credit_card" && (
                <div className="mt-6 pt-6 border-t border-border">
                  <CardForm
                    data={card}
                    onChange={patchCard}
                    installments={installments}
                    onInstallmentsChange={setInstallments}
                    installmentsOptions={Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1)}
                    total={totalPrice}
                  />
                </div>
              )}

              {payment === "pix" && (
                <div className="mt-6 pt-6 border-t border-border space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Endereço de cobrança</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Usamos esses dados para gerar o contrato e o recibo da sua reserva.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">CEP *</span>
                      <input
                        value={pixAddress.cep}
                        onChange={(e) => setPixAddress((p) => ({ ...p, cep: e.target.value }))}
                        className={inputCls}
                        placeholder="00000-000"
                        maxLength={9}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">Endereço *</span>
                      <input
                        value={pixAddress.address}
                        onChange={(e) => setPixAddress((p) => ({ ...p, address: e.target.value }))}
                        className={inputCls}
                        placeholder="Rua / Avenida"
                        maxLength={200}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">Número *</span>
                      <input
                        value={pixAddress.number}
                        onChange={(e) => setPixAddress((p) => ({ ...p, number: e.target.value }))}
                        className={inputCls}
                        maxLength={20}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">Cidade *</span>
                      <input
                        value={pixAddress.city}
                        onChange={(e) => setPixAddress((p) => ({ ...p, city: e.target.value }))}
                        className={inputCls}
                        maxLength={120}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">Estado *</span>
                      <input
                        value={pixAddress.state}
                        onChange={(e) => setPixAddress((p) => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))}
                        className={inputCls}
                        maxLength={2}
                        required
                      />
                    </label>
                  </div>
                </div>
              )}
            </Card>


            {/* Observações */}
            <Card title="Observações (opcional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputCls} min-h-[100px]`}
                placeholder="Alguma preferência, restrição alimentar, quarto especial…"
                maxLength={2000}
              />
            </Card>
          </div>

          {/* Right: summary */}
          <aside className="lg:sticky lg:top-6 h-fit">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="font-semibold">Resumo da reserva</h3>
              <div className="mt-4 space-y-1 text-sm">
                <div className="font-medium">{pkg.title}</div>
                <div className="text-muted-foreground text-xs">{pkg.destination}</div>
                <div className="text-muted-foreground text-xs">
                  {isFlexibleDate
                    ? (preferredDate ? `Data desejada: ${preferredDate.split("-").reverse().join("/")}` : "Data à escolher")
                    : isService
                      ? (pkg.going_date ? `Data do evento: ${formatDateBR(pkg.going_date)}` : "")
                      : formatDateRange(pkg.going_date, pkg.return_date)}
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm border-t border-border pt-4">
                {isPerUnit ? (
                  <SummaryLine
                    label={`Ingressos × ${adults}`}
                    value={formatBRL(Number(pkg.price_per_person) * adults)}
                  />
                ) : (
                  <>
                    <SummaryLine
                      label={`Adultos × ${adults}`}
                      value={formatBRL(Number(pkg.price_per_person) * adults)}
                    />
                    {children > 0 && (
                      <SummaryLine
                        label={`Crianças × ${children}`}
                        value={formatBRL(Number(pkg.price_per_person) * children)}
                      />
                    )}
                  </>
                )}
                {Number(pkg.taxes ?? 0) > 0 && (
                  <SummaryLine
                    label="Já com taxas inclusas de"
                    value={formatBRL(Number(pkg.taxes))}
                  />
                )}
                {addonsList
                  .filter((a) => selectedAddons[a.key])
                  .map((a) => {
                    const units = isPerUnit ? adults : (adults + children);
                    const qty = a.per === "order" ? 1 : Math.max(1, units);
                    return (
                      <Fragment key={a.key}>
                        <SummaryLine
                          label={`+ ${a.name}${a.per !== "order" && qty > 1 ? ` × ${qty}` : ""}`}
                          value={formatBRL(a.price * qty)}
                        />
                        {a.subs
                          .filter((sub: any) => selectedAddons[sub.key])
                          .map((sub: any) => {
                            const sQty = sub.per === "order" ? 1 : Math.max(1, units);
                            return (
                              <SummaryLine
                                key={sub.key}
                                label={`  └ ${sub.name}${sub.per !== "order" && sQty > 1 ? ` × ${sQty}` : ""}`}
                                value={formatBRL(sub.price * sQty)}
                              />
                            );
                          })}
                      </Fragment>
                    );
                  })}
                {payment === "pix" && pixDiscountValue > 0 && (
                  <SummaryLine
                    label="Desconto Pix (-5%)"
                    value={`- ${formatBRL(pixDiscountValue)}`}
                  />
                )}
              </div>
              <div className="mt-4 border-t border-border pt-4 flex justify-between items-baseline">
                <span className="text-muted-foreground text-sm">Total</span>
                <span className="text-2xl font-display font-bold text-brand-orange">
                  {formatBRL(totalPrice)}
                </span>
              </div>
              {payment === "pix" && pixDiscountValue > 0 && (
                <div className="mt-1 text-right text-xs text-green-500 font-semibold">
                  Você economiza {formatBRL(pixDiscountValue)} pagando via Pix
                </div>
              )}
              {payment === "credit_card" && (
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  em {installments}x de {formatBRL(totalPrice / installments)}
                  {installments <= 10 ? " sem juros" : ""}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || success}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                  </>
                ) : success ? (
                  <>
                    <Check className="h-4 w-4" /> Reserva enviada
                  </>
                ) : payment === "pix" ? (
                  <>Realizar pagamento</>

                ) : (
                  <>Fazer pedido</>
                )}

              </button>
              <p className="mt-3 text-[11px] text-muted-foreground text-center">
                Ao continuar você concorda com nossos{" "}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="text-brand-orange hover:underline font-medium"
                >
                  termos e política de cancelamento
                </button>
                .
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground/80 text-center">
                <span aria-hidden className="mr-1 font-sans">{"\u{1F512}\u{FE0E}"}</span>
                Ambiente criptografado. Seus dados trafegam por conexão segura.
              </p>
            </div>
          </aside>
        </form>
      </div>
      {termsOpen && <TermsModal onClose={() => setTermsOpen(false)} />}
      {success && payment === "pix" && pixInfo && !pixPaid && (
        <PixQrOverlay
          qrCode={pixInfo.qrCode}
          valor={pixInfo.valor}
          expiraEm={pixInfo.expiraEm}
          onClose={() => navigate({ to: "/pacotes" })}
        />
      )}
      {success && payment === "pix" && pixPaid && (
        <SuccessOverlay
          title="Pagamento aprovado!"
          message="Recebemos seu Pix. Nossa equipe já foi notificada e vai começar a organizar sua viagem."
          onClose={() => navigate({ to: "/pacotes" })}
        />
      )}
      {success && (payment === "credit_card" || payment === "boleto") && (
        <SuccessOverlay
          title="Muito obrigado pela compra!"
          message="Seu pedido foi enviado com sucesso. Nossa equipe entrará em contato em breve para confirmar sua reserva."
          onClose={() => navigate({ to: "/pacotes" })}
        />
      )}
      {success && payment === "pix" && !pixInfo && (
        <SuccessOverlay
          title="Pedido registrado!"
          message="Nossa equipe vai enviar o QR Pix por e-mail em instantes."
          onClose={() => navigate({ to: "/pacotes" })}
        />
      )}

      <ContactFooter whatsappMessage={`Olá! Preciso de ajuda para finalizar minha reserva.`} />
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function PaymentOption({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-xl border p-4 transition ${
        active
          ? "border-brand-orange bg-brand-orange/5"
          : "border-border bg-background hover:border-brand-orange/50"
      }`}
    >
      {badge && (
        <span className="absolute -top-2 right-3 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-orange" />
        <span className="font-semibold">{title}</span>
        {active && <Check className="ml-auto h-4 w-4 text-brand-orange" />}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SuccessOverlay({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-9 w-9 text-emerald-500" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">{title}</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

function PixQrOverlay({
  qrCode,
  valor,
  expiraEm,
  onClose,
}: {
  qrCode: string;
  valor: number;
  expiraEm: string;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000)),
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(qrCode)}`;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 md:p-8 shadow-2xl">
        <h2 className="font-display text-xl md:text-2xl font-bold text-foreground text-center">
          Pague com <span className="text-brand-orange">Pix</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground text-center">Escaneie o QR ou copie o código</p>
        <div className="mt-4 flex justify-center">
          <img src={qrImg} alt="QR Code Pix" width={240} height={240} className="rounded-xl border border-border" />
        </div>
        <div className="mt-4 rounded-2xl bg-gradient-brand p-4 text-primary-foreground text-center">
          <div className="text-xs uppercase tracking-wider opacity-90">Valor</div>
          <div className="text-2xl font-bold">{formatBRL(valor)}</div>
          <div className="text-xs opacity-90 mt-1">Expira em {mm}:{ss}</div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-semibold mb-1.5 text-muted-foreground">Pix copia e cola</div>
          <div className="rounded-xl border border-dashed border-border bg-background p-3 font-mono text-[11px] break-all leading-relaxed max-h-24 overflow-y-auto">
            {qrCode}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(qrCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 w-full rounded-full bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
          >
            {copied ? "Copiado!" : "Copiar código Pix"}
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando confirmação do pagamento…
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground underline"
        >
          Fechar (o QR também foi enviado por e-mail)
        </button>
      </div>
    </div>
  );
}

