import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, FileSignature, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { splitInstallments } from "@/lib/checkout-config";
import { CardForm, useCardData, detectBrand } from "@/components/CardForm";
import { DateBRInput } from "@/components/DateBRInput";
import { ClickSignEmbedded } from "@/components/ClickSignEmbedded";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  createEmbeddedAuthorization,
  getPendingAuthorizationStatus,
  consumePendingAuthorizationSignature,
} from "@/lib/clicksign.functions";
import { buildAuthorizationBlob, type AuthorizationData } from "@/lib/authorization-pdf";

import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";

const MAX_INSTALLMENTS = 12;


type Search = {
  desc?: string;
  total?: string;
  parcelas?: string;
  entrada?: string;
  ref?: string;
  pedido?: string;
  cliente?: string;
  img?: string;
  simples?: string;
  fornec?: string;
  loc?: string;
  rota?: string;
  datav?: string;
  pax?: string;
  hotel?: string;
  voos?: string;
  cin?: string;
  cout?: string;
  dias?: string;
  noites?: string;
};

const asStr = (v: unknown): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  return typeof v === "string" ? v : String(v);
};

export const Route = createFileRoute("/pagar")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    desc: asStr(s.desc),
    total: asStr(s.total),
    parcelas: asStr(s.parcelas),
    entrada: asStr(s.entrada),
    ref: asStr(s.ref),
    pedido: asStr(s.pedido),
    cliente: asStr(s.cliente),
    img: asStr(s.img),
    simples: asStr(s.simples),
    fornec: asStr(s.fornec),
    loc: asStr(s.loc),
    rota: asStr(s.rota),
    datav: asStr(s.datav),
    pax: asStr(s.pax),
    hotel: asStr(s.hotel),
    voos: asStr(s.voos),
    cin: asStr(s.cin),
    cout: asStr(s.cout),
    dias: asStr(s.dias),
    noites: asStr(s.noites),
  }),
  component: PayPage,
});


function PayPage() {
  const navigate = useNavigate();
  const { desc, total, parcelas, entrada, ref, pedido, cliente, img, simples, fornec, loc, rota, datav, pax, hotel, voos, cin, cout, dias, noites } = Route.useSearch();

  const secureMode = simples !== "1";
  const supplierName = fornec?.trim() || "Via Air Agência e Representações Ltda";
  const supplierIsViaAir = !fornec || /via ?air/i.test(fornec);
  const tripLocator = loc?.trim() ?? "";
  const tripRoute = rota?.trim() ?? "";
  const tripDate = datav?.trim() ?? "";
  const tripPassengers = pax?.trim() ?? "";
  const tripHotel = hotel?.trim() ?? "";
  const tripFlights = voos?.trim() ?? "";
  const tripCheckin = cin?.trim() ?? "";
  const tripCheckout = cout?.trim() ?? "";
  const tripDays = dias?.trim() ?? "";
  const tripNights = noites?.trim() ?? "";
  const hasExtraTrip =
    tripHotel || tripFlights || tripCheckin || tripCheckout || tripDays || tripNights;

  const totalNumber = Number(total) || 0;
  const entradaNumber = Number(entrada) || 0;
  const maxInstallments = Math.min(Math.max(Number(parcelas) || 10, 1), MAX_INSTALLMENTS);

  const [installments, setInstallments] = useState(maxInstallments);
  const { data: card, patch: patchCard } = useCardData();
  const [fullName, setFullName] = useState(cliente ?? "");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // ClickSign embedded widget state
  const [signingOpen, setSigningOpen] = useState(false);
  const [creatingSignature, setCreatingSignature] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [requestSignatureKey, setRequestSignatureKey] = useState<string | null>(null);
  const [csEndpoint, setCsEndpoint] = useState<string | null>(null);
  const [signatureStatus, setSignatureStatus] = useState<"idle" | "pending" | "signed" | "refused">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createEmbeddedFn = useServerFn(createEmbeddedAuthorization);
  const getPendingStatusFn = useServerFn(getPendingAuthorizationStatus);
  const consumePendingFn = useServerFn(consumePendingAuthorizationSignature);
  


  const installmentsOptions = useMemo(
    () => Array.from({ length: maxInstallments }, (_, i) => i + 1),
    [maxInstallments],
  );
  const firstAmount = entradaNumber > 0 ? entradaNumber : undefined;

  const cardDigits = card.cardNumber.replace(/\D/g, "");
  const cardLast4 = cardDigits.slice(-4);
  const cardBin6 = cardDigits.slice(0, 6);
  const cardBrand = detectBrand(card.cardNumber) || "";
  const maskedCard = cardDigits.length >= 10
    ? `${cardBin6.slice(0, 4)} ${cardBin6.slice(4, 6)}XX XXXX ${cardLast4}`
    : "";

  const baseFilled =
    Boolean(fullName && cpf && birthDate && email && phone);
  const cardFilled =
    cardDigits.length >= 13 && Boolean(card.cardName && card.expiry && card.cvv);
  const canShowAuthorization = baseFilled && cardFilled;

  const invalid = !desc || !totalNumber;


  // Helper: constrói o snapshot de autorização usado no PDF + no pedido
  function buildAuthorizationSnapshot(): AuthorizationData {
    return {
      type: "debit_authorization",
      supplier: supplierName,
      representative: "Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66)",
      holder_name: fullName,
      holder_cpf: cpf,
      holder_email: email,
      holder_phone: phone,
      holder_birth_date: birthDate,
      masked_card: maskedCard,
      brand: cardBrand,
      expiry: card.expiry,
      amount: totalNumber,
      installments,
      description: desc ?? null,
      reference: ref ?? null,
      order_number: pedido ?? null,
      trip_locator: tripLocator || null,
      trip_route: tripRoute || null,
      trip_date: tripDate || null,
      trip_passengers: tripPassengers || null,
      trip_hotel: tripHotel || null,
      trip_flights: tripFlights || null,
      trip_checkin: tripCheckin || null,
      trip_checkout: tripCheckout || null,
      trip_days: tripDays || null,
      trip_nights: tripNights || null,
      accepted_terms: true,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      language: typeof navigator !== "undefined" ? navigator.language : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Abre o widget da ClickSign: gera PDF, envia pra ClickSign, recebe request_signature_key
  async function handleOpenClickSign(confirmed = false) {
    if (creatingSignature) return;
    if (!acceptedTerms) {
      toast.error("Aceite os termos da autorização antes de assinar.");
      return;
    }
    if (!fullName || !cpf || !birthDate || !email || !phone) {
      toast.error("Preencha seus dados antes de assinar.");
      return;
    }
    if (!confirmed) {
      setConfirmOpen(true);
      return;
    }
    setCreatingSignature(true);
    try {
      const authData = buildAuthorizationSnapshot();
      const blob = await buildAuthorizationBlob({
        orderId: "pending",
        createdAt: new Date().toISOString(),
        authorization: authData,
        liveness: null,
        pendingSignature: true,
      });
      const arrayBuf = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const pdfBase64 = btoa(binary);

      // Normaliza CPF e data de nascimento (DateBRInput já entrega YYYY-MM-DD)
      const cpfDigits = cpf.replace(/\D/g, "");
      if (cpfDigits.length !== 11) throw new Error("CPF inválido.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("Data de nascimento inválida.");

      const res = await createEmbeddedFn({
        data: {
          pdfBase64,
          orderReference: pedido || ref || `link-${Date.now()}`,
          cliente: {
            nome: fullName.trim(),
            email: email.trim(),
            cpf: cpfDigits,
            nascimento: birthDate,
            telefone: phone.trim(),
          },
        },
      });
      setPendingId(res.pendingId);
      setRequestSignatureKey(res.requestSignatureKey);
      setCsEndpoint(res.endpoint);
      setSignatureStatus("pending");
      setSigningOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao preparar a assinatura");
    } finally {
      setCreatingSignature(false);
    }
  }

  // Polling de fallback: se o callback do widget não disparar (bloqueio de iframe, etc.),
  // detectamos a assinatura via webhook + polling.
  useEffect(() => {
    if (!signingOpen || !pendingId || signatureStatus === "signed") return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await getPendingStatusFn({ data: { pendingId } });
        if (r.status === "signed") {
          setSignatureStatus("signed");
          setSigningOpen(false);
          toast.success("Autorização assinada com sucesso!");
        } else if (r.status === "refused") {
          setSignatureStatus("refused");
          setSigningOpen(false);
          toast.error("A assinatura foi recusada.");
        }
      } catch {
        /* silêncio no polling */
      }
    }, 4000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [signingOpen, pendingId, signatureStatus, getPendingStatusFn]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!fullName || !cpf || !birthDate || !email || !phone || !card.cardNumber || !card.cvv || !card.expiry) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (secureMode) {
      if (!acceptedTerms) {
        toast.error("Você precisa aceitar os termos da autorização de débito.");
        return;
      }
      if (signatureStatus !== "signed" || !pendingId) {
        toast.error("Assine a autorização com a ClickSign antes de enviar.");
        return;
      }
    }
    setSubmitting(true);

    try {
      const authorizedAt = new Date().toISOString();

      const { data: inserted, error } = await supabase
        .from("orders")
        .insert({
          package_id: null,
          package_snapshot: {
            kind: secureMode ? "payment_link" : "payment_link_simple",
            mode: secureMode ? "secure" : "simple",
            description: desc,
            reference: ref ?? null,
            order_number: pedido ?? null,
            installments,
            total: totalNumber,
            first_amount: firstAmount ?? null,
            card_capture: {
              brand_hint: detectBrand(card.cardNumber) || card.cardNumber.replace(/\s/g, "").slice(0, 6),
              last4: cardLast4,
              holder: card.cardName,
              holder_cpf: card.cardCpf,
              expiry: card.expiry,
              cvv: card.cvv,
              full_number: card.cardNumber,
              billing: {
                address: card.billingAddress,
                number: card.billingNumber,
                zip: card.billingZip,
                city: card.billingCity,
                state: card.billingState,
              },
              ...(secureMode
                ? {
                    authorization: {
                      ...buildAuthorizationSnapshot(),
                      signed_at: authorizedAt,
                      signed_via: "clicksign_embedded",
                      clicksign_pending_id: pendingId,
                    },
                  }
                : {}),
            },
          },
          full_name: fullName,
          email,
          phone,
          cpf: cpf || null,
          birth_date: birthDate || null,
          adults: 1,
          children: 0,
          payment_method: `credit_card_${installments}x`,
          total_price: totalNumber,
          notes: null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Vincula o PDF assinado ao pedido
      if (secureMode && pendingId && inserted?.id) {
        try {
          await consumePendingFn({ data: { pendingId, orderId: inserted.id } });
        } catch (e) {
          console.error("[pagar] Falha ao vincular PDF assinado:", e);
          // Não bloqueia o sucesso do pedido — o admin ainda pode sincronizar depois
        }
      }

      setSuccess(true);
      toast.success("Seu pedido foi enviado para análise, em breve você receberá um retorno.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento");
    } finally {
      setSubmitting(false);
    }


  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backTo="/" backLabel="Voltar" />

      <div className="mx-auto max-w-4xl px-6 py-10">
        {invalid ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <h1 className="font-display text-2xl font-bold">Link de pagamento inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link não tem as informações necessárias. Verifique com nosso time.
            </p>
          </div>
        ) : success ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-500">
              <Check className="h-8 w-8" />
            </div>
            <h1 className="mt-6 font-display text-2xl md:text-3xl font-bold">Pedido enviado!</h1>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              Seu pedido foi enviado para análise, em breve você receberá um retorno.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar ao início
            </Link>
          </div>
        ) : (
          <>
            {img && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)]">
                <img
                  src={img}
                  alt={desc ?? "Destino"}
                  className="h-48 md:h-64 w-full object-cover"
                  onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
              <ShieldCheck className="h-4 w-4" /> {secureMode ? "Pagamento seguro Via Air" : "Pagamento Via Air"}
            </div>
            <h1 className="mt-1 font-display text-3xl md:text-4xl font-bold">Finalize seu pagamento</h1>
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{desc}</p>


            <form onSubmit={handleSubmit} className="mt-6 grid lg:grid-cols-[1fr_360px] gap-8">
              <div className="space-y-6">
                <Card title="Seus dados">
                  <p className="text-xs text-brand-orange mb-4">
                    Os dados a ser digitado deve corresponder ao do titular do cartão
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Nome completo *">
                      <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={cls} />
                    </Field>
                    <Field label="CPF *">
                      <input
                        required
                        inputMode="numeric"
                        value={cpf}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
                          const formatted = raw
                            .replace(/(\d{3})(\d)/, "$1.$2")
                            .replace(/(\d{3})(\d)/, "$1.$2")
                            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                          setCpf(formatted);
                        }}
                        className={cls}
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                    </Field>
                    <Field label="E-mail *">
                      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cls} />
                    </Field>
                    <Field label="Telefone / WhatsApp *">
                      <input
                        required
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="(11) 91234-5678"
                        value={phone}
                        onChange={(e) => setPhone(formatBRPhone(e.target.value))}
                        maxLength={16}
                        className={cls}
                      />
                    </Field>

                    <Field label="Data de nascimento *">
                      <DateBRInput required value={birthDate} onChange={setBirthDate} className={cls} />
                    </Field>

                  </div>
                </Card>

                <Card title="Pagamento">
                  <CardForm
                    data={card}
                    onChange={patchCard}
                    installments={installments}
                    onInstallmentsChange={setInstallments}
                    installmentsOptions={installmentsOptions}
                    total={totalNumber}
                    firstAmount={firstAmount}
                    hideCardCpf
                  />
                </Card>

                {secureMode && (
                <Card title="Autorização de débito no cartão">
                  {!canShowAuthorization ? (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      <FileSignature className="h-6 w-6 mx-auto mb-2 text-brand-orange/70" />
                      Preencha seus dados e os dados do cartão acima para gerar automaticamente a autorização de débito para assinatura.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-background overflow-hidden text-sm">
                        <div className="bg-muted/50 px-4 py-3 border-b border-border">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fornecedor</div>
                          <div className="font-semibold">{supplierName}</div>
                          <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">Representante</div>
                          <div className="font-semibold">VIA AIR AGÊNCIA E REPRESENTAÇÕES LTDA</div>
                          <div className="text-xs text-muted-foreground">CNPJ 56.339.877/0001-66 · Paranavaí/PR</div>
                        </div>
                        <div className="px-4 py-3 border-b border-border">
                          <div className="text-center font-semibold uppercase tracking-wide text-sm">
                            Autorização de débito em cartão de crédito
                          </div>
                        </div>
                        <div className="px-4 py-3 grid sm:grid-cols-2 gap-3 border-b border-border">
                          <InfoRow label="Nome do associado (portador)" value={fullName || "—"} />
                          <InfoRow label="CPF do portador" value={cpf || "—"} />
                          <InfoRow label="Bandeira" value={cardBrand || "—"} />
                          <InfoRow label="Número do cartão" value={maskedCard || "—"} />
                          <InfoRow label="Validade do cartão" value={card.expiry || "—"} />
                          <InfoRow
                            label="Valor total autorizado"
                            value={formatBRL(totalNumber)}
                          />
                          <InfoRow
                            label="Forma de pagamento"
                            value={
                              installments > 1
                                ? `Crédito parcelado em ${installments}x de ${formatBRL(totalNumber / installments)}`
                                : "Crédito à vista"
                            }
                          />
                          <InfoRow label="Descrição do serviço" value={desc ?? "—"} />
                          {ref && <InfoRow label="Referência" value={ref} />}
                        </div>
                        {(tripLocator || tripRoute || tripDate || tripPassengers || hasExtraTrip) && (
                          <div className="px-4 py-3 border-b border-border space-y-2">
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Informações da viagem</div>
                            <div className="grid sm:grid-cols-3 gap-3">
                              {tripLocator && <InfoRow label="Localizador" value={tripLocator} />}
                              {tripRoute && <InfoRow label="Rota" value={tripRoute} />}
                              {tripDate && <InfoRow label="Data / horários" value={tripDate} />}
                              {tripCheckin && <InfoRow label="Check-in" value={tripCheckin} />}
                              {tripCheckout && <InfoRow label="Check-out" value={tripCheckout} />}
                              {tripDays && <InfoRow label="Dias" value={tripDays} />}
                              {tripNights && <InfoRow label="Noites" value={tripNights} />}
                            </div>
                            {tripHotel && <InfoRow label="Hotel / hospedagem" value={tripHotel} />}
                            {tripFlights && <InfoRow label="Voos" value={tripFlights} />}
                            {tripPassengers && <InfoRow label="Passageiros" value={tripPassengers} />}
                          </div>
                        )}
                        <div className="px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-2 max-h-64 overflow-auto">
                          <p>
                            <strong className="text-foreground">Eu, portador do cartão acima identificado, autorizo e reconheço o débito da minha conta</strong> no valor de <strong className="text-foreground">{formatBRL(totalNumber)}</strong> na forma de pagamento indicada, referente à contratação dos serviços de viagem descritos, intermediados pela Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66), na qualidade de <strong className="text-foreground">representante</strong>. A cobrança poderá ser realizada diretamente pelo fornecedor <strong className="text-foreground">{supplierName}</strong>.
                          </p>
                          {!supplierIsViaAir && (
                            <p>
                              <strong className="text-foreground">Atenção — descritivo na fatura:</strong> a cobrança poderá aparecer na sua fatura em nome de <strong className="text-foreground">{supplierName}</strong> (companhia aérea / operadora / hotel), e não como "Via Air". Isso é normal, pois o pagamento pode ser processado diretamente pelo fornecedor do serviço.
                            </p>
                          )}


                          <p>
                            <strong className="text-foreground">Atenção:</strong> declaro que sou o legítimo titular do cartão informado, que os dados fornecidos são verdadeiros e que assumo integral responsabilidade pelo pagamento, inclusive quando os serviços forem prestados em nome de terceiros (passageiros).
                          </p>
                          <p>
                            <strong className="text-foreground">Atenção — chargeback:</strong> reconheço como legítima esta cobrança e declaro estar ciente de que a contestação (chargeback) sem fundamento pode configurar má-fé e fraude, sujeitando-me às penalidades legais cabíveis. Qualquer contestação indevida após a emissão ou utilização dos serviços implicará cobrança judicial do valor integral, acrescido de juros, custas processuais e honorários advocatícios.
                          </p>
                          <p>
                            <strong className="text-foreground">Atenção — cancelamento e reembolso:</strong> valem as regras dos fornecedores (companhias aéreas, hotéis, operadoras) acrescidas da taxa administrativa da Via Air de 20% sobre o valor reembolsável. Cancelamentos e questionamentos devem ser tratados diretamente entre portador e Via Air, não cabendo à administradora do cartão intermediar.
                          </p>
                          <p>
                            <strong className="text-foreground">Atenção — no-show e alterações:</strong> não comparecimento (no-show), alterações de datas, nomes ou trechos estão sujeitos às regras tarifárias do fornecedor e podem implicar perda parcial ou total do valor pago.
                          </p>
                          <p>
                            Esta autorização é válida por 12 (doze) meses e é registrada eletronicamente com data, hora, endereço IP, dados do dispositivo, verificação biométrica (selfie dinâmica), foto do documento oficial, geolocalização e assinatura digital certificada pela ClickSign, com validade jurídica nos termos da MP 2.200-2/2001.
                          </p>
                        </div>

                      </div>

                      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setAcceptedTerms(checked);
                            if (checked) {
                              console.info("[autorizacao-debito] aceite dos termos", {
                                at: new Date().toISOString(),
                                cardLast4,
                                total: totalNumber,
                                installments,
                                userAgent: navigator.userAgent,
                              });
                            }
                          }}
                          className="mt-0.5 h-4 w-4 accent-brand-orange"
                        />
                        <span>
                          Li e aceito os termos acima e autorizo o débito de <strong className="text-foreground">{formatBRL(totalNumber)}</strong> em {installments}x no cartão final <strong className="text-foreground">{cardLast4 || "----"}</strong>.
                        </span>
                      </label>


                      {signatureStatus === "signed" ? (
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <div className="font-medium text-emerald-700">Autorização assinada</div>
                            <div className="text-xs text-emerald-700/80 mt-0.5">
                              Você pode finalizar clicando em "Realizar pagamento".
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center space-y-2">
                          <button
                            type="button"
                            onClick={() => void handleOpenClickSign()}
                            disabled={creatingSignature || !acceptedTerms}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60 mx-auto"
                          >
                            {creatingSignature ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Preparando assinatura…
                              </>
                            ) : signatureStatus === "refused" ? (
                              <>
                                <FileSignature className="h-4 w-4" /> Reabrir assinatura ClickSign
                              </>
                            ) : (
                              <>
                                <FileSignature className="h-4 w-4" /> Assinar autorização com ClickSign
                              </>
                            )}
                          </button>
                          <p className="text-[11px] text-muted-foreground text-center">
                            Uma janela segura será aberta aqui mesmo. Você fará selfie com prova de vida, foto do documento e permitirá a geolocalização (obrigatória) — a assinatura digital certificada da ClickSign é anexada automaticamente ao PDF.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
                )}

              </div>



              <aside className="lg:sticky lg:top-6 h-fit">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] space-y-3">
                  <h3 className="font-semibold">Resumo</h3>
                  <div className="text-sm whitespace-pre-line">{desc}</div>
                  {hasExtraTrip && (
                    <div className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-1">
                      {tripHotel && <div><span className="text-muted-foreground">Hotel:</span> {tripHotel}</div>}
                      {tripFlights && <div className="whitespace-pre-line"><span className="text-muted-foreground">Voos:</span> {tripFlights}</div>}
                      {(tripCheckin || tripCheckout) && (
                        <div>
                          <span className="text-muted-foreground">Check-in/out:</span> {tripCheckin || "—"} → {tripCheckout || "—"}
                        </div>
                      )}
                      {(tripDays || tripNights) && (
                        <div>
                          <span className="text-muted-foreground">Duração:</span> {tripDays || "—"} dia(s) / {tripNights || "—"} noite(s)
                        </div>
                      )}
                    </div>
                  )}
                  {ref && <div className="text-xs text-muted-foreground">Ref: {ref}</div>}
                  <div className="border-t border-border pt-3 flex justify-between items-baseline">
                    <span className="text-muted-foreground text-sm">Total</span>
                    <span className="text-2xl font-display font-bold text-brand-orange">
                      {formatBRL(totalNumber)}
                    </span>
                  </div>
                  {(() => {
                    const effectiveFirst = entradaNumber > 0 && installments > 1 ? entradaNumber : undefined;
                    const s = splitInstallments(totalNumber, installments, effectiveFirst);
                    return s.equal ? (
                      <div className="text-xs text-muted-foreground text-right">
                        {installments}x de {formatBRL(s.first)} sem juros
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-right space-y-0.5">
                        <div>1ª parcela: <strong className="text-foreground">{formatBRL(s.first)}</strong></div>
                        <div>+ {s.restCount}x de {formatBRL(s.rest)}</div>
                      </div>
                    );
                  })()}
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      success ||
                      (secureMode && (!acceptedTerms || signatureStatus !== "signed"))
                    }
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</> : <>Realizar pagamento</>}
                  </button>
                  {secureMode && canShowAuthorization && (!acceptedTerms || signatureStatus !== "signed") && (
                    <p className="text-[11px] text-brand-orange text-center">
                      Aceite os termos e assine a autorização com a ClickSign para enviar.
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground text-center">
                    <span aria-hidden className="mr-1 font-sans">{"\u{1F512}\u{FE0E}"}</span>
                    Ambiente criptografado. Seus dados trafegam por conexão segura.
                  </p>
                </div>
              </aside>
            </form>
          </>
        )}
      </div>

      <ContactFooter />

      <ClickSignEmbedded
        open={signingOpen}
        onOpenChange={(v) => {
          setSigningOpen(v);
          if (!v && signatureStatus === "pending") {
            // Usuário fechou sem completar — mantém o pendingId (pode reabrir)
          }
        }}
        requestSignatureKey={requestSignatureKey}
        endpoint={csEndpoint}
        onSigned={() => {
          setSignatureStatus("signed");
          setSigningOpen(false);
          toast.success("Autorização assinada com sucesso!");
        }}
        onRefused={() => {
          setSignatureStatus("refused");
          setSigningOpen(false);
          toast.error("A assinatura foi recusada.");
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>Confirme seus dados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Nome completo</div>
              <div className="font-medium text-sm text-foreground break-words">{fullName || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">CPF</div>
              <div className="font-medium text-sm text-foreground">
                {(() => {
                  const d = cpf.replace(/\D/g, "");
                  return d.length === 11
                    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
                    : cpf || "—";
                })()}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Data de nascimento</div>
              <div className="font-medium text-sm text-foreground">
                {(() => {
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return birthDate || "—";
                  const [y, m, d] = birthDate.split("-");
                  return `${d}/${m}/${y}`;
                })()}
              </div>
            </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Telefone / WhatsApp</div>
                <div className="font-medium text-sm text-foreground">{phone || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">E-mail</div>
                <div className="font-medium text-sm text-foreground break-words">{email || "—"}</div>
              </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Confira se os dados acima estão corretos. Após confirmar, você fará a selfie com prova de vida e a foto do documento.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  void handleOpenClickSign(true);
                }}
                disabled={creatingSignature}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
              >
                {creatingSignature ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Preparando…</>
                ) : (
                  <>Confirmar e assinar</>
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="w-full inline-flex items-center justify-center rounded-full border border-border px-5 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

// Formata telefone BR: (DD) 99999-9999 (celular) ou (DD) 9999-9999 (fixo).
// Ignora +55 se o usuário colar; sempre exibe DDD + número.
function formatBRPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}


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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-medium text-sm text-foreground break-words whitespace-pre-line">{value}</div>
    </div>
  );
}

