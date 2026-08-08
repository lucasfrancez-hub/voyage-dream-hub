import { createFileRoute } from '@tanstack/react-router'

/**
 * Webhook público do ASAAS para TRANSFERÊNCIAS (saques Pix).
 *
 * Faz duas coisas:
 *  1. Validação de saque via webhook (substitui o token 2FA do app):
 *     só responde `APPROVED` quando existe um pagamento correspondente
 *     criado dentro do sistema, ainda não autorizado e com o mesmo valor.
 *  2. Sincronização de status pelos eventos TRANSFER_*.
 *
 * Autenticação: header `asaas-access-token` (ou `x-asaas-access-token`)
 * precisa bater com ASAAS_TRANSFER_WEBHOOK_TOKEN (fallback: ASAAS_WEBHOOK_TOKEN).
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

        const ip =
          request.headers.get('cf-connecting-ip') ||
          (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
          null

        const event: string = body?.event || ''
        const transfer = body?.transfer ?? body?.payment ?? body ?? null
        const asaasId: string | null = transfer?.id ?? null
        const externalRef: string | null = transfer?.externalReference ?? null
        const value = Number(transfer?.value ?? 0)

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        // Localiza o pagamento correspondente criado dentro do sistema.
        let row: any = null
        if (externalRef && /^[0-9a-f-]{36}$/i.test(externalRef)) {
          const { data } = await supabaseAdmin
            .from('asaas_transfers')
            .select('*')
            .eq('id', externalRef)
            .maybeSingle()
          row = data
        }
        if (!row && asaasId) {
          const { data } = await supabaseAdmin
            .from('asaas_transfers')
            .select('*')
            .eq('asaas_transfer_id', asaasId)
            .maybeSingle()
          row = data
        }

        console.log('[asaas-transfer-webhook]', {
          event,
          id: asaasId,
          value,
          status: transfer?.status,
          matched: row?.id ?? null,
        })

        // ---- 1) Sincronização de status (eventos TRANSFER_*) ----
        if (event.startsWith('TRANSFER_')) {
          const { statusFromEvent, applyTransferStatus } = await import(
            '@/lib/asaas-transfer.server'
          )
          const status = statusFromEvent(event)
          if (row && status) {
            if (!row.asaas_transfer_id && asaasId) {
              await supabaseAdmin
                .from('asaas_transfers')
                .update({ asaas_transfer_id: asaasId })
                .eq('id', row.id)
            }
            await applyTransferStatus({
              transferId: row.id,
              status,
              raw: transfer,
              event,
              ip,
            })
          } else {
            await supabaseAdmin.from('asaas_transfer_events').insert({
              asaas_transfer_id: asaasId,
              event,
              status: transfer?.status ?? null,
              message: row ? 'evento sem status mapeado' : 'transferência não encontrada no sistema',
              ip,
              payload: body,
            })
          }
          return Response.json({ received: true })
        }

        // ---- 2) Autorização de saque ----
        // Nunca autorizar só porque chegou um webhook: exige pagamento
        // legítimo criado no sistema, com valor igual e ainda não autorizado.
        const valueOk = row ? Math.abs(Number(row.value) - value) < 0.01 || value === 0 : false
        const statusOk = row
          ? ['pendente', 'agendado', 'processando'].includes(String(row.status))
          : false
        const approved = Boolean(row) && valueOk && statusOk

        if (row) {
          await supabaseAdmin
            .from('asaas_transfers')
            .update(
              approved
                ? { authorized: true, authorized_at: new Date().toISOString() }
                : { fail_reason: 'Autorização de saque negada pelo sistema' },
            )
            .eq('id', row.id)
        }

        await supabaseAdmin.from('asaas_transfer_events').insert({
          transfer_id: row?.id ?? null,
          asaas_transfer_id: asaasId,
          event: 'WITHDRAW_AUTHORIZATION',
          status: row?.status ?? null,
          decision: approved ? 'APPROVED' : 'REFUSED',
          message: approved
            ? 'Saque autorizado — pagamento correspondente encontrado.'
            : !row
              ? 'Recusado: nenhum pagamento correspondente criado no sistema.'
              : !valueOk
                ? 'Recusado: valor divergente.'
                : 'Recusado: status do pagamento não permite autorização.',
          ip,
          payload: body,
        })

        return Response.json({ status: approved ? 'APPROVED' : 'REFUSED' })
      },

      GET: async () => Response.json({ ok: true, service: 'asaas-transfer-webhook' }),
    },
  },
})
