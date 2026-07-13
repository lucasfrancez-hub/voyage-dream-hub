import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export type HotelMapData = {
  address: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  mapPngBase64: string | null;
  mapsUrl: string;
};

/**
 * Geocodes an address and returns a static map PNG + a Google Maps URL for QR/link.
 * Runs server-side through the Lovable Google Maps connector gateway.
 */
export const getHotelMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { address: string; hotelName?: string }) => input)
  .handler(async ({ data }): Promise<HotelMapData> => {
    const address = String(data.address || "").trim();
    const hotelName = String(data.hotelName || "").trim();
    if (!address) {
      return { address, formattedAddress: null, lat: null, lng: null, mapPngBase64: null, mapsUrl: "" };
    }

    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmKey) {
      throw new Error("Google Maps connector not configured");
    }
    const authHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmKey,
    };

    // 1) Geocode
    const searchQuery = hotelName ? `${hotelName}, ${address}` : address;
    let lat: number | null = null;
    let lng: number | null = null;
    let formattedAddress: string | null = null;
    try {
      const geoRes = await fetch(
        `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}`,
        { headers: authHeaders },
      );
      if (geoRes.ok) {
        const geoJson = (await geoRes.json()) as {
          status: string;
          results?: Array<{
            formatted_address?: string;
            geometry?: { location?: { lat: number; lng: number } };
          }>;
        };
        const first = geoJson.results?.[0];
        if (first?.geometry?.location) {
          lat = first.geometry.location.lat;
          lng = first.geometry.location.lng;
          formattedAddress = first.formatted_address ?? null;
        }
      } else {
        console.error(`[voucher-map] geocode failed [${geoRes.status}]:`, await geoRes.text());
      }
    } catch (err) {
      console.error("[voucher-map] geocode error:", err);
    }

    // 2) Static map (PNG)
    let mapPngBase64: string | null = null;
    if (lat != null && lng != null) {
      try {
        const params = new URLSearchParams({
          center: `${lat},${lng}`,
          zoom: "15",
          size: "640x360",
          scale: "2",
          maptype: "roadmap",
          markers: `color:0xF1A04A|${lat},${lng}`,
          format: "png",
        });
        const mapRes = await fetch(`${GATEWAY}/maps/api/staticmap?${params.toString()}`, {
          headers: authHeaders,
        });
        if (mapRes.ok) {
          const buf = new Uint8Array(await mapRes.arrayBuffer());
          // Convert to base64
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < buf.length; i += chunk) {
            binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
          }
          mapPngBase64 = btoa(binary);
        } else {
          console.error(`[voucher-map] staticmap failed [${mapRes.status}]:`, await mapRes.text());
        }
      } catch (err) {
        console.error("[voucher-map] staticmap error:", err);
      }
    }

    const mapsUrl =
      lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;

    return { address, formattedAddress, lat, lng, mapPngBase64, mapsUrl };
  });
