import { buildIdempotencyKey, isStatusAtivo } from './boleto-pay.helpers'

/**
 * Acesso mínimo à tabela asaas_bill_payments, para permitir teste com fake.
 */
export interface BillRepo {
  /** Pagamento já criado por esta mesma tentativa do usuário. */
  buscarPorClientRequestId(id: string): Promise<any | null>
  /** Pagamento existente com a mesma chave determinística. */
  buscarPorIdempotencyKey(key: string): Promise<any | null>
  /**
   * Insere o registro. Deve rejeitar com `{ code: '23505' }` quando a chave
   * única (idempotency_key / client_request_id) já existir.
   */
  inserir(row: Record<string, any>): Promise<any>
}

export type ResultadoRegistro =
  | { tipo: 'reaproveitado'; row: any }
  | { tipo: 'criado'; row: any }

/**
 * Cria o registro do pagamento de forma idempotente.
 *
 * - Mesma tentativa (duplo clique / retry do navegador) → devolve o registro
 *   já criado, sem novo pagamento.
 * - Mesmo boleto + mesma data com pagamento ATIVO (refresh, nova aba) →
 *   devolve o pagamento ativo em vez de criar outro.
 * - Tentativa anterior cancelada/falhada → cria uma nova com sufixo.
 */
export async function criarRegistroIdempotente(
  repo: BillRepo,
  args: {
    clientRequestId: string
    linha: string
    quando: string | null
    montarRow: (idempotencyKey: string) => Record<string, any>
  },
): Promise<ResultadoRegistro> {
  const jaCriado = await repo.buscarPorClientRequestId(args.clientRequestId)
  if (jaCriado) return { tipo: 'reaproveitado', row: jaCriado }

  let ultimoErro: any = null
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const key = buildIdempotencyKey(args.linha, args.quando, tentativa)
    try {
      const row = await repo.inserir(args.montarRow(key))
      return { tipo: 'criado', row }
    } catch (e: any) {
      ultimoErro = e
      if (String(e?.code) !== '23505') throw e
      const existente = await repo.buscarPorIdempotencyKey(key)
      if (existente && isStatusAtivo(existente.status)) {
        return { tipo: 'reaproveitado', row: existente }
      }
      // chave ocupada por tentativa cancelada/falhada → tenta a próxima
    }
  }
  throw new Error(ultimoErro?.message ?? 'Não foi possível registrar o pagamento.')
}
