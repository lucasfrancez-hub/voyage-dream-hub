/**
 * Servidor do app privado da agenda (`/agenda/<token>`).
 *
 * Não tem login: o acesso vale pelo link secreto + PIN de 4 dígitos.
 * Por isso todas as funções aqui revalidam token+PIN a cada chamada.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* Autenticação por link + PIN                                         */
/* ------------------------------------------------------------------ */

type LinkAgenda = { id: string; token: string; pin_hash: string | null; nome: string; ativo: boolean };

async function hashPin(token: string, pin: string): Promise<string> {
  const dados = new TextEncoder().encode(`viaair-agenda:${token}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function abrirLink(token: string, pin?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wa_calendar_app_links")
    .select("id, token, pin_hash, nome, ativo")
    .eq("token", token)
    .maybeSingle();
  const link = data as LinkAgenda | null;
  if (!link || !link.ativo) return { link: null as LinkAgenda | null, precisaPin: false, pinOk: false };
  if (!link.pin_hash) return { link, precisaPin: false, pinOk: true };
  if (!pin) return { link, precisaPin: true, pinOk: false };
  const ok = (await hashPin(token, pin)) === link.pin_hash;
  return { link, precisaPin: !ok, pinOk: ok };
}

async function exigirAcesso(token: string, pin?: string | null): Promise<LinkAgenda> {
  const { link, pinOk } = await abrirLink(token, pin);
  if (!link) throw new Error("Link inválido.");
  if (!pinOk) throw new Error("PIN incorreto.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("wa_calendar_app_links")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", link.id);
  return link;
}

/* ------------------------------------------------------------------ */
/* Abertura do app                                                     */
/* ------------------------------------------------------------------ */

export const abrirAgendaApp = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; pin?: string | null }) => {
    if (!d?.token) throw new Error("Link inválido.");
    return d;
  })
  .handler(async ({ data }) => {
    const { link, precisaPin, pinOk } = await abrirLink(data.token, data.pin);
    if (!link) return { valido: false, precisaPin: false, nome: "", vapid: "" };
    const { chavePublicaVapid } = await import("@/lib/whatsapp/webpush.server");
    return {
      valido: true,
      precisaPin: precisaPin && !pinOk,
      nome: link.nome,
      vapid: pinOk ? chavePublicaVapid() : "",
    };
  });

/* ------------------------------------------------------------------ */
/* Dados da agenda                                                     */
/* ------------------------------------------------------------------ */

export const eventosAgendaApp = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; pin?: string | null; de: string; ate: string }) => {
    if (!d?.token || !d?.de || !d?.ate) throw new Error("Dados incompletos.");
    return d;
  })
  .handler(async ({ data }) => {
    await exigirAcesso(data.token, data.pin);
    const { listarEventos, listarContas } = await import("@/lib/whatsapp/calendar.server");
    const [eventos, contas] = await Promise.all([
      listarEventos(data.de, data.ate, { somenteVisiveis: true }),
      listarContas(),
    ]);
    return {
      eventos,
      contas: contas.map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, provider: c.provider, email: c.username, calendarioNome: c.calendar_nome })),
    };
  });

/** Cria um compromisso direto pelo app da agenda (link + PIN). */
export const criarEventoAgendaApp = createServerFn({ method: "POST" })
  .inputValidator((d: {
    token: string;
    pin?: string | null;
    titulo: string;
    descricao?: string | null;
    local?: string | null;
    inicio: string;
    fim: string;
    accountId?: string | null;
    diaInteiro?: boolean | null;
    linkReuniao?: string | null;
    convidados?: string[] | null;
    url?: string | null;
  }) => {
    if (!d?.token) throw new Error("Link inválido.");
    if (!d?.titulo?.trim()) throw new Error("Informe o título do compromisso.");
    if (!d?.inicio || !d?.fim) throw new Error("Informe início e fim.");
    if (new Date(d.fim) <= new Date(d.inicio)) throw new Error("O fim precisa ser depois do início.");
    return d;
  })
  .handler(async ({ data }) => {
    const link = await exigirAcesso(data.token, data.pin);
    const { criarEvento } = await import("@/lib/whatsapp/calendar.server");
    const evento = await criarEvento({
      titulo: data.titulo.trim(),
      descricao: data.descricao ?? null,
      local: data.local ?? null,
      inicio: data.inicio,
      fim: data.fim,
      accountId: data.accountId ?? null,
      diaInteiro: data.diaInteiro ?? false,
      linkReuniao: data.linkReuniao ?? null,
      convidados: data.convidados ?? null,
      url: data.url ?? null,
      criado_por: `app:${link.nome}`,
    });
    return { ok: true, id: evento.id };
  });

/** Edita um compromisso pelo app da agenda (link + PIN). */
export const atualizarEventoAgendaApp = createServerFn({ method: "POST" })
  .inputValidator((d: {
    token: string;
    pin?: string | null;
    id: string;
    titulo?: string;
    descricao?: string | null;
    local?: string | null;
    inicio?: string;
    fim?: string;
  }) => {
    if (!d?.token) throw new Error("Link inválido.");
    if (!d?.id) throw new Error("Compromisso inválido.");
    if (d.inicio && d.fim && new Date(d.fim) <= new Date(d.inicio)) {
      throw new Error("O fim precisa ser depois do início.");
    }
    return d;
  })
  .handler(async ({ data }) => {
    await exigirAcesso(data.token, data.pin);
    const { atualizarEvento } = await import("@/lib/whatsapp/calendar.server");
    const { token: _t, pin: _p, id, ...patch } = data;
    await atualizarEvento(id, patch);
    return { ok: true };
  });

/** Exclui um compromisso pelo app da agenda (link + PIN). */
export const excluirEventoAgendaApp = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; pin?: string | null; id: string }) => {
    if (!d?.token) throw new Error("Link inválido.");
    if (!d?.id) throw new Error("Compromisso inválido.");
    return d;
  })
  .handler(async ({ data }) => {
    await exigirAcesso(data.token, data.pin);
    const { removerEvento } = await import("@/lib/whatsapp/calendar.server");
    await removerEvento(data.id);
    return { ok: true };
  });



/* ------------------------------------------------------------------ */
/* Notificações push                                                   */
/* ------------------------------------------------------------------ */

export const salvarPushAgenda = createServerFn({ method: "POST" })
  .inputValidator((d: {
    token: string;
    pin?: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
    prefs?: { lembrete?: boolean; resumo?: boolean; novo?: boolean; minutosAntes?: number };
  }) => {
    if (!d?.token || !d?.endpoint || !d?.p256dh || !d?.auth) throw new Error("Inscrição inválida.");
    return d;
  })
  .handler(async ({ data }) => {
    const link = await exigirAcesso(data.token, data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("wa_calendar_push_subs").upsert(
      {
        link_id: link.id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        pref_lembrete: data.prefs?.lembrete ?? true,
        pref_resumo: data.prefs?.resumo ?? true,
        pref_novo: data.prefs?.novo ?? true,
        minutos_antes: data.prefs?.minutosAntes ?? 30,
        ativo: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerPushAgenda = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; pin?: string | null; endpoint: string }) => {
    if (!d?.token || !d?.endpoint) throw new Error("Inscrição inválida.");
    return d;
  })
  .handler(async ({ data }) => {
    await exigirAcesso(data.token, data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wa_calendar_push_subs").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const testarPushAgenda = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; pin?: string | null; endpoint: string }) => {
    if (!d?.token || !d?.endpoint) throw new Error("Inscrição inválida.");
    return d;
  })
  .handler(async ({ data }) => {
    await exigirAcesso(data.token, data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enviarPush } = await import("@/lib/whatsapp/webpush.server");
    const { data: sub } = await supabaseAdmin
      .from("wa_calendar_push_subs")
      .select("endpoint, p256dh, auth")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    if (!sub) throw new Error("Este aparelho ainda não está inscrito.");
    const r = await enviarPush(sub as { endpoint: string; p256dh: string; auth: string }, {
      title: "Agenda VIA AIR",
      body: "Notificações ligadas neste aparelho ✅",
      url: "/agenda",
      tag: "teste",
    });
    if (!r.ok) throw new Error(r.erro || `Falha ao enviar (${r.status})`);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Administração do link (painel interno)                              */
/* ------------------------------------------------------------------ */

export const listarLinksAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_calendar_app_links")
      .select("id, token, nome, ativo, last_seen_at, pin_hash, created_at")
      .order("created_at", { ascending: true });
    const links = (data ?? []) as Array<{ id: string; token: string; nome: string; ativo: boolean; last_seen_at: string | null; pin_hash: string | null }>;
    const { count } = await supabaseAdmin
      .from("wa_calendar_push_subs")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true);
    return {
      links: links.map((l) => ({ ...l, temPin: !!l.pin_hash, pin_hash: undefined })),
      aparelhos: count ?? 0,
    };
  });

export const criarLinkAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome?: string; pin: string }) => {
    if (!/^\d{4}$/.test(d?.pin ?? "")) throw new Error("O PIN precisa ter 4 números.");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const token = Array.from(bytes)
      .map((b) => "abcdefghijkmnopqrstuvwxyz23456789"[b % 33])
      .join("");
    const { error } = await supabaseAdmin.from("wa_calendar_app_links").insert({
      token,
      nome: data.nome?.trim() || "Agenda VIA AIR",
      pin_hash: await hashPin(token, data.pin),
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const removerLinkAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("Link inválido.");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wa_calendar_app_links").delete().eq("id", data.id);
    return { ok: true };
  });
