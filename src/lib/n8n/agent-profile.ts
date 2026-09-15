/**
 * Perfil do agente enviado ao n8n.
 *
 * A fonte da verdade é a tabela `ai_agents` — nenhum nome é fixado em código.
 * A única regra derivada é o `role`: a coluna `equipe` já separa consultores
 * (Camila, Fabrício, Giovani, Maria, Nath, Roberto) dos especialistas
 * exclusivamente aéreos (Bruno, Paula).
 */

export type AgentRole = "consultant" | "air";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { resolveToolsEnabled } from "./tools-catalog";

export type N8nAgentProfile = {
  id: string;
  slug: string;
  name: string;
  gender: string | null;
  role: AgentRole;
  tools_enabled: string[];
  forbidden_topics: string[];
};

export type AiAgentRow = {
  id: string;
  slug: string;
  nome: string;
  equipe?: string | null;
  tom_voz?: string | null;
  tools_habilitadas?: unknown;
  temas_proibidos?: string[] | null;
};

/** especialista → "air"; qualquer outra equipe → "consultant". */
export function roleFromEquipe(equipe: string | null | undefined): AgentRole {
  return (equipe ?? "consultor") === "especialista" ? "air" : "consultant";
}

/**
 * Gênero gramatical usado no tratamento ("Paula está online" x "Bruno está
 * online"). Derivado do próprio cadastro; sem lista fixa de nomes.
 */
export function genderFromAgent(row: AiAgentRow): string | null {
  const tom = (row.tom_voz ?? "").toLowerCase();
  if (/\bfeminin/.test(tom)) return "f";
  if (/\bmasculin/.test(tom)) return "m";
  const nome = (row.nome ?? "").trim().toLowerCase();
  if (!nome) return null;
  return nome.endsWith("a") ? "f" : "m";
}

/** Normaliza `tools_habilitadas` (JSONB: array, objeto de flags ou nulo). */
export function toolsEnabledFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  }
  return [];
}

export function toAgentProfile(row: AiAgentRow): N8nAgentProfile {
  const role = roleFromEquipe(row.equipe);
  return {
    id: row.id,
    slug: row.slug,
    name: row.nome,
    gender: genderFromAgent(row),
    role,
    tools_enabled: resolveToolsEnabled(role, toolsEnabledFrom(row.tools_habilitadas)),
    forbidden_topics: Array.isArray(row.temas_proibidos) ? row.temas_proibidos : [],
  };
}
