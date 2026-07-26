import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  orderNumber?: string
  valor?: number
  qrCode?: string
  expiraEmMin?: number
}

const PixQrCliente = ({
  recipientName = 'Cliente',
  orderNumber = '',
  valor = 0,
  qrCode = '',
  expiraEmMin = 30,
}: Props) => {
  const valorFmt = Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const qrImgUrl = qrCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(
        qrCode,
      )}`
    : ''

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{`Seu Pix — ${valorFmt} — pedido #${orderNumber}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brand}>
            <Text style={brandText}>VIA AIR • PAGAMENTO PIX</Text>
          </Section>
          <Section style={{ padding: '28px 28px 8px 28px' }}>
            <Heading style={h1}>Olá, {recipientName}!</Heading>
            <Text style={muted}>
              Seu pedido <strong style={{ color: '#0b2d67' }}>#{orderNumber}</strong> está pronto
              para pagamento. Use o QR Code ou copie o código Pix abaixo em qualquer banco.
            </Text>

            <div style={valueBox}>
              <div style={valueLabel}>Valor a pagar</div>
              <div style={valueBig}>{valorFmt}</div>
              <div style={valueLabel}>Expira em {expiraEmMin} minutos</div>
            </div>

            {qrImgUrl && (
              <div style={{ textAlign: 'center' as const, margin: '20px 0' }}>
                <img
                  src={qrImgUrl}
                  alt="QR Code Pix"
                  width={240}
                  height={240}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 12 }}
                />
              </div>
            )}

            <Text style={label}>Pix copia e cola</Text>
            <div style={codeBox}>{qrCode}</div>

            <Text style={{ ...muted, marginTop: 24 }}>
              Assim que o pagamento for confirmado, você recebe outro e-mail com o comprovante e
              nossa equipe começa a organizar sua viagem. Se tiver qualquer dúvida, é só responder
              este e-mail.
            </Text>
          </Section>
          <Section style={{ padding: '0 28px 28px 28px' }}>
            <Text style={{ color: '#9ca3af', fontSize: 12 }}>
              VIA AIR • Consultoria de viagens<br />
              Este código só pode ser pago uma vez. Após o vencimento, gere um novo pelo site.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PixQrCliente,
  subject: (d) => `Seu Pix VIA AIR — pedido #${d?.orderNumber ?? ''}`.trim(),
  displayName: 'Pix QR para cliente',
  previewData: {
    recipientName: 'Camila',
    orderNumber: 'VA25051248',
    valor: 12480,
    qrCode: '00020126360014BR.GOV.BCB.PIX0114+55419999999995204000053039865802BR5913VIA AIR TUR6009CURITIBA62070503***6304ABCD',
    expiraEmMin: 30,
  },
} satisfies TemplateEntry

export default PixQrCliente

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = {
  maxWidth: 640,
  margin: '0 auto',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  overflow: 'hidden' as const,
}
const brand = { background: '#0b2d67', padding: '14px 20px' }
const brandText = { color: '#fff', fontSize: 12, letterSpacing: 2, margin: 0, fontWeight: 700 as const }
const h1 = { color: '#0b2d67', fontSize: 24, margin: '0 0 8px 0' }
const muted = { color: '#4b5563', fontSize: 14, lineHeight: 1.55 }
const label = { color: '#0b2d67', fontSize: 13, fontWeight: 700 as const, margin: '20px 0 6px 0' }
const valueBox = {
  background: 'linear-gradient(135deg, #0b2d67 0%, #1e4ba0 100%)',
  borderRadius: 14,
  padding: '18px 22px',
  color: '#fff',
  margin: '20px 0',
}
const valueLabel = { fontSize: 12, opacity: 0.85, letterSpacing: 1, textTransform: 'uppercase' as const }
const valueBig = { fontSize: 34, fontWeight: 800 as const, margin: '4px 0' }
const codeBox = {
  background: '#f2f5fa',
  border: '1px dashed #b6c2d9',
  borderRadius: 10,
  padding: '12px 14px',
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#0b2d67',
  wordBreak: 'break-all' as const,
  lineHeight: 1.4,
}
