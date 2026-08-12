import { createServerFn } from "@tanstack/react-start";
import {
  explorarInput,
  explorarHandler,
  buscarOrigensInput,
  buscarOrigensHandler,
  datasDaRotaInput,
  datasDaRotaHandler,
} from "@/lib/melhores-destinos.server";

/**
 * Versões públicas (sem login): os dados são preços públicos coletados do
 * Melhores Destinos e alimentam o bloco de passagens baratas do site/embed.
 */
export const explorarPassagensMdPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => explorarInput.parse(data))
  .handler(explorarHandler);

export const buscarOrigensMdPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => buscarOrigensInput.parse(data))
  .handler(buscarOrigensHandler);

export const datasDaRotaMdPublic = createServerFn({ method: "POST" })
  .inputValidator((data) => datasDaRotaInput.parse(data))
  .handler(datasDaRotaHandler);
