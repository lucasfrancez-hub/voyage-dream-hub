import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createHotelCart,
  fetchHotelRooms,
  hotelCartInput,
  hotelDestinationsInput,
  hotelRoomsInput,
  hotelSearchInput,
  searchHotelDestinations,
  searchHotels,
} from "@/lib/onertravel-hotels.server";

export type {
  OnerHotel,
  OnerHotelPoint,
  OnerHotelRooms,
  OnerHotelSearchResult,
  OnerRoomRate,
} from "@/lib/onertravel-hotels.server";

export const onerHotelDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hotelDestinationsInput.parse(d))
  .handler(async ({ data }) => searchHotelDestinations(data));

export const onerHotelSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hotelSearchInput.parse(d))
  .handler(async ({ data }) => searchHotels(data));

export const onerCreateHotelCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hotelCartInput.parse(d))
  .handler(async ({ data }) => createHotelCart(data));

export const onerHotelRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => hotelRoomsInput.parse(d))
  .handler(async ({ data }) => fetchHotelRooms(data));
