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
    description?: string;
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
    description?: string;
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
Retorne SEMPRE um array \`items\`. Se o voucher tiver mais de uma hospedagem (ex.: pacote com 2 hotéis em cidades diferentes), retorne UM item POR HOSPEDAGEM. Não colapse hotéis distintos.
Devolve JSON estruturado com TODOS os dados úteis por item, incluindo políticas.

Regras (por item):
- Datas no formato YYYY-MM-DD (sem hora). Só use hora quando check-in/check-out estiverem explicitamente com horário — nesse caso, deixe as datas puras e coloque a hora em notes.
- title: nome descritivo curto do item (ex.: "Hospedagem — Hotel Pestana Rio").
- supplier_name: fornecedor emissor do voucher (ex.: "CVC", "Bancorbrás", "HotelDo", "Direto no hotel").
- supplier_locator: código da reserva no fornecedor (localizador/PNR/número da reserva).
- hotel_name: nome do hotel. hotel_stars: 1..5 se informado. address: endereço completo com cidade/estado/país.
- room: tipo/descrição do quarto. board: regime (café, meia pensão, all inclusive, apenas hospedagem).
- nights: número de diárias. guests: descrição textual dos hóspedes (ex.: "2 adultos + 1 criança").
- description: RESUMO CURTO E BONITINHO da hospedagem para o cliente (1–3 frases em português claro, tom acolhedor).
- policies: (LEGADO — pode omitir se preencher cancellation_policy + observations).
- cancellation_policy: RESUMO CURTO da política de cancelamento/reembolso/no-show em português claro, com no máximo 3–5 frases OU bullets separados por "\n- ".
- observations: ARRAY de tópicos curtos com TODAS as demais informações relevantes do voucher. Cada item = 1 tópico curto (1 linha, máx ~140 chars). Não omita nenhuma.
- value: valor total pago em número. tax_value: taxas incluídas no total. currency: BRL/USD/EUR.
- status: "confirmed" se o voucher confirma emissão; "reserved" se aguardando pagamento; "pending" se apenas pedido.
- passengers: lista de hóspedes com nome completo; kind = "adult"/"child"/"infant"; cpf/document só se explícitos.
- notes: contatos e telefones de emergência (se houver). NÃO duplique observações.
- NUNCA invente. Se um campo não estiver no voucher, omita-o do JSON.`;

const SERVICE_PROMPT = `Você extrai vouchers de SERVIÇOS de viagem (traslados, passeios, ingressos, seguros, aluguel de carro, transfers, atividades).

MUITO IMPORTANTE — MÚLTIPLOS SERVIÇOS: um único voucher/PDF frequentemente contém VÁRIOS serviços distintos (ex.: 5 passeios em cidades diferentes, ou traslado + tour + ingresso). Retorne UM item POR SERVIÇO. Nunca colapse serviços diferentes em um só item. Cada localizador/reserva/tour distinto = 1 item separado no array \`items\`.

Devolve JSON estruturado com TODOS os dados úteis por item, incluindo políticas.

Regras (por item):
- Datas em YYYY-MM-DD; horas em HH:MM (24h) quando houver.
- title: nome descritivo curto e claro do serviço (ex.: "Excursão a Lucerna", "Traslado GRU → Hotel", "Ingresso Disney 3 dias"). NÃO inclua códigos internos, "COMBO", "General - Adultos - es, en" nem faixa etária no título.
- category: categoria curta ("Passeio", "Traslado", "Ingresso", "Seguro", "Aluguel de carro", "Atividade").
- supplier_name: fornecedor/operador (ex.: "CIVITATIS TOURS", "Assist Card").
- supplier_locator: código da reserva DAQUELE serviço específico.
- quantity: quantidade quando aplicável.
- date_from/time_from: início do serviço; date_to/time_to: fim (quando houver).
- address: ponto de encontro / endereço quando existir.
- description: RESUMO CURTO E BONITINHO para o cliente entender o que ele contratou (2–4 frases, em português claro, tom acolhedor). Foque no que a pessoa VAI FAZER — não copie parágrafos gigantes nem repita política de cancelamento. Ex.: "Passeio de dia inteiro saindo de Zurique para Lucerna. Inclui transporte de ida e volta e guia acompanhante em espanhol e inglês. Em Lucerna você tem cerca de 6 horas livres para explorar a cidade por conta própria."
- policies: (LEGADO — pode omitir se preencher cancellation_policy + observations).
- cancellation_policy: RESUMO CURTO da política de cancelamento/reembolso/no-show (3–5 frases OU bullets separados por "\n- ").
- observations: ARRAY de tópicos curtos com TODAS as demais informações relevantes DESTE serviço (itens inclusos/não inclusos, ponto de encontro, horário de apresentação, idiomas do guia, documentos, contatos). Cada item = 1 tópico curto (1 linha, máx ~140 chars). Não omita nenhuma.
- value/tax_value/currency: se o voucher trouxer valor DAQUELE serviço específico. Se o valor for único e geral, deixe apenas no primeiro item ou omita nos demais.
- status: "confirmed" (voucher emitido/confirmado), "reserved" (aguardando pgto), "pending" (solicitado).
- passengers: participantes/beneficiários DAQUELE serviço; kind = adult/child/infant.
- notes: contatos, telefone de emergência (se houver). NÃO duplique observações nem a description.
- NUNCA invente. Se um campo não estiver no voucher, omita-o do JSON.`;

function itemSchema(kind: "hotel" | "other") {
  const commonDetails: Record<string, unknown> = {
    value: { type: "number" },
    tax_value: { type: "number" },
    currency: { type: "string" },
    supplier_name: { type: "string" },
    policies: { type: "string" },
    cancellation_policy: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
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
