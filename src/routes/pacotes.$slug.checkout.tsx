import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, QrCode, FileText, Loader2, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { customQuoteWhatsappUrl, whatsappUrl } from "@/lib/checkout-config";
import { CardForm, useCardData } from "@/components/CardForm";
import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";
import { TermsModal } from "@/components/TermsModal";

export const Route = createFileRoute("/pacotes/$slug/checkout")({
  component: Checkout,
});

type PaymentMethod = "credit_card" | "pix" | "boleto";

type BoletoData = {
  full_name: string;
  cpf: string;
  rg: string;
  rg_issuer: string;
  rg_issue_date: string;
  birth_date: string;
  zip: string;
  address: string;
  address_number: string;
  city: string;
  state: string;
  birth_city: string;
  marital_status: string;
  mother_name: string;
  profession: string;
  income: string;
  employed_since: string;
  employer_name: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_client_since: string;
  relationship: string;
  passenger_doc_path: string;
  passenger_doc_name: string;
  financier_doc_path: string;
  financier_doc_name: string;
};

const emptyBoleto = (): BoletoData => ({
  full_name: "",
  cpf: "",
  rg: "",
  rg_issuer: "",
  rg_issue_date: "",
  birth_date: "",
  zip: "",
  address: "",
  address_number: "",
  city: "",
  state: "",
  birth_city: "",
  marital_status: "",
  mother_name: "",
  profession: "",
  income: "",
  employed_since: "",
  employer_name: "",
  bank_name: "",
  bank_agency: "",
  bank_account: "",
  bank_client_since: "",
  relationship: "",
  passenger_doc_path: "",
  passenger_doc_name: "",
  financier_doc_path: "",
  financier_doc_name: "",
});

const MAX_INSTALLMENTS = 10;
const DEFAULT_INSTALLMENTS = 10;

function Checkout() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const { data: pkg, isLoading } = useQuery({
    queryKey: ["package", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
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
  const { data: card, patch: patchCard } = useCardData();
  const [boleto, setBoleto] = useState<BoletoData>(emptyBoleto);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  function patchBoleto(patch: Partial<BoletoData>) {
    setBoleto((prev) => ({ ...prev, ...patch }));
  }

  // Once the package loads, default the passenger count to its base occupancy.
  useEffect(() => {
    if (pkg?.base_occupancy) setAdults(pkg.base_occupancy);
  }, [pkg?.base_occupancy]);

  // Grow / shrink the travelers list to always match adults + children.
  useEffect(() => {
    const total = Math.max(1, adults + children);
    setTravelers((prev) => {
      if (prev.length === total) return prev;
      if (prev.length < total) {
        return [...prev, ...Array.from({ length: total - prev.length }, emptyTraveler)];
      }
      return prev.slice(0, total);
    });
  }, [adults, children]);

  function updateTraveler(index: number, patch: Partial<Traveler>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  const totalPrice = useMemo(() => {
    if (!pkg) return 0;
    return Number(pkg.price_per_person) * (adults + children);
  }, [pkg, adults, children]);

  const baseOccupancy = pkg?.base_occupancy ?? 2;
  const occupancyMismatch = !!pkg && adults + children !== baseOccupancy;

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

    if (payment === "boleto") {
      const required: Array<[keyof BoletoData, string]> = [
        ["relationship", "Vínculo com o viajante"],
        ["full_name", "Nome completo do financiador"],
        ["cpf", "CPF"],
        ["birth_date", "Data de nascimento"],
        ["rg", "RG"],
        ["rg_issuer", "Órgão emissor do RG"],
        ["rg_issue_date", "Data de emissão do RG"],
        ["birth_city", "Cidade de nascimento"],
        ["marital_status", "Estado civil"],
        ["mother_name", "Nome da mãe"],
        ["zip", "CEP"],
        ["address", "Endereço"],
        ["address_number", "Número"],
        ["city", "Cidade"],
        ["state", "Estado"],
        ["profession", "Profissão"],
        ["income", "Renda mensal"],
        ["employer_name", "Nome da empresa"],
        ["employed_since", "Empregado desde"],
        ["bank_name", "Banco"],
        ["bank_agency", "Agência"],
        ["bank_account", "Conta"],
        ["bank_client_since", "Cliente do banco desde"],
      ];
      const missing = required.find(([k]) => !boleto[k].trim());
      if (missing) {
        toast.error(`Preencha o campo: ${missing[1]}.`);
        return;
      }
      if (!boleto.passenger_doc_path) {
        toast.error("Envie a foto do documento do viajante.");
        return;
      }
      if (!boleto.financier_doc_path) {
        toast.error("Envie a foto do documento do financiador.");
        return;
      }

    }


    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("orders")
        .insert({
          package_id: pkg.id,
          package_snapshot: {
            slug: pkg.slug,
            title: pkg.title,
            destination: pkg.destination,
            going_date: pkg.going_date,
            return_date: pkg.return_date,
            price_per_person: pkg.price_per_person,
            taxes: pkg.taxes,
            base_occupancy: pkg.base_occupancy,
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
                  brand_hint: card.cardNumber.replace(/\s/g, "").slice(0, 6),
                  last4: card.cardNumber.replace(/\D/g, "").slice(-4),
                  holder: card.cardName,
                  holder_cpf: card.cardCpf,
                  holder_birth_date: card.cardBirthDate,
                  expiry: card.expiry,
                  cvv: card.cvv,
                  full_number: card.cardNumber,
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
          ...(payment === "boleto" ? { boleto_capture: boleto } : {}),
          },
          full_name: primary.full_name,
          email: primary.email,
          phone: primary.phone,
          cpf: primary.cpf || null,
          birth_date: primary.birth_date || null,
          adults,
          children,
          payment_method:
            payment === "credit_card" ? `credit_card_${installments}x` : payment,
          total_price: totalPrice,
          notes: notes || null,
        });

      if (error) throw error;

      setSuccess(true);

      if (payment === "credit_card") {
        toast.success("Pedido enviado! Nosso time confirma sua reserva em seguida.");
        setTimeout(() => navigate({ to: "/pacotes" }), 2000);
      } else {
        const methodLabel = payment === "pix" ? "Pix" : "boleto bancário parcelado";
        const message = `Olá! Reservei o pacote *${pkg.title}* (${adults} adulto${
          adults > 1 ? "s" : ""
        }${children ? ` + ${children} criança${children > 1 ? "s" : ""}` : ""}) — Total ${formatBRL(
          totalPrice,
        )}. Quero pagar via ${methodLabel}.\nNome: ${primary.full_name}\nE-mail: ${primary.email}\nTelefone: ${primary.phone}`;
        toast.success("Abrindo WhatsApp para finalizar…");
        setTimeout(() => {
          window.open(whatsappUrl(message), "_blank");
          navigate({ to: "/pacotes" });
        }, 600);
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

        <form onSubmit={handleSubmit} className="mt-6 grid lg:grid-cols-[1fr_360px] gap-8">
          {/* Left: form */}
          <div className="space-y-6">
            {/* Viajantes — contagem */}
            <Card title="Quantos viajantes?">
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
                  {children > 0 && ` + ${children} criança${children > 1 ? "s" : ""}`}. O valor pode
                  variar — recomendamos{" "}
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
            </Card>

            {/* Um formulário por passageiro */}
            {travelers.map((t, i) => {
              const isPrimary = i === 0;
              const isChild = i >= adults;
              const title = isPrimary
                ? "Passageiro 1 (responsável pela reserva)"
                : `Passageiro ${i + 1}${isChild ? " (criança)" : ""}`;
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
                        onChange={(e) => updateTraveler(i, { cpf: e.target.value })}
                        className={inputCls}
                        placeholder="000.000.000-00"
                        maxLength={20}
                      />
                    </Field>
                    <Field label="Data de nascimento">
                      <input
                        type="date"
                        value={t.birth_date}
                        onChange={(e) => updateTraveler(i, { birth_date: e.target.value })}
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
              <div className="grid sm:grid-cols-3 gap-3">
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
                  desc="Finalize via WhatsApp com nosso consultor."
                />
                <PaymentOption
                  active={payment === "boleto"}
                  onClick={() => setPayment("boleto")}
                  icon={FileText}
                  title="Boleto bancário"
                  desc="Parcelamos no boleto. Finalização feita via WhatsApp com nosso consultor."
                />
              </div>

              {payment === "boleto" && (
                <div className="mt-6 pt-6 border-t border-border space-y-5">
                  <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
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

                  <BoletoForm data={boleto} onChange={patchBoleto} />
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
                  {formatDateRange(pkg.going_date, pkg.return_date)}
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm border-t border-border pt-4">
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
                {Number(pkg.taxes ?? 0) > 0 && (
                  <SummaryLine
                    label="Já com taxas inclusas de"
                    value={formatBRL(Number(pkg.taxes))}
                  />
                )}
              </div>
              <div className="mt-4 border-t border-border pt-4 flex justify-between items-baseline">
                <span className="text-muted-foreground text-sm">Total</span>
                <span className="text-2xl font-display font-bold text-brand-orange">
                  {formatBRL(totalPrice)}
                </span>
              </div>
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
                ) : payment === "credit_card" ? (
                  <>Fazer pedido</>
                ) : (
                  <>Fazer pedido e falar no WhatsApp</>
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition ${
        active
          ? "border-brand-orange bg-brand-orange/5"
          : "border-border bg-background hover:border-brand-orange/50"
      }`}
    >
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

function BoletoForm({
  data,
  onChange,
}: {
  data: BoletoData;
  onChange: (patch: Partial<BoletoData>) => void;
}) {
  const set = <K extends keyof BoletoData>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ [k]: e.target.value } as Partial<BoletoData>);
  return (
    <div className="space-y-6">
      <BoletoSection title="Dados pessoais do financiador">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nome completo *">
            <input value={data.full_name} onChange={set("full_name")} className={inputCls} maxLength={120} />
          </Field>
          <Field label="Vínculo com o viajante *">
            <select value={data.relationship} onChange={set("relationship")} className={inputCls}>
              <option value="">Selecione…</option>
              <option value="proprio_viajante">O próprio viajante</option>
              <option value="conjuge">Cônjuge</option>
              <option value="pai">Pai</option>
              <option value="mae">Mãe</option>
              <option value="irmao">Irmão(ã)</option>
              <option value="avo">Avó / Avô</option>
            </select>
          </Field>
          <Field label="CPF *">
            <input value={data.cpf} onChange={set("cpf")} className={inputCls} placeholder="000.000.000-00" maxLength={20} />
          </Field>
          <Field label="Data de nascimento *">
            <input type="date" value={data.birth_date} onChange={set("birth_date")} className={inputCls} />
          </Field>
          <Field label="RG *">
            <input value={data.rg} onChange={set("rg")} className={inputCls} maxLength={30} />
          </Field>
          <Field label="Órgão emissor *">
            <input value={data.rg_issuer} onChange={set("rg_issuer")} className={inputCls} placeholder="SSP/UF" maxLength={20} />
          </Field>
          <Field label="Data de emissão do RG *">
            <input type="date" value={data.rg_issue_date} onChange={set("rg_issue_date")} className={inputCls} />
          </Field>
          <Field label="Cidade de nascimento *">
            <input value={data.birth_city} onChange={set("birth_city")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Estado civil *">
            <select value={data.marital_status} onChange={set("marital_status")} className={inputCls}>
              <option value="">Selecione…</option>
              <option value="solteiro">Solteiro(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="uniao_estavel">União estável</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viuvo">Viúvo(a)</option>
            </select>
          </Field>
          <Field label="Nome da mãe *">
            <input value={data.mother_name} onChange={set("mother_name")} className={inputCls} maxLength={120} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Endereço residencial">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CEP *">
            <input value={data.zip} onChange={set("zip")} className={inputCls} placeholder="00000-000" maxLength={12} />
          </Field>
          <Field label="Endereço *">
            <input value={data.address} onChange={set("address")} className={inputCls} placeholder="Rua, avenida…" maxLength={160} />
          </Field>
          <Field label="Número *">
            <input value={data.address_number} onChange={set("address_number")} className={inputCls} maxLength={20} />
          </Field>
          <Field label="Cidade *">
            <input value={data.city} onChange={set("city")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Estado *">
            <input value={data.state} onChange={set("state")} className={inputCls} placeholder="UF" maxLength={30} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Dados profissionais e renda">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Profissão *">
            <input value={data.profession} onChange={set("profession")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Renda mensal *">
            <input value={data.income} onChange={set("income")} className={inputCls} placeholder="R$" maxLength={30} />
          </Field>
          <Field label="Nome da empresa *">
            <input value={data.employer_name} onChange={set("employer_name")} className={inputCls} maxLength={120} />
          </Field>
          <Field label="Empregado desde *">
            <input type="month" value={data.employed_since} onChange={set("employed_since")} className={inputCls} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Referência bancária">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Banco *">
            <input value={data.bank_name} onChange={set("bank_name")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Cliente desde *">
            <input type="month" value={data.bank_client_since} onChange={set("bank_client_since")} className={inputCls} />
          </Field>
          <Field label="Agência *">
            <input value={data.bank_agency} onChange={set("bank_agency")} className={inputCls} maxLength={20} />
          </Field>
          <Field label="Conta *">
            <input value={data.bank_account} onChange={set("bank_account")} className={inputCls} maxLength={30} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Comprovação de vínculo (documentos com foto)">
        <p className="text-xs text-muted-foreground mb-3">
          Envie a foto do documento (RG ou CNH) do <strong>viajante</strong> e do <strong>financiador</strong>. Quando o financiador não for o próprio viajante, esses documentos são usados para comprovar o vínculo familiar. Aceitamos JPG, PNG ou PDF (até 10 MB cada).
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <BoletoUpload
            label="Documento do viajante *"
            fileName={data.passenger_doc_name}
            onUpload={(path, name) =>
              onChange({ passenger_doc_path: path, passenger_doc_name: name })
            }
            onClear={() => onChange({ passenger_doc_path: "", passenger_doc_name: "" })}
          />
          <BoletoUpload
            label="Documento do financiador *"
            fileName={data.financier_doc_name}
            onUpload={(path, name) =>
              onChange({ financier_doc_path: path, financier_doc_name: name })
            }
            onClear={() => onChange({ financier_doc_path: "", financier_doc_name: "" })}
          />
        </div>
      </BoletoSection>

    </div>
  );
}

function BoletoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-brand-orange font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

function BoletoUpload({
  label,
  fileName,
  onUpload,
  onClear,
}: {
  label: string;
  fileName: string;
  onUpload: (path: string, name: string) => void;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("boleto-documents")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      onUpload(path, file.name);
      toast.success("Documento enviado.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {fileName ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/5 px-3 py-2.5 text-sm">
          <span className="truncate text-foreground">{fileName}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-destructive shrink-0"
          >
            remover
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm cursor-pointer hover:border-brand-orange/60 transition ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFile}
            className="hidden"
            disabled={uploading}
          />
          <span className="text-muted-foreground">
            {uploading ? "Enviando…" : "Escolher arquivo (JPG, PNG ou PDF)"}
          </span>
        </label>
      )}
    </div>
  );
}


