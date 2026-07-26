import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Cria uma cobrança Pix imediata para o pedido informado.
 * Endpoint público — o checkout aceita clientes não autenticados. Faz as
 * seguintes validações antes de gerar a cobrança:
 *  - o pedido existe
 *  - método de pagamento é Pix
 *  - valor bate com `total_price`
 *  - se já existe cobrança ativa/não expirada, retorna a mesma
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
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, total_price, payment_method, full_name, cpf, email, status')
      .eq('id', data.orderId)
      .maybeSingle()

    if (orderErr) throw new Error(`Falha ao buscar pedido: ${orderErr.message}`)
    if (!order) throw new Error('Pedido não encontrado.')
    if (!String(order.payment_method || '').startsWith('pix')) {
      throw new Error('Este pedido não é Pix.')
    }
    const total = Number(order.total_price ?? 0)
    if (Math.abs(total - data.valorEsperado) > 0.01) {
      throw new Error('Valor divergente do pedido.')
    }

    // Reaproveita cobrança ativa se existir
    const nowIso = new Date().toISOString()
    const { data: existing } = await supabaseAdmin
      .from('pix_cobrancas')
      .select('txid, qr_code, expira_em, status, valor')
      .eq('order_id', order.id)
      .eq('status', 'ativa')
      .gt('expira_em', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return {
        txid: existing.txid,
        qrCode: existing.qr_code,
        expiraEm: existing.expira_em,
        valor: Number(existing.valor),
        reused: true,
      }
    }

    const { createPixCobranca: sendToProxy, makeTxid } = await import('@/lib/pix.server')

    const txid = makeTxid(order.order_number || order.id.replace(/-/g, '').slice(0, 20))
    const expiracaoSeg = 1800 // 30 min

    const cobranca = await sendToProxy({
      txid,
      valor: total,
      expiracao_seg: expiracaoSeg,
      devedor: order.cpf && order.full_name
        ? { cpf: String(order.cpf).replace(/\D/g, ''), nome: order.full_name }
        : undefined,
      solicitacao: `Pedido VIA AIR #${order.order_number ?? ''}`.trim(),
    })

    const expiraEm = new Date(Date.now() + expiracaoSeg * 1000).toISOString()

    const { error: insertErr } = await supabaseAdmin.from('pix_cobrancas').insert({
      txid: cobranca.txid || txid,
      order_id: order.id,
      valor: total,
      qr_code: cobranca.pixCopiaECola,
      status: 'ativa',
      expira_em: expiraEm,
      payer_name: order.full_name,
      payer_document: order.cpf,
      raw_response: cobranca.raw ?? null,
    })
    if (insertErr) throw new Error(`Falha ao salvar cobrança: ${insertErr.message}`)

    // Dispara e-mail com o QR pro cliente (best-effort)
    if (order.email) {
      try {
        const { sendTransactionalInternal } = await import('@/lib/email/send-internal.server')
        await sendTransactionalInternal({
          templateName: 'pix-qr-cliente',
          recipientEmail: order.email,
          idempotencyKey: `pix-qr-${cobranca.txid || txid}`,
          templateData: {
            recipientName: order.full_name || 'Cliente',
            orderNumber: order.order_number || '',
            valor: total,
            qrCode: cobranca.pixCopiaECola,
            expiraEmMin: Math.round(expiracaoSeg / 60),
          },
        })
      } catch (err) {
        console.error('[criarPixCobranca] envio de e-mail falhou', err)
      }
    }

    return {
      txid: cobranca.txid || txid,
      qrCode: cobranca.pixCopiaECola,
      expiraEm,
      valor: total,
      reused: false,
    }
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
