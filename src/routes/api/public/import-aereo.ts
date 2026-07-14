import { createFileRoute } from "@tanstack/react-router";

// Endpoint público chamado pela extensão do navegador rodando na página
// da companhia aérea. A autenticação é feita pelo próprio TOKEN gerado
// no admin (`createImportToken`): quem tem o token pode gravar naquele
// pedido. O token vive por 2 h e é consumido depois da conferência.
//
// Body: { token, airline_hint, source_url, raw_text }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
} as const;

const SYSTEM_PROMPT = `Você é um extrator de reservas aéreas. Recebe o TEXTO
VISÍVEL de uma página de "Minhas Viagens" de uma companhia aérea brasileira
(LATAM, GOL ou AZUL) e devolve JSON estruturado com passageiros e voos.

Regras:
- Não invente. Se um campo não estiver visível no texto, omita.
- Datas/horas no formato "YYYY-MM-DDTHH:mm" no horário local do aeroporto.
- Códigos IATA sempre em MAIÚSCULAS (3 letras).
- Separe VOOS DE IDA (outbound) e VOOS DE VOLTA (return). Se houver conexões,
  cada trecho vira um segment dentro do bloco.
- passengers[].kind: "adult" para adultos, "child" criança, "infant" bebê.
- flight_number: formato "LA 3331" (com espaço).
- Em cabin_class use os rótulos que aparecem (Econômica, Premium, Business).
- baggage/seat: só se aparecerem explicitamente no texto.
- locator = código PNR (6 caracteres).
- Nunca copie CPF/documento — a página normalmente nem mostra.`;

function textParamsSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      supplier_name: { type: "string" },
      locator: { type: "string" },
      order_number: { type: "string" },
      status: { type: "string" },
      notes: { type: "string" },
      passengers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            full_name: { type: "string" },
            kind: { type: "string", enum: ["adult", "child", "infant"] },
            ticket_number: { type: "string" },
            seat: { type: "string" },
            baggage: { type: "string" },
          },
          required: ["full_name"],
        },
      },
      flights: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            direction: { type: "string", enum: ["outbound", "return"] },
            airline: { type: "string" },
            segments: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  airline: { type: "string" },
                  airline_iata: { type: "string" },
                  flight_number: { type: "string" },
                  from_iata: { type: "string" },
                  from_city: { type: "string" },
                  from_airport: { type: "string" },
                  from_terminal: { type: "string" },
                  to_iata: { type: "string" },
                  to_city: { type: "string" },
                  to_airport: { type: "string" },
                  to_terminal: { type: "string" },
                  depart_at: { type: "string" },
                  arrive_at: { type: "string" },
                  duration: { type: "string" },
                  layover: { type: "string" },
                  cabin_class: { type: "string" },
                  fare_class: { type: "string" },
                  aircraft: { type: "string" },
                  status: { type: "string" },
                },
              },
            },
          },
          required: ["direction", "segments"],
        },
      },
    },
    required: ["passengers", "flights"],
  };
}

export const Route = createFileRoute("/api/public/import-aereo")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: { token?: string; airline_hint?: string; source_url?: string; raw_text?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const token = String(body.token ?? "").trim();
        const airline = String(body.airline_hint ?? "").toLowerCase();
        const rawText = String(body.raw_text ?? "").slice(0, 60_000);
        if (!token || token.length < 10) return json({ error: "invalid_token" }, 400);
        if (!["latam", "gol", "azul"].includes(airline)) return json({ error: "invalid_airline" }, 400);
        if (rawText.length < 200) return json({ error: "raw_text_too_short" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: staging, error: loadErr } = await supabaseAdmin
          .from("flight_import_staging")
          .select("token, status, expires_at, order_id")
          .eq("token", token)
          .maybeSingle();
        if (loadErr) return json({ error: "db_error", detail: loadErr.message }, 500);
        if (!staging) return json({ error: "token_not_found" }, 404);
        if (staging.status === "consumed") return json({ error: "already_consumed" }, 409);
        if (new Date(staging.expires_at).getTime() < Date.now()) return json({ error: "token_expired" }, 410);

        // Marca como processando + guarda source_url/raw_text
        await supabaseAdmin.from("flight_import_staging").update({
          status: "pending",
          source_url: body.source_url ?? null,
          raw_text: rawText,
          error: null,
        }).eq("token", token);

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return json({ error: "ai_key_missing" }, 500);

        try {
          const aiBody = {
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content:
                `Companhia: ${airline.toUpperCase()}\nURL: ${body.source_url ?? ""}\n\nTEXTO DA PÁGINA:\n${rawText}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_reservation",
                description: "Retorna a reserva estruturada.",
                parameters: textParamsSchema(),
              },
            }],
            tool_choice: { type: "function", function: { name: "return_reservation" } },
          };

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
            },
            body: JSON.stringify(aiBody),
          });
          if (!res.ok) {
            const t = await res.text();
            await supabaseAdmin.from("flight_import_staging").update({
              status: "error", error: `AI ${res.status}: ${t.slice(0, 300)}`,
            }).eq("token", token);
            return json({ error: "ai_failed", detail: t.slice(0, 300) }, 502);
          }
          const jr = await res.json() as {
            choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
          };
          const args = jr.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
            ?? jr.choices?.[0]?.message?.content ?? "{}";
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(args) as Record<string, unknown>; }
          catch {
            const m = args.match(/\{[\s\S]*\}/);
            parsed = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
          }

          await supabaseAdmin.from("flight_import_staging").update({
            status: "ready", parsed: parsed as never, error: null,
          }).eq("token", token);

          return json({ ok: true }, 200);
        } catch (e) {
          await supabaseAdmin.from("flight_import_staging").update({
            status: "error", error: (e as Error).message,
          }).eq("token", token);
          return json({ error: "exception", detail: (e as Error).message }, 500);
        }
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
