import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  airportSearchInput,
  cartInput,
  createFlightCart,
  flightSearchInput,
  inboundSearchInput,
  searchAirports,
  searchFlights,
  searchInboundFlights,
} from "@/lib/onertravel.server";

export const onerAirportSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => airportSearchInput.parse(data))
  .handler(async ({ data }) => searchAirports(data));

export const onerFlightSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => flightSearchInput.parse(data))
  .handler(async ({ data }) => searchFlights(data));

export const onerInboundSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inboundSearchInput.parse(data))
  .handler(async ({ data }) => searchInboundFlights(data));

export const onerCreateFlightCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => cartInput.parse(data))
  .handler(async ({ data }) => createFlightCart(data));
