import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// AeroDataBox via RapidAPI
// Docs: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
//   GET /flights/number/{flightNumber}/{date}
//   flightNumber ex.: "LA3331"  (sem espaço)
//   date         ex.: "2026-08-14"

export type FlightLookupResult = {
  airline: string;      // "LATAM Airlines"
  airlineIata: string;  // "LA"
  flightNumber: string; // "LA 3331"
  fromIata: string;
  fromCity: string;
  fromAirport: string;
  toIata: string;
  toCity: string;
  toAirport: string;
  departAtLocal: string; // "YYYY-MM-DDTHH:mm"
  arriveAtLocal: string; // "YYYY-MM-DDTHH:mm"
  aircraft?: string;
  status?: string;
};

const Input = z.object({
  flightNumber: z.string().min(3).max(10), // "LA3331" ou "LA 3331"
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type ADBFlight = {
  number?: string;
  airline?: { name?: string; iata?: string };
  departure?: {
    airport?: { iata?: string; municipalityName?: string; name?: string };
    scheduledTime?: { local?: string; utc?: string };
  };
  arrival?: {
    airport?: { iata?: string; municipalityName?: string; name?: string };
    scheduledTime?: { local?: string; utc?: string };
  };
  aircraft?: { model?: string };
  status?: string;
};

function toLocalInput(v?: string): string {
  if (!v) return "";
  // AeroDataBox: "2026-08-14 10:00-03:00"
  const s = v.replace(" ", "T");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
}

export const lookupFlight = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ results: FlightLookupResult[]; error?: string }> => {
    const apiKey = process.env.RAPIDAPI_AERODATABOX_KEY;
    if (!apiKey) return { results: [], error: "RAPIDAPI_AERODATABOX_KEY não configurada" };

    const num = data.flightNumber.replace(/\s+/g, "").toUpperCase();
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${data.date}?withAircraftImage=false&withLocation=false`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
        },
      });
    } catch (e) {
      return { results: [], error: `Falha ao contactar AeroDataBox: ${(e as Error).message}` };
    }

    if (resp.status === 204 || resp.status === 404) return { results: [] };
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { results: [], error: `AeroDataBox ${resp.status}: ${text.slice(0, 200)}` };
    }

    const raw = (await resp.json().catch(() => null)) as ADBFlight[] | null;
    if (!raw || !Array.isArray(raw)) return { results: [] };

    const results: FlightLookupResult[] = raw.map((f) => ({
      airline: f.airline?.name ?? "",
      airlineIata: f.airline?.iata ?? "",
      flightNumber: f.number ?? "",
      fromIata: f.departure?.airport?.iata ?? "",
      fromCity: f.departure?.airport?.municipalityName ?? "",
      fromAirport: f.departure?.airport?.name ?? "",
      toIata: f.arrival?.airport?.iata ?? "",
      toCity: f.arrival?.airport?.municipalityName ?? "",
      toAirport: f.arrival?.airport?.name ?? "",
      departAtLocal: toLocalInput(f.departure?.scheduledTime?.local),
      arriveAtLocal: toLocalInput(f.arrival?.scheduledTime?.local),
      aircraft: f.aircraft?.model,
      status: f.status,
    }));

    return { results };
  });
