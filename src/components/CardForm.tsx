import { useState, useMemo } from "react";
import { CreditCard as CardIcon } from "lucide-react";
import { formatBRL } from "@/lib/format";

// Detecção simples de bandeira por prefixo (BIN)
export function detectBrand(number: string): string {
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

export type CardData = {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
  billingAddress: string;
  billingNumber: string;
  billingZip: string;
  billingCity: string;
  billingState: string;
};

export const emptyCardData = (): CardData => ({
  cardNumber: "",
  cardName: "",
  expiry: "",
  cvv: "",
  billingAddress: "",
  billingNumber: "",
  billingZip: "",
  billingCity: "",
  billingState: "",
});

export function useCardData(initial?: Partial<CardData>) {
  const [data, setData] = useState<CardData>({ ...emptyCardData(), ...initial });
  const brand = useMemo(() => detectBrand(data.cardNumber), [data.cardNumber]);
  const patch = (p: Partial<CardData>) => setData((prev) => ({ ...prev, ...p }));
  const reset = () => setData(emptyCardData());
  return { data, setData, patch, reset, brand };
}

export function CardForm({
  data,
  onChange,
  installments,
  installmentsOptions,
  onInstallmentsChange,
  total,
}: {
  data: CardData;
  onChange: (p: Partial<CardData>) => void;
  installments: number;
  installmentsOptions: number[];
  onInstallmentsChange: (n: number) => void;
  total: number;
}) {
  const brand = detectBrand(data.cardNumber);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CardIcon className="h-4 w-4 text-brand-orange" /> Dados do cartão de crédito
      </div>

      <div className="grid sm:grid-cols-[1fr_120px] gap-4">
        <Field label="Número do cartão *">
          <div className="relative">
            <input
              required
              inputMode="numeric"
              value={data.cardNumber}
              onChange={(e) => onChange({ cardNumber: e.target.value.replace(/[^\d ]/g, "") })}
              className={`${cls} pr-24`}
              placeholder="0000 0000 0000 0000"
              maxLength={23}
              autoComplete="cc-number"
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
            required
            inputMode="numeric"
            value={data.cvv}
            onChange={(e) => onChange({ cvv: e.target.value.replace(/\D/g, "") })}
            className={cls}
            placeholder="•••"
            maxLength={4}
            autoComplete="cc-csc"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Validade (MM/AA) *">
          <input
            required
            value={data.expiry}
            onChange={(e) => onChange({ expiry: e.target.value })}
            className={cls}
            placeholder="12/29"
            maxLength={5}
            autoComplete="cc-exp"
          />
        </Field>
        <Field label="Nome como está no cartão *">
          <input
            required
            value={data.cardName}
            onChange={(e) => onChange({ cardName: e.target.value.toUpperCase() })}
            className={cls}
            placeholder="LUCAS S SILVA"
            autoComplete="cc-name"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Parcelas">
          <select
            value={installments}
            onChange={(e) => onInstallmentsChange(Number(e.target.value))}
            className={cls}
          >
            {installmentsOptions.map((n) => (
              <option key={n} value={n}>
                {n}x de {formatBRL(total / n)}
                {n <= 10 ? " sem juros" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="text-xs text-muted-foreground self-end pb-2">
          Até <strong>10x sem juros</strong>. 11x e 12x sob consulta.
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="text-xs text-muted-foreground mb-3">Endereço de cobrança (antifraude)</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CEP *">
            <input required value={data.billingZip} onChange={(e) => onChange({ billingZip: e.target.value })} className={cls} placeholder="00000-000" />
          </Field>
          <Field label="Endereço *">
            <input required value={data.billingAddress} onChange={(e) => onChange({ billingAddress: e.target.value })} className={cls} placeholder="Rua / Avenida" />
          </Field>
          <Field label="Número *">
            <input required value={data.billingNumber} onChange={(e) => onChange({ billingNumber: e.target.value })} className={cls} />
          </Field>
          <Field label="Cidade *">
            <input required value={data.billingCity} onChange={(e) => onChange({ billingCity: e.target.value })} className={cls} />
          </Field>
          <Field label="Estado *">
            <input required value={data.billingState} onChange={(e) => onChange({ billingState: e.target.value.toUpperCase() })} className={cls} maxLength={2} placeholder="PR" />
          </Field>
        </div>
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
