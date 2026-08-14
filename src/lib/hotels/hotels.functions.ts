import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const hotelSearchSchema = z.object({
  type: z.enum(["HOTEL_STANDALONE", "FLIGHT_HOTEL_PACKAGE"]).default("HOTEL_STANDALONE"),
  destination: z.string().trim().min(2).max(120),
  startDate: DATE,
  endDate: DATE,
  rooms: z.number().int().min(1).max(6).default(1),
  adults: z.number().int().min(1).max(8).default(2),
  children: z.number().int().min(0).max(6).default(0),
  regionId: z.string().trim().max(40).nullish(),
  latLong: z.string().trim().max(60).nullish(),
  refresh: z.boolean().default(false),
});

/** Busca de hospedagem para uso interno (equipe logada). */
export const searchHotelsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => hotelSearchSchema.parse(input))
  .handler(async ({ data }) => {
    const { searchHotels } = await import("@/lib/hotels/search.server");
    return searchHotels(data);
  });
