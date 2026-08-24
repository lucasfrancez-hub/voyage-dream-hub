import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Lista os itens de um orçamento da operadora com o status atual. */
export const consultarReservaFRTFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orcamentoId: number }) => input)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { consultarReservaFRT } = await import("./cancelamento.server");
    return consultarReservaFRT(data.orcamentoId);
  });

/** Cancela itens (ou tudo) de um orçamento na operadora e grava o rastro. */
export const cancelarReservaFRTFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orcamentoId: number;
      itens?: { tipo: "aereo" | "hotel" | "servico" | "seguro"; id: number }[] | null;
      motivo?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { cancelarReservaFRT } = await import("./cancelamento.server");
    try {
      return await cancelarReservaFRT(data);
    } catch (e) {
      return {
        ok: false,
        orcamentoId: data.orcamentoId,
        itens: [],
        passos: [{ passo: "Cancelamento", ok: false, detalhe: e instanceof Error ? e.message : "Falha inesperada" }],
      };
    }
  });
