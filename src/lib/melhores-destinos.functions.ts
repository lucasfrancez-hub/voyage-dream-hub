import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  melhoresDestinosInput,
  scrapeMelhoresDestinosHandler,
} from "@/lib/melhores-destinos.server";

export const scrapeMelhoresDestinos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => melhoresDestinosInput.parse(data))
  .handler(scrapeMelhoresDestinosHandler);
