/**
 * Google Calendar via connector gateway da Lovable.
 * SERVER-ONLY — usa LOVABLE_API_KEY + GOOGLE_CALENDAR_API_KEY.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

export type GoogleCalendario = { id: string; nome: string; principal: boolean; cor: string | null };

export type GoogleEvento = {
  uid: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  situacao: string;
  detalhes: DetalhesEvento;
};

export type Participante = { nome: string | null; email: string | null; resposta: string | null; organizador?: boolean };

export type DetalhesEvento = {
  url?: string | null;
  conferencia?: string | null;
  organizador?: Participante | null;
  criador?: Participante | null;
  participantes?: Participante[];
  lembretes?: string[];
  recorrencia?: string | null;
  fusoHorario?: string | null;
  visibilidade?: string | null;
  disponibilidade?: string | null;
  calendario?: string | null;
  meuStatus?: string | null;
};

function chaves(): { lovable: string; conexao: string } {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conexao = process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!lovable || !conexao) {
    throw new Error("Google Agenda ainda não está conectado neste projeto.");
  }
  return { lovable, conexao };
}

async function gcal(path: string, init?: RequestInit): Promise<unknown> {
  const { lovable, conexao } = chaves();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${lovable}`);
  headers.set("X-Connection-Api-Key", conexao);
  if (init?.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers });
  const texto = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Google Agenda ${res.status}: ${texto.slice(0, 300)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

/** Calendários da conta Google conectada. */
export async function listarCalendariosGoogle(): Promise<GoogleCalendario[]> {
  const data = (await gcal("/users/me/calendarList?maxResults=100")) as {
    items?: Array<{ id: string; summary?: string; primary?: boolean; backgroundColor?: string }>;
  };
  return (data.items ?? []).map((c) => ({
    id: c.id,
    nome: c.summary ?? c.id,
    principal: Boolean(c.primary),
    cor: c.backgroundColor ?? null,
  }));
}

function normalizar(ev: {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  transparency?: string;
  visibility?: string;
  recurrence?: string[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  creator?: { email?: string; displayName?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string; organizer?: boolean; self?: boolean }>;
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  reminders?: { useDefault?: boolean; overrides?: Array<{ method?: string; minutes?: number }> };
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}, calendario?: string): GoogleEvento | null {
  const inicioRaw = ev.start?.dateTime ?? ev.start?.date;
  const fimRaw = ev.end?.dateTime ?? ev.end?.date;
  const uid = ev.id ?? ev.iCalUID;
  if (!uid || !inicioRaw) return null;
  const diaInteiro = Boolean(ev.start?.date && !ev.start?.dateTime);
  const inicio = new Date(diaInteiro ? `${inicioRaw}T00:00:00-03:00` : inicioRaw);
  const fim = fimRaw
    ? new Date(diaInteiro ? `${fimRaw}T00:00:00-03:00` : fimRaw)
    : new Date(inicio.getTime() + 3600000);
  return {
    uid,
    titulo: ev.summary ?? "(sem título)",
    descricao: ev.description ?? null,
    local: ev.location ?? null,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    diaInteiro,
    situacao: (ev.status ?? "confirmed").toLowerCase(),
    detalhes: {
      url: ev.htmlLink ?? null,
      conferencia:
        ev.hangoutLink ??
        ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
        null,
      organizador: ev.organizer
        ? { nome: ev.organizer.displayName ?? null, email: ev.organizer.email ?? null, resposta: null, organizador: true }
        : null,
      criador: ev.creator ? { nome: ev.creator.displayName ?? null, email: ev.creator.email ?? null, resposta: null } : null,
      participantes: (ev.attendees ?? []).map((a) => ({
        nome: a.displayName ?? null,
        email: a.email ?? null,
        resposta: (a.responseStatus ?? null)?.toLowerCase() ?? null,
        organizador: Boolean(a.organizer),
      })),
      lembretes: (ev.reminders?.overrides ?? []).map((r) =>
        `${r.minutes ?? 0} min antes${r.method ? ` (${r.method === "email" ? "e-mail" : "alerta"})` : ""}`,
      ),
      recorrencia: ev.recurrence?.[0] ?? null,
      fusoHorario: ev.start?.timeZone ?? null,
      visibilidade: ev.visibility ?? null,
      disponibilidade: ev.transparency === "transparent" ? "livre" : "ocupado",
      calendario: calendario ?? null,
      meuStatus: (ev.attendees ?? []).find((a) => a.self)?.responseStatus?.toLowerCase() ?? null,
    },
  };
}

/** Eventos de um período (segue todas as páginas do Google). */
export async function buscarEventosGoogle(calendarId: string, de: Date, ate: Date): Promise<GoogleEvento[]> {
  const saida: GoogleEvento[] = [];
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < 20; pagina++) {
    const qs = new URLSearchParams({
      timeMin: de.toISOString(),
      timeMax: ate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      ...(pageToken ? { pageToken } : {}),
    });
    const data = (await gcal(`/calendars/${encodeURIComponent(calendarId)}/events?${qs}`)) as {
      items?: Parameters<typeof normalizar>[0][];
      nextPageToken?: string;
    };
    for (const item of data.items ?? []) {
      const ev = normalizar(item, calendarId);
      if (ev) saida.push(ev);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return saida;
}

export type EntradaGoogle = {
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  inicio: string;
  fim: string;
  diaInteiro?: boolean | null;
  linkReuniao?: string | null;
  convidados?: string[] | null;
  url?: string | null;
};

function diaGoogle(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function corpoGoogle(ev: EntradaGoogle) {
  const descricao = [ev.descricao || "", ev.linkReuniao ? `Reunião: ${ev.linkReuniao}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: ev.titulo,
    description: descricao || undefined,
    location: ev.local ?? undefined,
    source: ev.url ? { title: ev.titulo, url: ev.url } : undefined,
    attendees: ev.convidados?.length ? ev.convidados.map((email) => ({ email })) : undefined,
    ...(ev.diaInteiro
      ? { start: { date: diaGoogle(ev.inicio) }, end: { date: diaGoogle(ev.fim) } }
      : {
          start: { dateTime: new Date(ev.inicio).toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: new Date(ev.fim).toISOString(), timeZone: "America/Sao_Paulo" },
        }),
  };
}

/** Cria um evento e devolve o id gerado pelo Google. */
export async function criarEventoGoogle(calendarId: string, ev: EntradaGoogle): Promise<string> {
  const data = (await gcal(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(corpoGoogle(ev)),
  })) as { id?: string };
  if (!data?.id) throw new Error("O Google não devolveu o identificador do compromisso.");
  return data.id;
}

export async function atualizarEventoGoogle(calendarId: string, eventId: string, ev: EntradaGoogle): Promise<void> {
  await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      summary: ev.titulo,
      description: ev.descricao ?? null,
      location: ev.local ?? null,
      start: { dateTime: new Date(ev.inicio).toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: new Date(ev.fim).toISOString(), timeZone: "America/Sao_Paulo" },
    }),
  });
}

export async function excluirEventoGoogle(calendarId: string, eventId: string): Promise<void> {
  await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}
