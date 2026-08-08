/** Helpers do pagamento de boletos via ASAAS (Pague Contas). */

export const BILL_STATUS_LABEL: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  agendado: 'Agendado',
  processando: 'Em processamento',
  pago: 'Pago',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
}

export async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error) throw new Error(`Falha ao validar permissão: ${error.message}`)
  if (!isAdmin) throw new Error('Acesso restrito a administradores.')
}

export function onlyDigits(v: string) {
  return (v || '').replace(/\D+/g, '')
}

/** Data de hoje (America/Sao_Paulo) em yyyy-mm-dd. */
export function todayBRT() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Mapeia o status do ASAAS para o status interno. */
export function mapBillStatus(asaasStatus?: string | null): string {
  const s = (asaasStatus || '').toUpperCase()
  if (['PAID', 'BANK_PROCESSING_PAID', 'CONFIRMED'].includes(s)) return 'pago'
  if (['SCHEDULED', 'PENDING_SCHEDULING'].includes(s)) return 'agendado'
  if (['PENDING', 'BANK_PROCESSING', 'PROCESSING'].includes(s)) return 'processando'
  if (['FAILED', 'REFUSED', 'ERROR'].includes(s)) return 'falhou'
  if (['CANCELLED', 'CANCELED', 'DELETED'].includes(s)) return 'cancelado'
  return 'processando'
}

/** Extrai vencimento (fator) e valor de uma linha digitável de 47 dígitos. */
export function parseBoletoLine(line: string): { dueDate: string | null; value: number | null } {
  const d = onlyDigits(line)
  if (d.length !== 47) return { dueDate: null, value: null }
  const fator = Number(d.slice(33, 37))
  const centavos = Number(d.slice(37, 47))
  let dueDate: string | null = null
  if (fator > 0) {
    const base = Date.UTC(1997, 9, 7) // 07/10/1997
    const dt = new Date(base + fator * 86400000)
    dueDate = dt.toISOString().slice(0, 10)
  }
  return { dueDate, value: centavos > 0 ? centavos / 100 : null }
}

export function isBoletoVencido(dueDate?: string | null) {
  if (!dueDate) return false
  return dueDate < todayBRT()
}
