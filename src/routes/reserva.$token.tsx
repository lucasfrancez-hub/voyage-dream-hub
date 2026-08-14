/**
 * Checkout público do orçamento (mesmo modelo do checkout de pacotes).
 *
 * Regras:
 * - A quantidade de passageiros vem travada do orçamento (não é editável).
 * - As formas de pagamento vêm do próprio orçamento: boleto só aparece
 *   quando liberado (pacote com 60+ dias de antecedência).
 * - Ao concluir, o pedido entra em /admin/pedidos como qualquer outro.
 */
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, QrCode, FileText, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, maskCPF } from "@/lib/format";
import { PIX_FEE } from "@/lib/checkout-config";
import { useServerFn } from "@tanstack/react-start";
import { notifyPixOrder } from "@/lib/pix-notify.functions";
import { criarPixCobranca, consultarPixCobranca } from "@/lib/pix.functions";
import { CardForm, useCardData, detectBrand } from "@/components/CardForm";
import { BoletoForm, emptyBoleto, validateBoleto, type BoletoData } from "@/components/BoletoForm";
import { DateBRInput } from "@/components/DateBRInput";
import { PixQrOverlay } from "@/components/PixQrOverlay";
import { TermsModal } from "@/components/TermsModal";
import { ContactFooter } from "@/components/ContactFooter";
import { fetchPublicQuote } from "@/lib/public-quote.functions";
import { getPublicQuote } from "@/lib/quote.functions";
import { buildPublicQuoteFromOrder } from "@/lib/public-quote/from-order";
import type { PublicQuote } from "@/lib/public-quote/types";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/reserva/$token")({
  loader: async ({ params }): Promise<{ quote: PublicQuote }> => {
    if (/^[a-z0-9]{6,20}$/i.test(params.token)) {
      const premium = await fetchPublicQuote({ data: { publicId: params.token } }).catch(() => null);
      if (premium) return { quote: premium };
    }
    try {
      const legacy = await getPublicQuote({ data: { token: params.token } });
      return { quote: buildPublicQuoteFromOrder(legacy, params.token) };
    } catch {
      throw notFound();
    }
  },
  head: () => ({
    meta: [
      { title: "Finalizar reserva — VIA AIR" },
      { name: "description", content: "Conclua a reserva do seu orçamento VIA AIR com Pix, cartão ou boleto." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Finalizar reserva — VIA AIR" },
      { property: "og:description", content: "Conclua a reserva do seu orçamento VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReservaCheckout,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Orçamento não encontrado ou expirado.
    </div>
  ),
});

type PaymentMethod = "credit_card" | "pix" | "boleto";

type Traveler = {
  full_name: string;
  cpf: string;
  birth_date: string;
  email: string;
  phone: string;
};

const emptyTraveler = (): Traveler => ({ full_name: "", cpf: "", birth_date: "", email: "", phone: "" });

function ReservaCheckout() {
  const { token } = Route.useParams();
  const { quote } = Route.useLoaderData();
  const navigate = useNavigate();

  const adults = Math.max(1, Number(quote.passengers?.adults) || 1);
  const children = Math.max(0, Number(quote.passengers?.children) || 0);
  const infants = Math.max(0, Number(quote.passengers?.infants) || 0);
  const totalPax = adults + children + infants;

  const boletoEnabled = !!quote.payment?.boleto?.enabled;
  const cardInstallments = quote.payment?.card?.installments ?? [];
  const defaultInstallment =
    [...cardInstallments].filter((i) => i.interestFree).sort((a, b) => b.number - a.number)[0]?.number ?? 1;

  const [travelers, setTravelers] = useState<Traveler[]>(() =>
    Array.from({ length: totalPax }, emptyTraveler),
  );
  const [payment, setPayment] = useState<PaymentMethod>("credit_card");
  const [installments, setInstallments] = useState<number>(defaultInstallment);
  const [boletoInstallments, setBoletoInstallments] = useState<number>(1);
  const { data: card, patch: patchCard } = useCardData();
  const [boleto, setBoleto] = useState<BoletoData>(emptyBoleto);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [pixInfo, setPixInfo] = useState<{ txid: string; qrCode: string; expiraEm: string; valor: number } | null>(null);
  const [pixError, setPixError] = useState(false);
  const [pixPaid, setPixPaid] = useState(false);

  const notifyPix = useServerFn(notifyPixOrder);
  const criarPix = useServerFn(criarPixCobranca);
  const consultarPix = useServerFn(consultarPixCobranca);

  useEffect(() => {
    if (!pixInfo?.txid || pixPaid) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await consultarPix({ data: { txid: pixInfo.txid } });
        if (!stopped && res?.status === "concluida") setPixPaid(true);
      } catch {
        /* retenta */
      }
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pixInfo?.txid, pixPaid, consultarPix]);

  const baseTotal = Number(quote.totals?.total) || 0;
  const pixTotal = (Number(quote.payment?.pix?.total) || baseTotal) + PIX_FEE;
  const pixDiscountValue = Math.max(0, baseTotal - (Number(quote.payment?.pix?.total) || baseTotal));
  const totalPrice = payment === "pix" ? pixTotal : baseTotal;

  const installmentSelected = cardInstallments.find((i) => i.number === installments);
  const cardTotal = installmentSelected ? Number(installmentSelected.total) : baseTotal;

  function patchBoleto(patch: Partial<BoletoData>) {
    setBoleto((prev) => ({ ...prev, ...patch }));
  }

  function updateTraveler(index: number, patch: Partial<Traveler>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  const boletoCpfDigits = boleto.cpf.replace(/\D/g, "");
  const boletoNameNorm = boleto.full_name.trim().toLowerCase();
  const financierMatchesTraveler = travelers.some((t) => {
    const tCpf = t.cpf.replace(/\D/g, "");
    const tName = t.full_name.trim().toLowerCase();
    if (boletoCpfDigits.length >= 11 && tCpf.length >= 11) return tCpf === boletoCpfDigits;
    if (boletoNameNorm && tName) return tName === boletoNameNorm;
    return false;
  });
  const isThirdPartyFinancier =
    (boletoCpfDigits.length >= 11 || boletoNameNorm.length > 0) && !financierMatchesTraveler;

  const periodo = [quote.startDate, quote.endDate]
    .filter(Boolean)
    .map((d) => String(d).slice(0, 10).split("-").reverse().join("/"))
    .join(" → ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

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
    if (payment === "pix" && primary.cpf.replace(/\D/g, "").length !== 11) {
      toast.error("Informe o CPF do passageiro 1 para gerar o QR Code Pix.");
      return;
    }
    if (payment === "boleto") {
      const err = validateBoleto(boleto, isThirdPartyFinancier);
      if (err) {
        toast.error(err);
        return;
      }
    }

    const finalTotal = payment === "pix" ? pixTotal : payment === "credit_card" ? cardTotal : baseTotal;

    setSubmitting(true);
    try {
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("orders").insert({
        id: newId,
        package_id: null,
        trip_title: quote.title,
        package_snapshot: {
          origin_kind: "public_quote",
          quote_public_id: quote.publicId,
          quote_token: token,
          quote_type: quote.type,
          quote_url: `/orcamento/${token}`,
          title: quote.title,
          destination: quote.destination ?? null,
          origin: quote.origin ?? null,
          going_date: quote.startDate ?? null,
          return_date: quote.endDate ?? null,
          nights: quote.nights ?? null,
          cabin: quote.cabin ?? null,
          trip_kind: quote.tripKind ?? null,
          summary: quote.summary ?? null,
          products: quote.products ?? null,
          totals: quote.totals ?? null,
          agent: quote.agent ?? null,
          travelers: travelers.map((t, i) => ({
            index: i + 1,
            kind: i < adults ? "adult" : i < adults + children ? "child" : "infant",
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
                boleto_installment_value: baseTotal / Math.max(boletoInstallments, 1),
              }
            : {}),
        },
        full_name: primary.full_name,
        email: primary.email,
        phone: primary.phone,
        cpf: primary.cpf || null,
        birth_date: primary.birth_date || null,
        adults,
        children: children + infants,
        payment_method:
          payment === "credit_card"
            ? `credit_card_${installments}x`
            : payment === "boleto"
              ? boletoInstallments > 1
                ? `boleto_${boletoInstallments}x`
                : "boleto"
              : payment,
        total_price: finalTotal,
        notes: notes || null,
        payer_full_name: payment === "credit_card" ? card.cardName : primary.full_name,
        payer_cpf: payment === "credit_card" ? card.cardCpf : primary.cpf || null,
        payer_email: primary.email,
        payer_phone: primary.phone,
        payer_zip: payment === "credit_card" ? card.billingZip : null,
        payer_address: payment === "credit_card" ? card.billingAddress : null,
        payer_number: payment === "credit_card" ? card.billingNumber : null,
        payer_city: payment === "credit_card" ? card.billingCity : null,
        payer_state: payment === "credit_card" ? card.billingState : null,
      });
      if (error) throw error;

      const orderNumber = `#${String(parseInt(newId.replace(/-/g, "").slice(0, 12), 16) % 100000000).padStart(8, "0")}`;
      setSuccess(true);

      if (payment === "pix") {
        try {
          await notifyPix({
            data: {
              orderNumber,
              productKind: quote.type === "AIR_ONLY" ? "Aéreo (orçamento)" : "Orçamento",
              productTitle: quote.title,
              adults,
              children: children + infants,
              totalPrice: formatBRL(finalTotal),
              customerName: primary.full_name,
              customerEmail: primary.email,
              customerPhone: primary.phone,
              notes: notes || undefined,
            },
          });
        } catch (err) {
          console.error("[reserva] pix notify falhou", err);
        }
        try {
          const cob = await criarPix({ data: { orderId: newId, valorEsperado: finalTotal } });
          setPixInfo(cob);
        } catch (err) {
          console.error("[reserva] pix cobrança falhou", err);
          setPixError(true);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao enviar reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <img src={viaAirLogo.url} alt="VIA AIR" className="h-8 w-auto" />
          <a
            href={`/orcamento/${token}`}
            className="text-xs text-muted-foreground hover:text-brand-orange"
          >
            ← Voltar ao orçamento
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-3xl md:text-4xl font-bold">
          Falta pouco para concluir <span className="text-brand-orange">sua reserva</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Preencha os dados dos viajantes e escolha a forma de pagamento. Nosso time confirma a reserva em seguida.
        </p>

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Este orçamento foi montado para{" "}
          <span className="font-medium text-foreground">{quote.passengers?.label || `${totalPax} viajante(s)`}</span>. Para
          alterar a quantidade de viajantes, fale com seu consultor para receber um novo orçamento.
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {travelers.map((t, i) => {
              const kind = i < adults ? "" : i < adults + children ? " (criança)" : " (bebê)";
              return (
                <Card key={i} title={i === 0 ? "Passageiro 1 (responsável pela reserva)" : `Passageiro ${i + 1}${kind}`}>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                    <Field label={i === 0 && payment === "pix" ? "CPF *" : "CPF"}>
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
                    {i === 0 && (
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

            <Card title="Pagamento">
              <p className="mb-4 text-sm text-muted-foreground">Como prefere pagar?</p>
              <div className={`grid gap-3 ${boletoEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <PaymentOption
                  active={payment === "credit_card"}
                  onClick={() => setPayment("credit_card")}
                  icon={CreditCard}
                  title="Cartão de crédito"
                  desc={`Parcele em até ${defaultInstallment}x sem juros em ambiente seguro e criptografado.`}
                />
                <PaymentOption
                  active={payment === "pix"}
                  onClick={() => setPayment("pix")}
                  icon={QrCode}
                  title="Pix"
                  desc="QR Code gerado na hora, com baixa automática assim que o pagamento cair."
                  badge={
                    quote.payment?.pix?.discountPercent
                      ? `-${quote.payment.pix.discountPercent}% de desconto`
                      : undefined
                  }
                />
                {boletoEnabled && (
                  <PaymentOption
                    active={payment === "boleto"}
                    onClick={() => setPayment("boleto")}
                    icon={FileText}
                    title="Boleto bancário"
                    desc={
                      quote.payment.boleto.note ??
                      "Parcelamos em até 10x sem juros no boleto, mediante aprovação."
                    }
                  />
                )}
              </div>

              {payment === "credit_card" && (
                <div className="mt-6 border-t border-border pt-6">
                  <CardForm
                    data={card}
                    onChange={patchCard}
                    installments={installments}
                    onInstallmentsChange={setInstallments}
                    installmentsOptions={cardInstallments.map((i) => i.number)}
                    total={cardTotal}
                  />
                </div>
              )}

              {payment === "boleto" && boletoEnabled && (
                <div className="mt-6 space-y-5 border-t border-border pt-6">
                  <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-4 text-xs leading-relaxed text-muted-foreground">
                    <p className="text-sm font-semibold text-foreground">Boleto em até 10x sem juros.</p>
                    <p className="mt-2">
                      Disponível apenas para viagens com no mínimo 60 dias de antecedência. Os dados são enviados para
                      análise de crédito e um consultor confirma o resultado pelo WhatsApp.
                    </p>
                  </div>
                  <label className="block rounded-xl border border-border bg-card p-4">
                    <span className="mb-1.5 block text-xs text-muted-foreground">
                      Em quantas vezes deseja parcelar? (sem juros)
                    </span>
                    <select
                      value={boletoInstallments}
                      onChange={(e) => setBoletoInstallments(Number(e.target.value))}
                      className={inputCls}
                    >
                      {(quote.payment.boleto.installments ?? []).map((p) => (
                        <option key={p.number} value={p.number}>
                          {p.number}x de {formatBRL(p.amount)} sem juros
                        </option>
                      ))}
                    </select>
                  </label>
                  <BoletoForm data={boleto} onChange={patchBoleto} isThirdParty={isThirdPartyFinancier} />
                </div>
              )}
            </Card>

            <Card title="Observações (opcional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputCls} min-h-[100px]`}
                placeholder="Alguma preferência, assento, restrição alimentar…"
                maxLength={2000}
              />
            </Card>
          </div>

          <aside className="h-fit lg:sticky lg:top-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <h3 className="font-semibold">Resumo da reserva</h3>
              <div className="mt-4 space-y-1 text-sm">
                <div className="font-medium">{quote.title}</div>
                {quote.destination && <div className="text-xs text-muted-foreground">{quote.destination}</div>}
                {periodo && <div className="text-xs text-muted-foreground">{periodo}</div>}
                <div className="text-xs text-muted-foreground">{quote.passengers?.label}</div>
              </div>

              <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                {(quote.summary ?? []).map((l, i) => (
                  <SummaryLine key={i} label={l.label} value={l.value} />
                ))}
                {payment === "pix" && pixDiscountValue > 0 && (
                  <SummaryLine
                    label={`Desconto Pix (-${quote.payment.pix.discountPercent}%)`}
                    value={`- ${formatBRL(pixDiscountValue)}`}
                  />
                )}
              </div>

              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display text-2xl font-bold text-brand-orange">
                  {formatBRL(payment === "credit_card" ? cardTotal : totalPrice)}
                </span>
              </div>
              {payment === "credit_card" && installmentSelected && installments > 1 && (
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  em {installments}x de {formatBRL(installmentSelected.amount)}
                  {installmentSelected.interestFree ? " sem juros" : ""}
                </div>
              )}
              {payment === "pix" && pixDiscountValue > 0 && (
                <div className="mt-1 text-right text-xs font-semibold text-green-500">
                  Você economiza {formatBRL(pixDiscountValue)} pagando via Pix
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || success}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:opacity-90 disabled:opacity-60"
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
                  <>
                    <QrCode className="h-4 w-4" /> Pagar via Pix
                  </>
                ) : (
                  <>Fazer pedido</>
                )}
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Ao continuar você concorda com nossos{" "}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="font-medium text-brand-orange hover:underline"
                >
                  termos e política de cancelamento
                </button>
                .
              </p>
              <p className="mt-2 text-center text-[10px] text-muted-foreground/80">
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
          onClose={() => navigate({ to: "/orcamento/$token", params: { token } })}
        />
      )}
      {success && payment === "pix" && pixPaid && (
        <SuccessOverlay
          title="Pagamento aprovado!"
          message="Recebemos seu Pix. Nossa equipe já foi notificada e vai organizar sua viagem."
          onClose={() => navigate({ to: "/orcamento/$token", params: { token } })}
        />
      )}
      {success && payment === "pix" && !pixInfo && !pixError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-orange" />
            <h2 className="mt-5 font-display text-xl font-bold">Gerando seu QR Code Pix</h2>
            <p className="mt-2 text-sm text-muted-foreground">Só mais alguns segundos…</p>
          </div>
        </div>
      )}
      {success && payment === "pix" && !pixInfo && pixError && (
        <SuccessOverlay
          title="Pedido registrado!"
          message="Não foi possível gerar o QR Code agora. Nossa equipe vai enviar o Pix em instantes."
          onClose={() => navigate({ to: "/orcamento/$token", params: { token } })}
        />
      )}
      {success && (payment === "credit_card" || payment === "boleto") && (
        <SuccessOverlay
          title="Muito obrigado!"
          message="Seu pedido foi enviado com sucesso. Nossa equipe entra em contato em breve para confirmar a reserva."
          onClose={() => navigate({ to: "/orcamento/$token", params: { token } })}
        />
      )}

      <ContactFooter whatsappMessage={`Olá! Preciso de ajuda para finalizar a reserva do orçamento ${quote.publicId}.`} />
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
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
      className={`relative rounded-xl border p-4 text-left transition ${
        active ? "border-brand-orange bg-brand-orange/5" : "border-border bg-background hover:border-brand-orange/50"
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
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function SuccessOverlay({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-9 w-9 text-emerald-500" />
        </div>
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:opacity-90"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
