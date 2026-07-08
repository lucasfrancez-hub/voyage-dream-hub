import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { CreditCard, ShieldAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { bitrixCheckoutUrl } from "@/lib/checkout-config";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/admin/cofre")({
  component: VaultPage,
});

// Detecção simples de bandeira por prefixo (BIN)
function detectBrand(number: string): string {
  const n = number.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(6011|65|64[4-9])/.test(n)) return "Discover";
  if (/^(38|30[0-5])/.test(n)) return "Diners";
  if (/^35/.test(n)) return "JCB";
  if (/^(50|5[6-8]|6[0-9])/.test(n) && n.length >= 6) return "Elo";
  if (/^(384|60)/.test(n)) return "Hipercard";
  return "";
}

const brandColors: Record<string, string> = {
  Visa: "bg-blue-600",
  Mastercard: "bg-red-500",
  Amex: "bg-sky-500",
  Discover: "bg-orange-500",
  Diners: "bg-slate-600",
  JCB: "bg-emerald-600",
  Elo: "bg-yellow-500",
  Hipercard: "bg-red-700",
};

type State = {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
  cpf: string;
  fullName: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  number: string;
  zip: string;
  city: string;
  state: string;
  total: string;
  installments: number;
  orderId: string;
};

const initial: State = {
  cardNumber: "",
  cardName: "",
  expiry: "",
  cvv: "",
  cpf: "",
  fullName: "",
  birthDate: "",
  phone: "",
  email: "",
  address: "",
  number: "",
  zip: "",
  city: "",
  state: "",
  total: "",
  installments: 10,
  orderId: "",
};

function VaultPage() {
  const [f, setF] = useState<State>(initial);
  const update = (patch: Partial<State>) => setF((prev) => ({ ...prev, ...patch }));
  const brand = detectBrand(f.cardNumber);
  const totalNumber = Number(f.total.replace(",", ".")) || 0;

  const bitrixUrl = useMemo(
    () =>
      totalNumber
        ? bitrixCheckoutUrl({
            installments: f.installments,
            total: totalNumber,
            orderId: f.orderId || undefined,
            packageTitle: f.fullName || undefined,
          })
        : "",
    [totalNumber, f.installments, f.orderId, f.fullName],
  );

  function handleProceed() {
    if (!bitrixUrl) {
      toast.error("Informe o valor total.");
      return;
    }
    // Copia os dados para clipboard para colar no cofre Bitrix (nada é salvo).
    const summary = `PAGAMENTO — ${formatBRL(totalNumber)} em ${f.installments}x
Cliente: ${f.fullName}  CPF: ${f.cpf}
Nasc.: ${f.birthDate}  Tel: ${f.phone}
E-mail: ${f.email}
End.: ${f.address}, ${f.number} — ${f.city}/${f.state} — CEP ${f.zip}
Bandeira: ${brand}  Nome no cartão: ${f.cardName}
Cartão: ${f.cardNumber}  Val: ${f.expiry}  CVV: ${f.cvv}`;
    try {
      navigator.clipboard.writeText(summary);
      toast.success("Dados copiados. Cole no cofre Bitrix.");
    } catch {}
    window.open(bitrixUrl, "_blank");
    // Limpa dados sensíveis imediatamente
    setTimeout(() => setF((p) => ({ ...p, cardNumber: "", cvv: "" })), 500);
  }

  function handleClear() {
    setF(initial);
    toast.success("Formulário limpo");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
        <CreditCard className="h-4 w-4" /> Cofre de pagamento
      </div>
      <h1 className="mt-1 font-display text-3xl font-bold">Formulário de pagamento seguro</h1>

      <div className="mt-4 rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 text-xs text-yellow-200/90 flex gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-yellow-500" />
        <div>
          <strong className="text-yellow-400">Aviso PCI-DSS:</strong> este formulário é
          <strong> não-persistente</strong> — nenhum dado de cartão é enviado ao nosso banco de dados
          nem trafega por servidores da Via Air. Os campos servem apenas como auxílio para o
          operador digitar no cofre certificado do Bitrix24. Ao clicar em <em>Prosseguir</em>, os
          dados são copiados para sua área de transferência e o cofre Bitrix é aberto em nova aba.
          Feche esta aba imediatamente após o uso.
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Card + billing */}
        <div className="space-y-6">
          <Card title="Dados do cartão">
            <div className="grid sm:grid-cols-[1fr_120px] gap-4 items-end">
              <Field label="Número do cartão *">
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={f.cardNumber}
                    onChange={(e) => update({ cardNumber: e.target.value.replace(/[^\d ]/g, "") })}
                    className={`${inputCls} pr-24`}
                    placeholder="0000 0000 0000 0000"
                    maxLength={23}
                    autoComplete="off"
                  />
                  {brand && (
                    <span
                      className={`absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-bold text-white ${brandColors[brand] ?? "bg-neutral-600"}`}
                    >
                      {brand}
                    </span>
                  )}
                </div>
              </Field>
              <Field label="CVV *">
                <input
                  inputMode="numeric"
                  value={f.cvv}
                  onChange={(e) => update({ cvv: e.target.value.replace(/\D/g, "") })}
                  className={inputCls}
                  placeholder="•••"
                  maxLength={4}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <Field label="Validade (MM/AA) *">
                <input
                  value={f.expiry}
                  onChange={(e) => update({ expiry: e.target.value })}
                  className={inputCls}
                  placeholder="12/29"
                  maxLength={5}
                />
              </Field>
              <Field label="Nome como está no cartão *">
                <input
                  value={f.cardName}
                  onChange={(e) => update({ cardName: e.target.value.toUpperCase() })}
                  className={inputCls}
                  placeholder="LUCAS S SILVA"
                  autoComplete="off"
                />
              </Field>
            </div>
          </Card>

          <Card title="Endereço de cobrança (antifraude)">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome completo *">
                <input value={f.fullName} onChange={(e) => update({ fullName: e.target.value })} className={inputCls} />
              </Field>
              <Field label="CPF *">
                <input value={f.cpf} onChange={(e) => update({ cpf: e.target.value })} className={inputCls} placeholder="000.000.000-00" />
              </Field>
              <Field label="Data de nascimento *">
                <input type="date" value={f.birthDate} onChange={(e) => update({ birthDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Telefone *">
                <input value={f.phone} onChange={(e) => update({ phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="E-mail *">
                <input type="email" value={f.email} onChange={(e) => update({ email: e.target.value })} className={inputCls} />
              </Field>
              <Field label="CEP *">
                <input value={f.zip} onChange={(e) => update({ zip: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Endereço *">
                <input value={f.address} onChange={(e) => update({ address: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Número *">
                <input value={f.number} onChange={(e) => update({ number: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Cidade *">
                <input value={f.city} onChange={(e) => update({ city: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Estado *">
                <input value={f.state} onChange={(e) => update({ state: e.target.value })} className={inputCls} maxLength={2} placeholder="PR" />
              </Field>
            </div>
          </Card>
        </div>

        {/* Summary */}
        <aside className="rounded-2xl border border-border bg-card p-6 space-y-4 lg:sticky lg:top-24 h-fit">
          <h2 className="font-semibold">Cobrança</h2>
          <Field label="Valor total (R$) *">
            <input
              inputMode="decimal"
              value={f.total}
              onChange={(e) => update({ total: e.target.value })}
              className={inputCls}
              placeholder="4999.90"
            />
          </Field>
          <Field label="Parcelas">
            <select
              value={f.installments}
              onChange={(e) => update({ installments: Number(e.target.value) })}
              className={inputCls}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x{n <= 10 ? " sem juros" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ID do pedido">
            <input value={f.orderId} onChange={(e) => update({ orderId: e.target.value })} className={inputCls} />
          </Field>

          <div className="pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-3xl font-display font-bold text-brand-orange">
              {totalNumber ? formatBRL(totalNumber) : "R$ —"}
            </div>
            {totalNumber > 0 && (
              <div className="text-xs text-muted-foreground">
                {f.installments}x de {formatBRL(totalNumber / f.installments)}
              </div>
            )}
          </div>

          <button
            onClick={handleProceed}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
          >
            <ExternalLink className="h-4 w-4" /> Prosseguir no cofre Bitrix
          </button>
          <button
            onClick={handleClear}
            className="w-full rounded-full border border-border px-5 py-2 text-xs text-muted-foreground hover:border-red-500 hover:text-red-500 transition"
          >
            Limpar tudo
          </button>
        </aside>
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
