import { createFileRoute } from '@tanstack/react-router'

/**
 * Webhook público do ASAAS para TRANSFERÊNCIAS (saques Pix).
 *
 * Autenticação: header `asaas-access-token` (ou `x-asaas-access-token`)
 * precisa bater com ASAAS_TRANSFER_WEBHOOK_TOKEN (fallback: ASAAS_WEBHOOK_TOKEN).
 *
 * Eventos: TRANSFER_CREATED / TRANSFER_PENDING / TRANSFER_IN_BANK_ACCOUNT /
 * TRANSFER_BLOCKED / TRANSFER_DONE / TRANSFER_FAILED / TRANSFER_CANCELLED.
 *
 * A resposta inclui `{ authorized: true }` para o fluxo de autorização de
 * transferência via webhook (substitui o token 2FA no painel).
 */
export const Route = createFileRoute('/api/public/asaas-transfer-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token =
          process.env['ASAAS_TRANSFER_WEBHOOK_TOKEN'] || process.env['ASAAS_WEBHOOK_TOKEN']
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
        const transfer = body?.transfer ?? body?.payment ?? null

        console.log('[asaas-transfer-webhook]', {
          event,
          id: transfer?.id,
          value: transfer?.value,
          status: transfer?.status,
          pixKey: transfer?.bankAccount?.pixAddressKey,
          failReason: transfer?.failReason,
        })

        return Response.json({ ok: true, authorized: true, event })
      },

      GET: async () => Response.json({ ok: true, service: 'asaas-transfer-webhook' }),
    },
  },
})
