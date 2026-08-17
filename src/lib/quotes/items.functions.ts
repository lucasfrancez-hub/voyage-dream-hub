/**
 * Server functions para editar itens de um orçamento (hospedagem, aéreo,
 * serviços) manualmente ou importando um documento com a IA.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ExtractedQuoteItems, ItemKind } from "./items.server";

export type { ExtractedQuoteItems } from "./items.server";

const HotelSchema = z.object({
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().max(120).nullish(),
  address: z.string().trim().max(240).nullish(),
  checkin: z.string().trim().max(10).nullish(),
  checkout: z.string().trim().max(10).nullish(),
  nights: z.number().min(0).max(365).nullish(),
  roomDescription: z.string().trim().max(200).nullish(),
  board: z.string().trim().max(120).nullish(),
  photos: z.array(z.string().trim().max(600)).max(12).optional(),
  total: z.number().min(0).nullish(),
});

const SegmentSchema = z.object({
  airline: z.string().trim().max(80).nullish(),
  airlineIata: z.string().trim().max(4).nullish(),
  flightNumber: z.string().trim().max(12).nullish(),
  fromIata: z.string().trim().max(4).nullish(),
  toIata: z.string().trim().max(4).nullish(),
  departure: z.string().trim().max(30).nullish(),
  arrival: z.string().trim().max(30).nullish(),
  duration: z.string().trim().max(20).nullish(),
  cabin: z.string().trim().max(40).nullish(),
  baggage: z.string().trim().max(80).nullish(),
});

const FlightSchema = z.object({
  direction: z.enum(["OUTBOUND", "INBOUND"]).nullish(),
  airline: z.string().trim().max(80).nullish(),
  fromIata: z.string().trim().max(4).nullish(),
  toIata: z.string().trim().max(4).nullish(),
  departure: z.string().trim().max(30).nullish(),
  arrival: z.string().trim().max(30).nullish(),
  duration: z.string().trim().max(20).nullish(),
  stops: z.number().min(0).max(10).nullish(),
  segments: z.array(SegmentSchema).max(12).default([]),
  total: z.number().min(0).nullish(),
});

const ServiceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).nullish(),
  date: z.string().trim().max(10).nullish(),
  quantity: z.number().min(0).max(999).nullish(),
  total: z.number().min(0).nullish(),
});

const KindSchema = z.enum(["hotel", "flight", "service"]);

async function assertStaff(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/** Cria ou atualiza um item da opção. `index` null = novo item. */
export const salvarItemOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(20).default(1),
        kind: KindSchema,
        index: z.number().int().min(0).nullish(),
        hotel: HotelSchema.optional(),
        flight: FlightSchema.optional(),
        service: ServiceSchema.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteOption } = await import("./items.server");

    return mutateQuoteOption(data.quoteId, data.optionNumber, (opt) => {
      if (data.kind === "hotel") {
        if (!data.hotel) throw new Error("Dados da hospedagem ausentes");
        if (data.index == null) opt.hotels.push(data.hotel as never);
        else opt.hotels[data.index] = data.hotel as never;
      } else if (data.kind === "flight") {
        if (!data.flight) throw new Error("Dados do voo ausentes");
        if (data.index == null) opt.flights.push(data.flight as never);
        else opt.flights[data.index] = data.flight as never;
      } else {
        if (!data.service) throw new Error("Dados do serviço ausentes");
        if (data.index == null) opt.services.push(data.service as never);
        else opt.services[data.index] = data.service as never;
      }
    });
  });

/** Remove um item da opção. */
export const removerItemOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(20).default(1),
        kind: KindSchema,
        index: z.number().int().min(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteOption } = await import("./items.server");

    return mutateQuoteOption(data.quoteId, data.optionNumber, (opt) => {
      const lista =
        data.kind === "hotel" ? opt.hotels : data.kind === "flight" ? opt.flights : opt.services;
      lista.splice(data.index, 1);
    });
  });

/** Lê um PDF/imagem com a IA e devolve os itens encontrados (sem salvar). */
export const lerArquivoOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().min(1).max(120),
        fileBase64: z.string().min(20).max(20_000_000),
        foco: KindSchema.nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ExtractedQuoteItems> => {
    await assertStaff(context.supabase as never, context.userId);
    const { lerDocumentoOrcamento } = await import("./items.server");
    return lerDocumentoOrcamento({
      filename: data.filename,
      mimeType: data.mimeType,
      fileBase64: data.fileBase64,
      foco: (data.foco ?? null) as ItemKind | null,
    });
  });

/** Salva de uma vez os itens confirmados vindos da leitura por IA. */
export const aplicarItensExtraidos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(20).default(1),
        hotels: z.array(HotelSchema).max(20).default([]),
        flights: z.array(FlightSchema).max(20).default([]),
        services: z.array(ServiceSchema).max(40).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteOption } = await import("./items.server");

    return mutateQuoteOption(data.quoteId, data.optionNumber, (opt) => {
      opt.hotels.push(...(data.hotels as never[]));
      opt.flights.push(...(data.flights as never[]));
      opt.services.push(...(data.services as never[]));
    });
  });

/* ------------------------------------------------------------------ */
/* Opções do orçamento (várias propostas dentro do mesmo orçamento)     */
/* ------------------------------------------------------------------ */

/** Cria uma nova opção (em branco ou duplicando outra). */
export const criarOpcaoOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        label: z.string().trim().max(80).nullish(),
        /** Número da opção a duplicar; ausente = opção vazia. */
        copiarDe: z.number().int().min(1).max(20).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteNormalized, garantirOpcao } = await import("./items.server");

    let novoNumero = 1;
    await mutateQuoteNormalized(data.quoteId, (normalized) => {
      if (normalized.options.length >= 20) throw new Error("Limite de 20 opções por orçamento");
      novoNumero = Math.max(0, ...normalized.options.map((o) => o.optionNumber)) + 1;
      const nova = garantirOpcao(normalized, novoNumero);
      const base = data.copiarDe
        ? normalized.options.find((o) => o.optionNumber === data.copiarDe)
        : null;
      if (base) {
        const copia = JSON.parse(JSON.stringify(base)) as typeof base;
        Object.assign(nova, copia, { optionNumber: novoNumero, total: null });
      }
      nova.label = data.label?.trim() || `Opção ${novoNumero}`;
    });
    return { optionNumber: novoNumero };
  });

/** Renomeia uma opção. */
export const renomearOpcaoOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(20),
        label: z.string().trim().min(1).max(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteNormalized } = await import("./items.server");
    await mutateQuoteNormalized(data.quoteId, (normalized) => {
      const opt = normalized.options.find((o) => o.optionNumber === data.optionNumber);
      if (!opt) throw new Error("Opção não encontrada");
      opt.label = data.label;
    });
    return { ok: true };
  });

/** Marca/desmarca a opção como ROTEIRO (exibição cronológica no link público). */
export const definirRoteiroOpcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(20),
        itinerary: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteNormalized } = await import("./items.server");
    await mutateQuoteNormalized(data.quoteId, (normalized) => {
      const opt = normalized.options.find((o) => o.optionNumber === data.optionNumber);
      if (!opt) throw new Error("Opção não encontrada");
      opt.itinerary = data.itinerary;
    });
    return { ok: true };
  });

/** Remove uma opção inteira (não deixa o orçamento sem nenhuma). */
export const removerOpcaoOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ quoteId: z.string().uuid(), optionNumber: z.number().int().min(1).max(20) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteNormalized } = await import("./items.server");
    await mutateQuoteNormalized(data.quoteId, (normalized) => {
      if (normalized.options.length <= 1) throw new Error("O orçamento precisa ter ao menos uma opção");
      const idx = normalized.options.findIndex((o) => o.optionNumber === data.optionNumber);
      if (idx < 0) throw new Error("Opção não encontrada");
      normalized.options.splice(idx, 1);
    });
    return { ok: true };
  });

/** Altera apenas o valor (total) de um item — usado na aba Financeiro. */
export const atualizarValorItemOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        quoteId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(20).default(1),
        kind: KindSchema,
        index: z.number().int().min(0),
        total: z.number().min(0).max(10_000_000).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { mutateQuoteOption } = await import("./items.server");

    return mutateQuoteOption(data.quoteId, data.optionNumber, (opt) => {
      const lista =
        data.kind === "hotel" ? opt.hotels : data.kind === "flight" ? opt.flights : opt.services;
      const item = lista[data.index] as { total?: number | null } | undefined;
      if (!item) throw new Error("Item não encontrado");
      item.total = data.total;
    });
  });
