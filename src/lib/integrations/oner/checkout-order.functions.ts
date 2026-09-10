/**
 * Funções do checkout que alimentam a tela de Pedidos da VIA AIR.
 * Todo checkout do portal precisa aparecer em "Meus pedidos" no mesmo formato
 * dos demais pedidos — inclusive o Pix, que abre tarefa manual com prazo.
 */
import { createServerFn } from "@tanstack/react-start";
import type { PassageiroDoCheckout } from "./checkout-order.server";

export const onerAbrirPedidoCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { cartId: string; metodo: "CARD" | "PIX"; passageiros?: PassageiroDoCheckout[] }) => d,
  )
  .handler(async ({ data }) => {
    const { abrirPedidoDoCarrinho } = await import("./checkout-order.server");
    try {
      return await abrirPedidoDoCarrinho(data);
    } catch {
      return { viaairOrderId: null, integrationOrderId: null };
    }
  });

export const onerConcluirPedidoCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      cartId: string;
      metodo: "CARD" | "PIX";
      localizador?: string | null;
      pixBrcode?: string | null;
      pixExpiraEm?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { concluirPedidoDoCarrinho } = await import("./checkout-order.server");
    try {
      return await concluirPedidoDoCarrinho(data);
    } catch {
      return { ok: false as const };
    }
  });
