import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato aaaa-mm-dd");
const iata = z.string().regex(/^[A-Za-z]{3}$/, "Código IATA de 3 letras");

const buscaSchema = z.object({
  trechos: z.array(z.object({ origem: iata, destino: iata, data: dataIso })).min(1).max(6),
  dataVolta: dataIso.optional().nullable(),
  adultos: z.number().int().min(1).max(9).default(1),
  criancas: z.number().int().min(0).max(8).optional(),
  bebes: z.number().int().min(0).max(8).optional(),
  classe: z.number().int().min(1).max(4).optional(),
  ravPercentual: z.number().min(0).max(100).optional(),
  pagina: z.number().int().min(1).max(20).optional(),
  porPagina: z.number().int().min(1).max(50).optional(),
  provedores: z.array(z.string().max(40)).max(20).optional(),
});

/** Diagnóstico: valida login/credenciais da conta PassHub. */
export const passhubStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { passhubPing } = await import("./client.server");
    return passhubPing();
  });

/** Busca aérea (ida, ida e volta e multitrecho) na PassHub. */
export const passhubBuscar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => buscaSchema.parse(input))
  .handler(async ({ data }) => {
    const { passhubBuscarVoos } = await import("./search.server");
    try {
      return { ok: true as const, resultado: await passhubBuscarVoos(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na busca PassHub";
      console.error("[passhub] busca falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Tarifação do voo escolhido (payload devolvido pela busca). */
export const passhubTarifarVoo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ payload: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    const { passhubTarifar } = await import("./search.server");
    try {
      return { ok: true as const, resultado: await passhubTarifar(data.payload) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao tarifar" };
    }
  });

/** Busca já normalizada para o motor interno (cards, filtros e ordenação). */
export const passhubMotorBuscar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => buscaSchema.parse(input))
  .handler(async ({ data }) => {
    const { passhubBuscarVoos } = await import("./search.server");
    const { normalizaBuscaPassHub } = await import("./normalize.server");
    try {
      const bruto = await passhubBuscarVoos(data);
      return { ok: true as const, resultado: normalizaBuscaPassHub(bruto), bruto };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na busca PassHub";
      console.error("[passhub] motor falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });
