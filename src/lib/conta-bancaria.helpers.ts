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
  receiptUrl: string | null
  /** Contraparte e dados completos do comprovante (quando disponíveis). */
  counterparty: string | null
  counterpartyLabel: string | null
  instituicao: string | null
  chavePix: string | null
  cpfCnpj: string | null
  operacao: string | null
  formaPagamento: string | null
  dueDate: string | null
  paymentDate: string | null
  /**
   * Data/hora real da movimentação em ISO com fuso de Brasília (-03:00).
   * `null` quando a API do ASAAS não expõe horário para o lançamento.
   */
  datetime: string | null
  /** De onde veio o timestamp (transfer.effectiveDate, pix.dateCreated, etc). */
  datetimeSource: string | null
  /** Origem da movimentação, apenas quando há evidência objetiva. */
  origem: 'viaair' | 'asaas' | null
}

/**
 * Converte "YYYY-MM-DD HH:mm:ss" (horário local de Brasília, formato ASAAS)
 * em ISO com offset -03:00. Retorna null se não houver horário.
 */
export function brtToIso(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/)
  if (!m) return null
  return `${m[1]}T${m[2]}${m[3] ?? ':00'}-03:00`
}


export async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error) throw new Error(`Falha ao validar permissão: ${error.message}`)
  if (!isAdmin) throw new Error('Acesso restrito a administradores.')
}


export function brtToday() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date()) // yyyy-mm-dd
}

export function monthRange(offset = 0) {
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

export function normalize(tx: any): ExtratoItem {
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
    receiptUrl: null,
    counterparty: null,
    counterpartyLabel: null,
    instituicao: null,
    chavePix: null,
    cpfCnpj: null,
    operacao: null,
    formaPagamento: null,
    dueDate: null,
    paymentDate: null,
    datetime: null,
    datetimeSource: null,
    origem: null,
  }
}

