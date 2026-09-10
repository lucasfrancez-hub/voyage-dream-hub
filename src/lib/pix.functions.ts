import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Cria uma cobrança Pix imediata para o pedido informado.
 * Endpoint público — o checkout aceita clientes não autenticados.
 * A lógica fica em `@/lib/pix-cobranca.server`, compartilhada com o
 * checkout de voos (o QR é sempre da VIA AIR).
 */
export const criarPixCobranca = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        valorEsperado: z.number().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { criarPixParaPedido } = await import('@/lib/pix-cobranca.server')
    return criarPixParaPedido({ orderId: data.orderId, valorEsperado: data.valorEsperado })
  })

/**
 * Consulta o status de uma cobrança pelo txid.
 * Público — mas só retorna informação mínima (status + pago_em). Serve para
 * o cliente fazer polling na tela de sucesso.
 */
export const consultarPixCobranca = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        txid: z.string().min(20).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: row } = await supabaseAdmin
      .from('pix_cobrancas')
      .select('status, pago_em, expira_em, order_id')
      .eq('txid', data.txid)
      .maybeSingle()
    return {
      status: row?.status ?? 'nao_encontrada',
      pagoEm: row?.pago_em ?? null,
      expiraEm: row?.expira_em ?? null,
    }
  })
