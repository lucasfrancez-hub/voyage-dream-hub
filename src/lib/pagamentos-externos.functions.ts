import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin } from './boleto-pay.helpers'

const BUCKET = 'comprovantes-externos'

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d,.-]/g, '')
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Lê um comprovante bancário externo (PDF/imagem) e extrai os dados com IA. */
export const lerComprovanteExterno = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(120),
        base64: z.string().min(10).max(20_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const bytes = Buffer.from(data.base64, 'base64')
    if (bytes.length > 12 * 1024 * 1024) throw new Error('Arquivo maior que 12MB.')

    const safe = data.filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`
    const up = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: data.mimeType, upsert: false })
    if (up.error) throw new Error(`Falha ao guardar o comprovante: ${up.error.message}`)

    const key = process.env['LOVABLE_API_KEY']
    if (!key) throw new Error('Leitura automática indisponível no momento.')

    const dataUrl = `data:${data.mimeType};base64,${data.base64}`
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content:
              'Você extrai dados de comprovantes bancários brasileiros (boleto pago, Pix, TED, DOC). ' +
              'Responda SOMENTE JSON válido com as chaves: banco_nome (nome do banco que executou o pagamento, ex: "Bradesco"), ' +
              'banco_codigo (código COMPE, ex: "237"), forma_pagamento ("boleto" | "pix" | "ted" | "doc" | "outro"), ' +
              'valor (number), valor_original (number|null), juros (number|null), multa (number|null), desconto (number|null), ' +
              'data_pagamento (ISO yyyy-mm-ddTHH:MM quando houver hora, senão yyyy-mm-dd), data_vencimento (yyyy-mm-dd|null), ' +
              'beneficiario_nome, beneficiario_documento (somente dígitos), pagador_nome, pagador_documento (somente dígitos), ' +
              'conta_debito (agência/conta debitada), descricao, autenticacao (nº de controle/autenticação/E2E), ' +
              'linha_digitavel (somente dígitos do código de barras quando existir). Use null quando não encontrar.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia todos os dados deste comprovante bancário.' },
              data.mimeType.includes('pdf')
                ? { type: 'file', file: { filename: safe, file_data: dataUrl } }
                : { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.error('[lerComprovanteExterno] IA falhou', res.status, t.slice(0, 300))
      return { path, extracao: null as any, erro: 'Não foi possível ler o comprovante automaticamente. Preencha os campos manualmente.' }
    }
    const j: any = await res.json()
    const raw = j?.choices?.[0]?.message?.content ?? '{}'
    let parsed: any = {}
    try {
      parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim())
    } catch {
      parsed = {}
    }

    const extracao = {
      banco_nome: parsed?.banco_nome ? String(parsed.banco_nome) : null,
      banco_codigo: parsed?.banco_codigo ? String(parsed.banco_codigo) : null,
      forma_pagamento: parsed?.forma_pagamento ? String(parsed.forma_pagamento).toLowerCase() : 'boleto',
      valor: num(parsed?.valor),
      valor_original: num(parsed?.valor_original),
      juros: num(parsed?.juros),
      multa: num(parsed?.multa),
      desconto: num(parsed?.desconto),
      data_pagamento: parsed?.data_pagamento ? String(parsed.data_pagamento) : null,
      data_vencimento: parsed?.data_vencimento ? String(parsed.data_vencimento).slice(0, 10) : null,
      beneficiario_nome: parsed?.beneficiario_nome ? String(parsed.beneficiario_nome) : null,
      beneficiario_documento: parsed?.beneficiario_documento ? String(parsed.beneficiario_documento).replace(/\D/g, '') : null,
      pagador_nome: parsed?.pagador_nome ? String(parsed.pagador_nome) : null,
      pagador_documento: parsed?.pagador_documento ? String(parsed.pagador_documento).replace(/\D/g, '') : null,
      conta_debito: parsed?.conta_debito ? String(parsed.conta_debito) : null,
      descricao: parsed?.descricao ? String(parsed.descricao) : null,
      autenticacao: parsed?.autenticacao ? String(parsed.autenticacao) : null,
      linha_digitavel: parsed?.linha_digitavel ? String(parsed.linha_digitavel).replace(/\D/g, '') : null,
    }

    return { path, extracao, erro: null as string | null }
  })

const registroSchema = z.object({
  financialEntryId: z.string().uuid().nullable().optional(),
  bancoNome: z.string().min(2).max(120),
  bancoCodigo: z.string().max(10).nullable().optional(),
  formaPagamento: z.string().max(20).default('boleto'),
  valor: z.number().positive(),
  valorOriginal: z.number().nullable().optional(),
  juros: z.number().nullable().optional(),
  multa: z.number().nullable().optional(),
  desconto: z.number().nullable().optional(),
  dataPagamento: z.string().min(8),
  dataVencimento: z.string().nullable().optional(),
  beneficiarioNome: z.string().max(200).nullable().optional(),
  beneficiarioDocumento: z.string().max(20).nullable().optional(),
  pagadorNome: z.string().max(200).nullable().optional(),
  pagadorDocumento: z.string().max(20).nullable().optional(),
  contaDebito: z.string().max(120).nullable().optional(),
  descricao: z.string().max(400).nullable().optional(),
  autenticacao: z.string().max(200).nullable().optional(),
  linhaDigitavel: z.string().max(60).nullable().optional(),
  documentoPath: z.string().max(400).nullable().optional(),
  rawExtracao: z.any().optional(),
  darBaixa: z.boolean().default(true),
})

/** Registra um pagamento feito fora do ASAAS e (opcionalmente) dá baixa no lançamento. */
export const registrarPagamentoExterno = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registroSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const ctx = context as any
    const supabase = ctx.supabase

    const dataPagamentoISO = new Date(
      data.dataPagamento.length <= 10 ? `${data.dataPagamento}T12:00:00-03:00` : data.dataPagamento,
    ).toISOString()

    const { data: row, error } = await supabase
      .from('pagamentos_externos')
      .insert({
        financial_entry_id: data.financialEntryId ?? null,
        banco_nome: data.bancoNome.trim(),
        banco_codigo: data.bancoCodigo ?? null,
        forma_pagamento: data.formaPagamento || 'boleto',
        valor: data.valor,
        valor_original: data.valorOriginal ?? null,
        juros: data.juros ?? null,
        multa: data.multa ?? null,
        desconto: data.desconto ?? null,
        data_pagamento: dataPagamentoISO,
        data_vencimento: data.dataVencimento || null,
        beneficiario_nome: data.beneficiarioNome ?? null,
        beneficiario_documento: data.beneficiarioDocumento ?? null,
        pagador_nome: data.pagadorNome ?? null,
        pagador_documento: data.pagadorDocumento ?? null,
        conta_debito: data.contaDebito ?? null,
        descricao: data.descricao ?? null,
        autenticacao: data.autenticacao ?? null,
        linha_digitavel: data.linhaDigitavel ?? null,
        documento_path: data.documentoPath ?? null,
        raw_extracao: data.rawExtracao ?? null,
        created_by: ctx.userId ?? null,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)

    if (data.financialEntryId && data.darBaixa) {
      const { error: upErr } = await supabase
        .from('financial_entries')
        .update({
          status: 'paid',
          paid_date: dataPagamentoISO.slice(0, 10),
          payment_method: `${data.bancoNome.trim()} (${data.formaPagamento || 'boleto'})`,
        })
        .eq('id', data.financialEntryId)
      if (upErr) throw new Error(upErr.message)
    }

    return { item: row }
  })

/** Lista pagamentos externos no período (data de pagamento). */
export const listarPagamentosExternos = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ startDate: z.string().optional(), finishDate: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const supabase = (context as any).supabase
    let q = supabase.from('pagamentos_externos').select('*').order('data_pagamento', { ascending: false }).limit(500)
    if (data.startDate) q = q.gte('data_pagamento', `${data.startDate}T00:00:00-03:00`)
    if (data.finishDate) q = q.lte('data_pagamento', `${data.finishDate}T23:59:59-03:00`)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return { items: (rows ?? []) as any[] }
  })

/** Remove um pagamento externo (não reabre automaticamente o lançamento). */
export const excluirPagamentoExterno = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const supabase = (context as any).supabase
    const { error } = await supabase.from('pagamentos_externos').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

/** Gera link temporário para abrir o arquivo original do comprovante externo. */
export const urlComprovanteExterno = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(data.path, 60 * 10)
    if (error) throw new Error(error.message)
    return { url: signed.signedUrl }
  })
