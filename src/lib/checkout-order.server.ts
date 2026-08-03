import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const passengerSchema = z.object({
  index: z.number().int().min(1).max(20),
  full_name: z.string().trim().min(2).max(120),
  cpf: z.string().max(20).nullable().optional(),
  birth_date: z.string().max(10).nullable().optional(),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(30).optional(),
});

const boletoCaptureSchema = z.record(z.string(), z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null(),
]));

const checkoutOrderSchema = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(["payment_link", "payment_link_simple", "payment_link_boleto"]),
  description: z.string().trim().min(1).max(500),
  reference: z.string().max(1000).nullable().optional(),
  orderNumber: z.string().max(100).nullable().optional(),
  total: z.number().finite().positive().max(10_000_000),
  installments: z.number().int().min(1).max(12),
  firstAmount: z.number().finite().nonnegative().nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(8).max(30),
  cpf: z.string().max(20).nullable().optional(),
  birthDate: z.string().max(10).nullable().optional(),
  notes: z.string().max(3000).nullable().optional(),
  passengers: z.array(passengerSchema).min(1).max(20).optional(),
  boletoCapture: boletoCaptureSchema.optional(),
  cardCapture: z.object({
    brand_hint: z.string().max(30),
    last4: z.string().regex(/^\d{4}$/),
    holder: z.string().trim().min(2).max(120),
    holder_cpf: z.string().max(20).optional(),
    expiry: z.string().max(7),
    billing: z.object({
      address: z.string().trim().min(2).max(200),
      number: z.string().trim().min(1).max(30),
      zip: z.string().trim().min(8).max(10),
      city: z.string().trim().min(2).max(100),
      state: z.string().trim().length(2),
    }),
    authorization: z.record(z.string(), z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
    ])).optional(),
  }).optional(),
});

export function validateCheckoutOrderInput(input: unknown) {
  return checkoutOrderSchema.parse(input);
}

export async function submitCheckoutOrderHandler({ data }: { data: z.infer<typeof checkoutOrderSchema> }) {
  const isBoleto = data.kind === "payment_link_boleto";
  if (isBoleto && (!data.boletoCapture || !data.passengers)) {
    throw new Error("Dados do boleto incompletos.");
  }
  if (!isBoleto && !data.cardCapture) {
    throw new Error("Dados do cartão incompletos.");
  }

  const packageSnapshot = isBoleto
    ? {
        kind: data.kind,
        description: data.description,
        reference: data.reference ?? null,
        order_number: data.orderNumber ?? null,
        total: data.total,
        installments: data.installments,
        installment_value: data.total / data.installments,
        image_url: data.imageUrl ?? null,
        passengers: data.passengers,
        boleto_capture: data.boletoCapture,
      }
    : {
        kind: data.kind,
        mode: data.kind === "payment_link" ? "secure" : "simple",
        description: data.description,
        reference: data.reference ?? null,
        order_number: data.orderNumber ?? null,
        installments: data.installments,
        total: data.total,
        first_amount: data.firstAmount ?? null,
        card_capture: data.cardCapture,
      };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("orders").insert({
    id: data.requestId,
    package_id: null,
    package_snapshot: packageSnapshot as Json,
    full_name: data.fullName,
    email: data.email.toLowerCase(),
    phone: data.phone,
    cpf: data.cpf ?? null,
    birth_date: data.birthDate ?? null,
    adults: Math.min(Math.max(data.passengers?.length ?? 1, 1), 20),
    children: 0,
    payment_method: isBoleto
      ? data.installments > 1 ? `boleto_${data.installments}x` : "boleto"
      : `credit_card_${data.installments}x`,
    total_price: data.total,
    notes: data.notes ?? null,
  });

  if (error && error.code !== "23505") {
    console.error("[checkout-order] insert failed", {
      requestId: data.requestId,
      kind: data.kind,
      code: error.code,
      message: error.message,
    });
    throw new Error(`Falha ${error.code || "desconhecida"} ao registrar a solicitação.`);
  }

  console.info("[checkout-order] accepted", { requestId: data.requestId, kind: data.kind });
  return { orderId: data.requestId };
}