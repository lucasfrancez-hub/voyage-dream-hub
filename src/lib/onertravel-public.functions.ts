/**
 * Versões PÚBLICAS (sem login) das buscas da operadora, usadas pelo motor de
 * busca aberto ao cliente final (/voar e o widget /embed/motor-busca).
 * São somente leitura de disponibilidade + criação de carrinho na operadora,
 * exatamente o que o site público da operadora já expõe.
 */
import { createServerFn } from "@tanstack/react-start";
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

export const onerAirportSearchPublic = createServerFn({ method: "GET" })
  .inputValidator((data) => airportSearchInput.parse(data))
  .handler(async ({ data }) => searchAirports(data));

export const onerFlightSearchPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => flightSearchInput.parse(data))
  .handler(async ({ data }) => searchFlights(data));

export const onerInboundSearchPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => inboundSearchInput.parse(data))
  .handler(async ({ data }) => searchInboundFlights(data));

export const onerCreateFlightCartPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => cartInput.parse(data))
  .handler(async ({ data }) => createFlightCart(data));

// ---------------------------------------------------------------- hotéis

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

export const onerHotelDestinationsPublic = createServerFn({ method: "GET" })
  .inputValidator((data) => hotelDestinationsInput.parse(data))
  .handler(async ({ data }) => searchHotelDestinations(data));

export const onerHotelSearchPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => hotelSearchInput.parse(data))
  .handler(async ({ data }) => searchHotels(data));

export const onerHotelRoomsPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => hotelRoomsInput.parse(data))
  .handler(async ({ data }) => fetchHotelRooms(data));

export const onerCreateHotelCartPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => hotelCartInput.parse(data))
  .handler(async ({ data }) => createHotelCart(data));
