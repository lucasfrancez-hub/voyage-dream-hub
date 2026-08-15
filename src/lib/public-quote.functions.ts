import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PublicQuote } from "./public-quote/types";

/** Leitura pública do orçamento por link (sem sessão). */
export const fetchPublicQuote = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ publicId: z.string().min(4).max(40) }).parse(input))
  .handler(async ({ data }): Promise<PublicQuote | null> => {
    const { getPublicQuoteByPublicId } = await import("./public-quote/store.server");
    if (!/^[a-z0-9]{6,20}$/i.test(data.publicId)) return null;
    return await getPublicQuoteByPublicId(data.publicId);
  });

/** Registra que o cliente clicou em "Quero reservar esta opção". */
export const registrarEscolhaOrcamento = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ publicId: z.string().min(4).max(40), optionId: z.string().max(60).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getPublicQuoteByPublicId, registrarEventoOrcamento } = await import(
      "./public-quote/store.server"
    );
    const quote = await getPublicQuoteByPublicId(data.publicId);
    if (!quote) return { ok: false };
    await registrarEventoOrcamento(quote.id, "quote_selected", { optionId: data.optionId ?? null });
    return { ok: true };
  });

/**
 * Somente aéreo: gera o carrinho da operadora (Comprar Viagem / Oner) da
 * opção escolhida e devolve a URL pra o cliente comprar a viagem.
 */
export const carrinhoOperadoraOrcamento = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ publicId: z.string().min(4).max(40), opcao: z.number().int().min(1).max(20).nullish() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ url: string | null; motivo?: string }> => {
    const { criarCarrinhoDoOrcamento } = await import("./public-quote/cart.server");
    try {
      return await criarCarrinhoDoOrcamento({ publicId: data.publicId, opcao: data.opcao ?? null });
    } catch (e) {
      return { url: null, motivo: e instanceof Error ? e.message : "Falha ao gerar o carrinho." };
    }
  });
