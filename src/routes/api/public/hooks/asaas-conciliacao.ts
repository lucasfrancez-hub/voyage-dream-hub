import { createFileRoute } from '@tanstack/react-router'

/**
 * Conciliação diária das cobranças de cartão com o ASAAS.
 * Não depende de webhook: consulta a cobrança e o extrato financeiro.
 * Autenticação: header `x-cron-token` = CRON_SECRET (ou ASAAS_WEBHOOK_TOKEN).
 */
export const Route = createFileRoute('/api/public/hooks/asaas-conciliacao')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado = process.env['CRON_SECRET'] || process.env['ASAAS_WEBHOOK_TOKEN']
        if (!esperado) return Response.json({ error: 'token missing' }, { status: 500 })
        const enviado = request.headers.get('x-cron-token') || request.headers.get('asaas-access-token') || ''
        if (enviado !== esperado) return Response.json({ error: 'unauthorized' }, { status: 401 })

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { consultarCobranca, extratoFinanceiro, consultarAntecipacao } = await import(
          '@/lib/asaas-card.server'
        )
        const { aplicarPagamento } = await import('@/lib/asaas-card.store.server')

        const desde = new Date(Date.now() - 60 * 24 * 3600_000).toISOString()
        const { data: cobrancas } = await supabaseAdmin
          .from('asaas_card_charges')
          .select('id, asaas_payment_id, asaas_status')
          .gte('created_at', desde)
          .not('asaas_payment_id', 'is', null)
          .limit(200)

        let atualizadas = 0
        for (const c of cobrancas ?? []) {
          const payment = await consultarCobranca(String(c.asaas_payment_id)).catch(() => null)
          if (!payment) continue
          if (String(payment.status) !== String(c.asaas_status ?? '')) {
            await aplicarPagamento(c.id, payment)
            atualizadas++
          }
        }

        const { data: antecipacoes } = await supabaseAdmin
          .from('asaas_anticipations')
          .select('id, asaas_anticipation_id, status')
          .not('asaas_anticipation_id', 'is', null)
          .neq('status', 'CREDITED')
          .limit(100)

        let antAtualizadas = 0
        for (const a of antecipacoes ?? []) {
          const ant = await consultarAntecipacao(String(a.asaas_anticipation_id)).catch(() => null)
          if (!ant?.status || String(ant.status) === String(a.status)) continue
          await supabaseAdmin
            .from('asaas_anticipations')
            .update({
              status: String(ant.status),
              credit_date: ant.creditDate ? String(ant.creditDate).slice(0, 10) : null,
              scheduled_date: ant.scheduledDate ? String(ant.scheduledDate).slice(0, 10) : null,
              valor_bruto: ant.value != null ? Number(ant.value) : null,
              taxa: ant.fee != null ? Number(ant.fee) : null,
              valor_liquido: ant.netValue != null ? Number(ant.netValue) : null,
              denial_reason: ant.denialReason ?? null,
            })
            .eq('id', a.id)
          antAtualizadas++
        }

        const hoje = new Date().toISOString().slice(0, 10)
        const inicio = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10)
        const extrato = await extratoFinanceiro({ startDate: inicio, finishDate: hoje }).catch(() => [])

        return Response.json({
          ok: true,
          cobrancasConferidas: cobrancas?.length ?? 0,
          cobrancasAtualizadas: atualizadas,
          antecipacoesAtualizadas: antAtualizadas,
          movimentosExtrato: extrato.length,
        })
      },
    },
  },
})
