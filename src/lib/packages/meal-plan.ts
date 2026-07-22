// Utilitários para normalizar o regime de alimentação e refletir em "O que inclui".

export type MealPlanKind =
  | "all_inclusive"
  | "meia_pensao"
  | "pensao_completa"
  | "cafe"
  | "sem_refeicao"
  | null;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Classifica o `meal_plan` (texto livre) em uma categoria canônica. */
export function classifyMealPlan(meal: string | null | undefined): MealPlanKind {
  if (!meal) return null;
  const s = norm(meal);
  if (!s.trim()) return null;
  if (/(all\s*inclusive|tudo\s*incluso|todo\s*incluido|\bai\b)/.test(s)) return "all_inclusive";
  if (/(pensao\s*completa|full\s*board|\bfap\b|\bfb\b)/.test(s)) return "pensao_completa";
  if (/(meia\s*pensao|half\s*board|\bmap\b|\bhb\b)/.test(s)) return "meia_pensao";
  if (/(cafe|breakfast|\bacm\b|\bapt\b|\bbb\b)/.test(s)) return "cafe";
  if (/(sem\s*refei|room\s*only|so\s*hospedagem|\bsc\b|\bro\b)/.test(s)) return "sem_refeicao";
  return null;
}

/** Rótulo (Title Case) para uso em "O que inclui". `null` = não adicionar nada. */
export function mealPlanLabel(kind: MealPlanKind): string | null {
  switch (kind) {
    case "all_inclusive":
      return "All Inclusive";
    case "pensao_completa":
      return "Pensão Completa";
    case "meia_pensao":
      return "Meia Pensão";
    case "cafe":
      return "Café da Manhã";
    case "sem_refeicao":
    case null:
    default:
      return null;
  }
}

/** Todos os rótulos possíveis (para detecção em textos livres). */
export const ALL_MEAL_LABELS: ReadonlyArray<{ kind: Exclude<MealPlanKind, null | "sem_refeicao">; label: string }> = [
  { kind: "all_inclusive", label: "All Inclusive" },
  { kind: "pensao_completa", label: "Pensão Completa" },
  { kind: "meia_pensao", label: "Meia Pensão" },
  { kind: "cafe", label: "Café da Manhã" },
];

/** Retorna as categorias de regime mencionadas em uma linha de "O que inclui". */
export function detectMealKindsInLine(line: string): MealPlanKind[] {
  const found: MealPlanKind[] = [];
  const kind = classifyMealPlan(line);
  if (kind) found.push(kind);
  return found;
}

/** Detecta mismatch entre o `meal_plan` selecionado e o(s) rótulo(s) presente(s) em `includes`. */
export function detectMealPlanMismatch(
  mealPlan: string | null | undefined,
  includes: string[] | null | undefined,
): { expected: string; found: string[] } | null {
  const kind = classifyMealPlan(mealPlan ?? "");
  if (!kind || kind === "sem_refeicao") return null;
  const expected = mealPlanLabel(kind);
  if (!expected) return null;
  const list = Array.isArray(includes) ? includes : [];
  const conflicting = new Set<string>();
  for (const raw of list) {
    const line = String(raw ?? "");
    const inLineKind = classifyMealPlan(line);
    if (inLineKind && inLineKind !== "sem_refeicao" && inLineKind !== kind) {
      const lbl = mealPlanLabel(inLineKind);
      if (lbl) conflicting.add(lbl);
    }
  }
  if (conflicting.size === 0) return null;
  return { expected, found: Array.from(conflicting) };
}
