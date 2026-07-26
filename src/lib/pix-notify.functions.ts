import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Notifica admin por e-mail quando um pedido via Pix é registrado no checkout.
 * Endpoint público (o checkout aceita clientes não autenticados). Não retorna
 * dados sensíveis e apenas dispara e-mail para o admin configurado.
 */
export const notifyPixOrder = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        orderNumber: z.string().min(1).max(40),
        productKind: z.string().max(40).optional(),
        productTitle: z.string().max(200).optional(),
        adults: z.number().int().min(0).max(50).optional(),
        children: z.number().int().min(0).max(50).optional(),
        totalPrice: z.string().max(40).optional(),
        customerName: z.string().max(200).optional(),
        customerEmail: z.string().max(200).optional(),
        customerPhone: z.string().max(60).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const adminEmail = process.env.AGENCIA_EMAIL_ASSINATURA
    if (!adminEmail) return { success: false, reason: 'no_admin_email' }

    const { sendTransactionalInternal } = await import('@/lib/email/send-internal.server')
    const res = await sendTransactionalInternal({
      templateName: 'pedido-pix-admin',
      recipientEmail: adminEmail,
      idempotencyKey: `pix-order-${data.orderNumber}`,
      templateData: data,
    })
    return { success: res.success }
  })
