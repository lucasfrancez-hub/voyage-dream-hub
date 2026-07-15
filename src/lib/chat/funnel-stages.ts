/**
 * Fonte única do funil de vendas — usada no CRM (Kanban) e no painel do chat.
 * Manter os `key` iguais em toda a app.
 */
export const FUNNEL_STAGES = [
  { key: "novo", label: "Novo Lead", pill: "bg-slate-100 text-slate-700 border-slate-200", accent: "border-slate-300" },
  { key: "qualificacao", label: "Qualificação", pill: "bg-blue-100 text-blue-700 border-blue-200", accent: "border-blue-300" },
  { key: "orcamento", label: "Orçamento", pill: "bg-indigo-100 text-indigo-700 border-indigo-200", accent: "border-indigo-300" },
  { key: "enviado", label: "Orçamento Enviado", pill: "bg-violet-100 text-violet-700 border-violet-200", accent: "border-violet-300" },
  { key: "pagamento", label: "Pagamento", pill: "bg-amber-100 text-amber-700 border-amber-200", accent: "border-amber-300" },
  { key: "contrato", label: "Contrato", pill: "bg-orange-100 text-orange-700 border-orange-200", accent: "border-orange-300" },
  { key: "confirmada", label: "Viagem Confirmada", pill: "bg-emerald-100 text-emerald-700 border-emerald-200", accent: "border-emerald-300" },
  { key: "pos", label: "Pós-venda", pill: "bg-teal-100 text-teal-700 border-teal-200", accent: "border-teal-300" },
  { key: "perdido", label: "Perdido", pill: "bg-red-100 text-red-700 border-red-200", accent: "border-red-300" },
] as const;

export type FunnelStageKey = typeof FUNNEL_STAGES[number]["key"];

export const FUNNEL_STAGE_KEYS = FUNNEL_STAGES.map((s) => s.key) as [FunnelStageKey, ...FunnelStageKey[]];
