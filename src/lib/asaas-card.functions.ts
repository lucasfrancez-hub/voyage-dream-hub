import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin } from './boleto-pay.helpers'

export type CobrancaCartao = {
  id: string
  created_at: string
  updated_at: string
  order_id: string | null
  venda_ref: string | null
  atendente_nome: string | null
  descricao: string | null
  cliente_nome: string | null
  cliente_documento: string | null
  cliente_email: string | null
  cliente_telefone: string | null
  valor: number
  parcelas: number
  valor_parcela: number | null
  status: string
  asaas_status: string | null
  asaas_payment_id: string | null
  asaas_customer_id: string | null
  asaas_installment_id: string | null
  external_reference: string | null
  date_created: string | null
  confirmed_date: string | null
  payment_date: string | null
  credit_date: string | null
  valor_bruto: number | null
  valor_liquido: number | null
  taxas: number | null
  card_brand: string | null
  card_last4: string | null
  card_holder_name: string | null
  card_token: string | null
  authorization_code: string | null
  nsu: string | null
  tid: string | null
  acquirer_transaction_id: string | null
  anticipation_status: string | null
  chargeback_status: string | null
  erro_codigo: string | null
  erro_mensagem: string | null
}

export type EventoCobranca = {
  id: string
  event_type: string
  received_at: string
  status_anterior: string | null
  status_novo: string | null
  resultado: string | null
}

export type Antecipacao = {
  id: string
  asaas_anticipation_id: string | null
  status: string
  requested_at: string | null
  scheduled_date: string | null
  credit_date: string | null
  valor_bruto: number | null
  taxa: number | null
  valor_liquido: number | null
  parcelas_antecipadas: number | null
  denial_reason: string | null
}

const ipDaRequisicao = () =>
  getRequestHeader('cf-connecting-ip') ||
  getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ||
  getRequestHeader('x-real-ip') ||
  null

const cobrarSchema = z.object({
  orderId: z.string().uuid().optional().nullable(),
  vendaRef: z.string().max(80).optional().nullable(),
  descricao: z.string().max(500).optional().nullable(),
  clienteNome: z.string().min(2).max(120),
  clienteDocumento: z.string().min(11).max(20),
  clienteEmail: z.string().email().max(160),
  clienteTelefone: z.string().max(20).optional().nullable(),
  cep: z.string().min(8).max(9),
  endereco: z.string().max(160).optional().nullable(),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(80).optional().nullable(),
  bairro: z.string().max(80).optional().nullable(),
  cidade: z.string().max(80).optional().nullable(),
  estado: z.string().max(2).optional().nullable(),
  titularNome: z.string().min(2).max(120),
  titularDocumento: z.string().min(11).max(20),
  valor: z.number().min(1).max(1_000_000),
  parcelas: z.number().int().min(1).max(21),
  vencimento: z.string().length(10),
  cartaoNumero: z.string().min(13).max(25),
  cartaoMes: z.string().min(1).max(2),
  cartaoAno: z.string().min(2).max(4),
  cartaoCvv: z.string().min(3).max(4),
})

/** Envia a cobrança de cartão ao ASAAS e registra tudo internamente. */
export const cobrarCartao = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cobrarSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ chargeId: string; charge: CobrancaCartao }> => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { cobrarNoCartao, detectarBandeira } = await import('./asaas-card.server')
    const { aplicarPagamento, sanitizarPayload } = await import('./asaas-card.store.server')

    const digitos = (v?: string | null) => (v ? v.replace(/\D/g, '') : '')
    const valorParcela = Number((data.valor / data.parcelas).toFixed(2))
    const externalReference =
      data.vendaRef?.trim() || `CARD-${Date.now().toString(36).toUpperCase()}`
    const atendente = (context as any).claims?.email ?? null

    // 1) Registro interno ANTES de chamar o ASAAS (auditoria mesmo em timeout).
    const { data: criado, error: erroInsert } = await supabaseAdmin
      .from('asaas_card_charges')
      .insert({
        order_id: data.orderId ?? null,
        venda_ref: data.vendaRef ?? null,
        atendente_id: context.userId,
        atendente_nome: atendente,
        descricao: data.descricao ?? null,
        cliente_nome: data.clienteNome,
        cliente_documento: digitos(data.clienteDocumento),
        cliente_email: data.clienteEmail,
        cliente_telefone: digitos(data.clienteTelefone),
        valor: data.valor,
        parcelas: data.parcelas,
        valor_parcela: valorParcela,
        external_reference: externalReference,
        status: 'indefinido',
        card_holder_name: data.titularNome,
        card_brand: detectarBandeira(data.cartaoNumero),
        card_last4: digitos(data.cartaoNumero).slice(-4),
      })
      .select('id')
      .single()
    if (erroInsert || !criado) throw new Error(erroInsert?.message ?? 'Falha ao registrar a cobrança.')

    await supabaseAdmin.from('asaas_charge_events').insert({
      charge_id: criado.id,
      asaas_event_id: `INTERNO_ENVIO:${criado.id}`,
      event_type: 'COBRANCA_ENVIADA',
      status_novo: 'indefinido',
      resultado: `Enviada por ${atendente ?? 'atendente'}`,
    })

    // 2) Transmite ao ASAAS (uma única tentativa — nunca repetir automaticamente).
    const resposta = await cobrarNoCartao({
      cliente: {
        name: data.clienteNome,
        cpfCnpj: digitos(data.clienteDocumento),
        email: data.clienteEmail,
        phone: digitos(data.clienteTelefone),
        postalCode: digitos(data.cep),
        address: data.endereco ?? null,
        addressNumber: data.numero,
        complement: data.complemento ?? null,
        province: data.bairro ?? null,
        city: data.cidade ?? null,
        state: data.estado ?? null,
        externalReference,
      },
      valor: data.valor,
      parcelas: data.parcelas,
      vencimento: data.vencimento,
      descricao: data.descricao ?? null,
      externalReference,
      cartao: {
        holderName: data.titularNome,
        number: data.cartaoNumero,
        expiryMonth: data.cartaoMes,
        expiryYear: data.cartaoAno,
        ccv: data.cartaoCvv,
      },
      titular: {
        name: data.titularNome,
        email: data.clienteEmail,
        cpfCnpj: digitos(data.titularDocumento),
        postalCode: digitos(data.cep),
        addressNumber: data.numero,
        addressComplement: data.complemento ?? null,
        phone: digitos(data.clienteTelefone),
      },
      remoteIp: ipDaRequisicao(),
    })

    if (resposta.payment) {
      await aplicarPagamento(criado.id, resposta.payment, {
        asaas_customer_id: resposta.customerId,
        card_holder_name: data.titularNome,
      })
      await supabaseAdmin.from('asaas_charge_events').insert({
        charge_id: criado.id,
        asaas_event_id: `INTERNO_RESPOSTA:${criado.id}`,
        event_type: 'RESPOSTA_ASAAS',
        asaas_payment_id: String(resposta.payment.id),
        status_novo: resposta.status,
        resultado: `Status ASAAS: ${resposta.payment.status}`,
        payload: sanitizarPayload(resposta.payment),
      })
    } else {
      await supabaseAdmin
        .from('asaas_card_charges')
        .update({
          status: resposta.status,
          asaas_customer_id: resposta.customerId,
          erro_codigo: resposta.erroCodigo,
          erro_mensagem: resposta.erroMensagem,
        })
        .eq('id', criado.id)
      await supabaseAdmin.from('asaas_charge_events').insert({
        charge_id: criado.id,
        asaas_event_id: `INTERNO_ERRO:${criado.id}`,
        event_type: 'FALHA_PROCESSAMENTO',
        status_novo: resposta.status,
        resultado: resposta.erroMensagem,
      })
    }

    const { data: charge } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('*')
      .eq('id', criado.id)
      .single()
    return { chargeId: criado.id, charge: charge as unknown as CobrancaCartao }
  })

/** Reconsulta a cobrança no ASAAS (obrigatório após timeout, antes de nova tentativa). */
export const reconsultarCobranca = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CobrancaCartao> => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { consultarCobranca, buscarCobrancaPorReferencia } = await import('./asaas-card.server')
    const { aplicarPagamento } = await import('./asaas-card.store.server')

    const { data: charge } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('id, asaas_payment_id, external_reference')
      .eq('id', data.chargeId)
      .single()
    if (!charge) throw new Error('Cobrança não encontrada.')

    let payment: any = null
    if (charge.asaas_payment_id) {
      payment = await consultarCobranca(charge.asaas_payment_id).catch(() => null)
    } else if (charge.external_reference) {
      const lista = await buscarCobrancaPorReferencia(charge.external_reference)
      payment = lista[0] ?? null
    }
    if (payment) await aplicarPagamento(charge.id, payment)

    const { data: atualizado } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('*')
      .eq('id', charge.id)
      .single()
    return atualizado as unknown as CobrancaCartao
  })

/** Lista as cobranças de cartão registradas. */
export const listarCobrancasCartao = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ busca: z.string().max(80).optional().nullable() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<CobrancaCartao[]> => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    let q = supabaseAdmin
      .from('asaas_card_charges')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    const busca = data.busca?.trim()
    if (busca) {
      q = q.or(
        `cliente_nome.ilike.%${busca}%,venda_ref.ilike.%${busca}%,asaas_payment_id.ilike.%${busca}%`,
      )
    }
    const { data: lista, error } = await q
    if (error) throw new Error(error.message)
    return (lista ?? []) as unknown as CobrancaCartao[]
  })

/** Detalhe completo de uma transação: cobrança, antecipações e linha do tempo. */
export const detalheCobrancaCartao = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      charge: CobrancaCartao
      antecipacoes: Antecipacao[]
      eventos: EventoCobranca[]
    }> => {
      await assertAdmin(context as any)
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const [{ data: charge }, { data: ant }, { data: ev }] = await Promise.all([
        supabaseAdmin.from('asaas_card_charges').select('*').eq('id', data.chargeId).single(),
        supabaseAdmin
          .from('asaas_anticipations')
          .select('*')
          .eq('charge_id', data.chargeId)
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('asaas_charge_events')
          .select('id, event_type, received_at, status_anterior, status_novo, resultado')
          .eq('charge_id', data.chargeId)
          .order('received_at', { ascending: true }),
      ])
      if (!charge) throw new Error('Cobrança não encontrada.')
      return {
        charge: charge as unknown as CobrancaCartao,
        antecipacoes: (ant ?? []) as unknown as Antecipacao[],
        eventos: (ev ?? []) as unknown as EventoCobranca[],
      }
    },
  )

/** Simula a antecipação (elegibilidade + taxas) antes de solicitar. */
export const simularAntecipacaoCobranca = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { simularAntecipacao } = await import('./asaas-card.server')
    const { data: charge } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('asaas_payment_id, asaas_installment_id')
      .eq('id', data.chargeId)
      .single()
    if (!charge?.asaas_payment_id) throw new Error('Cobrança sem ID no ASAAS.')
    const sim = await simularAntecipacao(
      charge.asaas_installment_id
        ? { installment: charge.asaas_installment_id }
        : { payment: charge.asaas_payment_id },
    )
    return {
      valorBruto: sim?.totalValue ?? sim?.value ?? null,
      taxa: sim?.fee ?? sim?.anticipationFee ?? null,
      valorLiquido: sim?.netValue ?? null,
      elegivel: sim?.isAnticipable ?? true,
    }
  })

/** Solicita a antecipação e registra o ciclo próprio dela. */
export const solicitarAntecipacaoCobranca = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chargeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Antecipacao> => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { solicitarAntecipacao } = await import('./asaas-card.server')
    const { sanitizarPayload } = await import('./asaas-card.store.server')

    const { data: charge } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('id, status, asaas_payment_id, asaas_installment_id')
      .eq('id', data.chargeId)
      .single()
    if (!charge?.asaas_payment_id) throw new Error('Cobrança sem ID no ASAAS.')
    if (!['aprovado', 'recebido'].includes(String(charge.status)))
      throw new Error('A antecipação só é possível com a cobrança aprovada.')

    const ant = await solicitarAntecipacao(
      charge.asaas_installment_id
        ? { installment: charge.asaas_installment_id }
        : { payment: charge.asaas_payment_id },
    )

    const registro = {
      charge_id: charge.id,
      asaas_anticipation_id: ant?.id ? String(ant.id) : null,
      asaas_payment_id: charge.asaas_payment_id,
      asaas_installment_id: charge.asaas_installment_id,
      status: String(ant?.status ?? 'PENDING'),
      requested_at: new Date().toISOString(),
      scheduled_date: ant?.scheduledDate ? String(ant.scheduledDate).slice(0, 10) : null,
      credit_date: ant?.creditDate ? String(ant.creditDate).slice(0, 10) : null,
      valor_bruto: ant?.value != null ? Number(ant.value) : null,
      taxa: ant?.fee != null ? Number(ant.fee) : null,
      valor_liquido: ant?.netValue != null ? Number(ant.netValue) : null,
      parcelas_antecipadas: ant?.installmentCount != null ? Number(ant.installmentCount) : null,
      denial_reason: ant?.denialReason ?? null,
      raw: sanitizarPayload(ant),
    }
    const { data: salvo, error } = await supabaseAdmin
      .from('asaas_anticipations')
      .upsert(registro, { onConflict: 'asaas_anticipation_id' })
      .select('*')
      .single()
    if (error) throw new Error(error.message)

    await supabaseAdmin
      .from('asaas_card_charges')
      .update({ anticipation_status: registro.status })
      .eq('id', charge.id)

    await supabaseAdmin.from('asaas_charge_events').insert({
      charge_id: charge.id,
      anticipation_id: salvo.id,
      asaas_event_id: `INTERNO_ANTECIPACAO:${salvo.id}`,
      event_type: 'ANTECIPACAO_SOLICITADA',
      asaas_anticipation_id: registro.asaas_anticipation_id,
      status_novo: registro.status,
      resultado: 'Antecipação solicitada',
    })

    return salvo as unknown as Antecipacao
  })

/** Conciliação: compara nossas cobranças com o ASAAS e com o extrato financeiro. */
export const conciliarAsaas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ inicio: z.string().length(10), fim: z.string().length(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { consultarCobranca, extratoFinanceiro, listarAntecipacoes } = await import(
      './asaas-card.server'
    )
    const { aplicarPagamento } = await import('./asaas-card.store.server')

    const { data: cobrancas } = await supabaseAdmin
      .from('asaas_card_charges')
      .select('id, asaas_payment_id, status, asaas_status, valor')
      .gte('created_at', `${data.inicio}T00:00:00Z`)
      .lte('created_at', `${data.fim}T23:59:59Z`)
      .not('asaas_payment_id', 'is', null)
      .limit(200)

    const divergencias: { chargeId: string; paymentId: string; antes: string; agora: string }[] = []
    for (const c of cobrancas ?? []) {
      const payment = await consultarCobranca(String(c.asaas_payment_id)).catch(() => null)
      if (!payment) continue
      if (String(payment.status) !== String(c.asaas_status ?? '')) {
        const novo = await aplicarPagamento(c.id, payment)
        divergencias.push({
          chargeId: c.id,
          paymentId: String(c.asaas_payment_id),
          antes: String(c.asaas_status ?? '—'),
          agora: `${payment.status} (${novo})`,
        })
      }
    }

    const [extrato, antecipacoes] = await Promise.all([
      extratoFinanceiro({ startDate: data.inicio, finishDate: data.fim }).catch(() => []),
      listarAntecipacoes(100).catch(() => []),
    ])

    return {
      conferidas: cobrancas?.length ?? 0,
      divergencias,
      movimentosExtrato: extrato.length,
      antecipacoesAsaas: antecipacoes.length,
    }
  })
