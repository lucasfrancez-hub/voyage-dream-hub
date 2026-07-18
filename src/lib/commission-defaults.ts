// Padrões de comissão configuráveis pelo usuário, persistidos em localStorage.
// Aplicados em imports (voucher, multi) e nos fallbacks de "Comissionável"
// no dialog financeiro dos pedidos.

export type CommissionKind = "hotel" | "service" | "flight" | "package";

const KEY = "via:commission-defaults:v1";

const FALLBACK: Record<CommissionKind, number> = {
  hotel: 12,
  service: 12,
  flight: 0,
  package: 12,
};

export function getCommissionDefaults(): Record<CommissionKind, number> {
  if (typeof window === "undefined") return { ...FALLBACK };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...FALLBACK };
    const parsed = JSON.parse(raw) as Partial<Record<CommissionKind, number>>;
    return {
      hotel: sanitize(parsed.hotel, FALLBACK.hotel),
      service: sanitize(parsed.service, FALLBACK.service),
      flight: sanitize(parsed.flight, FALLBACK.flight),
      package: sanitize(parsed.package, FALLBACK.package),
    };
  } catch {
    return { ...FALLBACK };
  }
}

export function getCommissionDefault(kind: CommissionKind): number {
  return getCommissionDefaults()[kind];
}

export function setCommissionDefaults(next: Partial<Record<CommissionKind, number>>) {
  if (typeof window === "undefined") return;
  const current = getCommissionDefaults();
  const merged = { ...current, ...next };
  window.localStorage.setItem(KEY, JSON.stringify(merged));
  try {
    window.dispatchEvent(new CustomEvent("via:commission-defaults-changed"));
  } catch {
    /* noop */
  }
}

function sanitize(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}
