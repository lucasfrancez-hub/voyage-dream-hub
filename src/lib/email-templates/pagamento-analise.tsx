import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, OrderSummary, styles } from './_layout'

interface Props {
  recipientName?: string
  orderId?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
}

export const PagamentoAnalise = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
  aereo,
  hotel,
  servico,
}: Props) => (
  <EmailLayout
    preview="Seu pagamento está em análise pela nossa equipe."
    stepNumber="02"
    stepLabel="PAGAMENTO EM ANÁLISE"
    footerMessage="Previsão de retorno: em até 3h úteis"
  >
    <Text style={styles.h1}>Pagamento</Text>
    <Text style={styles.h1Accent}>em análise</Text>
    <Text style={styles.idBadge}>ID DO PEDIDO: #{orderId}</Text>
    <Text style={styles.greeting}>Olá, {recipientName}!</Text>
    <Text style={styles.text}>
      Seu pagamento foi recebido e está em análise pela nossa equipe financeira. Assim que aprovado,
      você receberá a confirmação e os próximos passos da sua viagem.
    </Text>
    {(aereo || hotel || (servico && servico.length)) && (
      <OrderSummary title="Resumo do pedido" aereo={aereo} hotel={hotel} servico={servico} />
    )}
  </EmailLayout>
)

export default PagamentoAnalise

export const template = {
  component: PagamentoAnalise,
  subject: (data) => `Pagamento em análise · Pedido #${data?.orderId ?? ''}`.trim(),
  displayName: 'Pagamento em análise',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
    aereo: { origem: 'São Paulo (GRU)', destino: 'Paris (CDG)', datas: '10/08/2025 – 20/08/2025' },
    hotel: { nome: 'Hotel Louvre Saint-Honoré', noites: '10 noites', datas: '10/08/2025 – 20/08/2025' },
    servico: ['Transfer aeroporto ⇄ hotel', 'City tour em Paris'],
  },
} satisfies TemplateEntry
