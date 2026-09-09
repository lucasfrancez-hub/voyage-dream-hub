/**
 * Funções do painel interno da integração Comprar Viagem / Oner.
 * Só quem é administrador consegue usar.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ONER_STATE_LABEL, type OnerState } from "./config";

async function exigirAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Acesso restrito");
}

export const onerStatusConexao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as never);
    const { statusConexao } = await import("./session.server");
    return statusConexao();
  });

export const onerPedirCodigo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirAdmin(context as never);
    const { solicitarCodigo } = await import("./session.server");
    const r = await solicitarCodigo(null);
    return { ok: r.ok, mensagem: r.ok ? "Código enviado por e-mail" : (r.call.message ?? "Falhou") };
  });

export const onerEnviarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: { codigo: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { informarCodigoManual } = await import("./otp.server");
    const guardado = await informarCodigoManual(data.codigo);
    if (!guardado.ok) return { ok: false, mensagem: "Código inválido ou sem login em andamento" };
    const { validarCodigo } = await import("./session.server");
    const r = await validarCodigo(String(data.codigo).replace(/\D/g, ""));
    return { ok: r.ok, mensagem: r.ok ? "Conexão estabelecida" : (r.erro ?? "Código recusado") };
  });

export type OperacaoResumo = {
  id: string;
  provider_order_number: string | null;
  provider_sale_id: string | null;
  state: string;
  provider_status: string | null;
  amount: number | null;
  currency: string | null;
  customer_name: string | null;
  locator: string | null;
  last_error: string | null;
  updated_at: string;
  etapa: string;
};

export type EventoResumo = {
  id: string;
  created_at: string;
  event_type: string;
  message: string | null;
};

export const onerListarOperacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperacaoResumo[]> => {
    await exigirAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integration_orders")
      .select(
        "id, provider_order_number, provider_sale_id, state, provider_status, amount, currency, customer_name, locator, last_error, updated_at",
      )
      .eq("provider", "oner")
      .order("updated_at", { ascending: false })
      .limit(100);
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((o) => ({
      id: String(o["id"]),
      provider_order_number: (o["provider_order_number"] as string | null) ?? null,
      provider_sale_id: (o["provider_sale_id"] as string | null) ?? null,
      state: String(o["state"]),
      provider_status: (o["provider_status"] as string | null) ?? null,
      amount: (o["amount"] as number | null) ?? null,
      currency: (o["currency"] as string | null) ?? null,
      customer_name: (o["customer_name"] as string | null) ?? null,
      locator: (o["locator"] as string | null) ?? null,
      last_error: (o["last_error"] as string | null) ?? null,
      updated_at: String(o["updated_at"]),
      etapa: ONER_STATE_LABEL[o["state"] as OnerState] ?? String(o["state"]),
    }));
  });

export const onerDetalheOperacao = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ eventos: EventoResumo[] } | null> => {
    await exigirAdmin(context as never);
    const { buscarOperacao, listarEventos } = await import("./store.server");
    const op = await buscarOperacao(data.id);
    if (!op) return null;
    const eventos = (await listarEventos(data.id)) as unknown as Array<Record<string, unknown>>;
    return {
      eventos: eventos.map((e) => ({
        id: String(e["id"]),
        created_at: String(e["created_at"]),
        event_type: String(e["event_type"]),
        message: (e["message"] as string | null) ?? null,
      })),
    };
  });


export const onerSincronizarAgora = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { sincronizarOperacao } = await import("./sync.server");
    return sincronizarOperacao(data.id);
  });

export const onerMarcarRevisao = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; estado: OnerState; observacao?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { mudarEtapa } = await import("./store.server");
    await mudarEtapa(data.id, data.estado, { detail: data.observacao ?? "Ajuste manual pelo painel" });
    return { ok: true };
  });
