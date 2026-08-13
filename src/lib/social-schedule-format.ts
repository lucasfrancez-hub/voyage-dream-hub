/**
 * Helpers de exibição dos agendamentos de publicação social.
 * Usado no card da curadoria e no diálogo "Divulgar promoção".
 */

export type AgendamentoSocial = {
  id: string;
  channel: string;
  scheduled_at: string;
  status: string;
  label: string | null;
  promo_id: string | null;
  error?: string | null;
  published_at?: string | null;
  payload?: unknown;
};

/** Data e hora do agendamento no fuso de São Paulo (dd/mm/aaaa às HH:mm). */
export function agendamentoQuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${data} às ${hora}`;
}

/**
 * Descreve o canal do agendamento.
 * `nomesDestinos` permite trocar os IDs do WhatsApp pelos nomes dos canais/grupos.
 */
export function agendamentoCanal(
  a: AgendamentoSocial,
  nomesDestinos?: Map<string, string>,
): string {
  const p = (a.payload ?? {}) as {
    kind?: string;
    media_type?: string;
    destino_ids?: string[];
  };

  if (a.channel === "instagram") {
    return `Instagram · ${p.media_type === "story_image" ? "Story" : "Feed"}`;
  }

  if (a.channel === "whatsapp") {
    const ids = p.destino_ids ?? [];
    const nomes = nomesDestinos
      ? ids.map((id) => nomesDestinos.get(id)).filter((n): n is string => Boolean(n))
      : [];
    if (nomes.length) return `WhatsApp · ${nomes.join(", ")}`;
    if (ids.length) return `WhatsApp · ${ids.length} destino${ids.length === 1 ? "" : "s"}`;
    return "WhatsApp";
  }

  return a.label ?? a.channel;
}

/** Agrupa agendamentos ainda pendentes por promoção. */
export function agruparAgendamentosPorPromo(
  lista: AgendamentoSocial[],
): Map<string, AgendamentoSocial[]> {
  const mapa = new Map<string, AgendamentoSocial[]>();
  for (const a of lista) {
    if (!a.promo_id) continue;
    if (a.status !== "agendado") continue;
    const atual = mapa.get(a.promo_id) ?? [];
    atual.push(a);
    mapa.set(a.promo_id, atual);
  }
  for (const arr of mapa.values()) {
    arr.sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at));
  }
  return mapa;
}
