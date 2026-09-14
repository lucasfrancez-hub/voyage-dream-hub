/**
 * PUT /api/public/internal/v1/checkouts/{checkoutId}/passengers
 * Envia os passageiros ao fornecedor. Só o primeiro passageiro leva contato.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { lerCheckoutRef } from "@/lib/api/refs.server";

const passageiro = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(80),
  type: z.enum(["ADT", "CHD", "INF"]).default("ADT"),
  gender: z.enum(["M", "F"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  documentNumber: z.string().trim().min(5).max(30),
  documentType: z.number().int().min(1).max(9).default(1),
  nationalityCountryId: z.number().int().min(1).default(30),
  email: z.string().email().max(160).nullish(),
  phone: z.string().trim().min(8).max(20).nullish(),
});

const entrada = z.object({ passengers: z.array(passageiro).min(1).max(9) });

/** Sr. / Sra. / Srta. conforme sexo e tipo — a Sky Hub não envia tratamento. */
function tratamento(p: z.infer<typeof passageiro>): string {
  if (p.type !== "ADT") return p.gender === "F" ? "Srta." : "Sr.";
  return p.gender === "F" ? "Sra." : "Sr.";
}

export const Route = createFileRoute("/api/public/internal/v1/checkouts/$checkoutId/passengers")({
  server: {
    handlers: {
      PUT: async ({ request, params }) =>
        withApi(request, "passengers:write", async (ctx) => {
          const ref = await lerCheckoutRef(params.checkoutId);
          if (!ref) return fail("not_found", "Checkout não encontrado.", ctx.correlationId);
          const parsed = entrada.safeParse(ctx.body);
          if (!parsed.success) {
            return fail("invalid_request", "Dados dos passageiros inválidos.", ctx.correlationId, {
              details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            });
          }
          const primeiro = parsed.data.passengers[0]!;
          if (!primeiro.email || !primeiro.phone) {
            return fail(
              "invalid_request",
              "O primeiro passageiro precisa de e-mail e telefone.",
              ctx.correlationId,
            );
          }
          try {
            const { obterToken } = await import("@/lib/integrations/oner/session.server");
            const { enviarPassageiros } = await import("@/lib/integrations/oner/checkout.server");
            const token = await obterToken({});
            if (!token) {
              return fail("provider_unavailable", "Sessão do fornecedor indisponível.", ctx.correlationId);
            }
            const telefone = (primeiro.phone ?? "").replace(/\D/g, "");
            const r = await enviarPassageiros(
              ref.cartId,
              parsed.data.passengers.map((p) => ({
                firstName: p.firstName,
                lastName: p.lastName,
                documentNumber: p.documentNumber.replace(/\s/g, ""),
                documentTypeId: p.documentType,
                dateOfBirth: p.birthDate,
                gender: p.gender === "F" ? 2 : 1,
                nationalityCountryId: p.nationalityCountryId,
                passengerTypeCode: p.type,
                typeCode: p.type,
                title: tratamento(p),
                contact: {
                  emailAddress: primeiro.email!.toLowerCase(),
                  ddi: 55,
                  phoneNumber: telefone,
                },
              })),
              token,
            );
            if (!r.ok) {
              return fail(
                "provider_error",
                "O fornecedor recusou os dados dos passageiros.",
                ctx.correlationId,
                { provider: "oner" },
              );
            }
            return ok(
              { checkoutId: params.checkoutId, passengersSaved: parsed.data.passengers.length },
              ctx.correlationId,
            );
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
