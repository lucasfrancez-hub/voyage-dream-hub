export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return BRL.format(n);
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDateRange(a?: string | null, b?: string | null): string {
  const A = formatDateBR(a);
  const B = formatDateBR(b);
  if (A === "—" && B === "—") return "—";
  if (A === "—") return B;
  if (B === "—") return A;
  return `${A} → ${B}`;
}
