import * as React from 'react'
import { Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles } from './_layout'

interface Props {
  recipientName?: string
  orderId?: string
}

export const ContratoConfirmado = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
}: Props) => (
  <EmailLayout
    preview="Contrato confirmado! Agora é só aguardar seus vouchers."
    stepNumber="05"
    stepLabel="CONTRATO CONFIRMADO"
  >
    <Text style={styles.h1}>Contrato</Text>
    <Text style={styles.h1Accent}>confirmado!</Text>
    <Text style={styles.idBadge}>ID DO PEDIDO: #{orderId}</Text>
    <Text style={styles.greeting}>Olá, {recipientName}!</Text>
    <Text style={styles.text}>
      Recebemos a confirmação do contrato. Agora é só aguardar a emissão dos seus vouchers!
    </Text>

    <Section style={stepsBox}>
      <Text style={stepsTitle}>O que acontece agora?</Text>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={stepCell}>
            <Text style={stepIcon}>📄</Text>
            <Text style={stepHeading}>Emissão dos vouchers</Text>
            <Text style={stepDesc}>
              Estamos finalizando os detalhes da sua viagem.
            </Text>
          </td>
          <td style={stepCell}>
            <Text style={stepIcon}>✉</Text>
            <Text style={stepHeading}>Envio dos vouchers</Text>
            <Text style={stepDesc}>
              Em breve você receberá tudo por e-mail.
            </Text>
          </td>
          <td style={stepCell}>
            <Text style={stepIcon}>🧳</Text>
            <Text style={stepHeading}>Preparar as malas!</Text>
            <Text style={stepDesc}>
              Sua viagem está cada vez mais perto! ✈
            </Text>
          </td>
        </tr>
      </table>
    </Section>
  </EmailLayout>
)

export default ContratoConfirmado

const stepsBox = { backgroundColor: '#fafafa', border: '1px solid #eaeaea', borderRadius: '8px', padding: '24px 20px', margin: '16px 0 4px' }
const stepsTitle = { fontSize: '14px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 16px', textAlign: 'center' as const }
const stepCell = { verticalAlign: 'top' as const, padding: '0 12px', width: '33.33%', textAlign: 'center' as const }
const stepIcon = { fontSize: '28px', margin: '0 0 8px', color: '#F26B1F' }
const stepHeading = { fontSize: '13px', color: '#F26B1F', fontWeight: 'bold' as const, margin: '0 0 6px' }
const stepDesc = { fontSize: '11px', color: '#475569', margin: 0, lineHeight: '1.4' }

export const template = {
  component: ContratoConfirmado,
  subject: (data) => `Contrato confirmado · Pedido #${data?.orderId ?? ''}`.trim(),
  displayName: 'Contrato confirmado',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
  },
} satisfies TemplateEntry
