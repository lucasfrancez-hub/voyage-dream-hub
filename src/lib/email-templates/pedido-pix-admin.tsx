import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  orderNumber?: string
  productKind?: string
  productTitle?: string
  adults?: number
  children?: number
  totalPrice?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  notes?: string
}

const PedidoPixAdmin = ({
  orderNumber = '—',
  productKind = 'Pacote',
  productTitle = '—',
  adults = 1,
  children = 0,
  totalPrice = '—',
  customerName = '—',
  customerEmail = '—',
  customerPhone = '—',
  notes,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`Novo pedido via Pix — #${orderNumber}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brand}>
          <Text style={brandText}>VIA AIR • NOVO PEDIDO PIX</Text>
        </Section>
        <Section style={{ padding: '24px 28px' }}>
          <Heading style={h1}>Novo pedido via Pix recebido</Heading>
          <Text style={muted}>
            Pedido <strong style={{ color: '#0b2d67' }}>#{orderNumber}</strong> aguardando emissão do
            Pix e envio ao cliente.
          </Text>
          <div style={box}>
            <Row label="Tipo" value={productKind} />
            <Row label="Produto" value={productTitle} />
            <Row
              label="Viajantes"
              value={`${adults} adulto${adults > 1 ? 's' : ''}${
                children ? ` + ${children} criança${children > 1 ? 's' : ''}` : ''
              }`}
            />
            <Row label="Total" value={totalPrice} />
          </div>
          <Heading style={h2}>Cliente</Heading>
          <div style={box}>
            <Row label="Nome" value={customerName} />
            <Row label="E-mail" value={customerEmail} />
            <Row label="Telefone" value={customerPhone} />
          </div>
          {notes && (
            <>
              <Heading style={h2}>Observações</Heading>
              <Text style={{ ...muted, whiteSpace: 'pre-wrap' as const }}>{notes}</Text>
            </>
          )}
        </Section>
      </Container>
    </Body>
  </Html>
)

function Row({ label, value }: { label: string; value: string }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        <td style={{ padding: '6px 0', color: '#4b5563', fontSize: 13, width: 120 }}>{label}</td>
        <td style={{ padding: '6px 0', color: '#0b2d67', fontSize: 14, fontWeight: 600 }}>{value}</td>
      </tr>
    </table>
  )
}

export const template = {
  component: PedidoPixAdmin,
  subject: (d) => `Novo pedido via Pix #${d?.orderNumber ?? ''}`.trim(),
  displayName: 'Pedido via Pix (admin)',
  previewData: {
    orderNumber: 'VA25051248',
    productKind: 'Pacote',
    productTitle: 'Paris Encantadora 10 noites',
    adults: 2,
    children: 0,
    totalPrice: 'R$ 12.480,00',
    customerName: 'Camila Souza',
    customerEmail: 'camila@example.com',
    customerPhone: '+55 41 99999-9999',
  },
} satisfies TemplateEntry

export default PedidoPixAdmin

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: 640, margin: '0 auto', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' as const }
const brand = { background: '#0b2d67', padding: '14px 20px' }
const brandText = { color: '#fff', fontSize: 12, letterSpacing: 2, margin: 0, fontWeight: 700 }
const h1 = { color: '#0b2d67', fontSize: 22, margin: '4px 0 8px 0' }
const h2 = { color: '#0b2d67', fontSize: 15, margin: '18px 0 6px 0' }
const muted = { color: '#4b5563', fontSize: 14, lineHeight: 1.55 }
const box = { background: '#f2f5fa', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', marginTop: 6 }
