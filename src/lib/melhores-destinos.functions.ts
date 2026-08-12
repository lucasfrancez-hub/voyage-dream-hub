import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listarPromocoesInput,
  listarPromocoesHandler,
  datasDaRotaInput,
  datasDaRotaHandler,
  explorarInput,
  explorarHandler,
  buscarOrigensInput,
  buscarOrigensHandler,
} from "@/lib/melhores-destinos.server";

export const listarPromocoesMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listarPromocoesInput.parse(data))
  .handler(listarPromocoesHandler);

export const datasDaRotaMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => datasDaRotaInput.parse(data))
  .handler(datasDaRotaHandler);

export const explorarPassagensMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => explorarInput.parse(data))
  .handler(explorarHandler);

export const buscarOrigensMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => buscarOrigensInput.parse(data))
  .handler(buscarOrigensHandler);
