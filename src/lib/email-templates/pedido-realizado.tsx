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

export const PedidoRealizado = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
  aereo,
  hotel,
  servico,
}: Props) => (
  <EmailLayout
    preview="Recebemos seu pedido com sucesso!"
    stepNumber="01"
    stepLabel="PEDIDO REALIZADO"
  >
    <Text style={styles.h1}>Pedido realizado</Text>
    <Text style={styles.h1Accent}>com sucesso!</Text>
    <Text style={styles.idBadge}>ID DO PEDIDO: #{orderId}</Text>
    <Text style={styles.greeting}>Olá, {recipientName}!</Text>
    <Text style={styles.text}>
      Recebemos o seu pedido com sucesso. Em breve nossa equipe entrará em contato para dar continuidade.
    </Text>
    {(aereo || hotel || (servico && servico.length)) && (
      <OrderSummary aereo={aereo} hotel={hotel} servico={servico} />
    )}
  </EmailLayout>
)

export default PedidoRealizado

export const template = {
  component: PedidoRealizado,
  subject: (data) => `Pedido realizado com sucesso! #${data?.orderId ?? ''}`.trim(),
  displayName: 'Pedido realizado',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
    aereo: { origem: 'São Paulo (GRU)', destino: 'Paris (CDG)', datas: '10/08/2025 – 20/08/2025' },
    hotel: { nome: 'Hotel Louvre Saint-Honoré', noites: '10 noites', datas: '10/08/2025 – 20/08/2025', categoria: 'Categoria: 4 estrelas' },
    servico: ['Transfer aeroporto ⇄ hotel', 'City tour em Paris'],
  },
} satisfies TemplateEntry
