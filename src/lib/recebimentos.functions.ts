import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/**
 * Recebimentos avulsos (cobranças Pix e boletos criados manualmente pelo admin).
 * Toda a comunicação com o ASAAS acontece no backend.
 */

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error) throw new Error(`Falha ao validar permissão: ${error.message}`)
  if (!isAdmin) throw new Error('Acesso restrito a administradores.')
}

export const listarRecebimentos = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: rows, error } = await supabaseAdmin
      .from('asaas_recebimentos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(data.limit ?? 200)
    if (error) throw new Error(`Falha ao listar recebimentos: ${error.message}`)
    return rows ?? []
  })

const criarInput = z.object({
  kind: z.enum(['pix', 'boleto']),
  customerName: z.string().min(2),
  cpfCnpj: z.string().min(11),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  value: z.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional().or(z.literal('')),
})

export const criarRecebimento = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => criarInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { ensureAsaasCustomer, createAsaasCharge } = await import('@/lib/asaas.server')

    const customerId = await ensureAsaasCustomer({
      name: data.customerName,
      cpfCnpj: data.cpfCnpj.replace(/\D/g, ''),
      email: data.email || undefined,
      phone: data.phone || undefined,
    } as any)

    const charge = await createAsaasCharge({
      customerId,
      billingType: data.kind === 'pix' ? 'PIX' : 'BOLETO',
      value: data.value,
      dueDate: data.dueDate,
      description: data.description || null,
    })

    const { data: nome } = await context.supabase
      .from('profiles')
      .select('full_name')
      .eq('id', context.userId)
      .maybeSingle()

    const { data: row, error } = await supabaseAdmin
      .from('asaas_recebimentos')
      .insert({
        kind: data.kind,
        status: 'pendente',
        customer_name: data.customerName,
        customer_cpf_cnpj: data.cpfCnpj.replace(/\D/g, ''),
        customer_email: data.email || null,
        customer_phone: data.phone || null,
        value: data.value,
        due_date: data.dueDate,
        description: data.description || null,
        asaas_payment_id: charge.paymentId,
        asaas_customer_id: customerId,
        invoice_url: charge.invoiceUrl,
        bank_slip_url: charge.bankSlipUrl,
        identification_field: charge.identificationField,
        pix_payload: charge.pixPayload,
        pix_qr_image: charge.pixEncodedImage
          ? `data:image/png;base64,${charge.pixEncodedImage}`
          : null,
        created_by: context.userId,
        created_by_name: (nome as any)?.full_name ?? null,
        raw_response: charge.raw as any,
      })
      .select('*')
      .single()
    if (error) throw new Error(`Falha ao salvar recebimento: ${error.message}`)
    return row
  })

export const sincronizarRecebimento = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { getAsaasPayment } = await import('@/lib/asaas.server')

    const { data: row } = await supabaseAdmin
      .from('asaas_recebimentos')
      .select('id, asaas_payment_id')
      .eq('id', data.id)
      .maybeSingle()
    if (!row?.asaas_payment_id) throw new Error('Recebimento sem cobrança no ASAAS.')

    const pay = await getAsaasPayment(row.asaas_payment_id)
    const st = String(pay?.status || '').toUpperCase()
    const status =
      st === 'RECEIVED' || st === 'CONFIRMED' || st === 'RECEIVED_IN_CASH'
        ? 'recebido'
        : st === 'REFUNDED'
          ? 'estornado'
          : st === 'OVERDUE'
            ? 'vencido'
            : st === 'DELETED'
              ? 'cancelado'
              : 'pendente'

    await supabaseAdmin
      .from('asaas_recebimentos')
      .update({
        status,
        paid_at: pay?.paymentDate ? new Date(pay.paymentDate).toISOString() : null,
        raw_response: pay as any,
      })
      .eq('id', row.id)
    return { status }
  })

export const cancelarRecebimento = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { deleteAsaasPayment } = await import('@/lib/asaas.server')

    const { data: row } = await supabaseAdmin
      .from('asaas_recebimentos')
      .select('id, asaas_payment_id, status')
      .eq('id', data.id)
      .maybeSingle()
    if (!row) throw new Error('Recebimento não encontrado.')
    if (row.status === 'recebido') throw new Error('Cobrança já recebida.')
    if (row.asaas_payment_id) await deleteAsaasPayment(row.asaas_payment_id)
    await supabaseAdmin
      .from('asaas_recebimentos')
      .update({ status: 'cancelado' })
      .eq('id', row.id)
    return { ok: true }
  })
