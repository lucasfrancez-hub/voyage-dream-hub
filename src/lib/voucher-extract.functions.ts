import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  fileBase64: z.string().min(20).max(20_000_000), // ~15MB base64 cap
});

export type ExtractedVoucherFlightSegment = {
  airline?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  layover?: string;
};

export type ExtractedVoucherFlight = {
  airline?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  stops?: number;
  cabin_class?: string;
  carry_on?: boolean;
  checked_bag?: boolean;
  personal_item?: boolean;
  segments?: ExtractedVoucherFlightSegment[];
};

export type ExtractedVoucherPassenger = {
  full_name?: string;
  kind?: "adult" | "child" | "infant";
  cpf?: string | null;
  birth_date?: string | null;
  document?: string | null;
};

export type ExtractedVoucherHotel = {
  name?: string;
  stars?: number;
  meal_plan?: string;
  check_in?: string;
  check_out?: string;
  nights?: number;
};

export type ExtractedVoucher = {
  supplier_name?: string;
  supplier_order_number?: string;
  locator?: string;
  reservation_reference?: string;
  destination?: string;
  origin?: string;
  going_date?: string | null;
  return_date?: string | null;
  total_price?: number | null;
  currency?: string | null;
  outbound_flight?: ExtractedVoucherFlight | null;
  return_flight?: ExtractedVoucherFlight | null;
  hotel?: ExtractedVoucherHotel | null;
  passengers?: ExtractedVoucherPassenger[];
  notes?: string | null;
};

const SYSTEM_PROMPT = `Você é um extrator de vouchers de viagem (companhias aéreas e operadoras).
Recebe um voucher em PDF e devolve JSON estruturado com voos, hotel e passageiros.

Regras:
- Datas/horas no formato ISO 8601 quando possível (ex.: 2025-09-24T06:05:00-03:00). Se não houver timezone, use o horário local.
- Códigos IATA em MAIÚSCULAS (3 letras).
- Se houver voo de ida e volta, preencha outbound_flight e return_flight. Se houver conexões, use segments[].
- passengers[].kind: "adult" para adultos, "child" para crianças, "infant" para colo/bebê.
- CPF só se estiver explícito no voucher; senão null.
- supplier_name: nome do fornecedor emissor (ex.: "Azul Linhas Aéreas", "GOL", "LATAM", "CVC", "HubTravels").
- supplier_order_number: número do pedido/reserva no sistema do fornecedor.
- locator: código localizador da reserva (PNR, 6 caracteres normalmente).
- Não invente. Se um campo não estiver no voucher, omita.`;

export const extractVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ExtractedVoucher> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente no servidor");

    const dataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraia as informações deste voucher em JSON estruturado seguindo o schema.",
            },
            {
              type: "file",
              file: { filename: data.filename, file_data: dataUrl },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_voucher_data",
            description: "Retorna os dados estruturados do voucher.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                supplier_name: { type: "string" },
                supplier_order_number: { type: "string" },
                locator: { type: "string" },
                reservation_reference: { type: "string" },
                destination: { type: "string" },
                origin: { type: "string" },
                going_date: { type: "string" },
                return_date: { type: "string" },
                total_price: { type: "number" },
                currency: { type: "string" },
                outbound_flight: flightSchema(),
                return_flight: flightSchema(),
                hotel: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    stars: { type: "number" },
                    meal_plan: { type: "string" },
                    check_in: { type: "string" },
                    check_out: { type: "string" },
                    nights: { type: "number" },
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
                notes: { type: "string" },
              },
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_voucher_data" } },
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
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na extração (${res.status}): ${text.slice(0, 300)}`);
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
    let parsed: ExtractedVoucher = {};
    try {
      parsed = JSON.parse(raw) as ExtractedVoucher;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]) as ExtractedVoucher;
        } catch {
          throw new Error("Resposta da IA não pôde ser interpretada como JSON.");
        }
      } else {
        throw new Error("Resposta da IA não pôde ser interpretada como JSON.");
      }
    }

    return parsed;
  });

function flightSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      airline: { type: "string" },
      flight_number: { type: "string" },
      from_iata: { type: "string" },
      from_city: { type: "string" },
      to_iata: { type: "string" },
      to_city: { type: "string" },
      depart_at: { type: "string" },
      arrive_at: { type: "string" },
      duration: { type: "string" },
      stops: { type: "number" },
      cabin_class: { type: "string" },
      carry_on: { type: "boolean" },
      checked_bag: { type: "boolean" },
      personal_item: { type: "boolean" },
      segments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            airline: { type: "string" },
            flight_number: { type: "string" },
            from_iata: { type: "string" },
            from_city: { type: "string" },
            to_iata: { type: "string" },
            to_city: { type: "string" },
            depart_at: { type: "string" },
            arrive_at: { type: "string" },
            duration: { type: "string" },
            layover: { type: "string" },
          },
        },
      },
    },
  } as const;
}
