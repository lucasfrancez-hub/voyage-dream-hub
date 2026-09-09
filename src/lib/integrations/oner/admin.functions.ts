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

/* ---------------- PIX — preparação manual ---------------- */

export type TarefaPixResumo = {
  id: string;
  criado_em: string;
  cliente: string | null;
  email: string | null;
  produto: string | null;
  valor: number | null;
  comissao: number | null;
  valor_liquido: number | null;
  moeda: string | null;
  pedido: string | null;
  localizador: string | null;
  brcode: string | null;
  observacoes: string | null;
  estado: string;
  etapa: string;
  pendente: boolean;
  oferta: string;
  busca: string;
  etapas: Array<{ chave: string; titulo: string; feito: boolean; em: string | null }>;
  passageiros: Array<{ nome: string; tipo: string; documento: string | null; nascimento: string | null }>;
};

export const onerListarTarefasPix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TarefaPixResumo[]> => {
    await exigirAdmin(context as never);
    const { listarTarefasPix } = await import("./pix-manual.server");
    const { listarPassageiros } = await import("./store.server");
    const { ONER_PIX_STEPS, ONER_PIX_STEP_LABEL } = await import("./config");
    const tarefas = await listarTarefasPix();
    const resultado: TarefaPixResumo[] = [];
    for (const t of tarefas) {
      const pax = (await listarPassageiros(t.id)) as unknown as Array<Record<string, unknown>>;
      const lista = t.manual_checklist ?? {};
      resultado.push({
        id: t.id,
        criado_em: t.created_at,
        cliente: t.customer_name,
        email: t.customer_email,
        produto: t.product_kind,
        valor: t.amount,
        comissao: t.commission_amount,
        valor_liquido: t.provider_net_amount,
        moeda: t.currency,
        pedido: t.provider_order_number,
        localizador: t.locator,
        brcode: t.provider_pix_brcode,
        observacoes: t.manual_notes,
        estado: t.state,
        etapa: ONER_STATE_LABEL[t.state] ?? t.state,
        pendente: t.state === "PIX_MANUAL_PREPARATION",
        oferta: JSON.stringify(t.offer_payload ?? {}, null, 2),
        busca: JSON.stringify(t.search_reference ?? {}, null, 2),
        etapas: ONER_PIX_STEPS.map((chave) => ({
          chave,
          titulo: ONER_PIX_STEP_LABEL[chave],
          feito: Boolean(lista[chave]?.feito),
          em: lista[chave]?.em ?? null,
        })),
        passageiros: pax.map((p) => ({
          nome: `${String(p["first_name"] ?? "")} ${String(p["last_name"] ?? "")}`.trim(),
          tipo: String(p["passenger_type"] ?? "ADT"),
          documento: (p["document_number"] as string | null) ?? null,
          nascimento: (p["birth_date"] as string | null) ?? null,
        })),
      });
    }
    return resultado;
  });

export const onerMarcarEtapaPix = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; etapa: string; feito: boolean }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { marcarEtapaPix } = await import("./pix-manual.server");
    await marcarEtapaPix(data.id, data.etapa as never, data.feito, (context as { userId: string }).userId);
    return { ok: true };
  });

export const onerRegistrarDadosPix = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: string;
      valorLiquido?: number | null;
      numeroPedido?: string | null;
      brcode?: string | null;
      localizador?: string | null;
      observacoes?: string | null;
    }) => d,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { registrarDadosPix } = await import("./pix-manual.server");
    const { id, ...dados } = data;
    await registrarDadosPix(id, dados);
    return { ok: true };
  });

export const onerConcluirPix = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await exigirAdmin(context as never);
    const { concluirTarefaPix } = await import("./pix-manual.server");
    await concluirTarefaPix(data.id, (context as { userId: string }).userId);
    return { ok: true };
  });

