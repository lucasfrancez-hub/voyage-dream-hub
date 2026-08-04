import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  exclusiveSearchInput,
  insuranceSearchInput,
  listExclusiveCriteria,
  listInsuranceDestinations,
  searchExclusive,
  searchInsurance,
} from "@/lib/onertravel-extras.server";

export const onerInsuranceDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listInsuranceDestinations());

export const onerInsuranceSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => insuranceSearchInput.parse(d))
  .handler(async ({ data }) => searchInsurance(data));

export const onerExclusiveCriteria = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listExclusiveCriteria());

export const onerExclusiveSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => exclusiveSearchInput.parse(d))
  .handler(async ({ data }) => searchExclusive(data));
