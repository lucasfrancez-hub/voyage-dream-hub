/**
 * COTAÇÃO MULTI-TRECHO SALVA (link pronto).
 *
 * O link enviado no WhatsApp precisa funcionar em qualquer celular: por isso a
 * seleção completa da viagem (trechos, voos, companhia, bagagem, preços) fica
 * salva no backend e é recuperada por um token — nada depende de localStorage
 * nem de parâmetros frágeis na URL.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const segmentSchema = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  date: z.string().trim().min(8).max(10),
});

const pickSchema = z.object({
  airline: z.string().trim().max(6).nullable().optional(),
  airlineName: z.string().trim().max(80).nullable().optional(),
  flightNumber: z.string().trim().max(12).nullable().optional(),
  time: z.string().trim().max(5).nullable().optional(),
  arrival: z.string().trim().max(5).nullable().optional(),
  fareKey: z.string().trim().max(400).nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  baggage: z.boolean().nullable().optional(),
});

const paxSchema = z.object({
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(9),
  infants: z.number().int().min(0).max(9),
});

export type SavedMultiPick = z.infer<typeof pickSchema>;

function novoToken(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Salva a seleção completa e devolve o link pronto da cotação. */
export const createMultiCityQuote = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        segments: z.array(segmentSchema).min(2).max(6),
        pax: paxSchema,
        picks: z.array(pickSchema).min(2).max(6),
        total: z.number().nonnegative().nullable().optional(),
        label: z.string().trim().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = novoToken();
    const { error } = await supabaseAdmin.from("multicity_quotes").insert({
      token,
      segments: data.segments.map((s) => ({
        origin: s.origin.toUpperCase(),
        destination: s.destination.toUpperCase(),
        date: s.date,
      })),
      pax: data.pax,
      picks: data.picks,
      total_price: data.total ?? null,
      label: data.label ?? null,
    });
    if (error) throw new Error(error.message);
    return {
      token,
      url: `https://pedidos.viaair.tur.br/multitrecho/cotacao/${token}`,
    };
  });

/** Recupera a cotação salva (leitura pública pelo token do link). */
export const getMultiCityQuote = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: z.string().trim().min(6).max(32) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("multicity_quotes")
      .select("token,segments,pax,picks,total_price,label,expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return {
      token: row.token,
      segments: (row.segments ?? []) as { origin: string; destination: string; date: string }[],
      pax: (row.pax ?? { adults: 1, children: 0, infants: 0 }) as {
        adults: number;
        children: number;
        infants: number;
      },
      picks: (row.picks ?? []) as SavedMultiPick[],
      total: row.total_price != null ? Number(row.total_price) : null,
      label: row.label,
    };
  });
