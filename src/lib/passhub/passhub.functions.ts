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
      // O JSON original pode ter vários megabytes. A tela só precisa do
      // resultado normalizado para listar, filtrar e reservar as ofertas.
      return { ok: true as const, resultado: normalizaBuscaPassHub(bruto) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na busca PassHub";
      console.error("[passhub] motor falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Campos opcionais chegam como "" quando o usuário não preenche; tratamos como ausentes. */
const vazioComoIndefinido = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const paxSchema = z.object({
  tipo: z.enum(["ADT", "CHD", "INF"]),
  nome: z.string().min(2).max(60),
  sobrenome: z.string().min(2).max(80),
  nascimento: dataIso,
  genero: z.enum(["M", "F"]),
  documentoTipo: z.enum(["cpf", "passport"]),
  documento: z.string().min(5).max(30),
  paisEmissor: vazioComoIndefinido(z.string().length(2)),
  paisResidencia: vazioComoIndefinido(z.string().length(2)),
  emissao: vazioComoIndefinido(dataIso),
  validade: vazioComoIndefinido(dataIso),
  email: z.string().email().max(120).optional().or(z.literal("")),
  ddi: z.string().max(4).optional(),
  ddd: z.string().max(3).optional(),
  telefone: z.string().max(20).optional(),
});

/** Revalida preço e disponibilidade da oferta escolhida (passo obrigatório antes de reservar). */
export const passhubTarifarOferta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rateTokens: z.array(z.string().min(4)).min(1).max(6),
        provedor: z.string().max(40).default("CVC"),
        precoEsperado: z.number().min(0),
        ravPercentual: z.number().min(0).max(100).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubTarifarOferta: tarifar } = await import("./book.server");
    try {
      return { ok: true as const, tarifacao: await tarifar(data) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao tarifar" };
    }
  });

/** Cria a reserva na PassHub e devolve o localizador. */
export const passhubReservar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pricedRateTokens: z.array(z.string().min(4)).min(1).max(6),
        provedor: z.string().max(40).default("CVC"),
        ravPercentual: z.number().min(0).max(100).nullable().optional(),
        paxs: z.array(paxSchema).min(1).max(9),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubReservarOferta } = await import("./book.server");
    try {
      const reserva = await passhubReservarOferta(data);
      return { ok: true as const, reserva };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao reservar";
      console.error("[passhub] reservar falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Lista todas as reservas da agência na PassHub (painel + motor interno). */
export const passhubReservas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { passhubListarReservas } = await import("./reservas.server");
    try {
      return { ok: true as const, reservas: await passhubListarReservas() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao listar reservas";
      console.error("[passhub] reservas falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Detalhe de uma reserva/bilhete específico. */
export const passhubReservaDetalhe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const { passhubReservaDetalhe: detalhe } = await import("./reservas.server");
    try {
      return { ok: true as const, reserva: await detalhe(data.id) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao carregar" };
    }
  });

/** Busca (e devolve) o link de pagamento do checkout PassHub de uma reserva. */
export const passhubLinkPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive().optional(),
        localizador: z.string().min(4).max(12).optional(),
      })
      .refine((v) => !!v.id || !!v.localizador, "Informe a reserva")
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubLinkPagamentoReserva } = await import("./reservas.server");
    try {
      const { link } = await passhubLinkPagamentoReserva(data);
      if (!link) {
        return {
          ok: false as const,
          erro: "A consolidadora ainda não gerou o link desta reserva. Tente de novo em instantes.",
        };
      }
      return { ok: true as const, link };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao obter link" };
    }
  });

/** Cancela a reserva na consolidadora (PassHub). */
export const passhubCancelarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        motivo: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubCancelarReserva: cancelar } = await import("./reservas.server");
    try {
      const r = await cancelar(data.id, data.motivo);
      if (!r.ok) return { ok: false as const, erro: r.mensagem };
      return { ok: true as const, mensagem: r.mensagem, rota: r.rota, reserva: r.reserva };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao cancelar" };
    }
  });

/** Gera o QR Code Pix a partir do link de pagamento do checkout PassHub. */
export const passhubPixReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        link: z.string().url().optional(),
        id: z.number().int().positive().optional(),
        localizador: z.string().min(4).max(12).optional(),
      })
      .refine((v) => !!v.link || !!v.id || !!v.localizador, "Informe a reserva")
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      let link = data.link ?? "";
      if (!link) {
        const { passhubLinkPagamentoReserva } = await import("./reservas.server");
        const r = await passhubLinkPagamentoReserva({ id: data.id, localizador: data.localizador });
        link = r.link;
      }
      if (!link) {
        return {
          ok: false as const,
          erro: "A consolidadora ainda não gerou o link desta reserva.",
        };
      }
      const { passhubPixDoLink } = await import("./pix.server");
      return { ok: true as const, pix: await passhubPixDoLink(link) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao gerar o Pix" };
    }
  });
