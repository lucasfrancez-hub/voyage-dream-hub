/**
 * Pix do checkout de voos: o QR Code é SEMPRE da VIA AIR (Asaas),
 * nunca o Pix do fornecedor. O pedido VIA AIR do carrinho é reaproveitado
 * e o time recebe a tarefa manual de refazer o carrinho sem comissão.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const entrada = z.object({
  cartId: z.string().min(8).max(80),
  valor: z.number().finite().positive().max(1_000_000),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160).optional(),
  documentoNumero: z.string().trim().min(11).max(20),
});

export const onerPixViaAir = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => entrada.parse(input))
  .handler(async ({ data }) => {
    try {
      const { abrirPedidoDoCarrinho, concluirPedidoDoCarrinho } = await import(
        "./checkout-order.server"
      );
      const aberto = await abrirPedidoDoCarrinho({ cartId: data.cartId, metodo: "PIX" });
      if (!aberto.viaairOrderId) {
        return { ok: false as const, erro: "Não foi possível abrir o pedido desta reserva." };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("orders")
        .update({
          payment_method: "pix",
          full_name: data.nome,
          cpf: data.documentoNumero.replace(/\D/g, ""),
          ...(data.email ? { email: data.email.toLowerCase() } : {}),
        } as never)
        .eq("id", aberto.viaairOrderId);

      const { criarPixParaPedido } = await import("@/lib/pix-cobranca.server");
      const pix = await criarPixParaPedido({
        orderId: aberto.viaairOrderId,
        valorEsperado: data.valor,
      });

      await concluirPedidoDoCarrinho({
        cartId: data.cartId,
        metodo: "PIX",
        pixExpiraEm: pix.expiraEm,
      });

      return {
        ok: true as const,
        pix: { txid: pix.txid, qrCode: pix.qrCode, valor: pix.valor, expiraEm: pix.expiraEm },
      };
    } catch (e) {
      return {
        ok: false as const,
        erro: e instanceof Error ? e.message : "Não foi possível gerar o Pix agora.",
      };
    }
  });
