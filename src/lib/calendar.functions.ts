import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: { supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> }; userId?: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Sem permissão para configurar a agenda.");
}

type Provedor = "titan" | "icloud" | "google";

/** Agendas conectadas (sem expor credenciais). */
export const listarContasAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listarContas } = await import("@/lib/whatsapp/calendar.server");
    const contas = await listarContas();
    return contas.map((c) => ({
      id: c.id,
      provider: c.provider,
      nome: c.nome,
      cor: c.cor,
      email: c.username,
      calendarioNome: c.calendar_nome,
      ativo: c.ativo,
      visivel: c.visivel,
      padrao: c.padrao,
      ultimaSync: c.last_sync_at,
      ultimoErro: c.last_error,
    }));
  });

/** Testa o login CalDAV (Titan ou iCloud) e devolve os calendários encontrados. */
export const testarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: Provedor; serverUrl?: string; email: string; senha: string }) => {
    if (!d?.email || !d?.senha) throw new Error("Informe e-mail e senha.");
    if (d.provider === "google") throw new Error("O Google Agenda conecta direto, sem senha.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { testarConexao } = await import("@/lib/whatsapp/caldav.server");
    const { SERVIDOR_PADRAO } = await import("@/lib/whatsapp/calendar.server");
    return await testarConexao({
      serverUrl: data.serverUrl?.trim() || SERVIDOR_PADRAO[data.provider],
      username: data.email.trim(),
      password: data.senha,
    });
  });

/** Salva uma agenda CalDAV (Titan ou iCloud) e sincroniza. */
export const conectarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    provider: Provedor;
    nome?: string;
    serverUrl?: string;
    email: string;
    senha: string;
    calendarUrl: string;
    calendarNome?: string;
  }) => {
    if (!d?.email || !d?.senha || !d?.calendarUrl) throw new Error("Dados incompletos para conectar a agenda.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CORES, SERVIDOR_PADRAO, contaPorId, listarContas, sincronizarConta } = await import(
      "@/lib/whatsapp/calendar.server"
    );

    const contas = await listarContas();
    const existente = contas.find((c) => c.provider === data.provider && c.username === data.email.trim());
    const valores = {
      provider: data.provider,
      nome: data.nome?.trim() || (data.provider === "titan" ? "VIA AIR — Titan" : "Pessoal — iCloud"),
      cor: CORES[data.provider],
      server_url: data.serverUrl?.trim() || SERVIDOR_PADRAO[data.provider],
      username: data.email.trim(),
      password: data.senha,
      calendar_url: data.calendarUrl,
      calendar_nome: data.calendarNome ?? null,
      ativo: true,
      visivel: true,
      padrao: contas.length === 0,
      last_error: null,
    };

    let id = existente?.id ?? null;
    if (id) await supabaseAdmin.from("wa_calendar_accounts").update(valores).eq("id", id);
    else {
      const { data: nova, error } = await supabaseAdmin
        .from("wa_calendar_accounts")
        .insert(valores)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = nova.id as string;
    }

    const conta = await contaPorId(id);
    return conta ? await sincronizarConta(conta) : { total: 0 };
  });

/** Lista os calendários da conta Google conectada ao projeto. */
export const listarCalendariosGoogleFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as never);
    const { listarCalendariosGoogle } = await import("@/lib/whatsapp/gcal.server");
    return await listarCalendariosGoogle();
  });

/** Adiciona um calendário do Google ao painel. */
export const conectarGoogleAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { calendarId: string; nome?: string }) => {
    if (!d?.calendarId) throw new Error("Escolha um calendário do Google.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CORES, contaPorId, listarContas, sincronizarConta } = await import("@/lib/whatsapp/calendar.server");

    const contas = await listarContas();
    const existente = contas.find((c) => c.provider === "google" && c.calendar_id === data.calendarId);
    const valores = {
      provider: "google",
      nome: data.nome?.trim() || "Google Agenda",
      cor: CORES.google,
      calendar_id: data.calendarId,
      calendar_nome: data.nome?.trim() || data.calendarId,
      ativo: true,
      visivel: true,
      padrao: contas.length === 0,
      last_error: null,
    };

    let id = existente?.id ?? null;
    if (id) await supabaseAdmin.from("wa_calendar_accounts").update(valores).eq("id", id);
    else {
      const { data: nova, error } = await supabaseAdmin
        .from("wa_calendar_accounts")
        .insert(valores)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = nova.id as string;
    }

    const conta = await contaPorId(id);
    return conta ? await sincronizarConta(conta) : { total: 0 };
  });

/** Liga/desliga a exibição de uma agenda ou define como padrão. */
export const ajustarContaAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; visivel?: boolean; padrao?: boolean; nome?: string; cor?: string }) => {
    if (!d?.id) throw new Error("Agenda inválida.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.padrao) await supabaseAdmin.from("wa_calendar_accounts").update({ padrao: false }).neq("id", data.id);
    const patch: { visivel?: boolean; padrao?: boolean; nome?: string; cor?: string } = {};
    if (data.visivel !== undefined) patch.visivel = data.visivel;
    if (data.padrao !== undefined) patch.padrao = data.padrao;
    if (data.nome) patch.nome = data.nome;
    if (data.cor) patch.cor = data.cor;
    await supabaseAdmin.from("wa_calendar_accounts").update(patch).eq("id", data.id);
    return { ok: true };
  });

/** Remove uma agenda conectada e os compromissos espelhados dela. */
export const desconectarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("Agenda inválida.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wa_calendar_events").delete().eq("account_id", data.id);
    await supabaseAdmin.from("wa_calendar_accounts").delete().eq("id", data.id);
    return { ok: true };
  });

/** Puxa novamente os compromissos de todas as agendas. */
export const sincronizarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sincronizar } = await import("@/lib/whatsapp/calendar.server");
    return await sincronizar();
  });

/** Compromissos de um período. */
export const listarCompromissos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { de: string; ate: string }) => {
    if (!d?.de || !d?.ate) throw new Error("Período inválido.");
    return d;
  })
  .handler(async ({ data }) => {
    const { listarEventos } = await import("@/lib/whatsapp/calendar.server");
    return await listarEventos(data.de, data.ate);
  });

/** Verifica choque de horário entre todas as agendas. */
export const verificarConflitos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inicio: string; fim: string; ignorarId?: string }) => {
    if (!d?.inicio || !d?.fim) throw new Error("Informe início e fim.");
    return d;
  })
  .handler(async ({ data }) => {
    const { conflitos } = await import("@/lib/whatsapp/calendar.server");
    return await conflitos(data.inicio, data.fim, data.ignorarId);
  });

/** Cria um compromisso na agenda escolhida. */
export const criarCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    titulo: string;
    descricao?: string | null;
    local?: string | null;
    inicio: string;
    fim: string;
    telefone?: string | null;
    accountId?: string | null;
  }) => {
    if (!d?.titulo?.trim()) throw new Error("Informe o título do compromisso.");
    if (!d?.inicio || !d?.fim) throw new Error("Informe início e fim.");
    if (new Date(d.fim) <= new Date(d.inicio)) throw new Error("O fim precisa ser depois do início.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { criarEvento } = await import("@/lib/whatsapp/calendar.server");
    return await criarEvento({
      ...data,
      criado_por: (context as { claims?: { email?: string } }).claims?.email ?? null,
    });
  });

/** Edita um compromisso existente. */
export const atualizarCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; titulo?: string; descricao?: string | null; local?: string | null; inicio?: string; fim?: string }) => {
    if (!d?.id) throw new Error("Compromisso inválido.");
    return d;
  })
  .handler(async ({ data }) => {
    const { atualizarEvento } = await import("@/lib/whatsapp/calendar.server");
    const { id, ...patch } = data;
    return await atualizarEvento(id, patch);
  });

/** Exclui um compromisso. */
export const excluirCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("Compromisso inválido.");
    return d;
  })
  .handler(async ({ data }) => {
    const { removerEvento } = await import("@/lib/whatsapp/calendar.server");
    await removerEvento(data.id);
    return { ok: true };
  });
