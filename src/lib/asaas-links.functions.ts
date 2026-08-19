import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin } from './boleto-pay.helpers'

export type AsaasLink = {
  id: string
  name: string
  description: string | null
  value: number | null
  billingType: string
  chargeType: string
  maxInstallmentCount: number | null
  url: string
  active: boolean
  deleted: boolean
  endDate: string | null
}

const mapa = (l: any): AsaasLink => ({
  id: String(l?.id ?? ''),
  name: String(l?.name ?? ''),
  description: l?.description ?? null,
  value: l?.value ?? null,
  billingType: String(l?.billingType ?? 'UNDEFINED'),
  chargeType: String(l?.chargeType ?? 'DETACHED'),
  maxInstallmentCount: l?.maxInstallmentCount ?? null,
  url: String(l?.url ?? ''),
  active: Boolean(l?.active),
  deleted: Boolean(l?.deleted),
  endDate: l?.endDate ?? null,
})

/** Cria um link de pagamento direto na API do ASAAS. */
export const criarLinkAsaas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        description: z.string().max(500).optional().nullable(),
        value: z.number().min(0).max(1_000_000).optional().nullable(),
        billingType: z.enum(['UNDEFINED', 'BOLETO', 'CREDIT_CARD', 'PIX']),
        chargeType: z.enum(['DETACHED', 'INSTALLMENT']),
        maxInstallmentCount: z.number().int().min(1).max(21).optional().nullable(),
        dueDateLimitDays: z.number().int().min(1).max(90).optional().nullable(),
        endDate: z.string().max(10).optional().nullable(),
        notificationEnabled: z.boolean().optional(),
        externalReference: z.string().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AsaasLink> => {
    await assertAdmin(context as any)
    const { createAsaasPaymentLink } = await import('./asaas.server')
    const link = await createAsaasPaymentLink({
      name: data.name,
      description: data.description ?? null,
      value: data.value ?? null,
      billingType: data.billingType,
      chargeType: data.chargeType,
      maxInstallmentCount: data.chargeType === 'INSTALLMENT' ? (data.maxInstallmentCount ?? 12) : null,
      dueDateLimitDays: data.dueDateLimitDays ?? null,
      endDate: data.endDate || null,
      notificationEnabled: data.notificationEnabled ?? true,
      externalReference: data.externalReference ?? null,
    })
    return mapa(link)
  })

/** Lista os links de pagamento já criados no ASAAS. */
export const listarLinksAsaas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AsaasLink[]> => {
    await assertAdmin(context as any)
    const { listAsaasPaymentLinks } = await import('./asaas.server')
    const lista = await listAsaasPaymentLinks(30)
    return lista.filter((l) => !l?.deleted).map(mapa)
  })

/** Exclui um link de pagamento no ASAAS. */
export const excluirLinkAsaas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(3).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { deleteAsaasPaymentLink } = await import('./asaas.server')
    await deleteAsaasPaymentLink(data.id)
    return { ok: true }
  })
