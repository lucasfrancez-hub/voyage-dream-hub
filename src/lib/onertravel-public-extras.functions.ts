/**
 * Versões PÚBLICAS (sem login) das buscas de carro, exclusivos e seguros.
 * Usadas pelo motor de busca aberto ao cliente final (/voar e o widget).
 * São somente leitura de disponibilidade + criação de carrinho na operadora.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  carCartInput,
  carLocationInput,
  carSearchInput,
  createCarCart,
  searchCarLocations,
  searchCars,
} from "@/lib/onertravel-cars.server";
import {
  exclusiveSearchInput,
  insuranceSearchInput,
  listExclusiveCriteria,
  listInsuranceDestinations,
  searchExclusive,
  searchInsurance,
} from "@/lib/onertravel-extras.server";

export const onerCarLocationsPublic = createServerFn({ method: "GET" })
  .inputValidator((d) => carLocationInput.parse(d))
  .handler(async ({ data }) => searchCarLocations(data));

export const onerCarSearchPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => carSearchInput.parse(d))
  .handler(async ({ data }) => searchCars(data));

export const onerCreateCarCartPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => carCartInput.parse(d))
  .handler(async ({ data }) => createCarCart(data));

export const onerInsuranceDestinationsPublic = createServerFn({ method: "GET" }).handler(
  async () => listInsuranceDestinations(),
);

export const onerInsuranceSearchPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => insuranceSearchInput.parse(d))
  .handler(async ({ data }) => searchInsurance(data));

export const onerExclusiveCriteriaPublic = createServerFn({ method: "GET" }).handler(async () =>
  listExclusiveCriteria(),
);

export const onerExclusiveSearchPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => exclusiveSearchInput.parse(d))
  .handler(async ({ data }) => searchExclusive(data));
