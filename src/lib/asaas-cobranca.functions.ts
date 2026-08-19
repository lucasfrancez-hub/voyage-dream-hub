import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin } from './boleto-pay.helpers'

export type AsaasCobrancaResultado = {
  paymentId: string
  status: string
  value: number
  installmentCount: number | null
  invoiceUrl: string | null
  bankSlipUrl: string | null
  identificationField: string | null
  pixPayload: string | null
  pixEncodedImage: string | null
}

const schema = z.object({
  // cliente
  nome: z.string().min(2).max(120),
  cpfCnpj: z.string().min(11).max(20),
  email: z.string().email().max(160),
  telefone: z.string().max(20).optional().nullable(),
  cep: z.string().min(8).max(9),
  endereco: z.string().max(160).optional().nullable(),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(80).optional().nullable(),
  bairro: z.string().max(80).optional().nullable(),
  cidade: z.string().max(80).optional().nullable(),
  estado: z.string().max(2).optional().nullable(),
  // cobrança
  billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
  valor: z.number().min(1).max(1_000_000),
  vencimento: z.string().min(10).max(10),
  parcelas: z.number().int().min(1).max(21).optional().nullable(),
  descricao: z.string().max(500).optional().nullable(),
  referencia: z.string().max(80).optional().nullable(),
  // cartão (checkout transparente)
  cartaoTitular: z.string().max(120).optional().nullable(),
  cartaoNumero: z.string().max(25).optional().nullable(),
  cartaoMes: z.string().max(2).optional().nullable(),
  cartaoAno: z.string().max(4).optional().nullable(),
  cartaoCvv: z.string().max(4).optional().nullable(),
})

/** Envia a cobrança digitada no nosso formulário direto para a API do ASAAS. */
export const criarCobrancaAsaas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }): Promise<AsaasCobrancaResultado> => {
    await assertAdmin(context as any)
    const { ensureAsaasCustomer, createAsaasDirectCharge } = await import('./asaas.server')

    const remoteIp =
      getRequestHeader('cf-connecting-ip') ||
      getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ||
      null

    const customerId = await ensureAsaasCustomer({
      name: data.nome,
      cpfCnpj: data.cpfCnpj,
      email: data.email,
      phone: data.telefone ?? null,
      postalCode: data.cep,
      address: data.endereco ?? null,
      addressNumber: data.numero,
      complement: data.complemento ?? null,
      province: data.bairro ?? null,
      city: data.cidade ?? null,
      state: data.estado ?? null,
      externalReference: data.referencia ?? null,
    })

    if (data.billingType === 'CREDIT_CARD') {
      const faltando =
        !data.cartaoTitular || !data.cartaoNumero || !data.cartaoMes || !data.cartaoAno || !data.cartaoCvv
      if (faltando) throw new Error('Preencha todos os dados do cartão.')
    }

    return await createAsaasDirectCharge({
      customerId,
      billingType: data.billingType,
      value: data.valor,
      dueDate: data.vencimento,
      description: data.descricao ?? null,
      externalReference: data.referencia ?? null,
      installmentCount: data.billingType === 'PIX' ? null : (data.parcelas ?? null),
      card:
        data.billingType === 'CREDIT_CARD'
          ? {
              holderName: String(data.cartaoTitular),
              number: String(data.cartaoNumero),
              expiryMonth: String(data.cartaoMes),
              expiryYear: String(data.cartaoAno),
              ccv: String(data.cartaoCvv),
            }
          : null,
      holder:
        data.billingType === 'CREDIT_CARD'
          ? {
              name: data.nome,
              email: data.email,
              cpfCnpj: data.cpfCnpj,
              postalCode: data.cep,
              addressNumber: data.numero,
              addressComplement: data.complemento ?? null,
              phone: data.telefone ?? null,
            }
          : null,
      remoteIp,
    })
  })
