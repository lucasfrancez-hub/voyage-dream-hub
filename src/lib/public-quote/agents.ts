/**
 * Foto e dados públicos dos consultores VIA AIR usados no orçamento público.
 * O V14 aprovado usa a foto real do consultor — nunca o círculo com a inicial.
 */

import brunoAsset from "@/assets/consultores/bruno.webp.asset.json";
import paulaAsset from "@/assets/consultores/paula.webp.asset.json";
import camilaAsset from "@/assets/consultores/camila.webp.asset.json";
import robertoAsset from "@/assets/consultores/roberto.png.asset.json";
import nathAsset from "@/assets/consultores/nath.webp.asset.json";
import giovaniAsset from "@/assets/consultores/giovani.webp.asset.json";
import fabricioAsset from "@/assets/consultores/fabricio.webp.asset.json";
import mariaAsset from "@/assets/consultores/maria.webp.asset.json";

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
  bruno: { name: "Bruno", photoUrl: brunoAsset.url, role: "Consultor de viagens" },
  paula: { name: "Paula", photoUrl: paulaAsset.url, role: "Consultora de viagens" },
  camila: { name: "Camila", photoUrl: camilaAsset.url, role: "Consultora de viagens" },
  roberto: { name: "Roberto", photoUrl: robertoAsset.url, role: "Consultor de viagens" },
  nath: { name: "Nath", photoUrl: nathAsset.url, role: "Consultora de viagens" },
  nathalia: { name: "Nath", photoUrl: nathAsset.url, role: "Consultora de viagens" },
  giovani: { name: "Giovani", photoUrl: giovaniAsset.url, role: "Consultor de viagens" },
  fabricio: { name: "Fabrício", photoUrl: fabricioAsset.url, role: "Consultor de viagens" },
  maria: { name: "Maria", photoUrl: mariaAsset.url, role: "Consultora de viagens" },
};

/** Busca tolerante: "Lucas Rocha Francez", "lucas  francez", "Lucas F." etc. */
function findAgent(name?: string | null): AgentProfile | null {
  if (!name) return null;
  const n = NORM(name);
  if (AGENTS[n]) return AGENTS[n];
  const tokens = n.split(/\s+/).filter(Boolean);
  for (const [key, profile] of Object.entries(AGENTS)) {
    const keyTokens = key.split(/\s+/).filter(Boolean);
    if (keyTokens.every((t) => tokens.includes(t))) return profile;
  }
  return null;
}

/** Foto oficial do consultor (ou null quando não houver cadastro). */
export function agentPhoto(name?: string | null): string | null {
  return findAgent(name)?.photoUrl ?? null;
}

export function agentProfile(name?: string | null): AgentProfile | null {
  return findAgent(name);
}

