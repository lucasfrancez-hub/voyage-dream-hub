import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Fetches a remote image server-side (bypasses browser CORS) and returns
// it as base64 + content-type so the client can embed it into the PDF.
export const fetchProxiedImage = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const r = await fetch(data.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ViaAirVoucher/1.0; +https://viaair.tur.br)",
          Accept: "image/*,*/*;q=0.8",
        },
      });
      if (!r.ok) return { ok: false as const, status: r.status };
      const contentType = (r.headers.get("content-type") ?? "").toLowerCase();
      const buf = new Uint8Array(await r.arrayBuffer());
      // base64 encode
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      return { ok: true as const, base64, contentType };
    } catch (e) {
      return {
        ok: false as const,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
