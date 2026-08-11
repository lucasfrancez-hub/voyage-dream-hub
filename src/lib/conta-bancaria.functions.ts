import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin, brtToIso, monthRange, normalize } from './conta-bancaria.helpers'
import type { ExtratoItem } from './conta-bancaria.helpers'

/** Saldo atual + entradas/saídas do mês corrente. */
export const obterResumoBancario = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any)
    const { getAsaasBalance, getAsaasStatement } = await import('@/lib/asaas.server')

    const { start, finish } = monthRange(0)
    const [balance, entradasSaidas] = await Promise.all([
      getAsaasBalance(),
      (async () => {
        let offset = 0
        let entradas = 0
        let saidas = 0
        for (let i = 0; i < 20; i++) {
          const page = await getAsaasStatement({
            startDate: start,
            finishDate: finish,
            offset,
            limit: 100,
          })
          const rows: any[] = page?.data ?? []
          for (const r of rows) {
            const v = Number(r?.value ?? 0)
            if (v >= 0) entradas += v
            else saidas += Math.abs(v)
          }
          if (!page?.hasMore || rows.length === 0) break
          offset += rows.length
        }
        return { entradas, saidas }
      })(),
    ])

    return {
      saldo: balance,
      entradasMes: entradasSaidas.entradas,
      saidasMes: entradasSaidas.saidas,
      periodo: { start, finish },
      atualizadoEm: new Date().toISOString(),
    }
  })

const extratoInput = z.object({
  startDate: z.string().optional(),
  finishDate: z.string().optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

/** Extrato paginado, com vínculo às movimentações internas quando possível. */
export const listarExtratoBancario = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => extratoInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { getAsaasStatement } = await import('@/lib/asaas.server')
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const fallback = monthRange(0)
    const startDate = data.startDate || fallback.start
    const finishDate = data.finishDate || fallback.finish
    const offset = data.offset ?? 0
    const limit = data.limit ?? 50

    const page = await getAsaasStatement({ startDate, finishDate, offset, limit })
    const items: ExtratoItem[] = (page?.data ?? []).map(normalize)

    const paymentIds = [...new Set(items.map((i) => i.paymentId).filter(Boolean))] as string[]
    const transferIds = [...new Set(items.map((i) => i.transferId).filter(Boolean))] as string[]

    const [cobrancas, transfers] = await Promise.all([
      paymentIds.length
        ? supabaseAdmin
            .from('pix_cobrancas')
            .select('asaas_payment_id, order_id')
            .in('asaas_payment_id', paymentIds)
        : Promise.resolve({ data: [] as any[] }),
      transferIds.length
        ? supabaseAdmin
            .from('asaas_transfers')
            .select('id, asaas_transfer_id, favored_name')
            .in('asaas_transfer_id', transferIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const byPayment = new Map<string, string>()
    for (const c of (cobrancas as any).data ?? []) {
      if (c.asaas_payment_id && c.order_id) byPayment.set(c.asaas_payment_id, c.order_id)
    }
    const byTransfer = new Map<string, any>()
    for (const t of (transfers as any).data ?? []) {
      if (t.asaas_transfer_id) byTransfer.set(t.asaas_transfer_id, t)
    }

    // Comprovantes ao vivo (ASAAS) para o mesmo período.
    const receipts = await (async () => {
      try {
        const { buildComprovanteIndex } = await import('@/lib/comprovantes.server')
        return await buildComprovanteIndex({ startDate, finishDate })
      } catch {
        return new Map<string, any>()
      }
    })()

    for (const it of items) {
      const comp =
        (it.transferId && receipts.get(it.transferId)) ||
        (it.paymentId && receipts.get(it.paymentId)) ||
        null
      it.receiptUrl = comp?.receiptUrl ?? null
      if (comp) {
        it.counterparty = comp.favored ?? null
        it.counterpartyLabel = comp.counterpartyLabel ?? null
        it.instituicao = comp.instituicao ?? null
        it.chavePix = comp.chavePix ?? null
        it.cpfCnpj = comp.cpfCnpj ?? null
        it.operacao = comp.operation ?? null
        it.formaPagamento = comp.formaPagamento ?? null
        it.dueDate = comp.dueDate ?? null
        it.paymentDate = comp.paymentDate ?? null
      }
      if (!it.counterpartyLabel) {
        it.counterpartyLabel = it.direction === 'in' ? 'Pagador' : 'Favorecido'
      }
      if (!it.counterparty && it.transferId && byTransfer.has(it.transferId)) {
        it.counterparty = byTransfer.get(it.transferId).favored_name ?? null
      }
      if (it.paymentId && byPayment.has(it.paymentId)) {
        it.link = { kind: 'pedido', id: byPayment.get(it.paymentId)!, label: 'Abrir pedido' }
      } else if (it.transferId && byTransfer.has(it.transferId)) {
        it.link = {
          kind: 'pagamento',
          id: byTransfer.get(it.transferId).id,
          label: 'Abrir pagamento',
        }
      }
    }

    // Data/hora real: o endpoint /financialTransactions só devolve `date`
    // (YYYY-MM-DD). O horário vem da transação Pix / transferência.
    for (const it of items) {
      const withTime = brtToIso(it.paymentDate) ?? brtToIso(it.date)
      if (withTime) {
        it.datetime = withTime
        it.datetimeSource = 'comprovante.paymentDate'
      }
    }

    const semHora = items.filter((i) => !i.datetime && i.pixTransactionId).slice(0, 40)
    if (semHora.length) {
      const { getAsaasPixTransaction } = await import('@/lib/asaas.server')
      await Promise.all(
        semHora.map(async (it) => {
          const px = await getAsaasPixTransaction(it.pixTransactionId!).catch(() => null)
          if (!px) return
          const iso = brtToIso(px.effectiveDate) ?? brtToIso(px.dateCreated)
          if (iso) {
            it.datetime = iso
            it.datetimeSource = px.effectiveDate
              ? 'pixTransaction.effectiveDate'
              : 'pixTransaction.dateCreated'
          }
        }),
      )
    }

    // Origem: só quando há evidência objetiva de vínculo interno.
    for (const it of items) {
      const interno =
        Boolean(it.link) ||
        (it.transferId && byTransfer.has(it.transferId)) ||
        (it.paymentId && byPayment.has(it.paymentId))
      const externo = Boolean(it.transferId || it.paymentId || it.pixTransactionId)
      it.origem = interno ? 'viaair' : externo ? 'asaas' : null
    }

    return {
      items,
      hasMore: Boolean(page?.hasMore),
      totalCount: Number(page?.totalCount ?? items.length),
      offset,
      limit,
    }
  })

