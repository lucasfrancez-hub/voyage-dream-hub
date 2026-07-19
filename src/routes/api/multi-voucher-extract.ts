// HTTP route for uploading a voucher file as multipart/form-data.
// Avoids the RPC body-size / "Failed to fetch" issues that happen when a big
// base64 payload is sent through createServerFn's serialized protocol.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const MAX_BYTES = 15 * 1024 * 1024;

const PROMPT = `Você recebe UM documento (voucher, itinerário, confirmação, e-mail impresso em PDF) que pode conter MÚLTIPLOS produtos de viagem misturados: aéreo, hospedagem e serviços (traslado, passeio, ingresso, seguro, aluguel de carro).

Sua tarefa: separar o documento em ITENS individuais, cada um com seu próprio "kind".

REGRAS GERAIS:
- Datas: YYYY-MM-DD. Horas em ISO local "YYYY-MM-DDTHH:MM" quando houver.
- Nunca invente dado que não esteja no documento.
- Se um bloco não deixa claro o tipo, use "other" (serviço).
- passengers no NÍVEL SUPERIOR: lista única de passageiros/hóspedes do documento inteiro. Não repita a mesma pessoa por item.

CLASSIFICAÇÃO POR TIPO:

kind = "flight" (AÉREO): um item por RESERVA aérea (localizador/PNR). O item traz "segments" com TODOS os trechos daquela reserva.
- supplier_locator, supplier_name, segments[] (airline_code, airline_name, flight_number, from_iata, to_iata, depart_at, arrive_at, cabin_class, fare_class, segment_index).
- details.value/tax_value/currency.

kind = "hotel" (HOSPEDAGEM): um item por hotel.
- details.hotel_name, hotel_stars, address, room, board, check_in, check_out, nights, guests, value, tax_value, currency.

kind = "other" (SERVIÇOS): traslado, passeio, ingresso, seguro, aluguel de carro, atividade.
- details.category, date_from/time_from, date_to/time_to, address, value, tax_value, currency.

Em CADA item: details.cancellation_policy (resumo curto), details.observations[] (todos os tópicos completos), details.notes (contatos de emergência apenas).

title curto e humano; status "confirmed"/"reserved"/"pending"; passageiros: full_name obrigatório, kind adult/child/infant, cpf só se 11 dígitos, document = passaporte quando houver.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["flight", "hotel", "other"] },
          title: { type: "string" },
          supplier_name: { type: "string" },
          supplier_locator: { type: "string" },
          status: { type: "string", enum: ["confirmed", "reserved", "pending"] },
          segments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                airline_code: { type: "string" },
                airline_name: { type: "string" },
                flight_number: { type: "string" },
                from_iata: { type: "string" },
                to_iata: { type: "string" },
                depart_at: { type: "string" },
                arrive_at: { type: "string" },
                cabin_class: { type: "string" },
                fare_class: { type: "string" },
                segment_index: { type: "number" },
              },
            },
          },
          details: {
            type: "object",
            additionalProperties: true,
            properties: {
              hotel_name: { type: "string" },
              hotel_stars: { type: "number" },
              address: { type: "string" },
              room: { type: "string" },
              board: { type: "string" },
              check_in: { type: "string" },
              check_out: { type: "string" },
              nights: { type: "number" },
              guests: { type: "string" },
              category: { type: "string" },
              quantity: { type: "number" },
              date_from: { type: "string" },
              date_to: { type: "string" },
              time_from: { type: "string" },
              time_to: { type: "string" },
              value: { type: "number" },
              tax_value: { type: "number" },
              currency: { type: "string" },
              cancellation_policy: { type: "string" },
              observations: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
            },
          },
        },
        required: ["kind"],
      },
    },
    passengers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          full_name: { type: "string" },
          kind: { type: "string", enum: ["adult", "child", "infant"] },
          cpf: { type: "string" },
          birth_date: { type: "string" },
          document: { type: "string" },
        },
      },
    },
  },
  required: ["items"],
} as const;

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

function makeFetch(key: string): typeof fetch {
  return (input, init) => {
    const h = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => h.set(k, v));
    if (isNewKey(key) && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
    h.set("apikey", key);
    return fetch(input, { ...init, headers: h });
  };
}

async function bufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export const Route = createFileRoute("/api/multi-voucher-extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const token = authHeader.slice(7);

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return Response.json({ error: "LOVABLE_API_KEY ausente" }, { status: 500 });

          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: {
              fetch: makeFetch(SUPABASE_PUBLISHABLE_KEY),
              headers: { Authorization: `Bearer ${token}` },
            },
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const { data: isAdmin } = await supabase.rpc("has_role", {
            _user_id: claims.claims.sub,
            _role: "admin",
          });
          if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "Arquivo não enviado" }, { status: 400 });
          }
          if (file.size > MAX_BYTES) {
            return Response.json({ error: "Arquivo maior que 15 MB" }, { status: 413 });
          }

          const mimeType = file.type || "application/pdf";
          const b64 = await bufferToBase64(await file.arrayBuffer());
          const dataUrl = `data:${mimeType};base64,${b64}`;
          const isImage = mimeType.startsWith("image/");

          const contentBlocks: unknown[] = [
            {
              type: "text",
              text: "Extraia TODOS os itens de viagem (aéreo, hospedagem, serviços) presentes neste documento em JSON estruturado conforme o schema.",
            },
            isImage
              ? { type: "image_url", image_url: { url: dataUrl } }
              : { type: "file", file: { filename: file.name, file_data: dataUrl } },
          ];

          const body = {
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: PROMPT },
              { role: "user", content: contentBlocks },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "return_multi_voucher",
                  description: "Retorna itens estruturados do documento.",
                  parameters: SCHEMA,
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "return_multi_voucher" } },
          };

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
              "X-Lovable-AIG-SDK": "custom-fetch",
            },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const text = await res.text();
            if (res.status === 429)
              return Response.json({ error: "Limite de uso da IA atingido." }, { status: 429 });
            if (res.status === 402)
              return Response.json({ error: "Créditos da IA esgotados." }, { status: 402 });
            return Response.json(
              { error: `Falha na extração (${res.status}): ${text.slice(0, 300)}` },
              { status: 502 },
            );
          }

          const json = (await res.json()) as {
            choices?: Array<{
              message?: {
                tool_calls?: Array<{ function?: { arguments?: string } }>;
                content?: string;
              };
            }>;
          };
          const toolArgs = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          const raw = toolArgs ?? json.choices?.[0]?.message?.content ?? "{}";
          let parsed: { items?: unknown[]; passengers?: unknown[] } = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            const m = raw.match(/\{[\s\S]*\}/);
            if (!m) return Response.json({ error: "Resposta da IA inválida" }, { status: 502 });
            parsed = JSON.parse(m[0]);
          }
          return Response.json({
            items: Array.isArray(parsed.items) ? parsed.items : [],
            passengers: Array.isArray(parsed.passengers) ? parsed.passengers : [],
          });
        } catch (e) {
          return Response.json(
            { error: (e as Error)?.message ?? "Falha inesperada" },
            { status: 500 },
          );
        }
      },
    },
  },
});
