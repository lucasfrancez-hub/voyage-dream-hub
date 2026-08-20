import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato aaaa-mm-dd");
const iata = z.string().regex(/^[A-Za-z]{3}$/, "Código IATA de 3 letras");

const buscaSchema = z.object({
  trechos: z
    .array(z.object({ origem: iata, destino: iata, data: dataIso }))
    .min(1)
    .max(6),
  adultos: z.number().int().min(1).max(9).default(1),
  criancas: z.number().int().min(0).max(8).optional(),
  bebes: z.number().int().min(0).max(8).optional(),
  cabine: z.enum(["Y", "S", "C", "F"]).optional(),
  companhia: z.string().max(3).optional().nullable(),
  somenteDiretos: z.boolean().optional(),
  maxResultados: z.number().int().min(1).max(50).optional(),
  moeda: z.string().length(3).optional(),
});

const passageiroSchema = z.object({
  nome: z.string().min(2).max(60),
  sobrenome: z.string().min(2).max(60),
  tipo: z.enum(["ADT", "CHD", "INF"]),
  nascimento: dataIso.optional().nullable(),
  documento: z.string().max(40).optional().nullable(),
  email: z.string().email().max(120).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
});

const reservaSchema = z.object({
  segmentos: z
    .array(
      z.object({
        companhia: z.string().min(2).max(3),
        voo: z.string().min(1).max(5),
        classe: z.string().min(1).max(2),
        origem: iata,
        destino: iata,
        data: dataIso,
        partida: z.string().regex(/^\d{2}:\d{2}$/),
        chegada: z.string().regex(/^\d{2}:\d{2}$/),
        assentos: z.number().int().min(1).max(9),
      }),
    )
    .min(1)
    .max(8),
  passageiros: z.array(passageiroSchema).min(1).max(9),
  telefoneAgencia: z.string().min(8).max(30),
  emailContato: z.string().email().max(120).optional().nullable(),
  confirmar: z.literal(true),
  salvar: z.boolean().optional(),
});

/** Diagnóstico: valida credenciais e ambiente configurados. */
export const sabreStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sabrePing } = await import("./client.server");
    return sabrePing();
  });

/** Busca aérea (ida, ida e volta e multitrecho) no Bargain Finder Max. */
export const sabreBuscar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => buscaSchema.parse(input))
  .handler(async ({ data }) => {
    const { sabreBuscarVoos } = await import("./search.server");
    try {
      return { ok: true as const, resultado: await sabreBuscarVoos(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na busca Sabre";
      console.error("[sabre] busca falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Criação de PNR — exige confirmação explícita do operador. */
export const sabreReservar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reservaSchema.parse(input))
  .handler(async ({ data }) => {
    const { sabreCriarPnr } = await import("./booking.server");
    try {
      return { ok: true as const, pnr: await sabreCriarPnr(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao criar PNR";
      console.error("[sabre] reserva falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

export const sabreVerPnr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ localizador: z.string().length(6) }).parse(input))
  .handler(async ({ data }) => {
    const { sabreConsultarPnr } = await import("./booking.server");
    try {
      return { ok: true as const, pnr: await sabreConsultarPnr(data.localizador) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao consultar PNR" };
    }
  });

export const sabreCancelar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ localizador: z.string().length(6), confirmar: z.literal(true) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { sabreCancelarPnr } = await import("./booking.server");
    try {
      return await sabreCancelarPnr(data.localizador, data.confirmar);
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao cancelar" };
    }
  });
