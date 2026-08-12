/**
 * Codificação da trilha do explorador de passagens baratas na URL (?p=...).
 * Compartilhado entre a página /voar e o embed do WordPress.
 */
import type { MdStep } from "@/routes/admin.passagens-baratas";

const SEP = "|";
const FSEP = "~";

export function encodeTrail(trail: MdStep[]): string {
  return trail
    .map((s) =>
      [
        s.label,
        s.baseLabel ?? "",
        s.categoryId ?? "",
        s.toIata ?? "",
        s.fromIata ?? "",
        s.month ?? "",
      ]
        .map((v) => String(v).replace(/[|~]/g, " "))
        .join(FSEP),
    )
    .join(SEP);
}

export function decodeTrail(raw?: string): MdStep[] {
  const base: MdStep[] = [{ label: "Passagens baratas" }];
  if (!raw) return base;
  const steps = raw
    .split(SEP)
    .map((chunk) => {
      const [label, baseLabel, categoryId, toIata, fromIata, month] = chunk.split(FSEP);
      if (!label) return null;
      return {
        label,
        ...(baseLabel ? { baseLabel } : {}),
        ...(categoryId ? { categoryId: Number(categoryId) } : {}),
        ...(toIata ? { toIata } : {}),
        ...(fromIata ? { fromIata } : {}),
        ...(month ? { month } : {}),
      } as MdStep;
    })
    .filter(Boolean) as MdStep[];
  return steps.length ? steps : base;
}
