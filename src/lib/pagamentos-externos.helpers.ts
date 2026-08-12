import { z } from 'zod'

export const COMPROVANTES_BUCKET = 'comprovantes-externos'

/** Converte texto monetário brasileiro (ou número) para number. */
export function parseValor(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d,.-]/g, '')
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export const registroExternoSchema = z.object({
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

export type RegistroExternoInput = z.infer<typeof registroExternoSchema>

export type PagamentoExterno = {
  id: string
  financial_entry_id: string | null
  banco_nome: string
  banco_codigo: string | null
  forma_pagamento: string
  valor: number
  valor_original: number | null
  juros: number | null
  multa: number | null
  desconto: number | null
  data_pagamento: string
  data_vencimento: string | null
  beneficiario_nome: string | null
  beneficiario_documento: string | null
  pagador_nome: string | null
  pagador_documento: string | null
  conta_debito: string | null
  descricao: string | null
  autenticacao: string | null
  linha_digitavel: string | null
  documento_path: string | null
  created_at: string
}

/** Rótulo legível da forma de pagamento. */
export function formaLabel(forma: string | null | undefined): string {
  const f = String(forma ?? '').toLowerCase()
  if (f === 'pix') return 'Pix'
  if (f === 'ted') return 'TED'
  if (f === 'doc') return 'DOC'
  if (f === 'boleto') return 'Boleto'
  return 'Pagamento'
}

/** Normaliza o nome do banco para agrupar no filtro (ex.: "237 - BANCO BRADESCO S.A." -> "Bradesco"). */
export function bancoSlug(nome: string | null | undefined): string {
  const n = String(nome ?? '').toLowerCase()
  if (!n) return 'outro'
  if (n.includes('bradesco')) return 'Bradesco'
  if (n.includes('ita')) return 'Itaú'
  if (n.includes('brasil') && !n.includes('bradesco')) return 'Banco do Brasil'
  if (n.includes('caixa')) return 'Caixa'
  if (n.includes('santander')) return 'Santander'
  if (n.includes('sicoob')) return 'Sicoob'
  if (n.includes('sicredi')) return 'Sicredi'
  if (n.includes('inter')) return 'Inter'
  if (n.includes('nubank') || n.includes('nu pagamentos')) return 'Nubank'
  if (n.includes('asaas')) return 'ASAAS'
  return String(nome)
    .replace(/^\d{3}\s*[-–]\s*/, '')
    .replace(/\s*S\.?A\.?$/i, '')
    .trim()
}
