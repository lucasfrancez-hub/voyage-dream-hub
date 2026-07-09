import { useState, useMemo, useEffect } from "react";
import { CreditCard as CardIcon } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { splitInstallments } from "@/lib/checkout-config";
import { DateBRInput } from "@/components/DateBRInput";


export const CARD_BRANDS = [
  "Visa",
  "Mastercard",
  "Elo",
  "Amex",
  "Diners",
  "Hipercard",
] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

// Detecção simples de bandeira por prefixo (BIN)
export function detectBrand(number: string): CardBrand | "" {
  const n = number.replace(/\D/g, "");
  if (!n) return "";
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(38|30[0-5])/.test(n)) return "Diners";
  if (/^(50|5[6-8]|6[0-9])/.test(n) && n.length >= 6) return "Elo";
  if (/^(384|60)/.test(n)) return "Hipercard";
  return "";
}

// Logos "textuais" das bandeiras (aparência de badge oficial, sem uso de marca registrada).
function BrandLogo({ brand, active }: { brand: CardBrand; active: boolean }) {
  const base = "flex h-8 w-14 items-center justify-center rounded-md text-[10px] font-black tracking-tight";
  const dim = active ? "" : "opacity-60 grayscale";
  const cls = `${base} ${dim}`;
  switch (brand) {
    case "Visa":
      return <div className={`${cls} bg-white text-[#1a1f71]`}>VISA</div>;
    case "Mastercard":
      return (
        <div className={`${cls} bg-white relative overflow-hidden`}>
          <span className="absolute left-2 h-5 w-5 rounded-full bg-[#eb001b]" />
          <span className="absolute left-[26px] h-5 w-5 rounded-full bg-[#f79e1b] mix-blend-multiply" />
        </div>
      );
    case "Elo":
      return (
        <div className={`${cls} bg-black text-white`}>
          <span className="text-[#ffcb05]">e</span>
          <span className="text-[#ef4123]">l</span>
          <span className="text-white">o</span>
        </div>
      );
    case "Amex":
      return <div className={`${cls} bg-[#2e77bb] text-white text-[8px]`}>AMEX</div>;
    case "Diners":
      return <div className={`${cls} bg-white text-[#0079be] text-[8px]`}>DINERS</div>;
    case "Hipercard":
      return <div className={`${cls} bg-[#b3131b] text-white text-[8px]`}>HIPER</div>;
  }
}

export type CardData = {
  cardNumber: string;
  cardName: string;
  cardCpf: string;
  cardBirthDate: string;
  expiry: string;
  cvv: string;
  brand: CardBrand | "";
  billingAddress: string;
  billingNumber: string;
  billingZip: string;
  billingCity: string;
  billingState: string;
};

export const emptyCardData = (): CardData => ({
  cardNumber: "",
  cardName: "",
  cardCpf: "",
  cardBirthDate: "",
  expiry: "",
  cvv: "",
  brand: "",
  billingAddress: "",
  billingNumber: "",
  billingZip: "",
  billingCity: "",
  billingState: "",
});

export function useCardData(initial?: Partial<CardData>) {
  const [data, setData] = useState<CardData>({ ...emptyCardData(), ...initial });
  const brand = useMemo(() => detectBrand(data.cardNumber) || data.brand, [data.cardNumber, data.brand]);
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
  firstAmount,
  hideCardCpf,
}: {
  data: CardData;
  onChange: (p: Partial<CardData>) => void;
  installments: number;
  installmentsOptions: number[];
  onInstallmentsChange: (n: number) => void;
  total: number;
  firstAmount?: number;
  hideCardCpf?: boolean;
}) {
  const detected = detectBrand(data.cardNumber);
  const selectedBrand: CardBrand | "" = detected || data.brand;

  useEffect(() => {
    if (detected && detected !== data.brand) {
      onChange({ brand: detected });
    }
  }, [detected]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CardIcon className="h-4 w-4 text-brand-orange" /> Dados do cartão de crédito
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Bandeira do cartão *</div>
        <div className="flex flex-wrap gap-2">
          {CARD_BRANDS.map((b) => {
            const active = selectedBrand === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => onChange({ brand: b })}
                aria-pressed={active}
                title={b}
                className={`rounded-xl border p-1.5 transition ${active ? "border-brand-orange ring-2 ring-brand-orange/30 bg-brand-orange/5" : "border-border hover:border-brand-orange/50"}`}
              >
                <BrandLogo brand={b} active={active} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_120px] gap-4">
        <Field label="Número do cartão *">
          <input
            required
            inputMode="numeric"
            value={data.cardNumber}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              const isAmex = selectedBrand === "Amex";
              const limit = isAmex ? 15 : 16;
              const digits = raw.slice(0, limit);
              let formatted = digits;
              if (isAmex) {
                formatted = digits
                  .replace(/(\d{4})(\d)/, "$1 $2")
                  .replace(/(\d{4} \d{6})(\d)/, "$1 $2");
              } else {
                formatted = digits
                  .replace(/(\d{4})(\d)/, "$1 $2")
                  .replace(/(\d{4} \d{4})(\d)/, "$1 $2")
                  .replace(/(\d{4} \d{4} \d{4})(\d)/, "$1 $2");
              }
              onChange({ cardNumber: formatted });
            }}
            className={cls}
            placeholder={selectedBrand === "Amex" ? "0000 000000 00000" : "0000 0000 0000 0000"}
            maxLength={selectedBrand === "Amex" ? 17 : 19}
            autoComplete="cc-number"
          />
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
            inputMode="numeric"
            value={data.expiry}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
              const formatted = raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
              onChange({ expiry: formatted });
            }}
            className={cls}
            placeholder="MM/AA"
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

      {!hideCardCpf && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CPF do titular do cartão *">
            <input
              required
              inputMode="numeric"
              value={data.cardCpf}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
                const formatted = raw
                  .replace(/(\d{3})(\d)/, "$1.$2")
                  .replace(/(\d{3})(\d)/, "$1.$2")
                  .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                onChange({ cardCpf: formatted });
              }}
              className={cls}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </Field>
          <Field label="Data de nascimento do titular *">
            <DateBRInput
              required
              value={data.cardBirthDate}
              onChange={(iso) => onChange({ cardBirthDate: iso })}
              className={cls}
            />
          </Field>

        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Parcelas">
          <select
            value={installments}
            onChange={(e) => onInstallmentsChange(Number(e.target.value))}
            className={cls}
          >
            {installmentsOptions.map((n) => {
              const effFirst = firstAmount && n > 1 ? firstAmount : undefined;
              const s = splitInstallments(total, n, effFirst);
              const label = s.equal
                ? `${n}x de ${formatBRL(s.first)} sem juros`
                : `1x de ${formatBRL(s.first)} + ${s.restCount}x de ${formatBRL(s.rest)} sem juros`;
              return (
                <option key={n} value={n}>
                  {label}
                </option>
              );
            })}
          </select>
        </Field>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="text-xs text-muted-foreground mb-3">Endereço de cobrança</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CEP *">
            <input
              required
              value={data.billingZip}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
                onChange({ billingZip: formatted });
                if (raw.length === 8) {
                  fetch(`https://viacep.com.br/ws/${raw}/json/`)
                    .then((r) => r.json())
                    .then((d) => {
                      if (d && !d.erro) {
                        onChange({
                          billingAddress: d.logradouro || "",
                          billingCity: d.localidade || "",
                          billingState: (d.uf || "").toUpperCase(),
                        });
                      }
                    })
                    .catch(() => {});
                }
              }}
              className={cls}
              placeholder="00000-000"
              inputMode="numeric"
            />
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
