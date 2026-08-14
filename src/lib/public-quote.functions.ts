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
