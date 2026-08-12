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

/**
 * Abre um link a partir de dentro do embed. Dentro de um iframe (WordPress) o
 * window.open costuma ser bloqueado; nesse caso pedimos para a página que
 * hospeda o iframe abrir a URL (o snippet escuta viaair:embed-navigate).
 */
export function abrirLinkExterno(url: string) {
  if (typeof window === "undefined") return;
  let aberto: Window | null = null;
  try {
    aberto = window.open(url, "_blank", "noopener");
  } catch {
    aberto = null;
  }
  if (aberto) return;
  try {
    window.parent?.postMessage({ type: "viaair:embed-navigate", url }, "*");
    window.parent?.postMessage({ type: "VIAAIR_EMBED_NAVIGATE", url }, "*");
  } catch {}
}
