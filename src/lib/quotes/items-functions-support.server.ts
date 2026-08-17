import { z } from "zod";

export const HotelSchema = z.object({
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().max(120).nullish(),
  address: z.string().trim().max(240).nullish(),
  checkin: z.string().trim().max(10).nullish(),
  checkout: z.string().trim().max(10).nullish(),
  nights: z.number().min(0).max(365).nullish(),
  roomDescription: z.string().trim().max(200).nullish(),
  board: z.string().trim().max(120).nullish(),
  photos: z.array(z.string().trim().max(600)).max(12).optional(),
  total: z.number().min(0).nullish(),
});

const SegmentSchema = z.object({
  airline: z.string().trim().max(80).nullish(),
  airlineIata: z.string().trim().max(4).nullish(),
  flightNumber: z.string().trim().max(12).nullish(),
  fromIata: z.string().trim().max(4).nullish(),
  toIata: z.string().trim().max(4).nullish(),
  departure: z.string().trim().max(30).nullish(),
  arrival: z.string().trim().max(30).nullish(),
  duration: z.string().trim().max(20).nullish(),
  cabin: z.string().trim().max(40).nullish(),
  baggage: z.string().trim().max(80).nullish(),
});

export const FlightSchema = z.object({
  direction: z.enum(["OUTBOUND", "INBOUND"]).nullish(),
  airline: z.string().trim().max(80).nullish(),
  fromIata: z.string().trim().max(4).nullish(),
  toIata: z.string().trim().max(4).nullish(),
  departure: z.string().trim().max(30).nullish(),
  arrival: z.string().trim().max(30).nullish(),
  duration: z.string().trim().max(20).nullish(),
  stops: z.number().min(0).max(10).nullish(),
  segments: z.array(SegmentSchema).max(12).default([]),
  total: z.number().min(0).nullish(),
});

export const ServiceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).nullish(),
  date: z.string().trim().max(30).nullish(),
  quantity: z.number().min(0).max(999).nullish(),
  total: z.number().min(0).nullish(),
});

export const KindSchema = z.enum(["hotel", "flight", "service"]);

export async function assertQuoteStaff(
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}