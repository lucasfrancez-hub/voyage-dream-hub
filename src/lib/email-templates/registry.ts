import type { ComponentType } from 'react'

import { template as pedidoRealizadoTemplate } from './pedido-realizado'
import { template as pagamentoAnaliseTemplate } from './pagamento-analise'
import { template as orcamentoEnviadoTemplate } from './orcamento-enviado'
import { template as contratoEnviadoTemplate } from './contrato-enviado'
import { template as contratoConfirmadoTemplate } from './contrato-confirmado'
import { template as viagemConfirmadaTemplate } from './viagem-confirmada'
import { template as alteracaoVooAdminTemplate } from './alteracao-voo-admin'
import { template as cartaoEmbarqueTemplate } from './cartao-embarque'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'pedido-realizado': pedidoRealizadoTemplate,
  'pagamento-analise': pagamentoAnaliseTemplate,
  'orcamento-enviado': orcamentoEnviadoTemplate,
  'contrato-enviado': contratoEnviadoTemplate,
  'contrato-confirmado': contratoConfirmadoTemplate,
  'viagem-confirmada': viagemConfirmadaTemplate,
  'alteracao-voo-admin': alteracaoVooAdminTemplate,
  'cartao-embarque': cartaoEmbarqueTemplate,
}
