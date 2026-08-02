/**
 * Retorna os agentes de IA que estão ATIVOS e dentro da janela de horário
 * atual (America/Sao_Paulo). Usado pelo cabeçalho do chat pra mostrar,
 * em tempo real, quem está de plantão agora.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function hmToDecimal(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}
function nowDecimalSP(): number {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h + m / 60;
}
function inWindow(now: number, ini: number, fim: number): boolean {
  if (ini === fim) return true;
  if (ini < fim) return now >= ini && now < fim;
  return now >= ini || now < fim; // vira o dia
}

export const listOnlineAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_agents")
      .select("slug, nome, ativo, equipe, horario_inicio, horario_fim")
      .eq("ativo", true);
    const now = nowDecimalSP();
    const rows = (data ?? []) as Array<{
      slug: string;
      nome: string;
      ativo: boolean;
      equipe: string | null;
      horario_inicio: string;
      horario_fim: string;
    }>;
    return rows
      .filter((a) => inWindow(now, hmToDecimal(a.horario_inicio), hmToDecimal(a.horario_fim)))
      .map((a) => ({ slug: a.slug, nome: a.nome, equipe: a.equipe ?? "consultor" }));
  });
