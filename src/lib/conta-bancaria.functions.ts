import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error) throw new Error(`Falha ao validar permissão: ${error.message}`)
  if (!isAdmin) throw new Error('Acesso restrito a administradores.')
}

export interface ExtratoItem {
  id: string
  date: string | null
  createdAt: string | null
  description: string | null
  type: string | null
  direction: 'in' | 'out'
  value: number
  balance: number | null
  reference: string | null
  paymentId: string | null
  transferId: string | null
  link: { kind: 'pedido' | 'pagamento'; id: string; label: string } | null
}

function brtToday() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date()) // yyyy-mm-dd
}

function monthRange(offset = 0) {
  const today = brtToday()
  const [y, m] = today.split('-').map(Number)
  const d = new Date(Date.UTC(y!, (m! - 1) + offset, 1))
  const yy = d.getUTCFullYear()
  const mm = d.getUTCMonth()
  const start = new Date(Date.UTC(yy, mm, 1))
  const end = new Date(Date.UTC(yy, mm + 1, 0))
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return { start: iso(start), finish: iso(end) }
}

function normalize(tx: any): ExtratoItem {
  const value = Number(tx?.value ?? 0)
  return {
    id: String(tx?.id ?? crypto.randomUUID()),
    date: tx?.date ?? null,
    createdAt: tx?.dateCreated ?? tx?.date ?? null,
    description: tx?.description ?? null,
    type: tx?.type ?? null,
    direction: value < 0 ? 'out' : 'in',
    value,
    balance: tx?.balance != null ? Number(tx.balance) : null,
    reference:
      tx?.paymentId ?? tx?.transferId ?? tx?.externalReference ?? tx?.id ?? null,
    paymentId: tx?.paymentId ?? tx?.payment?.id ?? null,
    transferId: tx?.transferId ?? tx?.transfer?.id ?? null,
    link: null,
  }
}

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

    for (const it of items) {
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

    return {
      items,
      hasMore: Boolean(page?.hasMore),
      totalCount: Number(page?.totalCount ?? items.length),
      offset,
      limit,
    }
  })

export const rangeUtils = { monthRange, brtToday }
