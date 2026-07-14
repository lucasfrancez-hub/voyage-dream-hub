import * as React from 'react'
import { Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles } from './_layout'

interface Props {
  recipientName?: string
  orderId?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string }
  servicos?: string[]
  vouchers?: string[]
}

export const ViagemConfirmada = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
  aereo,
  hotel,
  servicos,
  vouchers,
}: Props) => (
  <EmailLayout
    preview="Sua viagem está confirmada! Vouchers em anexo."
    stepNumber="06"
    stepLabel="VIAGEM CONFIRMADA"
    darkFooter
    footerMessage="BOA VIAGEM! 🌎"
  >
    <Text style={styles.h1}>Sua viagem está</Text>
    <Text style={styles.h1Accent}>confirmada! ✈</Text>
    <Text style={styles.idBadge}>ID DO PEDIDO: #{orderId}</Text>
    <Text style={styles.greeting}>Olá, {recipientName}!</Text>
    <Text style={styles.text}>
      Tudo certo por aqui! Seu pedido foi confirmado e os vouchers estão prontos. Em breve você receberá
      todos os detalhes da sua viagem.
    </Text>

    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '16px 0' }}>
      <tr>
        <td style={{ verticalAlign: 'top' as const, width: '50%', padding: '0 6px 0 0' }}>
          <Section style={box}>
            <Text style={boxTitle}>Resumo da sua viagem</Text>
            {aereo && (
              <>
                <Text style={boxLabel}>✈ AÉREO</Text>
                <Text style={boxValue}>{aereo.origem} → {aereo.destino}</Text>
                <Text style={boxValue}>{aereo.datas}</Text>
              </>
            )}
            {hotel && (
              <>
                <Text style={{ ...boxLabel, marginTop: '12px' }}>🏨 HOTEL</Text>
                <Text style={boxValue}>{hotel.nome}</Text>
                <Text style={boxValue}>{hotel.noites} | {hotel.datas}</Text>
              </>
            )}
            {servicos && servicos.length > 0 && (
              <>
                <Text style={{ ...boxLabel, marginTop: '12px' }}>🧳 SERVIÇOS</Text>
                {servicos.map((s, i) => (
                  <Text key={i} style={boxValue}>{s}</Text>
                ))}
              </>
            )}
          </Section>
        </td>
        <td style={{ verticalAlign: 'top' as const, width: '50%', padding: '0 0 0 6px' }}>
          <Section style={box}>
            <Text style={boxTitle}>Seus vouchers</Text>
            {(vouchers && vouchers.length > 0 ? vouchers : ['Aéreo (em anexo)', 'Hotel (em anexo)', 'Serviços (em anexo)']).map((v, i) => (
              <Text key={i} style={voucherItem}>
                <span style={checkIcon}>✓</span> {v}
              </Text>
            ))}
            <Text style={{ ...boxValue, marginTop: '12px', fontWeight: 'bold' }}>
              Verifique sua caixa de e-mail!
            </Text>
          </Section>
        </td>
      </tr>
    </table>
  </EmailLayout>
)

export default ViagemConfirmada

const box = { backgroundColor: '#fafafa', border: '1px solid #eaeaea', borderRadius: '8px', padding: '16px', minHeight: '180px' }
const boxTitle = { fontSize: '13px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 12px' }
const boxLabel = { fontSize: '11px', color: '#F26B1F', fontWeight: 'bold' as const, margin: '0 0 4px', letterSpacing: '0.5px' }
const boxValue = { fontSize: '12px', color: '#475569', margin: '0 0 4px', lineHeight: '1.4' }
const voucherItem = { fontSize: '12px', color: '#475569', margin: '0 0 6px' }
const checkIcon = { color: '#F26B1F', fontWeight: 'bold' as const, marginRight: '6px' }

export const template = {
  component: ViagemConfirmada,
  subject: (data) => `Sua viagem está confirmada! ✈ Pedido #${data?.orderId ?? ''}`.trim(),
  displayName: 'Viagem confirmada',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
    aereo: { origem: 'São Paulo (GRU)', destino: 'Paris (CDG)', datas: '10/08/2025 – 20/08/2025' },
    hotel: { nome: 'Hotel Louvre Saint-Honoré', noites: '10 noites', datas: '10/08/2025 – 20/08/2025' },
    servicos: ['Transfer aeroporto ⇄ hotel', 'City tour em Paris'],
    vouchers: ['Aéreo (em anexo)', 'Hotel (em anexo)', 'Serviços (em anexo)'],
  },
} satisfies TemplateEntry
