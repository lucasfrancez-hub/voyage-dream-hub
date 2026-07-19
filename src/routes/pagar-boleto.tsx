import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, ShieldCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, maskCPF } from "@/lib/format";
import { BoletoForm, emptyBoleto, validateBoleto } from "@/components/BoletoForm";
import { DateBRInput } from "@/components/DateBRInput";

import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";

type Search = {
  desc?: string;
  total?: string;
  ref?: string;
  pedido?: string;
  cliente?: string;
  img?: string;
};

const asStr = (v: unknown): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  return typeof v === "string" ? v : String(v);
};

export const Route = createFileRoute("/pagar-boleto")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    desc: asStr(s.desc),
    total: asStr(s.total),
    ref: asStr(s.ref),
    pedido: asStr(s.pedido),
    cliente: asStr(s.cliente),
    img: asStr(s.img),
  }),
  component: PayBoletoPage,
});


type Passenger = {
  full_name: string;
  cpf: string;
  birth_date: string;
  email: string;
  phone: string;
};

const emptyPassenger = (): Passenger => ({
  full_name: "",
  cpf: "",
  birth_date: "",
  email: "",
  phone: "",
});

function PayBoletoPage() {
  const { desc, total, ref, pedido, cliente, img } = Route.useSearch();
  const totalNumber = Number(total) || 0;
  const invalid = !desc || !totalNumber;

  const [passengers, setPassengers] = useState<Passenger[]>([
    { ...emptyPassenger(), full_name: cliente ?? "" },
  ]);
  const [boleto, setBoleto] = useState(emptyBoleto);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [installments, setInstallments] = useState(1);
  const MAX_BOLETO_INSTALLMENTS = 10;
  const installmentValue = totalNumber > 0 && installments > 0 ? totalNumber / installments : 0;

  const boletoCpfDigits = boleto.cpf.replace(/\D/g, "");
  const boletoNameNorm = boleto.full_name.trim().toLowerCase();
  const financierMatchesPassenger = passengers.some((p) => {
    const tCpf = p.cpf.replace(/\D/g, "");
    const tName = p.full_name.trim().toLowerCase();
    if (boletoCpfDigits.length >= 11 && tCpf.length >= 11) return tCpf === boletoCpfDigits;
    if (boletoNameNorm && tName) return tName === boletoNameNorm;
    return false;
  });
  const hasFinancierIdentity = boletoCpfDigits.length >= 11 || boletoNameNorm.length > 0;
  const isThirdPartyFinancier = hasFinancierIdentity && !financierMatchesPassenger;

  function updatePassenger(i: number, patch: Partial<Passenger>) {
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPassenger() {
    setPassengers((prev) => [...prev, emptyPassenger()]);
  }
  function removePassenger(i: number) {
    setPassengers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function patchBoleto(patch: Partial<typeof boleto>) {
    setBoleto((prev) => ({ ...prev, ...patch }));
  }

  const summary = useMemo(() => ({ desc, ref, total: totalNumber }), [desc, ref, totalNumber]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || invalid) return;

    const primary = passengers[0];
    if (!primary?.full_name || !primary?.email || !primary?.phone) {
      toast.error("Preencha nome, e-mail e telefone do passageiro 1 (responsável pela reserva).");
      return;
    }
    const missingName = passengers.findIndex((p) => !p.full_name.trim());
    if (missingName >= 0) {
      toast.error(`Preencha o nome completo do passageiro ${missingName + 1}.`);
      return;
    }
    const err = validateBoleto(boleto, isThirdPartyFinancier);
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("orders").insert({
        package_id: null,
        package_snapshot: {
          kind: "payment_link_boleto",
          description: desc,
          reference: ref ?? null,
          order_number: pedido ?? null,

          total: totalNumber,
          installments,
          installment_value: installmentValue,
          image_url: img ?? null,
          passengers: passengers.map((p, i) => ({
            index: i + 1,
            full_name: p.full_name,
            cpf: p.cpf || null,
            birth_date: p.birth_date || null,
            ...(i === 0 ? { email: p.email, phone: p.phone } : {}),
          })),
          boleto_capture: boleto,
        },
        full_name: primary.full_name,
        email: primary.email,
        phone: primary.phone,
        cpf: primary.cpf || null,
        birth_date: primary.birth_date || null,
        adults: passengers.length,
        children: 0,
        payment_method: installments > 1 ? `boleto_${installments}x` : "boleto",
        total_price: totalNumber,
        notes: notes || null,
      });
      if (error) throw error;
      setSuccess(true);
      toast.success("Solicitação enviada! Nosso time entra em contato pelo WhatsApp.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar solicitação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backTo="/" backLabel="Voltar" />
      <div className="mx-auto max-w-5xl px-6 py-10">
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
            <h1 className="mt-6 font-display text-2xl md:text-3xl font-bold">Solicitação enviada!</h1>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              Seus dados foram encaminhados para análise de crédito. Um consultor entra em contato pelo WhatsApp em breve.
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
                  alt={desc ?? "Imagem ilustrativa do destino da viagem"}
                  className="h-48 md:h-64 w-full object-cover"
                  onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
              <ShieldCheck className="h-4 w-4" /> Ficha de crédito Via Air
            </div>
            <h1 className="mt-1 font-display text-3xl md:text-4xl font-bold">
              Solicitação de <span className="text-brand-orange">boleto bancário</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{summary.desc}</p>

            <form onSubmit={handleSubmit} className="mt-6 grid lg:grid-cols-[1fr_360px] gap-8">
              <div className="space-y-6">
                <Card title="Passageiros">
                  <p className="text-xs text-muted-foreground mb-4">
                    Informe os dados de cada passageiro. Se o financiador for diferente dos passageiros, será solicitada a comprovação de vínculo mais abaixo.
                  </p>
                  <div className="space-y-4">
                    {passengers.map((p, i) => (
                      <div key={i} className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold">
                            {i === 0 ? "Passageiro 1 (responsável pela reserva)" : `Passageiro ${i + 1}`}
                          </h3>
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => removePassenger(i)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" /> remover
                            </button>
                          )}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <Field label="Nome completo *">
                            <input
                              required
                              value={p.full_name}
                              onChange={(e) => updatePassenger(i, { full_name: e.target.value })}
                              className={cls}
                              placeholder="Como no documento"
                              maxLength={120}
                            />
                          </Field>
                          <Field label="CPF">
                            <input
                              value={p.cpf}
                              onChange={(e) => updatePassenger(i, { cpf: maskCPF(e.target.value) })}
                              className={cls}
                              placeholder="000.000.000-00"
                              inputMode="numeric"
                              maxLength={14}
                            />
                          </Field>
                          <Field label="Data de nascimento">
                            <DateBRInput
                              value={p.birth_date}
                              onChange={(iso) => updatePassenger(i, { birth_date: iso })}
                              className={cls}
                            />
                          </Field>

                          {i === 0 && (
                            <>
                              <Field label="E-mail *">
                                <input
                                  required
                                  type="email"
                                  value={p.email}
                                  onChange={(e) => updatePassenger(i, { email: e.target.value })}
                                  className={cls}
                                  placeholder="voce@email.com"
                                />
                              </Field>
                              <Field label="Telefone / WhatsApp *">
                                <input
                                  required
                                  value={p.phone}
                                  onChange={(e) => updatePassenger(i, { phone: e.target.value })}
                                  className={cls}
                                  placeholder="(00) 00000-0000"
                                />
                              </Field>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addPassenger}
                      className="inline-flex items-center gap-2 rounded-full border border-dashed border-border px-4 py-2 text-xs hover:border-brand-orange transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar passageiro
                    </button>
                  </div>
                </Card>

                <Card title="Ficha do financiador (boleto)">
                  <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-4 text-xs text-muted-foreground leading-relaxed mb-5 space-y-2">
                    <p className="text-sm text-foreground font-semibold">
                      Parcelamos em até 10x sem juros no boleto.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Como funciona:</span> ao enviar, os dados são encaminhados para <span className="text-foreground font-semibold">análise de crédito</span>. A finalização não é concluída online — um consultor entra em contato pelo WhatsApp com o resultado.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Quem pode financiar:</span> um dos viajantes ou parente de primeiro grau (pai, mãe, irmão(ã), cônjuge). Em casos específicos, aceitamos avó(ô).
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Todos os campos abaixo são obrigatórios.</span>
                    </p>
                  </div>
                  <BoletoForm data={boleto} onChange={patchBoleto} isThirdParty={isThirdPartyFinancier} />
                </Card>

                <Card title="Observações (opcional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={`${cls} min-h-[100px]`}
                    placeholder="Alguma preferência, restrição alimentar, quarto especial…"
                    maxLength={2000}
                  />
                </Card>
              </div>

              <aside className="lg:sticky lg:top-6 h-fit">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] space-y-3">
                  <h3 className="font-semibold">Resumo</h3>
                  <div className="text-sm">{summary.desc}</div>
                  {summary.ref && <div className="text-xs text-muted-foreground">Ref: {summary.ref}</div>}
                  <div className="border-t border-border pt-3 flex justify-between items-baseline">
                    <span className="text-muted-foreground text-sm">Total</span>
                    <span className="text-2xl font-display font-bold text-brand-orange">
                      {formatBRL(summary.total)}
                    </span>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <label className="block">
                      <span className="block text-xs text-muted-foreground mb-1.5">
                        Parcelamento no boleto (sem juros)
                      </span>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className={cls}
                      >
                        {Array.from({ length: MAX_BOLETO_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x de {formatBRL(totalNumber / n)} sem juros
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      {installments === 1
                        ? "Pagamento em boleto único."
                        : `${installments} boletos mensais de ${formatBRL(installmentValue)}, sem juros.`}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || success}
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                      </>
                    ) : (
                      <>Enviar solicitação</>
                    )}
                  </button>
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
