/**
 * Agenda do chat — ponte entre o banco e o calendário Titan (CalDAV).
 * SERVER-ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buscarEventos,
  excluirEvento,
  salvarEvento,
  type CalDavAuth,
} from "./caldav.server";

export type CalendarConfig = {
  id: string;
  server_url: string;
  username: string | null;
  password: string | null;
  calendar_url: string | null;
  calendar_nome: string | null;
  timezone: string;
  ativo: boolean;
  last_sync_at: string | null;
  last_error: string | null;
};

export type AgendaEvento = {
  id: string;
  uid: string;
  href: string | null;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  situacao: string;
  origem: string;
  telefone: string | null;
  criado_por: string | null;
};

export async function carregarConfig(): Promise<CalendarConfig | null> {
  const { data } = await supabaseAdmin
    .from("wa_calendar_config")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as CalendarConfig | null) ?? null;
}

export function authDaConfig(cfg: CalendarConfig | null): CalDavAuth | null {
  if (!cfg?.username || !cfg?.password || !cfg.calendar_url) return null;
  return { serverUrl: cfg.server_url, username: cfg.username, password: cfg.password };
}

/** Baixa os eventos do Titan no período e espelha no banco. */
export async function sincronizar(dias = 120): Promise<{ total: number; erro?: string }> {
  const cfg = await carregarConfig();
  const auth = authDaConfig(cfg);
  if (!cfg || !auth || !cfg.calendar_url) return { total: 0, erro: "Agenda ainda não conectada." };

  const de = new Date(Date.now() - 30 * 86400000);
  const ate = new Date(Date.now() + dias * 86400000);

  try {
    const eventos = await buscarEventos(auth, cfg.calendar_url, de, ate);
    const uids = new Set<string>();
    for (const ev of eventos) {
      uids.add(ev.uid);
      await supabaseAdmin
        .from("wa_calendar_events")
        .upsert(
          {
            uid: ev.uid,
            etag: ev.etag,
            href: ev.href,
            titulo: ev.titulo,
            descricao: ev.descricao,
            local: ev.local,
            inicio: ev.inicio,
            fim: ev.fim,
            dia_inteiro: ev.diaInteiro,
            situacao: ev.situacao,
            raw_ics: ev.rawIcs,
            deleted_at: null,
          },
          { onConflict: "uid" },
        );
    }

    // Some do banco o que sumiu do servidor no mesmo período.
    const { data: locais } = await supabaseAdmin
      .from("wa_calendar_events")
      .select("id, uid")
      .gte("inicio", de.toISOString())
      .lte("inicio", ate.toISOString())
      .is("deleted_at", null);
    const sumiram = (locais ?? []).filter((l) => !uids.has(l.uid as string)).map((l) => l.id as string);
    if (sumiram.length) {
      await supabaseAdmin.from("wa_calendar_events").delete().in("id", sumiram);
    }

    await supabaseAdmin
      .from("wa_calendar_config")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", cfg.id);
    return { total: eventos.length };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("wa_calendar_config").update({ last_error: erro }).eq("id", cfg.id);
    return { total: 0, erro };
  }
}

export async function listarEventos(deISO: string, ateISO: string): Promise<AgendaEvento[]> {
  const { data } = await supabaseAdmin
    .from("wa_calendar_events")
    .select("id, uid, href, titulo, descricao, local, inicio, fim, dia_inteiro, situacao, origem, telefone, criado_por")
    .gte("inicio", deISO)
    .lte("inicio", ateISO)
    .is("deleted_at", null)
    .order("inicio", { ascending: true });
  return (data ?? []) as AgendaEvento[];
}

function novoUid(): string {
  return `viaair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@viaair.tur.br`;
}

export type EntradaEvento = {
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  inicio: string;
  fim: string;
  telefone?: string | null;
  criado_por?: string | null;
};

/** Cria o compromisso no Titan e no banco. */
export async function criarEvento(entrada: EntradaEvento): Promise<AgendaEvento> {
  const cfg = await carregarConfig();
  const auth = authDaConfig(cfg);
  const uid = novoUid();
  let href: string | null = null;
  let etag: string | null = null;
  let ics: string | null = null;

  if (cfg?.calendar_url && auth) {
    const r = await salvarEvento(auth, cfg.calendar_url, { uid, ...entrada });
    href = r.href;
    etag = r.etag;
    ics = r.ics;
  }

  const { data, error } = await supabaseAdmin
    .from("wa_calendar_events")
    .insert({
      uid,
      href,
      etag,
      raw_ics: ics,
      titulo: entrada.titulo,
      descricao: entrada.descricao ?? null,
      local: entrada.local ?? null,
      inicio: entrada.inicio,
      fim: entrada.fim,
      origem: "chat",
      telefone: entrada.telefone ?? null,
      criado_por: entrada.criado_por ?? null,
    })
    .select("id, uid, href, titulo, descricao, local, inicio, fim, dia_inteiro, situacao, origem, telefone, criado_por")
    .single();
  if (error) throw new Error(error.message);
  return data as AgendaEvento;
}

/** Atualiza título/horário/local de um compromisso, no banco e no Titan. */
export async function atualizarEvento(id: string, patch: Partial<EntradaEvento>): Promise<AgendaEvento> {
  const { data: atual } = await supabaseAdmin
    .from("wa_calendar_events")
    .select("id, uid, href, titulo, descricao, local, inicio, fim, dia_inteiro, situacao, origem, telefone, criado_por")
    .eq("id", id)
    .maybeSingle();
  if (!atual) throw new Error("Compromisso não encontrado.");
  const ev = atual as AgendaEvento;

  const merged = {
    titulo: patch.titulo ?? ev.titulo,
    descricao: patch.descricao !== undefined ? patch.descricao : ev.descricao,
    local: patch.local !== undefined ? patch.local : ev.local,
    inicio: patch.inicio ?? ev.inicio,
    fim: patch.fim ?? ev.fim,
  };

  const cfg = await carregarConfig();
  const auth = authDaConfig(cfg);
  let ics: string | null = null;
  if (cfg?.calendar_url && auth) {
    const r = await salvarEvento(auth, cfg.calendar_url, { uid: ev.uid, ...merged }, ev.href);
    ics = r.ics;
  }

  const { data, error } = await supabaseAdmin
    .from("wa_calendar_events")
    .update({ ...merged, raw_ics: ics ?? undefined })
    .eq("id", id)
    .select("id, uid, href, titulo, descricao, local, inicio, fim, dia_inteiro, situacao, origem, telefone, criado_por")
    .single();
  if (error) throw new Error(error.message);
  return data as AgendaEvento;
}

/** Apaga o compromisso no Titan e no banco. */
export async function removerEvento(id: string): Promise<void> {
  const { data: atual } = await supabaseAdmin
    .from("wa_calendar_events")
    .select("id, uid, href")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return;
  const cfg = await carregarConfig();
  const auth = authDaConfig(cfg);
  if (cfg?.calendar_url && auth) {
    try {
      await excluirEvento(auth, cfg.calendar_url, atual.uid as string, atual.href as string | null);
    } catch {
      /* se já não existe lá, segue e limpa aqui */
    }
  }
  await supabaseAdmin.from("wa_calendar_events").delete().eq("id", id);
}

/* ------------------------------------------------------------------ */
/* Disponibilidade — usada pela IA para oferecer horários              */
/* ------------------------------------------------------------------ */

const EXPEDIENTE = { inicio: 9, fim: 19 }; // horário de Brasília
const PASSO_MIN = 30;

function paraSaoPaulo(d: Date): Date {
  return new Date(d.getTime() - 3 * 3600000); // -03:00, sem horário de verão
}

function deSaoPaulo(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, d, h + 3, min, 0));
}

export type Slot = { inicio: string; fim: string; label: string };

/** Horários livres nos próximos dias (duração em minutos). */
export async function horariosLivres(duracaoMin = 30, dias = 5, limite = 6): Promise<Slot[]> {
  const agora = new Date();
  const fimJanela = new Date(agora.getTime() + dias * 86400000);
  const ocupados = await listarEventos(agora.toISOString(), fimJanela.toISOString());

  const conflita = (ini: Date, fim: Date) =>
    ocupados.some((e) => new Date(e.inicio) < fim && new Date(e.fim) > ini);

  const slots: Slot[] = [];
  for (let dia = 0; dia < dias && slots.length < limite; dia += 1) {
    const base = paraSaoPaulo(new Date(agora.getTime() + dia * 86400000));
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();
    const d = base.getUTCDate();
    const diaSemana = base.getUTCDay();
    if (diaSemana === 0) continue; // domingo fechado
    const fimExpediente = diaSemana === 6 ? 13 : EXPEDIENTE.fim;

    for (let h = EXPEDIENTE.inicio * 60; h + duracaoMin <= fimExpediente * 60; h += PASSO_MIN) {
      const ini = deSaoPaulo(y, m, d, Math.floor(h / 60), h % 60);
      const fim = new Date(ini.getTime() + duracaoMin * 60000);
      if (ini.getTime() < agora.getTime() + 60 * 60000) continue; // pelo menos 1h de antecedência
      if (conflita(ini, fim)) continue;
      slots.push({
        inicio: ini.toISOString(),
        fim: fim.toISOString(),
        label: formatarSlot(ini),
      });
      if (slots.length >= limite) break;
      h += 60 - PASSO_MIN; // espalha as sugestões ao longo do dia
    }
  }
  return slots;
}

export function formatarSlot(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
