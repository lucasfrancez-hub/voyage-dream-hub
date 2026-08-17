import { createFileRoute } from '@tanstack/react-router'

/**
 * Webhook público do ASAAS (Pix).
 * Autenticação: header `asaas-access-token` deve bater com ASAAS_WEBHOOK_TOKEN.
 * Eventos tratados: PAYMENT_RECEIVED / PAYMENT_CONFIRMED (baixa) e
 * PAYMENT_OVERDUE / PAYMENT_DELETED / PAYMENT_REFUNDED (cancelamento).
 */
export const Route = createFileRoute('/api/public/asaas-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env['ASAAS_WEBHOOK_TOKEN']
        if (!token) return Response.json({ error: 'token missing' }, { status: 500 })

        const sent =
          request.headers.get('asaas-access-token') ||
          request.headers.get('x-asaas-access-token') ||
          ''
        if (sent !== token) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid json' }, { status: 400 })
        }

        const event: string = body?.event || ''

        // ----- Ciclo de vida das transferências Pix (TRANSFER_*) -----
        // Apenas observabilidade/sincronização: nunca cria ou redispara Pix.
        // A autorização continua exclusiva do asaas-transfer-webhook.ts.
        const { isTransferEvent } = await import('@/lib/asaas-transfer-events')
        if (isTransferEvent(event) || body?.transfer?.id) {
          try {
            const ip =
              request.headers.get('cf-connecting-ip') ||
              (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
              null
            const { registrarEventoTransferencia } = await import('@/lib/asaas-transfer.server')
            const res = await registrarEventoTransferencia(body, ip)
            return Response.json({ ok: true, event, transfer: res })
          } catch (e) {
            console.error('[asaas-webhook] transfer error', (e as Error).message)
            return Response.json({ ok: true, error: 'transfer handling failed' })
          }
        }


        // ----- Pague Contas (boletos) -----
        const bill = body?.bill
        if (event.startsWith('BILL_') || bill?.id) {
          try {
            const { supabaseAdmin: adm } = await import('@/integrations/supabase/client.server')
            const { data: bp } = await adm
              .from('asaas_bill_payments')
              .select('id')
              .eq('asaas_bill_id', bill?.id ?? '')
              .maybeSingle()
            if (!bp) return Response.json({ ok: true, skipped: 'bill not found' })
            const { aplicarStatusBoleto } = await import('@/lib/boleto-pay.server')
            await aplicarStatusBoleto(bp.id, bill)
            return Response.json({ ok: true, event })
          } catch (e) {
            console.error('[asaas-webhook] bill error', (e as Error).message)
            return Response.json({ ok: true, error: 'bill handling failed' })
          }
        }

        const payment = body?.payment
        const paymentId: string | undefined = payment?.id
        if (!paymentId) return Response.json({ ok: true, skipped: 'no payment id' })

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        let { data: cob } = await supabaseAdmin
          .from('pix_cobrancas')
          .select('id, order_id, status, valor')
          .eq('asaas_payment_id', paymentId)
          .maybeSingle()

        // fallback: externalReference guarda o txid gerado por nós
        if (!cob && payment?.externalReference) {
          const alt = await supabaseAdmin
            .from('pix_cobrancas')
            .select('id, order_id, status, valor')
            .eq('txid', payment.externalReference)
            .maybeSingle()
          cob = alt.data ?? null
        }

        // Recebimentos avulsos (Pix/boleto gerados no admin)
        {
          const { data: rec } = await supabaseAdmin
            .from('asaas_recebimentos')
            .select('id, status')
            .eq('asaas_payment_id', paymentId)
            .maybeSingle()
          if (rec) {
            const map: Record<string, string> = {
              PAYMENT_RECEIVED: 'recebido',
              PAYMENT_CONFIRMED: 'recebido',
              PAYMENT_OVERDUE: 'vencido',
              PAYMENT_DELETED: 'cancelado',
              PAYMENT_REFUNDED: 'estornado',
            }
            const novo = map[event]
            if (novo) {
              await supabaseAdmin
                .from('asaas_recebimentos')
                .update({
                  status: novo,
                  paid_at:
                    novo === 'recebido'
                      ? payment?.paymentDate
                        ? new Date(payment.paymentDate).toISOString()
                        : new Date().toISOString()
                      : null,
                  webhook_payload: body,
                })
                .eq('id', rec.id)
            }
            return Response.json({ ok: true, event, recebimento: true })
          }
        }

        if (!cob) {
          console.warn('[asaas-webhook] cobrança não encontrada', { paymentId, event })
          return Response.json({ ok: true, skipped: 'not found' })
        }

        const cancelEvents = [
          'PAYMENT_OVERDUE',
          'PAYMENT_DELETED',
          'PAYMENT_REFUNDED',
          'PAYMENT_CHARGEBACK_REQUESTED',
        ]
        const paidEvents = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']

        if (cancelEvents.includes(event)) {
          if (cob.status !== 'concluida') {
            await supabaseAdmin
              .from('pix_cobrancas')
              .update({
                status: event === 'PAYMENT_REFUNDED' ? 'estornada' : 'cancelada',
                webhook_payload: body,
              })
              .eq('id', cob.id)
          }
          {
            const { reportOrderPaymentToFraud } = await import(
              '@/lib/whatsapp/fraud/payment-link.server'
            )
            await reportOrderPaymentToFraud({
              order_id: cob.order_id,
              meta: {
                payment_status: event === 'PAYMENT_REFUNDED' ? 'estornado' : 'falhou',
                payment_attempt_count: 1,
                gateway_risk_result:
                  event === 'PAYMENT_CHARGEBACK_REQUESTED' ? 'fraud' : 'review',

              },
              label:
                event === 'PAYMENT_REFUNDED'
                  ? 'Pagamento estornado no gateway'
                  : 'Cobrança cancelada/vencida no gateway',
            })
          }
          return Response.json({ ok: true, event })
        }


        if (!paidEvents.includes(event)) {
          return Response.json({ ok: true, ignored: event })
        }

        if (cob.status === 'concluida') {
          return Response.json({ ok: true, duplicate: true })
        }

        const horario =
          payment?.paymentDate || payment?.confirmedDate || new Date().toISOString()
        const valor = Number(payment?.value ?? cob.valor ?? 0)

        await supabaseAdmin
          .from('pix_cobrancas')
          .update({
            status: 'concluida',
            pago_em: new Date(horario).toISOString(),
            asaas_payment_id: paymentId,
            e2eid: payment?.pixTransaction?.endToEndIdentifier ?? null,
            webhook_payload: body,
          })
          .eq('id', cob.id)

        if (cob.order_id) {
          await supabaseAdmin
            .from('orders')
            .update({ status: 'paid', pix_baixa_tipo: 'asaas' })
            .eq('id', cob.order_id)

          const description = `Pix ASAAS — ${paymentId}`
          const { data: existingPay } = await supabaseAdmin
            .from('order_payments')
            .select('id')
            .eq('order_id', cob.order_id)
            .eq('description', description)
            .maybeSingle()

          if (!existingPay) {
            await supabaseAdmin.from('order_payments').insert({
              order_id: cob.order_id,
              status: 'paid',
              method: 'pix',
              amount: valor,
              description,
              paid_at: new Date(horario).toISOString(),
            })
          }

          try {
            const adminEmail = process.env['AGENCIA_EMAIL_ASSINATURA']
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
                idempotencyKey: `pix-paid-${paymentId}`,
                templateData: {
                  orderNumber: order?.order_number ?? '',
                  productKind: 'Pagamento confirmado',
                  productTitle: `Pix recebido — R$ ${valor.toFixed(2)}`,
                  totalPrice: `R$ ${Number(order?.total_price ?? valor).toFixed(2)}`,
                  customerName: order?.full_name ?? '',
                  customerEmail: order?.email ?? '',
                  customerPhone: '',
                  notes: `ASAAS payment: ${paymentId} | evento: ${event}`,
                },
              })
            }
          } catch (err) {
            console.error('[asaas-webhook] notificação admin falhou', err)
          }
        }

        try {
          const { sendUazAlert } = await import('@/lib/broadcast/sync.server')
          const { data: ord } = cob.order_id
            ? await supabaseAdmin
                .from('orders')
                .select('order_number, full_name')
                .eq('id', cob.order_id)
                .maybeSingle()
            : { data: null as any }
          const linhas = [
            '\u2705 *Pix recebido*',
            `Valor: R$ ${valor.toFixed(2)}`,
            ord?.order_number ? `Pedido: ${ord.order_number}` : null,
            ord?.full_name ? `Cliente: ${ord.full_name}` : null,
            `Quando: ${new Date(horario).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            `ASAAS: ${paymentId}`,
          ].filter(Boolean)
          await sendUazAlert(linhas.join('\n'))
        } catch (err) {
          console.error('[asaas-webhook] alerta WhatsApp falhou', err)
        }

        {
          const { reportOrderPaymentToFraud } = await import(
            '@/lib/whatsapp/fraud/payment-link.server'
          )
          await reportOrderPaymentToFraud({
            order_id: cob.order_id,
            meta: {
              payment_status: 'paid',
              gateway_risk_result: 'approved',
              payment_attempt_count: 1,
            },
            label: 'Pagamento Pix confirmado no gateway',
          })
        }

        return Response.json({ ok: true, event, paid: true })

      },
    },
  },
})
