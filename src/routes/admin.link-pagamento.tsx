import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Copy, ExternalLink, MessageCircle, Vault, AlertTriangle, ShieldCheck, User, FileText, Wallet, Plane, ImageIcon, ArrowRight, Radio } from "lucide-react";
import { toast } from "sonner";
import { paymentLinkUrl, whatsappUrl, splitInstallments } from "@/lib/checkout-config";
import { formatBRL } from "@/lib/format";
import { saveCofreEntry, deleteCofreEntry, popEditEntry } from "@/lib/cofre-storage";
import { CollapsibleSection, EssentialGroup, CyberField as Field, cyberInput as cls } from "@/components/LinkFormSection";



export const Route = createFileRoute("/admin/link-pagamento")({
  validateSearch: (s: Record<string, unknown>) => s as Record<string, string | undefined>,
  component: LinkGenerator,
});


function LinkGenerator() {
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [total, setTotal] = useState("");
  const [installments, setInstallments] = useState(10);
  const [orderRef, setOrderRef] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [locator, setLocator] = useState("");
  const [tripRoute, setTripRoute] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [passengers, setPassengers] = useState("");
  const [hotel, setHotel] = useState("");
  const [flights, setFlights] = useState("");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [days, setDays] = useState("");
  const [nights, setNights] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<"equal" | "first-higher">("equal");
  const [firstAmount, setFirstAmount] = useState("");
  const editingIdRef = useRef<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const autogenRef = useRef(false);
  const autoRanRef = useRef(false);


  const search = Route.useSearch();

  useEffect(() => {
    // Fallback: se a nova aba perdeu a querystring, tenta sessionStorage
    let s: Record<string, string | undefined> = { ...(search ?? {}) };
    if (!s?.autogen) {
      try {
        const raw = sessionStorage.getItem("paymentLinkPrefill:/admin/link-pagamento");
        if (raw) {
          s = { ...(JSON.parse(raw) as Record<string, string>) };
          sessionStorage.removeItem("paymentLinkPrefill:/admin/link-pagamento");
        }
      } catch { /* ignore */ }
    }

    // 1) Se veio do pedido com autogen=1, pré-preenche a partir da querystring
    if (s?.autogen === "1") {
      autogenRef.current = true;
      if (s.customer) setCustomer(s.customer);
      if (s.phone) setCustomerPhone(String(s.phone).replace(/\D/g, ""));
      if (s.description) setDescription(s.description);
      if (s.supplier) setSupplier(s.supplier);
      if (s.total) setTotal(String(s.total));
      if (s.orderRef) setOrderRef(s.orderRef);
      if (s.orderNumber) setOrderNumber(s.orderNumber);
      if (s.locator) setLocator(s.locator);
      if (s.route) setTripRoute(s.route);
      if (s.travelDate) setTravelDate(s.travelDate);
      if (s.passengers) setPassengers(s.passengers);
      if (s.hotel) setHotel(s.hotel);
      if (s.flights) setFlights(s.flights);
      if (s.checkin) setCheckin(s.checkin);
      if (s.checkout) setCheckout(s.checkout);
      if (s.days) setDays(s.days);
      if (s.nights) setNights(s.nights);
      if (s.imageUrl) setImageUrl(s.imageUrl);
      return;
    }


    // 2) Caso contrário, tenta popular do cofre (edição)
    const entry = popEditEntry();
    if (!entry) return;
    editingIdRef.current = entry.id;
    setIsEditing(true);
    setCustomer(entry.customer ?? "");
    setCustomerPhone(entry.customerPhone ?? "");
    setDescription(entry.description ?? "");
    setSupplier(entry.supplier ?? "");
    setTotal(entry.total ? String(entry.total) : "");
    setInstallments(entry.installments || 1);
    setOrderRef(entry.orderRef ?? "");
    setOrderNumber(entry.orderNumber ?? "");
    setLocator(entry.locator ?? "");
    setTripRoute(entry.route ?? "");
    setTravelDate(entry.travelDate ?? "");
    setPassengers(entry.passengers ?? "");
    setHotel(entry.hotel ?? "");
    setFlights(entry.flights ?? "");
    setCheckin(entry.checkin ?? "");
    setCheckout(entry.checkout ?? "");
    setDays(entry.days ?? "");
    setNights(entry.nights ?? "");
    setImageUrl(entry.imageUrl ?? "");
    if (entry.firstAmount && entry.firstAmount > 0) {
      setMode("first-higher");
      setFirstAmount(String(entry.firstAmount));
    }
    toast.info("Editando link do cofre");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const totalNumber = Number(total.replace(",", ".")) || 0;
  const firstAmountNumber = Number(firstAmount.replace(",", ".")) || 0;
  const effectiveFirst =
    mode === "first-higher" && installments > 1 ? firstAmountNumber : undefined;

  const split = splitInstallments(totalNumber, installments, effectiveFirst);

  const url = useMemo(() => {
    if (!totalNumber || !description || !supplier.trim()) return "";
    return paymentLinkUrl({
      description,
      total: totalNumber,
      installments,
      firstAmount: effectiveFirst,
      orderRef: orderRef || undefined,
      orderNumber: orderNumber.trim() || undefined,
      customerName: customer || undefined,
      imageUrl: imageUrl || undefined,
      supplier: supplier.trim(),
      locator: locator.trim() || undefined,
      route: tripRoute.trim() || undefined,
      travelDate: travelDate.trim() || undefined,
      passengers: passengers.trim() || undefined,
      hotel: hotel.trim() || undefined,
      flights: flights.trim() || undefined,
      checkin: checkin.trim() || undefined,
      checkout: checkout.trim() || undefined,
      days: days.trim() || undefined,
      nights: nights.trim() || undefined,
    });
  }, [totalNumber, installments, orderRef, orderNumber, description, customer, effectiveFirst, imageUrl, supplier, locator, tripRoute, travelDate, passengers, hotel, flights, checkin, checkout, days, nights]);


  const parcelaLabel = split.equal
    ? `${installments}x de ${formatBRL(split.first)} sem juros`
    : `1ª de ${formatBRL(split.first)} + ${split.restCount}x de ${formatBRL(split.rest)}`;

  const whatsMessage = url
    ? `Olá${customer ? ` ${customer}` : ""}! Segue seu link de pagamento seguro Via Air:\n\n💳 ${description}\n💰 Total: ${formatBRL(totalNumber)}\n📆 ${parcelaLabel}\n\n🔒 ${url}\n\nQualquer dúvida estamos à disposição.`
    : "";

  function persistToCofre() {
    if (!url) return;
    if (editingIdRef.current) {
      deleteCofreEntry(editingIdRef.current);
      editingIdRef.current = null;
    }
    saveCofreEntry({
      customer: customer || undefined,
      customerPhone: customerPhone || undefined,
      description,
      total: totalNumber,
      installments,
      firstAmount: effectiveFirst,
      orderRef: orderRef || undefined,
      orderNumber: orderNumber.trim() || undefined,
      imageUrl: imageUrl || undefined,
      supplier: supplier.trim() || undefined,
      locator: locator.trim() || undefined,
      route: tripRoute.trim() || undefined,
      travelDate: travelDate.trim() || undefined,
      passengers: passengers.trim() || undefined,
      hotel: hotel.trim() || undefined,
      flights: flights.trim() || undefined,
      checkin: checkin.trim() || undefined,
      checkout: checkout.trim() || undefined,
      days: days.trim() || undefined,
      nights: nights.trim() || undefined,
      url,
    });
  }

  // Auto: quando vem do pedido (autogen), assim que o link estiver pronto,
  // salva no cofre, copia e abre o WhatsApp automaticamente.
  useEffect(() => {
    if (!autogenRef.current || autoRanRef.current) return;
    if (!url) return;
    autoRanRef.current = true;
    persistToCofre();
    try { navigator.clipboard.writeText(url); } catch { /* ignore */ }
    const wa = customerPhone
      ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(whatsMessage)}`
      : whatsappUrl(whatsMessage);
    toast.success("Link gerado, salvo no cofre e copiado");
    window.open(wa, "_blank", "noopener");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);



  // Contadores para pills de "X preenchidos" nas seções colapsáveis
  const travelFilled = [locator, tripRoute, travelDate, passengers, hotel, flights, checkin, checkout, days, nights].filter((v) => v.trim()).length;
  const extrasFilled = [orderRef, imageUrl].filter((v) => v.trim()).length;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 sm:py-10">
      {/* Header cyber premium */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-11 bg-brand-orange rounded-full shadow-[0_0_18px_rgba(242,107,31,0.35)]" />
          <div>
            <div className="flex items-center gap-2 text-brand-orange text-[10px] uppercase tracking-[0.24em] font-bold">
              <ShieldCheck className="h-3.5 w-3.5" /> Link seguro · cartão com verificação
            </div>
            <h1 className="mt-1 font-display text-3xl sm:text-4xl font-bold tracking-tight">
              {isEditing ? "Editar link do cofre" : "Novo link de pagamento"}
            </h1>
          </div>
        </div>
        <Link
          to="/admin/cofre"
          className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] hover:border-brand-orange hover:text-brand-orange transition"
        >
          <Vault className="h-3.5 w-3.5" /> Ver cofre
        </Link>
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/[0.04] p-3.5 text-xs text-yellow-900 dark:text-yellow-200/90">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong className="font-bold">Use este link seguro</strong> para clientes vindos da internet, desconhecidos ou que você nunca atendeu. Para clientes já conhecidos, use o link convencional.
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_380px] gap-6">
        <section className="rounded-xl border border-border/70 bg-card p-6 sm:p-8 space-y-10">
          <EssentialGroup title="Dados do cliente" icon={<User />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome do cliente">
                <input value={customer} onChange={(e) => setCustomer(e.target.value)} className={cls} placeholder="Lucas Silva" />
              </Field>
              <Field label="WhatsApp (com DDI)">
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
                  className={cls}
                  placeholder="5544999999999"
                />
              </Field>
            </div>
          </EssentialGroup>

          <EssentialGroup title="Sobre a cobrança" icon={<FileText />}>
            <Field label="Descrição / referência *">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${cls} min-h-[84px] resize-y`}
                placeholder={"Pacote Cancún 5 dias\nInclui traslados e passeios"}
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Fornecedor (aparece na fatura do cartão) *">
                <input required value={supplier} onChange={(e) => setSupplier(e.target.value)} className={cls} placeholder="LATAM, CVC, VIA AIR" />
              </Field>
              <Field label="Nº do pedido (opcional)">
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className={cls}
                  placeholder="ABC123 ou ID da operadora"
                  maxLength={40}
                />
              </Field>
            </div>
          </EssentialGroup>

          <EssentialGroup title="Valor e parcelamento" icon={<Wallet />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-background/60 border border-border/70 hover:border-brand-orange/40 transition-colors">
                <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand-orange mb-2.5">Valor total</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs font-bold tabular-nums">BRL</span>
                  <input required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className="bg-transparent text-2xl font-bold tabular-nums text-foreground focus:outline-none w-full placeholder:text-muted-foreground/40" placeholder="0,00" />
                </div>
              </div>
              <div className="p-4 rounded-lg bg-background/60 border border-border/70">
                <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-2.5">Máximo de parcelas</div>
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="bg-transparent text-2xl font-bold tabular-nums text-foreground focus:outline-none w-full appearance-none cursor-pointer">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n} className="bg-background text-foreground text-sm">{n}x sem juros</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className={`flex items-start gap-2.5 rounded-lg border p-3.5 cursor-pointer transition ${mode === "equal" ? "border-brand-orange bg-brand-orange/[0.06]" : "border-border/70 hover:border-brand-orange/50"}`}>
                <input type="radio" name="mode" checked={mode === "equal"} onChange={() => setMode("equal")} className="mt-0.5 accent-brand-orange" />
                <span className="text-xs">
                  <span className="block font-semibold text-foreground uppercase tracking-wider text-[10px]">Parcelas iguais</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground normal-case">Todas com o mesmo valor.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2.5 rounded-lg border p-3.5 cursor-pointer transition ${mode === "first-higher" ? "border-brand-orange bg-brand-orange/[0.06]" : "border-border/70 hover:border-brand-orange/50"} ${installments < 2 ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input type="radio" name="mode" checked={mode === "first-higher"} onChange={() => setMode("first-higher")} disabled={installments < 2} className="mt-0.5 accent-brand-orange" />
                <span className="text-xs">
                  <span className="block font-semibold text-foreground uppercase tracking-wider text-[10px]">1ª parcela maior</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground normal-case">Soma taxa de embarque na 1ª.</span>
                </span>
              </label>
            </div>
            {mode === "first-higher" && installments > 1 && (
              <Field label="Valor a somar na 1ª parcela (R$)">
                <input
                  inputMode="decimal"
                  value={firstAmount}
                  onChange={(e) => setFirstAmount(e.target.value)}
                  className={cls}
                  placeholder="150,00"
                />
              </Field>
            )}
          </EssentialGroup>

          <CollapsibleSection
            title="Informações da viagem"
            icon={<Plane />}
            hint="Aparecem no PDF de autorização de débito."
            filledCount={travelFilled}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Localizador da companhia aérea">
                <input
                  value={locator}
                  onChange={(e) => setLocator(e.target.value.toUpperCase())}
                  className={cls}
                  placeholder="ABC123"
                  maxLength={20}
                />
              </Field>
              <Field label="Data(s) da viagem">
                <input
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className={cls}
                  placeholder="12/03/2026 a 19/03/2026"
                />
              </Field>
            </div>
            <Field label="Rota (origem, destino e horários)">
              <textarea
                value={tripRoute}
                onChange={(e) => setTripRoute(e.target.value)}
                className={`${cls} min-h-[72px] resize-y`}
                placeholder={"CWB 08:15 → GRU 09:35 (LA3421)\nGRU 22:10 → MIA 06:30 (LA8188)"}
              />
            </Field>
            <Field label="Passageiros (um por linha)">
              <textarea
                value={passengers}
                onChange={(e) => setPassengers(e.target.value)}
                className={`${cls} min-h-[72px] resize-y`}
                placeholder={"JOÃO DA SILVA\nMARIA DA SILVA"}
              />
            </Field>
            <Field label="Hotel / hospedagem">
              <input
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
                className={cls}
                placeholder="Hotel Riu Cancún — quarto duplo vista mar"
              />
            </Field>
            <Field label="Voos (companhia, número, horários)">
              <textarea
                value={flights}
                onChange={(e) => setFlights(e.target.value)}
                className={`${cls} min-h-[72px] resize-y`}
                placeholder={"LATAM LA3421 CWB 08:15 → GRU 09:35"}
              />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Check-in"><input value={checkin} onChange={(e) => setCheckin(e.target.value)} className={cls} placeholder="12/03" /></Field>
              <Field label="Check-out"><input value={checkout} onChange={(e) => setCheckout(e.target.value)} className={cls} placeholder="19/03" /></Field>
              <Field label="Dias"><input value={days} onChange={(e) => setDays(e.target.value)} className={cls} placeholder="7" /></Field>
              <Field label="Noites"><input value={nights} onChange={(e) => setNights(e.target.value)} className={cls} placeholder="6" /></Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Apresentação e referência interna"
            icon={<ImageIcon />}
            hint="Imagem no topo do link e número interno para seu controle."
            filledCount={extrasFilled}
          >
            <Field label="Imagem do destino (URL)">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className={cls}
                placeholder="https://…foto-do-destino.jpg"
              />
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Prévia do destino"
                  className="mt-3 h-28 w-full rounded-lg object-cover border border-border/70"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
            </Field>
            <Field label="Referência interna (CRM)">
              <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className={cls} placeholder="Número do orçamento no CRM" />
            </Field>
          </CollapsibleSection>
        </section>

        {/* Sticky Summary — cyber premium */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
            <div className="p-6 space-y-6 relative">
              <div className="absolute inset-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(#F26B1F_1px,transparent_1px)] [background-size:22px_22px]" />

              <div className="relative">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-orange mb-4 flex items-center gap-2">
                  <Radio className="h-3 w-3" /> Resumo da cobrança
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-1.5">Total a cobrar</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-brand-orange text-sm font-bold">BRL</span>
                    <span className="text-4xl font-display font-bold tabular-nums text-foreground tracking-tight">
                      {totalNumber ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalNumber) : "0,00"}
                    </span>
                  </div>
                  {totalNumber > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground normal-case">{parcelaLabel}</div>
                  )}
                </div>
              </div>

              <div className="relative border-t border-border/60 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Link gerado</label>
                  <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${url ? "text-emerald-500" : "text-muted-foreground/60"}`}>
                    <span className={`w-1 h-1 rounded-full ${url ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/60"}`} />
                    {url ? "Pronto" : "Aguardando"}
                  </span>
                </div>
                <div className="p-3 bg-background/70 border border-border/60 rounded-lg">
                  <code className="text-[11px] font-mono text-muted-foreground block truncate">
                    {url || "preencha descrição, fornecedor e valor…"}
                  </code>
                </div>
              </div>

              <div className="relative grid gap-2">
                <button
                  type="button"
                  disabled={!url}
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    persistToCofre();
                    toast.success("Link copiado e salvo no cofre");
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange text-white px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] shadow-[0_4px_18px_rgba(242,107,31,0.28)] hover:bg-brand-orange/90 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:pointer-events-none group"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar link <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <a
                  href={url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!url}
                  onClick={() => persistToCofre()}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border/70 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:border-brand-orange hover:text-brand-orange transition ${!url ? "pointer-events-none opacity-40" : ""}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir link
                </a>
                <a
                  href={url ? (customerPhone ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(whatsMessage)}` : whatsappUrl(whatsMessage)) : "#"}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!url}
                  onClick={() => persistToCofre()}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border/70 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:border-brand-orange hover:text-brand-orange transition ${!url ? "pointer-events-none opacity-40" : ""}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
                </a>
              </div>

              <div className="relative flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground/60 pt-3 border-t border-border/40">
                <span>VIA AIR</span>
                <span>Cofre criptografado</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

