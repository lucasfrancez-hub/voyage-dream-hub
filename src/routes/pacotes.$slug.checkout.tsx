import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CreditCard, QrCode, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { BITRIX_CHECKOUT_URL, whatsappUrl } from "@/lib/checkout-config";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/pacotes/$slug/checkout")({
  component: Checkout,
});

type PaymentMethod = "credit_card" | "pix";

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

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>("credit_card");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const totalPrice = useMemo(() => {
    if (!pkg) return 0;
    const per = Number(pkg.price_per_person) + Number(pkg.taxes ?? 0);
    return per * adults + per * 0.7 * children;
  }, [pkg, adults, children]);

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

    if (!fullName || !email || !phone) {
      toast.error("Preencha nome, e-mail e telefone.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("orders").insert({
        package_id: pkg.id,
        package_snapshot: {
          slug: pkg.slug,
          title: pkg.title,
          destination: pkg.destination,
          going_date: pkg.going_date,
          return_date: pkg.return_date,
          price_per_person: pkg.price_per_person,
          taxes: pkg.taxes,
        },
        full_name: fullName,
        email,
        phone,
        cpf: cpf || null,
        birth_date: birthDate || null,
        adults,
        children,
        payment_method: payment,
        total_price: totalPrice,
        notes: notes || null,
      });

      if (error) throw error;

      setSuccess(true);

      if (payment === "credit_card") {
        toast.success("Redirecionando para o pagamento no cartão…");
        setTimeout(() => {
          window.location.href = BITRIX_CHECKOUT_URL;
        }, 1200);
      } else {
        const message = `Olá! Reservei o pacote *${pkg.title}* (${adults} adulto${
          adults > 1 ? "s" : ""
        }${children ? ` + ${children} criança${children > 1 ? "s" : ""}` : ""}) — Total ${formatBRL(
          totalPrice,
        )}. Quero pagar via Pix.\nNome: ${fullName}\nE-mail: ${email}\nTelefone: ${phone}`;
        toast.success("Abrindo WhatsApp para finalizar o Pix…");
        setTimeout(() => {
          window.open(whatsappUrl(message), "_blank");
          navigate({ to: "/pacotes" });
        }, 800);
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
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
          </Link>
          <Link
            to="/pacotes/$slug"
            params={{ slug }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-orange"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao pacote
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-3xl md:text-4xl font-bold">Falta pouco para concluir sua reserva</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Preencha seus dados e escolha a forma de pagamento. Nosso time confirma sua reserva em seguida.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid lg:grid-cols-[1fr_360px] gap-8">
          {/* Left: form */}
          <div className="space-y-6">
            {/* Passageiro principal */}
            <Card title="Passageiro principal">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nome completo *">
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputCls}
                    placeholder="Como no documento"
                    maxLength={120}
                  />
                </Field>
                <Field label="CPF">
                  <input
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className={inputCls}
                    placeholder="000.000.000-00"
                    maxLength={20}
                  />
                </Field>
                <Field label="E-mail *">
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="voce@email.com"
                    maxLength={160}
                  />
                </Field>
                <Field label="Telefone / WhatsApp *">
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputCls}
                    placeholder="(00) 00000-0000"
                    maxLength={30}
                  />
                </Field>
                <Field label="Data de nascimento">
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </Card>

            {/* Viajantes */}
            <Card title="Viajantes">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Adultos">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={adults}
                    onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Crianças (0-11)">
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
                Crianças com 30% de desconto sobre o valor por pessoa.
              </p>
            </Card>

            {/* Pagamento */}
            <Card title="Pagamento">
              <p className="text-sm text-muted-foreground mb-4">Como prefere pagar?</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <PaymentOption
                  active={payment === "credit_card"}
                  onClick={() => setPayment("credit_card")}
                  icon={CreditCard}
                  title="Cartão de crédito"
                  desc="Parcele em até 12x sem juros no ambiente seguro do cofre."
                />
                <PaymentOption
                  active={payment === "pix"}
                  onClick={() => setPayment("pix")}
                  icon={QrCode}
                  title="Pix"
                  desc="Finalize via WhatsApp com nosso consultor."
                />
              </div>
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
                <SummaryLine label={`Adultos × ${adults}`} value={formatBRL(Number(pkg.price_per_person) * adults)} />
                {children > 0 && (
                  <SummaryLine
                    label={`Crianças × ${children}`}
                    value={formatBRL(Number(pkg.price_per_person) * 0.7 * children)}
                  />
                )}
                {Number(pkg.taxes ?? 0) > 0 && (
                  <SummaryLine
                    label={`Taxas × ${adults + children}`}
                    value={formatBRL(Number(pkg.taxes) * (adults + children))}
                  />
                )}
              </div>
              <div className="mt-4 border-t border-border pt-4 flex justify-between items-baseline">
                <span className="text-muted-foreground text-sm">Total</span>
                <span className="text-2xl font-display font-bold text-brand-orange">
                  {formatBRL(totalPrice)}
                </span>
              </div>

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
                  <>Finalizar e pagar no cartão</>
                ) : (
                  <>Finalizar reserva no WhatsApp</>
                )}
              </button>
              <p className="mt-3 text-[11px] text-muted-foreground text-center">
                Ao continuar você concorda com nossos termos e política de cancelamento.
              </p>
            </div>
          </aside>
        </form>
      </div>
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
