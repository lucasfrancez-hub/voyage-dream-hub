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

/* ==================================================================
 * Validação e normalização de linha digitável / código de barras
 * ================================================================== */

export type BoletoCodeKind = 'bancario' | 'arrecadacao'

export type BoletoCodeParse = {
  valid: boolean
  kind: BoletoCodeKind | null
  /** Linha digitável (47 dígitos bancário / 48 arrecadação) */
  linha: string | null
  /** Código de barras (44 dígitos) */
  barcode: string | null
  value: number | null
  dueDate: string | null
  /** Motivo da invalidez, para exibir ao usuário */
  message: string | null
}

function mod10(block: string) {
  let sum = 0
  let weight = 2
  for (let i = block.length - 1; i >= 0; i--) {
    let p = Number(block[i]) * weight
    if (p > 9) p -= 9
    sum += p
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

function mod11Barcode(block43: string) {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9]
  let sum = 0
  for (let i = block43.length - 1, w = 0; i >= 0; i--, w++) {
    sum += Number(block43[i]) * (weights[w % 8] as number)
  }
  const rest = sum % 11
  const dv = 11 - rest
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv
}

function mod11Arrecadacao(block: string) {
  let sum = 0
  let weight = 2
  for (let i = block.length - 1; i >= 0; i--) {
    sum += Number(block[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const rest = sum % 11
  if (rest === 0) return 0
  if (rest === 1) return 0
  return 11 - rest
}

function fatorToDate(fator: number): string | null {
  if (!fator) return null
  const base = Date.UTC(1997, 9, 7)
  return new Date(base + fator * 86400000).toISOString().slice(0, 10)
}

function bancarioBarcodeToLinha(bc: string) {
  const c1 = bc.slice(0, 4) + bc.slice(19, 24)
  const c2 = bc.slice(24, 34)
  const c3 = bc.slice(34, 44)
  return (
    c1 + String(mod10(c1)) +
    c2 + String(mod10(c2)) +
    c3 + String(mod10(c3)) +
    bc[4] +
    bc.slice(5, 19)
  )
}

function bancarioLinhaToBarcode(l: string) {
  return (
    l.slice(0, 4) +
    l[32] +
    l.slice(33, 47) +
    l.slice(4, 9) +
    l.slice(10, 20) +
    l.slice(21, 31)
  )
}

function arrecadacaoLinhaToBarcode(l: string) {
  return l.slice(0, 11) + l.slice(12, 23) + l.slice(24, 35) + l.slice(36, 47)
}

function arrecadacaoBarcodeToLinha(bc: string) {
  const usaMod10 = bc[2] === '6' || bc[2] === '7'
  const dv = (b: string) => String(usaMod10 ? mod10(b) : mod11Arrecadacao(b))
  const blocks = [bc.slice(0, 11), bc.slice(11, 22), bc.slice(22, 33), bc.slice(33, 44)]
  return blocks.map((b) => b + dv(b)).join('')
}

/**
 * Aceita linha digitável (47/48) ou código de barras (44), de boleto bancário
 * ou de conta de consumo/tributo (arrecadação), valida os dígitos
 * verificadores e devolve as duas representações.
 */
export function parseBoletoCode(input: string): BoletoCodeParse {
  const d = onlyDigits(input)
  const fail = (message: string): BoletoCodeParse => ({
    valid: false, kind: null, linha: null, barcode: null, value: null, dueDate: null, message,
  })
  if (!d) return fail('Informe a linha digitável ou o código de barras.')

  let kind: BoletoCodeKind
  let linha: string
  let barcode: string

  if (d.length === 44) {
    kind = d[0] === '8' ? 'arrecadacao' : 'bancario'
    barcode = d
    linha = kind === 'bancario' ? bancarioBarcodeToLinha(d) : arrecadacaoBarcodeToLinha(d)
  } else if (d.length === 47) {
    kind = 'bancario'
    linha = d
    barcode = bancarioLinhaToBarcode(d)
  } else if (d.length === 48) {
    kind = 'arrecadacao'
    linha = d
    barcode = arrecadacaoLinhaToBarcode(d)
  } else {
    return fail(
      `Código com ${d.length} dígitos. Esperado 47 (linha digitável), 48 (conta de consumo) ou 44 (código de barras).`,
    )
  }

  if (kind === 'bancario') {
    const dvGeral = Number(barcode[4])
    const semDv = barcode.slice(0, 4) + barcode.slice(5)
    if (mod11Barcode(semDv) !== dvGeral) {
      return fail('Dígito verificador inválido — confira o código digitado.')
    }
    const fator = Number(barcode.slice(5, 9))
    const centavos = Number(barcode.slice(9, 19))
    return {
      valid: true,
      kind,
      linha,
      barcode,
      value: centavos > 0 ? centavos / 100 : null,
      dueDate: fatorToDate(fator),
      message: null,
    }
  }

  const usaMod10 = barcode[2] === '6' || barcode[2] === '7'
  const dvGeral = Number(barcode[3])
  const semDv = barcode.slice(0, 3) + barcode.slice(4)
  const calc = usaMod10 ? mod10(semDv) : mod11Arrecadacao(semDv)
  if (calc !== dvGeral) {
    return fail('Dígito verificador inválido — confira o código digitado.')
  }
  const centavos = Number(barcode.slice(4, 15))
  return {
    valid: true,
    kind,
    linha,
    barcode,
    value: centavos > 0 ? centavos / 100 : null,
    dueDate: null,
    message: null,
  }
}

/** Situações que impedem o pagamento, detectadas pela mensagem do provedor. */
export function classificarErroBoleto(description: string, code?: string | null) {
  const t = (description || '').toLowerCase()
  const has = (...w: string[]) => w.some((x) => t.includes(x))
  if (has('já foi pago', 'ja foi pago', 'já pago', 'liquidad')) {
    return { titulo: 'Boleto já pago', bloqueia: true }
  }
  if (has('baixad', 'baixa efetuada')) {
    return { titulo: 'Boleto baixado', bloqueia: true }
  }
  if (has('cancelad')) return { titulo: 'Boleto cancelado', bloqueia: true }
  if (has('não é possível pagar', 'nao e possivel pagar', 'indisponível', 'indisponivel')) {
    return { titulo: 'Boleto indisponível para pagamento', bloqueia: true }
  }
  if (has('vencid', 'data de pagamento', 'data limite', 'horário', 'horario')) {
    return { titulo: 'Data de pagamento não permitida', bloqueia: true }
  }
  if (has('saldo')) return { titulo: 'Saldo insuficiente', bloqueia: true }
  if (has('inválid', 'invalid', 'código de barras', 'codigo de barras')) {
    return { titulo: 'Código inválido', bloqueia: true }
  }
  return { titulo: code ? `Consulta recusada (${code})` : 'Consulta recusada', bloqueia: true }
}
