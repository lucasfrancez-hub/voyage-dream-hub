import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailLayout, styles } from './_layout'

interface Props {
  recipientName?: string
  orderId?: string
  contractUrl?: string
}

export const ContratoEnviado = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
  contractUrl,
}: Props) => (
  <EmailLayout
    preview="Seu contrato foi enviado. Revise e confirme sua aceitação."
    stepNumber="04"
    stepLabel="CONTRATO ENVIADO"
  >
    <Text style={styles.h1}>Contrato</Text>
    <Text style={styles.h1Accent}>enviado!</Text>
    <Text style={styles.idBadge}>ID DO PEDIDO: #{orderId}</Text>
    <Text style={styles.greeting}>Olá, {recipientName}!</Text>
    <Text style={styles.text}>
      Enviamos o contrato de prestação de serviços da sua viagem.
    </Text>
    <Text style={styles.text}>
      Por favor, revise com atenção e confirme sua aceitação.
    </Text>

    {contractUrl && (
      <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
        <Button href={contractUrl} style={button}>
          Ver contrato
        </Button>
      </Section>
    )}

    <Section style={stepsBox}>
      <Text style={stepsTitle}>Próximos passos</Text>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td style={stepCell}>
            <Text style={stepText}>
              <span style={checkIcon}>✓</span> Revise o contrato
            </Text>
          </td>
          <td style={stepCell}>
            <Text style={stepText}>
              <span style={checkIcon}>✓</span> Confirme sua aceitação
            </Text>
          </td>
          <td style={stepCell}>
            <Text style={stepText}>
              <span style={checkIcon}>✓</span> Aguarde a confirmação e os vouchers
            </Text>
          </td>
        </tr>
      </table>
    </Section>
  </EmailLayout>
)

export default ContratoEnviado

const button = { backgroundColor: '#F26B1F', color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '999px', padding: '12px 28px', textDecoration: 'none', display: 'inline-block' }
const stepsBox = { backgroundColor: '#fafafa', border: '1px solid #eaeaea', borderRadius: '8px', padding: '20px', margin: '16px 0 4px' }
const stepsTitle = { fontSize: '13px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 12px' }
const stepCell = { verticalAlign: 'top' as const, padding: '0 8px', width: '33.33%' }
const stepText = { fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.5' }
const checkIcon = { color: '#F26B1F', fontWeight: 'bold' as const, marginRight: '6px' }

export const template = {
  component: ContratoEnviado,
  subject: (data) => `Contrato enviado · Pedido #${data?.orderId ?? ''}`.trim(),
  displayName: 'Contrato enviado',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
    contractUrl: 'https://pedidos.viaair.tur.br/contrato/abc123',
  },
} satisfies TemplateEntry
