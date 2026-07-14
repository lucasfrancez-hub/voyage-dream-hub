import * as React from 'react'
import { Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, OrderSummary, styles } from './_layout'

interface Props {
  recipientName?: string
  quoteId?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
  valorTotal?: string
  formasPagamento?: string[]
}

export const OrcamentoEnviado = ({
  recipientName = 'Cliente',
  quoteId = 'OR00000000',
  aereo,
  hotel,
  servico,
  valorTotal,
  formasPagamento,
}: Props) => (
  <EmailLayout
    preview="Seu orçamento chegou! Confira os detalhes da sua viagem."
    stepNumber="03"
    stepLabel="ORÇAMENTO ENVIADO"
    darkFooter
    footerMessage="Vamos realizar a viagem dos seus sonhos!"
  >
    <Text style={styles.h1}>Orçamento</Text>
    <Text style={styles.h1Accent}>enviado!</Text>
    <Text style={styles.idBadge}>ID DO ORÇAMENTO: #{quoteId}</Text>
    <Text style={styles.greeting}>Olá, {recipientName}!</Text>
    <Text style={styles.text}>
      Conforme solicitado, segue o orçamento da sua viagem. Qualquer dúvida, estamos à disposição!
    </Text>
    {(aereo || hotel || (servico && servico.length)) && (
      <OrderSummary aereo={aereo} hotel={hotel} servico={servico} />
    )}
    {(valorTotal || (formasPagamento && formasPagamento.length)) && (
      <Section style={priceBox}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tr>
            {valorTotal && (
              <td style={{ verticalAlign: 'top' as const, width: '50%' }}>
                <Text style={priceLabel}>Valor total estimado</Text>
                <Text style={priceValue}>{valorTotal}</Text>
              </td>
            )}
            {formasPagamento && formasPagamento.length > 0 && (
              <td style={{ verticalAlign: 'top' as const, width: '50%' }}>
                <Text style={priceLabel}>Formas de pagamento</Text>
                {formasPagamento.map((f, i) => (
                  <Text key={i} style={paymentOption}>
                    {f}
                  </Text>
                ))}
              </td>
            )}
          </tr>
        </table>
      </Section>
    )}
  </EmailLayout>
)

export default OrcamentoEnviado

const priceBox = { backgroundColor: '#fafafa', border: '1px solid #eaeaea', borderRadius: '8px', padding: '20px', margin: '16px 0 20px' }
const priceLabel = { fontSize: '12px', color: '#475569', margin: '0 0 6px' }
const priceValue = { fontSize: '22px', color: '#F26B1F', fontWeight: 'bold' as const, margin: 0 }
const paymentOption = { fontSize: '12px', color: '#475569', margin: '0 0 4px', lineHeight: '1.5' }

export const template = {
  component: OrcamentoEnviado,
  subject: (data) => `Seu orçamento VIA AIR · #${data?.quoteId ?? ''}`.trim(),
  displayName: 'Orçamento enviado',
  previewData: {
    recipientName: 'Camila',
    quoteId: 'OR25051248',
    aereo: { origem: 'São Paulo (GRU)', destino: 'Paris (CDG)', datas: '10/08/2025 – 20/08/2025' },
    hotel: { nome: 'Hotel Louvre Saint-Honoré', noites: '10 noites', datas: '10/08/2025 – 20/08/2025', categoria: 'Categoria: 4 estrelas' },
    servico: ['Transfer aeroporto ⇄ hotel', 'City tour em Paris'],
    valorTotal: 'R$ 12.870,00',
    formasPagamento: ['Cartão de crédito até 10x sem juros', 'Pix com 5% de desconto', 'Boleto bancário'],
  },
} satisfies TemplateEntry
