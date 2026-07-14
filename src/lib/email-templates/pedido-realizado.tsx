import * as React from 'react'
import { Img, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, OrderSummary, styles } from './_layout'
import clipboardAsset from '@/assets/clipboard-check.png.asset.json'

const APP_BASE_URL = 'https://pedidos.viaair.tur.br'
const CLIPBOARD_URL = clipboardAsset.url.startsWith('http')
  ? clipboardAsset.url
  : `${APP_BASE_URL}${clipboardAsset.url}`

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
    <Section>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={{ verticalAlign: 'top' as const, paddingRight: '16px' }}>
            <Text style={styles.h1}>Pedido realizado</Text>
            <Text style={styles.h1Accent}>com sucesso!</Text>
            <Text style={styles.greeting}>Olá, {recipientName}!</Text>
            <Text style={styles.text}>
              Recebemos o seu pedido com sucesso.<br />
              Em breve nossa equipe entrará em contato<br />
              para dar continuidade.
            </Text>
            <Text style={styles.idBadge}>
              📋&nbsp;&nbsp;ID DO PEDIDO: <span style={styles.idBadgeAccent}>#{orderId}</span>
            </Text>
          </td>
          <td style={{ width: '200px', verticalAlign: 'top' as const, textAlign: 'right' as const }}>
            <Img src={CLIPBOARD_URL} alt="" width="180" height="180" style={{ display: 'inline-block' }} />
          </td>
        </tr>
      </table>
    </Section>
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
