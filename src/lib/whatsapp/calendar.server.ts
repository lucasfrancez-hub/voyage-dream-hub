/**
 * Agenda unificada — Titan (CalDAV), iCloud (CalDAV) e Google (API oficial).
 * SERVER-ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buscarEventos,
  excluirEvento,
  salvarEvento,
  type CalDavAuth,
} from "./caldav.server";
import {
  atualizarEventoGoogle,
  buscarEventosGoogle,
  criarEventoGoogle,
  excluirEventoGoogle,
} from "./gcal.server";

export type Provedor = "titan" | "icloud" | "google";

export const CORES: Record<Provedor, string> = {
  google: "#2563EB", // azul
  titan: "#F26B1F", // laranja
  icloud: "#16A34A", // verde
};

export const SERVIDOR_PADRAO: Record<Provedor, string> = {
  titan: "https://dav.titan.email",
  icloud: "https://caldav.icloud.com",
  google: "",
};

export type ContaAgenda = {
  id: string;
  provider: Provedor;
  nome: string;
  cor: string;
  server_url: string | null;
  username: string | null;
  password: string | null;
  calendar_url: string | null;
  calendar_id: string | null;
  calendar_nome: string | null;
  timezone: string;
  ativo: boolean;
  visivel: boolean;
  padrao: boolean;
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
  provider: string;
  account_id: string | null;
  telefone: string | null;
  criado_por: string | null;
  detalhes: import("./gcal.server").DetalhesEvento | null;
};

const CAMPOS_EVENTO =
  "id, uid, href, titulo, descricao, local, inicio, fim, dia_inteiro, situacao, origem, provider, account_id, telefone, criado_por, detalhes";

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

export async function listarContas(): Promise<ContaAgenda[]> {
  const { data } = await supabaseAdmin
    .from("wa_calendar_accounts")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as ContaAgenda[];
}

export async function contaPorId(id: string): Promise<ContaAgenda | null> {
  const { data } = await supabaseAdmin.from("wa_calendar_accounts").select("*").eq("id", id).maybeSingle();
  return (data as ContaAgenda | null) ?? null;
}

/** Conta usada quando ninguém escolheu destino. */
export async function contaPadrao(): Promise<ContaAgenda | null> {
  const contas = (await listarContas()).filter((c) => c.ativo);
  return contas.find((c) => c.padrao) ?? contas[0] ?? null;
}

export function authDaConta(conta: ContaAgenda): CalDavAuth | null {
  if (conta.provider === "google") return null;
  if (!conta.username || !conta.password || !conta.calendar_url) return null;
  return {
    serverUrl: conta.server_url || SERVIDOR_PADRAO[conta.provider],
    username: conta.username,
    password: conta.password,
  };
}

/* ------------------------------------------------------------------ */
/* Sincronização                                                       */
/* ------------------------------------------------------------------ */

async function gravarEvento(conta: ContaAgenda, ev: {
  uid: string;
  etag?: string | null;
  href?: string | null;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  situacao: string;
  rawIcs?: string | null;
  detalhes?: unknown;
}) {
  const { error } = await supabaseAdmin.from("wa_calendar_events").upsert(
    {
      account_id: conta.id,
      provider: conta.provider,
      origem: conta.provider,
      uid: ev.uid,
      etag: ev.etag ?? null,
      href: ev.href ?? null,
      titulo: ev.titulo,
      descricao: ev.descricao,
      local: ev.local,
      inicio: ev.inicio,
      fim: ev.fim,
      dia_inteiro: ev.diaInteiro,
      situacao: ev.situacao,
      raw_ics: ev.rawIcs ?? null,
      detalhes: {
        ...((ev.detalhes as Record<string, unknown>) ?? {}),
        calendario:
          ((ev.detalhes as { calendario?: string | null } | undefined)?.calendario) ??
          conta.calendar_nome ??
          conta.nome,
      },
      deleted_at: null,
    },
    { onConflict: "account_id,uid" },
  );
  // Sem isso, uma falha de gravação passava batido e a agenda ficava vazia.
  if (error) throw new Error(`Falha ao salvar "${ev.titulo}": ${error.message}`);
}

/** Baixa os compromissos de uma conta e espelha no banco. */
export async function sincronizarConta(conta: ContaAgenda, dias = 120): Promise<{ total: number; erro?: string }> {
  const de = new Date(Date.now() - 30 * 86400000);
  const ate = new Date(Date.now() + dias * 86400000);

  try {
    const uids = new Set<string>();

    if (conta.provider === "google") {
      if (!conta.calendar_id) throw new Error("Escolha um calendário do Google.");
      const eventos = await buscarEventosGoogle(conta.calendar_id, de, ate);
      for (const ev of eventos) {
        uids.add(ev.uid);
        await gravarEvento(conta, { ...ev, href: null, etag: null, rawIcs: null });
      }
    } else {
      const auth = authDaConta(conta);
      if (!auth || !conta.calendar_url) throw new Error("Agenda ainda não conectada.");
      const eventos = await buscarEventos(auth, conta.calendar_url, de, ate);
      for (const ev of eventos) {
        uids.add(ev.uid);
        await gravarEvento(conta, ev);
      }
    }

    const { data: locais } = await supabaseAdmin
      .from("wa_calendar_events")
      .select("id, uid")
      .eq("account_id", conta.id)
      .gte("inicio", de.toISOString())
      .lte("inicio", ate.toISOString())
      .is("deleted_at", null);
    const sumiram = (locais ?? []).filter((l) => !uids.has(l.uid as string)).map((l) => l.id as string);
    if (sumiram.length) await supabaseAdmin.from("wa_calendar_events").delete().in("id", sumiram);

    await supabaseAdmin
      .from("wa_calendar_accounts")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", conta.id);
    return { total: uids.size };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("wa_calendar_accounts").update({ last_error: erro }).eq("id", conta.id);
    return { total: 0, erro };
  }
}

/** Sincroniza todas as contas ativas. */
export async function sincronizar(dias = 120): Promise<{ total: number; erro?: string }> {
  const contas = (await listarContas()).filter((c) => c.ativo);
  if (!contas.length) return { total: 0, erro: "Nenhuma agenda conectada ainda." };
  let total = 0;
  const erros: string[] = [];
  for (const conta of contas) {
    const r = await sincronizarConta(conta, dias);
    total += r.total;
    if (r.erro) erros.push(`${conta.nome}: ${r.erro}`);
  }
  return erros.length ? { total, erro: erros.join(" · ") } : { total };
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export async function listarEventos(
  deISO: string,
  ateISO: string,
  opcoes?: { somenteVisiveis?: boolean },
): Promise<AgendaEvento[]> {
  const { data } = await supabaseAdmin
    .from("wa_calendar_events")
    .select(CAMPOS_EVENTO)
    .gte("inicio", deISO)
    .lte("inicio", ateISO)
    .is("deleted_at", null)
    .order("inicio", { ascending: true });
  const eventos = (data ?? []) as AgendaEvento[];
  if (!opcoes?.somenteVisiveis) return eventos;
  const contas = await listarContas();
  const ocultas = new Set(contas.filter((c) => !c.visivel).map((c) => c.id));
  return eventos.filter((e) => !e.account_id || !ocultas.has(e.account_id));
}

/** Compromissos que batem com o período informado (checagem de conflito). */
export async function conflitos(inicioISO: string, fimISO: string, ignorarId?: string): Promise<AgendaEvento[]> {
  const margem = 24 * 3600000;
  const eventos = await listarEventos(
    new Date(new Date(inicioISO).getTime() - margem).toISOString(),
    new Date(new Date(fimISO).getTime() + margem).toISOString(),
  );
  const ini = new Date(inicioISO).getTime();
  const fim = new Date(fimISO).getTime();
  return eventos.filter(
    (e) => e.id !== ignorarId && new Date(e.inicio).getTime() < fim && new Date(e.fim).getTime() > ini,
  );
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

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
  accountId?: string | null;
  diaInteiro?: boolean | null;
  linkReuniao?: string | null;
  convidados?: string[] | null;
  url?: string | null;
};

/** Cria o compromisso na agenda escolhida (ou na padrão) e no banco. */
export async function criarEvento(entrada: EntradaEvento): Promise<AgendaEvento> {
  const conta = entrada.accountId ? await contaPorId(entrada.accountId) : await contaPadrao();
  let uid = novoUid();
  let href: string | null = null;
  let etag: string | null = null;
  let ics: string | null = null;

  if (conta?.provider === "google" && conta.calendar_id) {
    uid = await criarEventoGoogle(conta.calendar_id, entrada);
  } else if (conta) {
    const auth = authDaConta(conta);
    if (auth && conta.calendar_url) {
      const r = await salvarEvento(auth, conta.calendar_url, { uid, ...entrada });
      href = r.href;
      etag = r.etag;
      ics = r.ics;
    }
  }

  const detalhes: Record<string, string | Array<{ email: string }>> = {};
  if (entrada.linkReuniao) detalhes['link_reuniao'] = entrada.linkReuniao;
  if (entrada.url) detalhes['url'] = entrada.url;
  if (entrada.convidados?.length) {
    detalhes['participantes'] = entrada.convidados.map((email) => ({ email }));
  }

  const { data, error } = await supabaseAdmin
    .from("wa_calendar_events")
    .insert({
      uid,
      href,
      etag,
      raw_ics: ics,
      account_id: conta?.id ?? null,
      provider: conta?.provider ?? "titan",
      titulo: entrada.titulo,
      descricao: entrada.descricao ?? null,
      local: entrada.local ?? null,
      inicio: entrada.inicio,
      fim: entrada.fim,
      dia_inteiro: entrada.diaInteiro ?? false,
      detalhes: (Object.keys(detalhes).length ? detalhes : null) as unknown as never,
      origem: "chat",
      telefone: entrada.telefone ?? null,
      criado_por: entrada.criado_por ?? null,
    })
    .select(CAMPOS_EVENTO)
    .single();
  if (error) throw new Error(error.message);
  return data as AgendaEvento;
}

/** Atualiza um compromisso no banco e na agenda de origem. */
export async function atualizarEvento(id: string, patch: Partial<EntradaEvento>): Promise<AgendaEvento> {
  const { data: atual } = await supabaseAdmin
    .from("wa_calendar_events")
    .select(CAMPOS_EVENTO)
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

  const conta = ev.account_id ? await contaPorId(ev.account_id) : await contaPadrao();
  let ics: string | null = null;
  if (conta?.provider === "google" && conta.calendar_id) {
    await atualizarEventoGoogle(conta.calendar_id, ev.uid, merged);
  } else if (conta) {
    const auth = authDaConta(conta);
    if (auth && conta.calendar_url) {
      const r = await salvarEvento(auth, conta.calendar_url, { uid: ev.uid, ...merged }, ev.href);
      ics = r.ics;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("wa_calendar_events")
    .update({ ...merged, raw_ics: ics ?? undefined })
    .eq("id", id)
    .select(CAMPOS_EVENTO)
    .single();
  if (error) throw new Error(error.message);
  return data as AgendaEvento;
}

/** Apaga o compromisso na origem e no banco. */
export async function removerEvento(id: string): Promise<void> {
  const { data: atual } = await supabaseAdmin
    .from("wa_calendar_events")
    .select("id, uid, href, account_id")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return;
  const conta = atual.account_id ? await contaPorId(atual.account_id as string) : await contaPadrao();
  try {
    if (conta?.provider === "google" && conta.calendar_id) {
      await excluirEventoGoogle(conta.calendar_id, atual.uid as string);
    } else if (conta) {
      const auth = authDaConta(conta);
      if (auth && conta.calendar_url) {
        await excluirEvento(auth, conta.calendar_url, atual.uid as string, atual.href as string | null);
      }
    }
  } catch {
    /* se já não existe lá, segue e limpa aqui */
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

/** Horários livres nos próximos dias (duração em minutos), olhando todas as agendas. */
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
      slots.push({ inicio: ini.toISOString(), fim: fim.toISOString(), label: formatarSlot(ini) });
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
