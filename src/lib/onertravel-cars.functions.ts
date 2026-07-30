import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  carLocationInput,
  carSearchInput,
  searchCarLocations,
  searchCars,
} from "@/lib/onertravel-cars.server";

export const onerCarLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => carLocationInput.parse(d))
  .handler(async ({ data }) => searchCarLocations(data));

export const onerCarSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => carSearchInput.parse(d))
  .handler(async ({ data }) => searchCars(data));
