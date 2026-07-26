import { createFileRoute } from '@tanstack/react-router'

/**
 * Webhook público recebido do proxy mTLS quando o Itaú confirma um Pix.
 * Payload reencaminhado do endpoint `/webhook/pix` do proxy:
 *   { pix: [{ endToEndId, txid, valor, horario, ... }], receivedAt }
 *
 * O proxy assina com `X-Proxy-Secret` — mesmo secret guardado no Lovable.
 * Isso evita que qualquer terceiro consiga marcar pedidos como pagos.
 */
export const Route = createFileRoute('/api/public/itau-pix-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const proxySecret = process.env.PIX_PROXY_SECRET
        if (!proxySecret) {
          return Response.json({ error: 'proxy secret missing' }, { status: 500 })
        }
        if (request.headers.get('x-proxy-secret') !== proxySecret) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid json' }, { status: 400 })
        }

        const events = Array.isArray(body?.pix) ? body.pix : []
        if (!events.length) return Response.json({ ok: true, processed: 0 })

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        let processed = 0

        for (const ev of events) {
          try {
            const txid = ev?.txid
            const e2eid = ev?.endToEndId
            const valor = ev?.valor
            const horario = ev?.horario || new Date().toISOString()
            if (!txid) continue

            const { data: cob } = await supabaseAdmin
              .from('pix_cobrancas')
              .select('id, order_id, status')
              .eq('txid', txid)
              .maybeSingle()

            if (!cob) {
              console.warn('[pix-webhook] cobrança não encontrada', { txid })
              continue
            }
            if (cob.status === 'concluida') {
              processed += 1
              continue
            }

            await supabaseAdmin
              .from('pix_cobrancas')
              .update({
                status: 'concluida',
                pago_em: horario,
                e2eid,
                webhook_payload: ev,
              })
              .eq('id', cob.id)

            // Marca o pedido como pago
            if (cob.order_id) {
              await supabaseAdmin
                .from('orders')
                .update({ status: 'paid' })
                .eq('id', cob.order_id)

              // Registra pagamento no order_payments (idempotente por txid)
              const { data: existingPay } = await supabaseAdmin
                .from('order_payments')
                .select('id')
                .eq('order_id', cob.order_id)
                .eq('description', `Pix Itaú — txid ${txid}`)
                .maybeSingle()

              if (!existingPay) {
                await supabaseAdmin.from('order_payments').insert({
                  order_id: cob.order_id,
                  status: 'paid',
                  method: 'pix',
                  amount: Number(valor ?? 0) || 0,
                  description: `Pix Itaú — txid ${txid}`,
                  paid_at: horario,
                })
              }

              // Notifica admin por e-mail
              try {
                const adminEmail = process.env.AGENCIA_EMAIL_ASSINATURA
                if (adminEmail) {
                  const { sendTransactionalInternal } = await import(
                    '@/lib/email/send-internal.server'
                  )
                  const { data: order } = await supabaseAdmin
                    .from('orders')
                    .select('order_number, full_name, email, total_price')
                    .eq('id', cob.order_id)
                    .maybeSingle()

                  await sendTransactionalInternal({
                    templateName: 'pedido-pix-admin',
                    recipientEmail: adminEmail,
                    idempotencyKey: `pix-paid-${txid}`,
                    templateData: {
                      orderNumber: order?.order_number ?? '',
                      productKind: 'Pagamento confirmado',
                      productTitle: `Pix recebido — R$ ${Number(valor ?? 0).toFixed(2)}`,
                      totalPrice: `R$ ${Number(order?.total_price ?? valor ?? 0).toFixed(2)}`,
                      customerName: order?.full_name ?? '',
                      customerEmail: order?.email ?? '',
                      customerPhone: '',
                      notes: `E2E: ${e2eid ?? '-'} | txid: ${txid}`,
                    },
                  })
                }
              } catch (err) {
                console.error('[pix-webhook] notificação admin falhou', err)
              }
            }

            processed += 1
          } catch (err) {
            console.error('[pix-webhook] erro em evento', err)
          }
        }

        return Response.json({ ok: true, processed })
      },
    },
  },
})
