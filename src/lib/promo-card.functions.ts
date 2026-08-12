import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { promoToCardData, type PromoCardData } from "@/lib/promo-card/card-data";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito");
}

const cardDataSchema = z.object({
  destinationImage: z.string().url().nullable(),
  imagePosition: z.string().max(30).optional(),
  categoria: z.string().max(60),
  destination: z.string().max(60),
  origin: z.string().max(60),
  destinationCity: z.string().max(60),
  originIata: z.string().max(5),
  destinationIata: z.string().max(5),
  tripType: z.enum(["ida-e-volta", "somente-ida"]),
  statusLabel: z.string().max(80),
  validityLabel: z.string().max(200),
  departureDate: z.string().max(12),
  returnDate: z.string().max(12).nullable(),
  airline: z.string().max(60),
  airlineIata: z.string().max(5).nullable(),
  airlineLogo: z.string().url().nullable(),
  baggage: z.string().max(120),
  totalPrice: z.number(),
  interestFreeInstallments: z.number().int().min(1).max(24),
  interestFreeInstallmentValue: z.number(),
  extendedInstallments: z.number().int().min(2).max(24).nullable(),
  extendedInstallmentValue: z.number().nullable(),
  pixOnly: z.boolean(),
  checkoutUrl: z.string().nullable().optional(),
});

/** Monta o objeto do card a partir da promoção + já sugere a foto do destino. */
export const buildPromoCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("airfare_promotions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Promoção não encontrada");

    const card = promoToCardData(row as Record<string, unknown>);
    const { searchDestinationPhotos } = await import("@/lib/promo-card/photos.server");
    const fotos = await searchDestinationPhotos(card.destinationCity).catch(() => []);
    if (fotos[0]) card.destinationImage = fotos[0].url;
    return { card, fotos };
  });

/** Busca alternativas de fotografia real do destino. */
export const listDestinationPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { searchDestinationPhotos } = await import("@/lib/promo-card/photos.server");
    return await searchDestinationPhotos(data.query);
  });

/** Gera a arte final (PNG 1080x1350 ou 1080x1920) e devolve a URL pública. */
export const renderPromoCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ card: cardDataSchema, format: z.enum(["feed", "story"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { renderPromoCardAsset } = await import("@/lib/promo-card/render.server");
    return await renderPromoCardAsset(data.card as PromoCardData, data.format);
  });
