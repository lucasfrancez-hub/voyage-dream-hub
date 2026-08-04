import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ComboCartInput, buildComboCart } from "@/lib/onertravel-combo.server";

export type {
  ComboFlightBookingData,
  ComboHotelBookingData,
} from "@/lib/onertravel-combo.server";

/** Cria o carrinho combinado (aéreo + hotel) e devolve a URL do carrinho. */
export const onerCreateComboCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ComboCartInput.parse(d))
  .handler(async ({ data }) => buildComboCart(data));

/** Versão pública (motor de busca do site, sem login). */
export const onerCreateComboCartPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => ComboCartInput.parse(d))
  .handler(async ({ data }) => buildComboCart(data));
