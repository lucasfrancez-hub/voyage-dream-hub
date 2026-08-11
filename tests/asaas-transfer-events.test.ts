import { describe, expect, it } from 'vitest'
import {
  TRANSFER_EVENTS,
  TRANSFER_STATUS_LABEL,
  deveAtualizarStatus,
  extrairCamposTransfer,
  isTransferEvent,
  statusFromTransferEvent,
} from '@/lib/asaas-transfer-events'

/** Payload simulado no formato que o ASAAS envia (nenhum Pix real). */
function mockPayload(event: string, transfer: Record<string, any> = {}) {
  return {
    event,
    dateCreated: '2026-08-11 20:11:56',
    transfer: {
      object: 'transfer',
      id: '3e9fa1d5-6b65-45af-9872-174c42f3e45d',
      externalReference: '95cacda8-adee-47df-8814-95abfca95ecb',
      value: 4999.99,
      status: 'PENDING',
      authorized: true,
      failReason: null,
      endToEndIdentifier: null,
      effectiveDate: null,
      confirmedDate: null,
      scheduleDate: '2026-08-11',
      transactionReceiptUrl: null,
      ...transfer,
    },
  }
}

describe('isTransferEvent', () => {
  it('reconhece todos os eventos TRANSFER_*', () => {
    for (const ev of TRANSFER_EVENTS) expect(isTransferEvent(ev)).toBe(true)
  })
  it('ignora eventos de cobrança e de boleto', () => {
    expect(isTransferEvent('PAYMENT_RECEIVED')).toBe(false)
    expect(isTransferEvent('BILL_PAID')).toBe(false)
    expect(isTransferEvent(undefined)).toBe(false)
  })
})

describe('statusFromTransferEvent', () => {
  const casos: Array<[string, string]> = [
    ['TRANSFER_CREATED', 'pendente'],
    ['TRANSFER_PENDING', 'pendente'],
    ['TRANSFER_IN_BANK_PROCESSING', 'processando'],
    ['TRANSFER_BLOCKED', 'bloqueado'],
    ['TRANSFER_FAILED', 'falhou'],
    ['TRANSFER_DONE', 'concluido'],
    ['TRANSFER_CANCELLED', 'cancelado'],
  ]
  it.each(casos)('%s -> %s', (event, esperado) => {
    expect(statusFromTransferEvent(event)).toBe(esperado)
  })
  it('aceita a grafia CANCELED', () => {
    expect(statusFromTransferEvent('TRANSFER_CANCELED')).toBe('cancelado')
  })
  it('devolve null para evento desconhecido', () => {
    expect(statusFromTransferEvent('TRANSFER_QUALQUER_COISA')).toBeNull()
  })
})

describe('extrairCamposTransfer', () => {
  it('extrai correlação e campos básicos do TRANSFER_CREATED', () => {
    const c = extrairCamposTransfer(mockPayload('TRANSFER_CREATED'))
    expect(c.asaasTransferId).toBe('3e9fa1d5-6b65-45af-9872-174c42f3e45d')
    expect(c.externalReference).toBe('95cacda8-adee-47df-8814-95abfca95ecb')
    expect(c.asaasStatus).toBe('PENDING')
    expect(c.value).toBe(4999.99)
    expect(c.authorized).toBe(true)
    expect(c.endToEndIdentifier).toBeNull()
  })

  it('extrai E2E, datas e recibo no TRANSFER_DONE', () => {
    const c = extrairCamposTransfer(
      mockPayload('TRANSFER_DONE', {
        status: 'DONE',
        endToEndIdentifier: 'E19540550202608080408IALLERTEP0F',
        effectiveDate: '2026-08-11 20:20:00',
        confirmedDate: '2026-08-11',
        transactionReceiptUrl: 'https://asaas.com/comprovante/123',
      }),
    )
    expect(c.asaasStatus).toBe('DONE')
    expect(c.endToEndIdentifier).toBe('E19540550202608080408IALLERTEP0F')
    expect(c.effectiveDate).toBe('2026-08-11')
    expect(c.confirmedDate).toBe('2026-08-11')
    expect(c.receiptUrl).toBe('https://asaas.com/comprovante/123')
  })

  it('extrai failReason no TRANSFER_FAILED', () => {
    const c = extrairCamposTransfer(
      mockPayload('TRANSFER_FAILED', { status: 'FAILED', failReason: 'Autorização externa foi recusada.' }),
    )
    expect(c.failReason).toBe('Autorização externa foi recusada.')
  })

  it('extrai refusalReason vindo da transação Pix aninhada', () => {
    const c = extrairCamposTransfer(
      mockPayload('TRANSFER_BLOCKED', {
        status: 'BLOCKED',
        pixTransaction: { refusalReason: 'Limite de transferência excedido', status: 'BLOCKED' },
      }),
    )
    expect(c.refusalReason).toBe('Limite de transferência excedido')
  })

  it('lê scheduleDate do TRANSFER_PENDING agendado pelo ASAAS', () => {
    const c = extrairCamposTransfer(mockPayload('TRANSFER_PENDING', { scheduleDate: '2026-08-12' }))
    expect(c.scheduleDate).toBe('2026-08-12')
  })

  it('não quebra com payload vazio', () => {
    const c = extrairCamposTransfer({})
    expect(c.asaasTransferId).toBeNull()
    expect(c.value).toBeNull()
  })
})

describe('deveAtualizarStatus (webhooks fora de ordem)', () => {
  it('avança no ciclo normal', () => {
    expect(deveAtualizarStatus('pendente', 'processando')).toBe(true)
    expect(deveAtualizarStatus('processando', 'concluido')).toBe(true)
    expect(deveAtualizarStatus('pendente', 'bloqueado')).toBe(true)
    expect(deveAtualizarStatus('pendente', 'cancelado')).toBe(true)
  })
  it('nunca regride um estado final', () => {
    expect(deveAtualizarStatus('concluido', 'pendente')).toBe(false)
    expect(deveAtualizarStatus('concluido', 'processando')).toBe(false)
    expect(deveAtualizarStatus('cancelado', 'pendente')).toBe(false)
    expect(deveAtualizarStatus('falhou', 'processando')).toBe(false)
  })
  it('permite reprocessar o mesmo status', () => {
    expect(deveAtualizarStatus('concluido', 'concluido')).toBe(true)
  })
  it('aceita status interno desconhecido', () => {
    expect(deveAtualizarStatus(null, 'pendente')).toBe(true)
  })
})

describe('rótulos exibidos no Financeiro', () => {
  it('usa os textos reais de cada estado', () => {
    expect(TRANSFER_STATUS_LABEL.pendente).toBe('Aguardando processamento')
    expect(TRANSFER_STATUS_LABEL.processando).toBe('Em processamento bancário')
    expect(TRANSFER_STATUS_LABEL.bloqueado).toBe('Bloqueado')
    expect(TRANSFER_STATUS_LABEL.concluido).toBe('Concluído')
    expect(TRANSFER_STATUS_LABEL.falhou).toBe('Falhou')
    expect(TRANSFER_STATUS_LABEL.cancelado).toBe('Cancelado')
  })
})

describe('trilhas de ciclo de vida completas', () => {
  const trilha = (events: string[]) =>
    events.map((e) => statusFromTransferEvent(e)).filter(Boolean)

  it('CREATED → PENDING → IN_BANK_PROCESSING → DONE', () => {
    expect(
      trilha(['TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_IN_BANK_PROCESSING', 'TRANSFER_DONE']),
    ).toEqual(['pendente', 'pendente', 'processando', 'concluido'])
  })

  it('CREATED → PENDING → BLOCKED', () => {
    expect(trilha(['TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_BLOCKED'])).toEqual([
      'pendente',
      'pendente',
      'bloqueado',
    ])
  })

  it('CREATED → PENDING → CANCELLED', () => {
    expect(trilha(['TRANSFER_CREATED', 'TRANSFER_PENDING', 'TRANSFER_CANCELLED'])).toEqual([
      'pendente',
      'pendente',
      'cancelado',
    ])
  })

  it('estado final resiste a um PENDING atrasado', () => {
    let atual = 'pendente'
    for (const ev of ['TRANSFER_DONE', 'TRANSFER_PENDING']) {
      const novo = statusFromTransferEvent(ev)!
      if (deveAtualizarStatus(atual, novo)) atual = novo
    }
    expect(atual).toBe('concluido')
  })
})
