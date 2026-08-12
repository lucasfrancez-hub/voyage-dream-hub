import { describe, it, expect } from 'vitest'
import {
  classificarErroBoleto,
  resolverValorPagamento,
  buildIdempotencyKey,
  isStatusAtivo,
  podeEmitirComprovante,
  tituloComprovanteBoleto,
  decidirAposFalhaDeRede,
  parseBoletoCode,
} from '@/lib/boleto-pay.helpers'
import { criarRegistroIdempotente, type BillRepo } from '@/lib/boleto-pay.idempotency'

/** Fake da tabela com índice único em idempotency_key e client_request_id. */
function fakeRepo() {
  const rows: any[] = []
  const repo: BillRepo & { rows: any[] } = {
    rows,
    async buscarPorClientRequestId(id) {
      return rows.find((r) => r.client_request_id === id) ?? null
    },
    async buscarPorIdempotencyKey(key) {
      return rows.find((r) => r.idempotency_key === key) ?? null
    },
    async inserir(row) {
      if (rows.some((r) => r.idempotency_key === row['idempotency_key'])) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' })
      }
      if (rows.some((r) => r.client_request_id === row['client_request_id'])) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' })
      }
      const novo = { id: `row-${rows.length + 1}`, ...row }
      rows.push(novo)
      return novo
    },
  }
  return repo
}

const montar = (status = 'pendente', clientRequestId = 'req-1') =>
  (idempotencyKey: string) => ({
    idempotency_key: idempotencyKey,
    client_request_id: clientRequestId,
    identification_field: '00190500954014481606906809350314337370000000100',
    status,
  })

describe('boleto — títulos que não podem ser pagos', () => {
  it('boleto já pago é bloqueado', () => {
    const c = classificarErroBoleto('Este boleto já foi pago.')
    expect(c.bloqueia).toBe(true)
    expect(c.titulo).toBe('Boleto já pago')
  })

  it('boleto baixado não avança', () => {
    const c = classificarErroBoleto('Título baixado pelo beneficiário')
    expect(c.bloqueia).toBe(true)
    expect(c.titulo).toBe('Boleto baixado')
  })

  it('boleto cancelado é bloqueado', () => {
    expect(classificarErroBoleto('Boleto cancelado').titulo).toBe('Boleto cancelado')
  })

  it('código com dígito verificador errado não passa da validação local', () => {
    const r = parseBoletoCode('00190500954014481606906809350314337370000000101')
    expect(r.valid).toBe(false)
  })
})

describe('boleto — idempotência', () => {
  it('duplo clique não cria dois pagamentos', async () => {
    const repo = fakeRepo()
    const args = {
      clientRequestId: 'req-1',
      linha: '00190500954014481606906809350314337370000000100',
      quando: '2026-08-12',
      montarRow: montar('pendente', 'req-1'),
    }
    const [a, b] = [
      await criarRegistroIdempotente(repo, args),
      await criarRegistroIdempotente(repo, args),
    ]
    expect(a.tipo).toBe('criado')
    expect(b.tipo).toBe('reaproveitado')
    expect(b.row.id).toBe(a.row.id)
    expect(repo.rows).toHaveLength(1)
  })

  it('refresh após confirmar (nova tentativa, mesmo boleto/data) não cria outro pagamento', async () => {
    const repo = fakeRepo()
    const linha = '00190500954014481606906809350314337370000000100'
    await criarRegistroIdempotente(repo, {
      clientRequestId: 'req-1',
      linha,
      quando: '2026-08-12',
      montarRow: montar('pendente', 'req-1'),
    })
    // Depois do refresh o front gera um novo clientRequestId:
    const r = await criarRegistroIdempotente(repo, {
      clientRequestId: 'req-2',
      linha,
      quando: '2026-08-12',
      montarRow: montar('pendente', 'req-2'),
    })
    expect(r.tipo).toBe('reaproveitado')
    expect(repo.rows).toHaveLength(1)
  })

  it('tentativa anterior cancelada permite novo pagamento do mesmo boleto', async () => {
    const repo = fakeRepo()
    const linha = '00190500954014481606906809350314337370000000100'
    await criarRegistroIdempotente(repo, {
      clientRequestId: 'req-1',
      linha,
      quando: '2026-08-12',
      montarRow: montar('cancelado', 'req-1'),
    })
    const r = await criarRegistroIdempotente(repo, {
      clientRequestId: 'req-2',
      linha,
      quando: '2026-08-12',
      montarRow: montar('pendente', 'req-2'),
    })
    expect(r.tipo).toBe('criado')
    expect(repo.rows).toHaveLength(2)
    expect(repo.rows[1].idempotency_key).not.toBe(repo.rows[0].idempotency_key)
  })

  it('a chave de idempotência não depende do relógio', () => {
    const a = buildIdempotencyKey('00190.50095 40144.816069 06809.350314 3 37370000000100', '2026-08-12')
    const b = buildIdempotencyKey('00190500954014481606906809350314337370000000100', '2026-08-12')
    expect(a).toBe(b)
  })
})

describe('boleto — timeout não provoca reenvio cego', () => {
  it('quando o pagamento é localizado pela referência, apenas sincroniza', () => {
    const d = decidirAposFalhaDeRede({ encontrado: true, status: 'processando' })
    expect(d.reenviar).toBe(false)
    expect(d.acao).toBe('sincronizar')
  })

  it('quando não é localizado, fica para reconciliar — nunca reenvia', () => {
    const d = decidirAposFalhaDeRede({ encontrado: false })
    expect(d.reenviar).toBe(false)
    expect(d.acao).toBe('reconciliar_depois')
  })
})

describe('boleto — valor definido pelo provedor', () => {
  it('frontend não consegue reduzir o valor de um título fechado', () => {
    const r = resolverValorPagamento({ valorProvedor: 350.75, valorInformado: 10, valorEditavel: false })
    expect(r.ok).toBe(false)
  })

  it('valor do provedor prevalece mesmo com diferença de centavos', () => {
    const r = resolverValorPagamento({ valorProvedor: 350.75, valorInformado: 350.75, valorEditavel: false })
    expect(r).toEqual({ ok: true, valor: 350.75 })
  })

  it('título de valor aberto respeita mínimo e máximo', () => {
    expect(
      resolverValorPagamento({ valorProvedor: null, valorInformado: 5, valorEditavel: true, minimo: 10 }).ok,
    ).toBe(false)
    expect(
      resolverValorPagamento({ valorProvedor: null, valorInformado: 50, valorEditavel: true, maximo: 40 }).ok,
    ).toBe(false)
    expect(
      resolverValorPagamento({ valorProvedor: null, valorInformado: 25, valorEditavel: true, minimo: 10, maximo: 40 }),
    ).toEqual({ ok: true, valor: 25 })
  })
})

describe('boleto — comprovante segue o status real', () => {
  it('somente pagamento concluído libera comprovante', () => {
    expect(podeEmitirComprovante('pago')).toBe(true)
    for (const s of ['pendente', 'agendado', 'processando', 'falhou', 'cancelado']) {
      expect(podeEmitirComprovante(s)).toBe(false)
    }
  })

  it('pagamento pendente não aparece como concluído', () => {
    expect(tituloComprovanteBoleto('pendente')).not.toContain('Comprovante')
    expect(tituloComprovanteBoleto('agendado')).toBe('Agendamento de pagamento')
    expect(tituloComprovanteBoleto('processando')).toBe('Pagamento em processamento')
    expect(tituloComprovanteBoleto('pago')).toBe('Comprovante de pagamento')
  })

  it('status ativos ocupam o título', () => {
    expect(['pendente', 'agendado', 'processando', 'pago'].every(isStatusAtivo)).toBe(true)
    expect(isStatusAtivo('cancelado')).toBe(false)
    expect(isStatusAtivo('falhou')).toBe(false)
  })
})
