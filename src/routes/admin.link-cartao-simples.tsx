import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Copy, ExternalLink, MessageCircle, Vault, AlertTriangle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { paymentSimpleLinkUrl, whatsappUrl, splitInstallments } from "@/lib/checkout-config";
import { formatBRL } from "@/lib/format";
import { saveCofreEntry, deleteCofreEntry, popEditEntry } from "@/lib/cofre-storage";
import { CollapsibleSection, EssentialGroup } from "@/components/LinkFormSection";


export const Route = createFileRoute("/admin/link-cartao-simples")({
  validateSearch: (s: Record<string, unknown>) => s as Record<string, string | undefined>,
  component: LinkSimpleGenerator,
});


function LinkSimpleGenerator() {
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [installments, setInstallments] = useState(10);
  const [orderRef, setOrderRef] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
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
    let s: Record<string, string | undefined> = { ...(search ?? {}) };
    if (!s?.autogen) {
      try {
        const raw = sessionStorage.getItem("paymentLinkPrefill:/admin/link-cartao-simples");
        if (raw) {
          s = { ...(JSON.parse(raw) as Record<string, string>) };
          sessionStorage.removeItem("paymentLinkPrefill:/admin/link-cartao-simples");
        }
      } catch { /* ignore */ }
    }
    if (s?.autogen === "1") {
      autogenRef.current = true;
      if (s.customer) setCustomer(s.customer);

      if (s.phone) setCustomerPhone(String(s.phone).replace(/\D/g, ""));
      if (s.description) setDescription(s.description);
      if (s.total) setTotal(String(s.total));
      if (s.orderRef) setOrderRef(s.orderRef);
      if (s.orderNumber) setOrderNumber(s.orderNumber);
      if (s.hotel) setHotel(s.hotel);
      if (s.flights) setFlights(s.flights);
      if (s.checkin) setCheckin(s.checkin);
      if (s.checkout) setCheckout(s.checkout);
      if (s.days) setDays(s.days);
      if (s.nights) setNights(s.nights);
      if (s.imageUrl) setImageUrl(s.imageUrl);
      return;

    }

    const entry = popEditEntry();
    if (!entry) return;
    editingIdRef.current = entry.id;
    setIsEditing(true);
    setCustomer(entry.customer ?? "");
    setCustomerPhone(entry.customerPhone ?? "");
    setDescription(entry.description ?? "");
    setTotal(entry.total ? String(entry.total) : "");
    setInstallments(entry.installments || 1);
    setOrderRef(entry.orderRef ?? "");
    setOrderNumber(entry.orderNumber ?? "");
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
    if (!totalNumber || !description) return "";
    return paymentSimpleLinkUrl({
      description,
      total: totalNumber,
      installments,
      firstAmount: effectiveFirst,
      orderRef: orderRef || undefined,
      orderNumber: orderNumber.trim() || undefined,
      customerName: customer || undefined,
      imageUrl: imageUrl || undefined,
      hotel: hotel.trim() || undefined,
      flights: flights.trim() || undefined,
      checkin: checkin.trim() || undefined,
      checkout: checkout.trim() || undefined,
      days: days.trim() || undefined,
      nights: nights.trim() || undefined,
    });
  }, [totalNumber, installments, orderRef, orderNumber, description, customer, effectiveFirst, imageUrl, hotel, flights, checkin, checkout, days, nights]);


  const parcelaLabel = split.equal
    ? `${installments}x de ${formatBRL(split.first)} sem juros`
    : `1ª de ${formatBRL(split.first)} + ${split.restCount}x de ${formatBRL(split.rest)}`;

  const whatsMessage = url
    ? `Olá${customer ? ` ${customer}` : ""}! Segue seu link de pagamento Via Air:\n\n💳 ${description}\n💰 Total: ${formatBRL(totalNumber)}\n📆 ${parcelaLabel}\n\n${url}\n\nQualquer dúvida estamos à disposição.`
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
      hotel: hotel.trim() || undefined,
      flights: flights.trim() || undefined,
      checkin: checkin.trim() || undefined,
      checkout: checkout.trim() || undefined,
      days: days.trim() || undefined,
      nights: nights.trim() || undefined,
      url,
    });
  }

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



  const travelFilled = [hotel, flights, checkin, checkout, days, nights].filter((v) => v.trim()).length;
  const extrasFilled = [orderRef, imageUrl].filter((v) => v.trim()).length;

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-brand-orange/10 border border-brand-orange/30 flex items-center justify-center text-brand-orange">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-brand-orange text-[11px] uppercase tracking-widest font-semibold">
              <Link2 className="h-3.5 w-3.5" /> Link convencional · cartão sem verificação
            </div>
            <h1 className="mt-0.5 font-display text-2xl font-bold">
              {isEditing ? "Editar link do cofre" : "Novo link de pagamento"}
            </h1>
          </div>
        </div>
        <Link
          to="/admin/cofre"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs hover:border-brand-orange transition"
        >
          <Vault className="h-4 w-4" /> Ver cofre
        </Link>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-3 text-xs text-yellow-900 dark:text-yellow-200">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>Use apenas para clientes já conhecidos e de confiança.</strong> Para desconhecidos, use o{" "}
          <Link to="/admin/link-pagamento" className="underline hover:text-yellow-700 dark:hover:text-yellow-100">link seguro</Link>.
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_400px] gap-6">
        <section className="rounded-2xl border border-border bg-card p-6 space-y-6">
          <EssentialGroup title="Dados do cliente">
            <div className="grid sm:grid-cols-2 gap-3">
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

          <EssentialGroup title="Sobre a cobrança">
            <Field label="Descrição / referência *">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${cls} min-h-[80px]`}
                placeholder={"Pacote Cancún 5 dias\nInclui traslados e passeios"}
              />
            </Field>
            <Field label="Nº do pedido (opcional)">
              <input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className={cls}
                placeholder="Localizador (ABC123) ou ID da operadora"
                maxLength={40}
              />
            </Field>
          </EssentialGroup>

          <EssentialGroup title="Valor e parcelas">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Valor total (R$) *">
                <input required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={cls} placeholder="4999.90" />
              </Field>
              <Field label="Parcelas">
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className={cls}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}x sem juros</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${mode === "equal" ? "border-brand-orange bg-brand-orange/5" : "border-border hover:border-brand-orange/50"}`}>
                <input type="radio" name="mode" checked={mode === "equal"} onChange={() => setMode("equal")} className="mt-0.5 accent-brand-orange" />
                <span className="text-sm">
                  <span className="block font-medium">Parcelas iguais</span>
                  <span className="block text-xs text-muted-foreground">Todas as parcelas com o mesmo valor.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${mode === "first-higher" ? "border-brand-orange bg-brand-orange/5" : "border-border hover:border-brand-orange/50"}`}>
                <input type="radio" name="mode" checked={mode === "first-higher"} onChange={() => setMode("first-higher")} disabled={installments < 2} className="mt-0.5 accent-brand-orange" />
                <span className="text-sm">
                  <span className="block font-medium">1ª parcela maior</span>
                  <span className="block text-xs text-muted-foreground">Ex.: soma a taxa de embarque na 1ª.</span>
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
                  placeholder="Ex.: 150.00"
                />
              </Field>
            )}
          </EssentialGroup>

          <CollapsibleSection
            title="Informações da viagem"
            hint="Aparecem no link do cliente. Deixe em branco se não se aplicar."
            filledCount={travelFilled}
          >
            <Field label="Hotel / hospedagem">
              <input value={hotel} onChange={(e) => setHotel(e.target.value)} className={cls} placeholder="Hotel Riu Cancún — quarto duplo vista mar" />
            </Field>
            <Field label="Voos (companhia, número, horários)">
              <textarea
                value={flights}
                onChange={(e) => setFlights(e.target.value)}
                className={`${cls} min-h-[70px]`}
                placeholder={"LATAM LA3421 CWB 08:15 → GRU 09:35"}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in"><input value={checkin} onChange={(e) => setCheckin(e.target.value)} className={cls} placeholder="12/03/2026" /></Field>
              <Field label="Check-out"><input value={checkout} onChange={(e) => setCheckout(e.target.value)} className={cls} placeholder="19/03/2026" /></Field>
              <Field label="Dias"><input value={days} onChange={(e) => setDays(e.target.value)} className={cls} placeholder="7" /></Field>
              <Field label="Noites"><input value={nights} onChange={(e) => setNights(e.target.value)} className={cls} placeholder="6" /></Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Apresentação e referência interna"
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
                  className="mt-2 h-28 w-full rounded-lg object-cover border border-border"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
            </Field>
            <Field label="Referência interna (CRM)">
              <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className={cls} placeholder="Ex.: número do orçamento no CRM" />
            </Field>
          </CollapsibleSection>
        </section>

        <aside className="rounded-2xl border border-border bg-card p-6 space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Resumo</div>
          <div className="text-3xl font-display font-bold text-brand-orange tabular-nums">
            {totalNumber ? formatBRL(totalNumber) : "R$ —"}
          </div>
          {totalNumber > 0 && (
            <div className="text-xs text-muted-foreground">{parcelaLabel}</div>
          )}

          <div className="pt-3 border-t border-border">
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Link gerado</label>
            <textarea readOnly value={url} className={`${cls} mt-1 min-h-[90px] font-mono text-xs`} placeholder="Preencha descrição e valor…" />
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              disabled={!url}
              onClick={() => {
                navigator.clipboard.writeText(url);
                persistToCofre();
                toast.success("Link copiado e salvo no cofre");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Copiar link
            </button>
            <a
              href={url || "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!url}
              onClick={() => persistToCofre()}
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm hover:border-brand-orange transition ${!url ? "pointer-events-none opacity-50" : ""}`}
            >
              <ExternalLink className="h-4 w-4" /> Abrir link
            </a>
            <a
              href={url ? (customerPhone ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(whatsMessage)}` : whatsappUrl(whatsMessage)) : "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!url}
              onClick={() => persistToCofre()}
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm hover:border-brand-orange transition ${!url ? "pointer-events-none opacity-50" : ""}`}
            >
              <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
            </a>
          </div>
        </aside>
      </div>

    </div>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
