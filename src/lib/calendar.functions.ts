import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: { supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> }; userId?: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Sem permissão para configurar a agenda.");
}

/** Situação atual da conexão com o calendário Titan. */
export const getCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { carregarConfig } = await import("@/lib/whatsapp/calendar.server");
    const cfg = await carregarConfig();
    return {
      conectado: Boolean(cfg?.calendar_url && cfg?.ativo),
      serverUrl: cfg?.server_url ?? "https://dav.titan.email",
      email: cfg?.username ?? "",
      calendarioNome: cfg?.calendar_nome ?? null,
      ultimaSync: cfg?.last_sync_at ?? null,
      ultimoErro: cfg?.last_error ?? null,
      _u: (context as { userId?: string }).userId ?? null,
    };
  });

/** Testa o login no Titan e devolve os calendários encontrados. */
export const testarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverUrl?: string; email: string; senha: string }) => {
    if (!d?.email || !d?.senha) throw new Error("Informe e-mail e senha do Titan.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { testarConexao } = await import("@/lib/whatsapp/caldav.server");
    const calendarios = await testarConexao({
      serverUrl: data.serverUrl?.trim() || "https://dav.titan.email",
      username: data.email.trim(),
      password: data.senha,
    });
    return calendarios;
  });

/** Salva a conexão com o Titan e faz a primeira sincronização. */
export const conectarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverUrl?: string; email: string; senha: string; calendarUrl: string; calendarNome?: string }) => {
    if (!d?.email || !d?.senha || !d?.calendarUrl) throw new Error("Dados incompletos para conectar a agenda.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarConfig, sincronizar } = await import("@/lib/whatsapp/calendar.server");

    const atual = await carregarConfig();
    const valores = {
      provider: "titan",
      server_url: data.serverUrl?.trim() || "https://dav.titan.email",
      username: data.email.trim(),
      password: data.senha,
      calendar_url: data.calendarUrl,
      calendar_nome: data.calendarNome ?? null,
      ativo: true,
      last_error: null,
    };
    if (atual) await supabaseAdmin.from("wa_calendar_config").update(valores).eq("id", atual.id);
    else await supabaseAdmin.from("wa_calendar_config").insert(valores);

    return await sincronizar();
  });

/** Desliga a integração e apaga as credenciais guardadas. */
export const desconectarCalendario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarConfig } = await import("@/lib/whatsapp/calendar.server");
    const atual = await carregarConfig();
    if (atual) {
      await supabaseAdmin
        .from("wa_calendar_config")
        .update({ username: null, password: null, calendar_url: null, calendar_nome: null, ativo: false, last_error: null })
        .eq("id", atual.id);
      await supabaseAdmin.from("wa_calendar_events").delete().eq("origem", "titan");
    }
    return { ok: true };
  });

/** Puxa novamente os compromissos do Titan. */
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

/** Cria um compromisso (vai também para o Titan). */
export const criarCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { titulo: string; descricao?: string | null; local?: string | null; inicio: string; fim: string; telefone?: string | null }) => {
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
