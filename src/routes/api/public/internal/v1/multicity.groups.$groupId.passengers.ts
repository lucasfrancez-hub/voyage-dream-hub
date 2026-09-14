/**
 * PUT /api/public/internal/v1/multicity/groups/{groupId}/passengers
 * Aplica os mesmos passageiros a todos os checkouts do grupo.
 * Se uma perna recusar, só ela falha — as outras continuam válidas.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";
import { comIdempotencia } from "@/lib/api/idempotency.server";
import { lerCheckoutRef } from "@/lib/api/refs.server";
import { lerGrupo } from "@/lib/api/multicity.server";

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

export const Route = createFileRoute(
  "/api/public/internal/v1/multicity/groups/$groupId/passengers",
)({
  server: {
    handlers: {
      PUT: async ({ request, params }) =>
        withApi(request, "passengers:write", async (ctx) =>
          comIdempotencia(
            {
              clientId: ctx.client.id,
              idempotencyKey: ctx.idempotencyKey,
              endpoint: `/multicity/groups/${params.groupId}/passengers`,
              body: ctx.body,
              correlationId: ctx.correlationId,
            },
            async () => {
              const grupo = await lerGrupo(params.groupId, ctx.client.id);
              if (!grupo) return fail("not_found", "Grupo não encontrado.", ctx.correlationId);
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
                  return fail(
                    "provider_unavailable",
                    "Sessão do fornecedor indisponível.",
                    ctx.correlationId,
                  );
                }
                const telefone = (primeiro.phone ?? "").replace(/\D/g, "");
                const lista = parsed.data.passengers.map((p) => ({
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
                }));

                const resultados = [];
                for (const item of grupo.itens) {
                  if (!item.checkout_id) {
                    resultados.push({
                      sequence: item.sequence,
                      checkoutId: null,
                      status: "FAILED",
                      error: { code: "not_found", message: "Esta perna não tem checkout criado." },
                    });
                    continue;
                  }
                  const ref = await lerCheckoutRef(item.checkout_id);
                  if (!ref) {
                    resultados.push({
                      sequence: item.sequence,
                      checkoutId: item.checkout_id,
                      status: "FAILED",
                      error: { code: "not_found", message: "Checkout expirado." },
                    });
                    continue;
                  }
                  try {
                    const r = await enviarPassageiros(ref.cartId, lista, token);
                    resultados.push({
                      sequence: item.sequence,
                      checkoutId: item.checkout_id,
                      status: r.ok ? "APPLIED" : "FAILED",
                      error: r.ok
                        ? null
                        : {
                            code: "provider_error",
                            message: "O fornecedor recusou os dados nesta perna.",
                          },
                    });
                  } catch (e) {
                    resultados.push({
                      sequence: item.sequence,
                      checkoutId: item.checkout_id,
                      status: "FAILED",
                      error: {
                        code: "provider_error",
                        message: e instanceof Error ? e.message : "Falha ao enviar os passageiros.",
                      },
                    });
                  }
                }

                return ok(
                  {
                    groupId: grupo.group_id,
                    passengersSaved: parsed.data.passengers.length,
                    status: resultados.every((r) => r.status === "APPLIED")
                      ? "APPLIED"
                      : resultados.some((r) => r.status === "APPLIED")
                        ? "PARTIALLY_APPLIED"
                        : "FAILED",
                    reservations: resultados,
                  },
                  ctx.correlationId,
                );
              } catch (e) {
                return failFromError(e, ctx.correlationId);
              }
            },
          ),
        ),
    },
  },
});
