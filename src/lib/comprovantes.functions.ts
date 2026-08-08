import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin, monthRange } from './conta-bancaria.helpers'

const rangeInput = z.object({
  startDate: z.string().optional(),
  finishDate: z.string().optional(),
})

/** Lista os comprovantes disponíveis no período, direto da API do ASAAS. */
export const listarComprovantes = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { fetchComprovantes } = await import('@/lib/comprovantes.server')
    const fallback = monthRange(0)
    const items = await fetchComprovantes({
      startDate: data.startDate || fallback.start,
      finishDate: data.finishDate || fallback.finish,
    })
    return { items, atualizadoEm: new Date().toISOString() }
  })

const oneInput = z.object({
  paymentId: z.string().optional().nullable(),
  transferId: z.string().optional().nullable(),
  billId: z.string().optional().nullable(),
})

/** Consulta ao vivo o comprovante de uma movimentação específica. */
export const obterComprovante = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => oneInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const asaas = await import('@/lib/asaas.server')

    if (data.transferId) {
      const url = await asaas.getAsaasTransferReceiptUrl(data.transferId)
      if (url) return { url }
    }
    if (data.paymentId) {
      const url = await asaas.getAsaasPaymentReceiptUrl(data.paymentId)
      if (url) return { url }
    }
    if (data.billId) {
      const bill = await asaas.getAsaasBill(data.billId).catch(() => null)
      if (bill?.transactionReceiptUrl) return { url: String(bill.transactionReceiptUrl) }
    }
    return { url: null as string | null }
  })

/** Consulta o comprovante completo (dados do pagador/recebedor) de uma movimentação. */
export const obterComprovanteDetalhado = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => oneInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { fetchComprovanteById } = await import('@/lib/comprovantes.server')
    const item = await fetchComprovanteById(data)
    return { item }
  })


const pdfInput = z.object({ url: z.string().url() })

/**
 * Baixa o comprovante do ASAAS. Quando o link responde um PDF, devolve o
 * arquivo em base64 para download direto; caso contrário devolve `pdf: false`
 * para o cliente abrir a página do comprovante.
 */
export const baixarComprovantePdf = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pdfInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const candidates = [data.url, data.url.includes('?') ? `${data.url}&pdf=true` : `${data.url}?pdf=true`]
    for (const u of candidates) {
      try {
        const res = await fetch(u, { headers: { Accept: 'application/pdf' } })
        if (!res.ok) continue
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('pdf')) continue
        const buf = new Uint8Array(await res.arrayBuffer())
        let bin = ''
        for (const b of buf) bin += String.fromCharCode(b)
        return { pdf: true as const, base64: btoa(bin) }
      } catch {
        /* tenta o próximo */
      }
    }
    return { pdf: false as const, base64: null }
  })

/** Descobre o comprovante ASAAS vinculado a um lançamento financeiro. */
export const comprovanteDoLancamento = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabase } = context as any
    const [{ data: tr }, { data: bp }] = await Promise.all([
      supabase
        .from('asaas_transfers')
        .select('asaas_transfer_id')
        .eq('financial_entry_id', data.entryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('asaas_bill_payments')
        .select('asaas_bill_id')
        .eq('financial_entry_id', data.entryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    return {
      transferId: (tr as any)?.asaas_transfer_id ?? null,
      billId: (bp as any)?.asaas_bill_id ?? null,
    }
  })
