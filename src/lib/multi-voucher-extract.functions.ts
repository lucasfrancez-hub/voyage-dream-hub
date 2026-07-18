import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  fileBase64: z.string().min(20).max(20_000_000),
});

export type MultiPassenger = {
  full_name?: string;
  kind?: "adult" | "child" | "infant";
  cpf?: string | null;
  birth_date?: string | null;
  document?: string | null;
};

export type MultiFlightSegment = {
  airline_code?: string;
  airline_name?: string;
  flight_number?: string;
  from_iata?: string;
  to_iata?: string;
  depart_at?: string;
  arrive_at?: string;
  cabin_class?: string;
  fare_class?: string;
  segment_index?: number;
};

export type MultiExtractedItem =
  | {
      kind: "flight";
      title?: string;
      supplier_name?: string;
      supplier_locator?: string;
      status?: "confirmed" | "reserved" | "pending";
      segments: MultiFlightSegment[];
      details?: {
        value?: number;
        tax_value?: number;
        currency?: string;
        cancellation_policy?: string;
        observations?: string[];
        notes?: string;
      };
    }
  | {
      kind: "hotel";
      title?: string;
      supplier_name?: string;
      supplier_locator?: string;
      status?: "confirmed" | "reserved" | "pending";
      details: {
        hotel_name?: string;
        hotel_stars?: number;
        address?: string;
        room?: string;
        board?: string;
        check_in?: string;
        check_out?: string;
        nights?: number;
        guests?: string;
        value?: number;
        tax_value?: number;
        currency?: string;
        cancellation_policy?: string;
        observations?: string[];
        notes?: string;
      };
    }
  | {
      kind: "other";
      title?: string;
      supplier_name?: string;
      supplier_locator?: string;
      status?: "confirmed" | "reserved" | "pending";
      details: {
        category?: string;
        quantity?: number;
        date_from?: string;
        date_to?: string;
        time_from?: string;
        time_to?: string;
        address?: string;
        value?: number;
        tax_value?: number;
        currency?: string;
        cancellation_policy?: string;
        observations?: string[];
        notes?: string;
      };
    };

export type MultiExtractResult = {
  items: MultiExtractedItem[];
  passengers: MultiPassenger[];
};

const PROMPT = `Você recebe UM documento (voucher, itinerário, confirmação, e-mail impresso em PDF) que pode conter MÚLTIPLOS produtos de viagem misturados: aéreo, hospedagem e serviços (traslado, passeio, ingresso, seguro, aluguel de carro).

Sua tarefa: separar o documento em ITENS individuais, cada um com seu próprio "kind".

REGRAS GERAIS:
- Datas: YYYY-MM-DD. Horas em ISO local "YYYY-MM-DDTHH:MM" quando houver.
- Nunca invente dado que não esteja no documento.
- Se um bloco não deixa claro o tipo, use "other" (serviço).
- passengers no NÍVEL SUPERIOR: lista única de passageiros/hóspedes do documento inteiro. Não repita a mesma pessoa por item.

CLASSIFICAÇÃO POR TIPO:

kind = "flight" (AÉREO): um item por RESERVA aérea (localizador/PNR). O item traz "segments" com TODOS os trechos daquela reserva.
- supplier_locator: PNR/localizador da reserva (6 letras, ex.: ABC123).
- supplier_name: companhia emissora ou consolidadora.
- segments[]: cada trecho com airline_code (2 letras IATA), airline_name, flight_number, from_iata (3 letras), to_iata (3 letras), depart_at (ISO local "YYYY-MM-DDTHH:MM"), arrive_at, cabin_class ("Econômica"/"Executiva"/"Primeira"), fare_class (1 letra quando informado), segment_index (ordem 0,1,2...).
- details.value: total pago da reserva aérea. details.tax_value: taxas. details.currency: BRL/USD/EUR.

kind = "hotel" (HOSPEDAGEM): um item por hotel/reserva de hospedagem.
- details.hotel_name, hotel_stars (1..5), address (endereço completo com cidade/país), room, board (regime), check_in, check_out, nights, guests (texto).
- details.value, tax_value, currency.

kind = "other" (SERVIÇOS): traslados, passeios, ingressos, seguros, aluguel de carro, atividades. Um item por serviço.
- details.category: "Traslado", "Passeio", "Ingresso", "Seguro", "Aluguel de carro", "Atividade".
- details.date_from/time_from, date_to/time_to, address, value, tax_value, currency.

POLÍTICAS E OBSERVAÇÕES (em CADA item):
- details.cancellation_policy: RESUMO CURTO da política de cancelamento/reembolso/no-show DAQUELE item (3–5 frases OU bullets separados por "\\n- ").
- details.observations: ARRAY de tópicos curtos (1 linha, ~140 chars) com TODAS as demais informações do item (taxas obrigatórias, horários, políticas de crianças/pet, café, wi-fi, franquia de bagagem, ponto de encontro, coberturas de seguro, etc). Cada item do array = 1 tópico. Não agrupe.
- details.notes: apenas contatos/telefones de emergência se houver. Não duplique observações.

title (em cada item): descritivo curto humano (ex.: "Aéreo LATAM GRU→MIA", "Hospedagem — Hotel Pestana Rio", "Traslado GRU → Hotel").

status: "confirmed" se emitido/confirmado; "reserved" se aguardando pagamento; "pending" se apenas solicitado.

passageiros: full_name obrigatório; kind = adult/child/infant; cpf apenas se 11 dígitos explícitos; document = passaporte quando houver; birth_date se explícito.

Se o documento contém APENAS um tipo, retorne items com 1 elemento. Se tem vários tipos, retorne múltiplos.
`;

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

export const extractMultiVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MultiExtractResult> => {
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
    const isImage = data.mimeType.startsWith("image/");

    const contentBlocks: unknown[] = [
      {
        type: "text",
        text: "Extraia TODOS os itens de viagem (aéreo, hospedagem, serviços) presentes neste documento em JSON estruturado conforme o schema. Separe corretamente por tipo.",
      },
      isImage
        ? { type: "image_url", image_url: { url: dataUrl } }
        : { type: "file", file: { filename: data.filename, file_data: dataUrl } },
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
    let parsed: MultiExtractResult = { items: [], passengers: [] };
    try {
      parsed = JSON.parse(raw) as MultiExtractResult;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Resposta da IA não pôde ser interpretada como JSON.");
      parsed = JSON.parse(match[0]) as MultiExtractResult;
    }

    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      passengers: Array.isArray(parsed.passengers) ? parsed.passengers : [],
    };
  });
