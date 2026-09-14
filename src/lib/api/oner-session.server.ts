/**
 * Sessão de compra do fornecedor (Oner) para a API interna.
 *
 * A pesquisa de voos é anônima; carrinho, passageiros, revalidação, formas de
 * pagamento, cartão, cancelamento e criação do pedido exigem a sessão da conta
 * operacional VIA AIR. Quando ela está vencida, a VIA AIR renova sozinha:
 * pede o código por e-mail e conclui o login internamente. O consumidor da API
 * (Sky Hub) nunca recebe, guarda ou envia código, cookie ou token do
 * fornecedor.
 *
 * Quando a renovação não conclui dentro da janela da requisição, devolvemos
 * `provider_session_unavailable` (503, repetível) com `retryAfterSeconds`, e
 * avisamos por webhook: checkout.session.required / restored / failed.
 *
 * SERVER-ONLY.
 */
import { fail } from "./respond";

/** Janela máxima de espera pelo código dentro de uma requisição HTTP. */
const ESPERA_CODIGO_MS = 20_000;
/** Quanto o consumidor deve esperar antes de repetir a chamada. */
const RETRY_AFTER_S = 60;

export type ContextoSessao = {
  checkoutId?: string | null;
  orderId?: string | null;
  groupId?: string | null;
};

async function avisar(
  event: "checkout.session.required" | "checkout.session.restored" | "checkout.session.failed",
  ctx: ContextoSessao,
  extra: Record<string, unknown> = {},
) {
  try {
    const { enfileirarEvento } = await import("./webhooks.server");
    await enfileirarEvento(event, {
      ...(ctx.checkoutId ? { checkoutId: ctx.checkoutId } : {}),
      ...(ctx.orderId ? { orderId: ctx.orderId } : {}),
      ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
      provider: "oner",
      ...extra,
    });
  } catch {
    /* aviso nunca derruba o fluxo */
  }
}

/**
 * Devolve o token da sessão de compra, renovando quando necessário.
 * Em caso de indisponibilidade devolve a resposta HTTP pronta.
 */
export async function sessaoDeCompra(
  correlationId: string,
  ctx: ContextoSessao = {},
): Promise<{ token: string } | { falha: Response }> {
  const { tokenAtual, obterToken } = await import("@/lib/integrations/oner/session.server");

  const jaTinha = await tokenAtual();
  if (jaTinha) return { token: jaTinha };

  // Sessão vencida: a VIA AIR renova por conta própria (código por e-mail).
  await avisar("checkout.session.required", ctx, { retryAfterSeconds: RETRY_AFTER_S });

  let token: string | null = null;
  try {
    token = await obterToken({ esperarCodigoMs: ESPERA_CODIGO_MS });
  } catch {
    token = null;
  }

  if (token) {
    await avisar("checkout.session.restored", ctx);
    return { token };
  }

  await avisar("checkout.session.failed", ctx, { retryAfterSeconds: RETRY_AFTER_S });
  return {
    falha: fail(
      "provider_session_unavailable",
      "A sessão de compra do fornecedor está sendo reativada. Repita a chamada em instantes com a mesma Idempotency-Key.",
      correlationId,
      {
        provider: "oner",
        details: { retryAfterSeconds: RETRY_AFTER_S, renewal: "IN_PROGRESS" },
      },
    ),
  };
}
