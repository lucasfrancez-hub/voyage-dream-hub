import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Malha aérea dinâmica da CompreFácil. */
export const buscarAereoCF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      origem: string;
      destino: string;
      ida: string;
      volta?: string | null;
      adultos: number;
      criancas?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { buscarAereoDinamicoCF } = await import("./dinamico.server");
    try {
      const ofertas = await buscarAereoDinamicoCF(data);
      return { ok: true as const, ofertas };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na busca aérea", ofertas: [] };
    }
  });

/** Listagem de hotéis dinâmica da CompreFácil. */
export const buscarHospedagemCF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { cidadeId: number; checkin: string; checkout: string; adultos: number; criancas?: number }) => input,
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { buscarHotelDinamicoCF } = await import("./dinamico.server");
    try {
      const hoteis = await buscarHotelDinamicoCF(data);
      return { ok: true as const, hoteis };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na busca de hotéis", hoteis: [] };
    }
  });
