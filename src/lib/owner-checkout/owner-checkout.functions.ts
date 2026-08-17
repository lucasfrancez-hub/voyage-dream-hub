import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_TESTE = "lucas@voeair.com";

const cartIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

/** Extrai o cartId de um link/carrinho da Owner. */
export const ownerExtrairCartId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entrada: z.string().min(8).max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { extrairCartId } = await import("./owner-checkout.server");
    const cartId = extrairCartId(data.entrada);
    return { cartId };
  });

export const ownerSolicitar2fa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ownerSendCode } = await import("./owner-checkout.server");
    return await ownerSendCode(EMAIL_TESTE);
  });

export const ownerValidar2fa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ codigo: z.string().min(4).max(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { ownerValidateCode } = await import("./owner-checkout.server");
    return await ownerValidateCode(EMAIL_TESTE, data.codigo.trim());
  });

export const ownerConsultarCarrinho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cartId: cartIdSchema, token: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { ownerGetCart } = await import("./owner-checkout.server");
    return await ownerGetCart(data.cartId, data.token);
  });

const passageiroSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  documentNumber: z.string().min(3).max(40),
  documentTypeId: z.number().int().default(1),
  dateOfBirth: z.string().min(8).max(30),
  gender: z.number().int().min(1).max(2).default(1),
  nationalityCountryId: z.number().int().default(30),
  passengerTypeCode: z.string().default("ADT"),
  typeCode: z.string().default("ADT"),
  title: z.string().default("MR"),
  contact: z.object({
    emailAddress: z.string().email(),
    ddi: z.number().int().default(55),
    phoneNumber: z.string().min(8).max(20),
  }),
});

export const ownerGravarPassageiros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        cartId: cartIdSchema,
        token: z.string().min(10),
        passageiros: z.array(passageiroSchema).min(1).max(9),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { ownerSavePassengers, checkoutUrl } = await import("./owner-checkout.server");
    const r = await ownerSavePassengers(data.cartId, data.passageiros, data.token);
    return { ...r, checkoutUrl: r.success ? checkoutUrl(data.cartId) : null };
  });
