/**
 * Foto e dados públicos dos consultores VIA AIR usados no orçamento público.
 * O V14 aprovado usa a foto real do consultor — nunca o círculo com a inicial.
 */

export type AgentProfile = {
  name: string;
  photoUrl: string;
  role?: string;
};

const NORM = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const AGENTS: Record<string, AgentProfile> = {
  "lucas francez": {
    name: "Lucas Francez",
    photoUrl: "https://media.infotravel.com.br/image/upload/E9E91522DE7AB637046B2E7A4B780637.jpg",
    role: "Consultor de viagens",
  },
};

/** Foto oficial do consultor (ou null quando não houver cadastro). */
export function agentPhoto(name?: string | null): string | null {
  if (!name) return null;
  return AGENTS[NORM(name)]?.photoUrl ?? null;
}

export function agentProfile(name?: string | null): AgentProfile | null {
  if (!name) return null;
  return AGENTS[NORM(name)] ?? null;
}
