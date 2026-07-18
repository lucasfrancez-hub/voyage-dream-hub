import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  fileBase64: z.string().min(20).max(20_000_000),
  kind: z.enum(["hotel", "other"]),
});

export type ExtractedItemPassenger = {
  full_name?: string;
  kind?: "adult" | "child" | "infant";
  cpf?: string | null;
  birth_date?: string | null;
  document?: string | null;
};

export type ExtractedHotelItem = {
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
    policies?: string;
    cancellation_policy?: string;
    observations?: string[];
    value?: number;
    tax_value?: number;
    currency?: string;
    supplier_name?: string;
    notes?: string;
  };
  passengers?: ExtractedItemPassenger[];
};

export type ExtractedServiceItem = {
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
    policies?: string;
    cancellation_policy?: string;
    observations?: string[];
    value?: number;
    tax_value?: number;
    currency?: string;
    supplier_name?: string;
    notes?: string;
  };
  passengers?: ExtractedItemPassenger[];
};

export type ExtractedItemVoucher = ExtractedHotelItem | ExtractedServiceItem;

const HOTEL_PROMPT = `Você extrai vouchers de HOSPEDAGEM (hotéis, pousadas, resorts).
Devolve JSON estruturado com TODOS os dados úteis, incluindo políticas.

Regras:
- Datas no formato YYYY-MM-DD (sem hora). Só use hora quando check-in/check-out estiverem explicitamente com horário — nesse caso, deixe as datas puras e coloque a hora em notes.
- title: nome descritivo curto do item (ex.: "Hospedagem — Hotel Pestana Rio").
- supplier_name: fornecedor emissor do voucher (ex.: "CVC", "Bancorbrás", "HotelDo", "Direto no hotel").
- supplier_locator: código da reserva no fornecedor (localizador/PNR/número da reserva).
- hotel_name: nome do hotel. hotel_stars: 1..5 se informado. address: endereço completo com cidade/estado/país.
- room: tipo/descrição do quarto. board: regime (café, meia pensão, all inclusive, apenas hospedagem).
- nights: número de diárias. guests: descrição textual dos hóspedes (ex.: "2 adultos + 1 criança").
- policies: TUDO sobre cancelamento, reembolso, no-show, taxas de resort, taxas locais, política de crianças, política de pet, check-in/check-out horários, depósito, etc. Preserve o texto original.
- value: valor total pago em número. tax_value: taxas incluídas no total. currency: BRL/USD/EUR.
- status: "confirmed" se o voucher confirma emissão; "reserved" se aguardando pagamento; "pending" se apenas pedido.
- passengers: lista de hóspedes com nome completo; kind = "adult"/"child"/"infant"; cpf/document só se explícitos.
- notes: qualquer observação relevante (horários, contatos, instruções).
- NUNCA invente. Se um campo não estiver no voucher, omita-o do JSON.`;

const SERVICE_PROMPT = `Você extrai vouchers de SERVIÇOS de viagem (traslados, passeios, ingressos, seguros, aluguel de carro, transfers, atividades).
Devolve JSON estruturado com TODOS os dados úteis, incluindo políticas.

Regras:
- Datas em YYYY-MM-DD; horas em HH:MM (24h) quando houver.
- title: nome descritivo do serviço (ex.: "Traslado GRU → Hotel", "City Tour Paris", "Ingresso Disney 3 dias", "Seguro Viagem Assist Card 30 dias").
- category: categoria curta ("Traslado", "Passeio", "Ingresso", "Seguro", "Aluguel de carro", "Atividade").
- supplier_name: fornecedor/operador emissor do voucher.
- supplier_locator: código da reserva no fornecedor.
- quantity: quantidade quando aplicável (ex.: 4 ingressos).
- date_from/time_from: início do serviço; date_to/time_to: fim (quando houver).
- address: local do serviço / ponto de encontro / endereço quando existir.
- policies: TUDO sobre cancelamento, reembolso, no-show, coberturas (para seguros), franquia, limite de idade, restrições, incluído/não incluído. Preserve texto original.
- value: valor total em número. tax_value: taxas incluídas. currency: BRL/USD/EUR.
- status: "confirmed" (voucher emitido/confirmado), "reserved" (aguardando pgto), "pending" (solicitado).
- passengers: participantes/beneficiários com nome; kind = adult/child/infant; cpf/document só se explícitos.
- notes: contatos, telefone de emergência, instruções específicas, horários, códigos adicionais.
- NUNCA invente. Se um campo não estiver no voucher, omita-o do JSON.`;

function itemSchema(kind: "hotel" | "other") {
  const commonDetails: Record<string, unknown> = {
    value: { type: "number" },
    tax_value: { type: "number" },
    currency: { type: "string" },
    supplier_name: { type: "string" },
    policies: { type: "string" },
    address: { type: "string" },
    notes: { type: "string" },
  };
  const hotelExtra: Record<string, unknown> = {
    hotel_name: { type: "string" },
    hotel_stars: { type: "number" },
    room: { type: "string" },
    board: { type: "string" },
    check_in: { type: "string" },
    check_out: { type: "string" },
    nights: { type: "number" },
    guests: { type: "string" },
  };
  const serviceExtra: Record<string, unknown> = {
    category: { type: "string" },
    quantity: { type: "number" },
    date_from: { type: "string" },
    date_to: { type: "string" },
    time_from: { type: "string" },
    time_to: { type: "string" },
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      supplier_name: { type: "string" },
      supplier_locator: { type: "string" },
      status: { type: "string", enum: ["confirmed", "reserved", "pending"] },
      details: {
        type: "object",
        additionalProperties: false,
        properties: { ...commonDetails, ...(kind === "hotel" ? hotelExtra : serviceExtra) },
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
  } as const;
}

export const extractItemVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ExtractedItemVoucher> => {
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
    const systemPrompt = data.kind === "hotel" ? HOTEL_PROMPT : SERVICE_PROMPT;

    const contentBlocks: unknown[] = [
      {
        type: "text",
        text: "Extraia TODOS os dados úteis deste voucher em JSON estruturado conforme o schema. Preserve políticas e observações no texto original.",
      },
      isImage
        ? { type: "image_url", image_url: { url: dataUrl } }
        : { type: "file", file: { filename: data.filename, file_data: dataUrl } },
    ];

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contentBlocks },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_item_voucher",
            description: "Retorna dados estruturados do voucher.",
            parameters: itemSchema(data.kind),
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_item_voucher" } },
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
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Resposta da IA não pôde ser interpretada como JSON.");
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    }

    return { kind: data.kind, ...parsed } as ExtractedItemVoucher;
  });
