import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Reservas aéreas registradas nos pedidos (para listar junto das da consolidadora). */
export const pedidosReservasAereas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listarReservasAereasDePedidos } = await import("./reservas-aereas.server");
    try {
      return { ok: true as const, reservas: await listarReservasAereasDePedidos() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao listar reservas dos pedidos";
      console.error("[pedidos] reservas aéreas falharam:", msg);
      return { ok: false as const, erro: msg };
    }
  });
