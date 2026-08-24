import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type InfoHotelMotor = {
  descricao: string | null;
  comodidades: string[];
  fotos: string[];
  avaliacao: number | null;
  numAvaliacoes: number | null;
  estrelas: number | null;
  endereco: string | null;
  webUrl: string | null;
};

/**
 * Dados reais do hotel para o bloco "Sobre o hotel" do motor de pacotes.
 * Reaproveita o enriquecimento já existente no projeto (com cache), sem criar
 * endpoint novo e sem inventar campo: o que não vier fica nulo/vazio.
 */
export const infoHotelMotor = createServerFn({ method: "POST" })
  .inputValidator((i: { nome: string; cidade?: string | null }) =>
    z.object({ nome: z.string().min(2).max(200), cidade: z.string().max(160).nullable().optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<InfoHotelMotor> => {
    const { enrichHotel } = await import("@/lib/public-quote/hotel-enrichment.server");
    const info = await enrichHotel({ name: data.nome, city: data.cidade ?? null }).catch(() => null);
    return {
      descricao: info?.description ?? null,
      comodidades: info?.amenities ?? [],
      fotos: info?.photos ?? [],
      avaliacao: info?.rating ?? null,
      numAvaliacoes: info?.num_reviews ?? null,
      estrelas: info?.stars ?? null,
      endereco: info?.address ?? null,
      webUrl: info?.web_url ?? null,
    };
  });
