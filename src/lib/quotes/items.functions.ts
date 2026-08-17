/**
 * Server functions para editar itens de um orçamento (hospedagem, aéreo,
 * serviços) manualmente ou importando um documento com a IA.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ExtractedQuoteItems, ItemKind } from "./items.server";
import {
  assertQuoteStaff,
  FlightSchema,
  HotelSchema,
  KindSchema,
  ServiceSchema,
} from "./items-functions-support.server";

export type { ExtractedQuoteItems } from "./items.server";

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
    await assertQuoteStaff(context.supabase as never, context.userId);
    const { mutateQuoteOption } = await import("./items.server");

    return mutateQuoteOption(data.quoteId, data.optionNumber, (opt) => {
      if (data.kind === "hotel") {
        if (!data.hotel) throw new Error("Dados da hospedagem ausentes");
        if (data.index == null) opt.hotels.push(data.hotel as never);
        else {
          // Preserva o que o formulário não envia (coordenadas, dados de
          // enriquecimento TripAdvisor, fotos já salvas etc.).
          const atual = (opt.hotels[data.index] ?? {}) as Record<string, unknown>;
          const enviado = data.hotel as Record<string, unknown>;
          const mesclado: Record<string, unknown> = { ...atual };
          for (const [k, v] of Object.entries(enviado)) {
            if (v === undefined) continue;
            if (k === "photos" && (!Array.isArray(v) || v.length === 0)) continue;
            mesclado[k] = v;
          }
          const mudouIdentidade =
            String(atual.name ?? "").trim().toLowerCase() !== String(enviado.name ?? "").trim().toLowerCase();
          if (mudouIdentidade) {
            // Hotel diferente: coordenadas/fotos antigas não valem mais.
            delete mesclado.latitude;
            delete mesclado.longitude;
            if (!Array.isArray(enviado.photos) || (enviado.photos as unknown[]).length === 0) {
              delete mesclado.photos;
            }
          }
          opt.hotels[data.index] = mesclado as never;
        }
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
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
    await assertQuoteStaff(context.supabase as never, context.userId);
    const { mutateQuoteOption } = await import("./items.server");

    return mutateQuoteOption(data.quoteId, data.optionNumber, (opt) => {
      const lista =
        data.kind === "hotel" ? opt.hotels : data.kind === "flight" ? opt.flights : opt.services;
      const item = lista[data.index] as { total?: number | null } | undefined;
      if (!item) throw new Error("Item não encontrado");
      item.total = data.total;
    });
  });
