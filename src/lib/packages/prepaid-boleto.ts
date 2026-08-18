/**
 * Boleto Pré-pago — regra única e centralizada.
 *
 * Modalidade separada do "Boleto bancário" (financiamento):
 *  - sem juros, sem análise de crédito;
 *  - disponível apenas para pacotes de origem Cativa;
 *  - some completamente quando faltam menos de 60 dias para o embarque;
 *  - a quantidade máxima de parcelas é SEMPRE calculada a partir da data atual
 *    (nunca gravada como valor definitivo no banco).
 *
 * Regra comercial aprovada:
 *   payoffDeadline = embarque - 30 dias
 *   maxInstallments = meses cheios entre hoje e payoffDeadline (máx. 12, mín. 1)
 *   (6 meses de antecedência => até 5x)
 */

export const PREPAID_MIN_DAYS = 60;
export const PREPAID_MARGIN_DAYS = 30;
export const PREPAID_MAX_INSTALLMENTS = 12;

export type PrepaidScheduleItem = {
  installment: number;
  type: "entry" | "installment";
  dueDate: string; // ISO yyyy-mm-dd
  amount: number;
};

export type PrepaidOption = {
  installments: number;
  entryAmount: number;
  installmentAmounts: number[];
  schedule: PrepaidScheduleItem[];
};

export type PrepaidConditions = {
  eligible: boolean;
  maxInstallments: number;
  daysUntilDeparture: number | null;
  payoffDeadline: string | null;
  options: PrepaidOption[];
};

export const EMPTY_PREPAID: PrepaidConditions = {
  eligible: false,
  maxInstallments: 0,
  daysUntilDeparture: null,
  payoffDeadline: null,
  options: [],
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function addMonths(d: Date, months: number): Date {
  const n = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  n.setDate(Math.min(d.getDate(), lastDay));
  return n;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** Meses cheios entre duas datas (conservador: só conta o mês completo). */
function fullMonthsBetween(from: Date, to: Date): number {
  let months = 0;
  while (addMonths(from, months + 1) <= to) months += 1;
  return months;
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Identificação interna — nunca exibida ao cliente. */
export function isCativaSource(supplierName?: string | null, source?: string | null): boolean {
  const s = `${supplierName ?? ""} ${source ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // Variações do mesmo fornecedor: "Cativa", "CATIVA", "Cativa Operadora",
  // "Cativa / Viajando com Desconto", "Viajando com Desconto".
  return /cativa|viajando\s*com\s*desconto/.test(s);
}

/** Divide o total em N parcelas em centavos, sem sobra (ajuste na entrada). */
export function splitAmount(total: number, parts: number): number[] {
  const cents = Math.round((Number(total) || 0) * 100);
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  const out = Array.from({ length: n }, () => base / 100);
  if (rest > 0) out[0] = (base + rest) / 100;
  return out;
}

export function getPrepaidBoletoConditions(input: {
  source?: string | null;
  supplierName?: string | null;
  departureDate?: string | Date | null;
  totalAmount?: number | null;
  currentDate?: Date;
}): PrepaidConditions {
  const today = startOfDay(input.currentDate ?? new Date());
  const departure = toDate(input.departureDate ?? null);
  const total = Number(input.totalAmount) || 0;

  if (!isCativaSource(input.supplierName, input.source)) return EMPTY_PREPAID;
  if (!departure) return EMPTY_PREPAID;

  const daysUntilDeparture = diffDays(today, departure);
  if (daysUntilDeparture < PREPAID_MIN_DAYS) {
    return { ...EMPTY_PREPAID, daysUntilDeparture };
  }

  const payoffDeadline = addDays(departure, -PREPAID_MARGIN_DAYS);
  const maxInstallments = Math.max(
    0,
    Math.min(PREPAID_MAX_INSTALLMENTS, fullMonthsBetween(today, payoffDeadline)),
  );

  if (maxInstallments < 1 || total <= 0) {
    return { ...EMPTY_PREPAID, daysUntilDeparture, payoffDeadline: toISODate(payoffDeadline) };
  }

  const options: PrepaidOption[] = [];
  for (let n = 1; n <= maxInstallments; n++) {
    const amounts = splitAmount(total, n);
    const schedule: PrepaidScheduleItem[] = amounts.map((amount, i) => ({
      installment: i + 1,
      type: i === 0 ? "entry" : "installment",
      dueDate: toISODate(i === 0 ? today : addMonths(today, i)),
      amount,
    }));
    options.push({
      installments: n,
      entryAmount: amounts[0] ?? 0,
      installmentAmounts: amounts,
      schedule,
    });
  }

  return {
    eligible: true,
    maxInstallments,
    daysUntilDeparture,
    payoffDeadline: toISODate(payoffDeadline),
    options,
  };
}

/**
 * Cronograma do Boleto bancário (financiado): sem entrada hoje —
 * a 1ª parcela vence sempre 30 dias após a compra, e as demais mês a mês.
 */
export function buildFinancedBoletoSchedule(
  total: number,
  installments: number,
  currentDate?: Date,
): PrepaidScheduleItem[] {
  const today = startOfDay(currentDate ?? new Date());
  const first = addDays(today, 30);
  const amounts = splitAmount(total, installments);
  return amounts.map((amount, i) => ({
    installment: i + 1,
    type: "installment" as const,
    dueDate: toISODate(i === 0 ? first : addMonths(first, i)),
    amount,
  }));
}
