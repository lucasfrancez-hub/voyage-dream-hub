import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import logoAsset from '@/assets/viaair-logo.png.asset.json'

const APP_BASE_URL = 'https://pedidos.viaair.tur.br'
const LOGO_URL = logoAsset.url.startsWith('http') ? logoAsset.url : `${APP_BASE_URL}${logoAsset.url}`

interface LayoutProps {
  preview: string
  stepNumber: string
  stepLabel: string
  children: React.ReactNode
  darkFooter?: boolean
  footerMessage?: string
}

export const EmailLayout = ({
  preview,
  stepNumber,
  stepLabel,
  children,
  darkFooter = false,
  footerMessage,
}: LayoutProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with brand + step badge */}
        <Section style={headerRow}>
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tr>
              <td style={{ textAlign: 'left' as const }}>
                <Text style={brand}>
                  <span style={planeIcon}>✈</span> VIA AIR
                </Text>
              </td>
              <td style={{ textAlign: 'right' as const }}>
                <Text style={stepNum}>{stepNumber}</Text>
                <Text style={stepLbl}>{stepLabel}</Text>
              </td>
            </tr>
          </table>
        </Section>

        {/* Main card */}
        <Section style={card}>{children}</Section>

        {/* Footer */}
        {darkFooter ? (
          <Section style={darkFooterStyle}>
            {footerMessage && <Text style={darkFooterMsg}>{footerMessage}</Text>}
            <Text style={darkFooterContact}>
              (11) 98765-4321 &nbsp;|&nbsp; atendimento@viaair.tur.br &nbsp;|&nbsp;{' '}
              <Link href="https://www.viaair.tur.br" style={darkFooterLink}>
                www.viaair.tur.br
              </Link>
            </Text>
          </Section>
        ) : (
          <Section style={lightFooter}>
            <Text style={lightFooterMsg}>
              <span style={{ color: '#F26B1F' }}>?</span>&nbsp;
              {footerMessage || 'Dúvidas? Estamos à disposição!'}
            </Text>
            <Text style={lightFooterContact}>
              (11) 98765-4321 &nbsp;|&nbsp; atendimento@viaair.tur.br &nbsp;|&nbsp;{' '}
              <Link href="https://www.viaair.tur.br" style={lightFooterLink}>
                www.viaair.tur.br
              </Link>
            </Text>
          </Section>
        )}
      </Container>
    </Body>
  </Html>
)

// Section for order details (Aéreo / Hotel / Serviço)
interface OrderSummaryProps {
  title?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
}

export const OrderSummary = ({ title = 'O que está incluso no seu pedido:', aereo, hotel, servico }: OrderSummaryProps) => (
  <Section style={summaryBox}>
    <Text style={summaryTitle}>{title}</Text>
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
      <tr>
        {aereo && (
          <td style={summaryCell}>
            <Text style={summaryLabel}>✈ AÉREO</Text>
            <Text style={summaryValue}>
              {aereo.origem} → {aereo.destino}
            </Text>
            <Text style={summaryValue}>{aereo.datas}</Text>
          </td>
        )}
        {hotel && (
          <td style={summaryCell}>
            <Text style={summaryLabel}>🏨 HOTEL</Text>
            <Text style={summaryValue}>{hotel.nome}</Text>
            <Text style={summaryValue}>
              {hotel.noites} | {hotel.datas}
            </Text>
            {hotel.categoria && <Text style={summaryValue}>{hotel.categoria}</Text>}
          </td>
        )}
        {servico && servico.length > 0 && (
          <td style={summaryCell}>
            <Text style={summaryLabel}>🧳 SERVIÇO</Text>
            {servico.map((s, i) => (
              <Text key={i} style={summaryValue}>
                {s}
              </Text>
            ))}
          </td>
        )}
      </tr>
    </table>
  </Section>
)

// Shared styles
const main = { backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif', margin: 0, padding: '20px 0' }
const container = { padding: '0', maxWidth: '640px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' as const, border: '1px solid #eaeaea' }
const headerRow = { padding: '24px 32px 8px' }
const brand = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0f172a', margin: 0, letterSpacing: '1px' }
const planeIcon = { color: '#F26B1F', marginRight: '6px' }
const stepNum = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0f172a', margin: 0, textAlign: 'right' as const }
const stepLbl = { fontSize: '10px', color: '#F26B1F', margin: 0, letterSpacing: '1.5px', fontWeight: 'bold' as const, textAlign: 'right' as const }
const card = { padding: '16px 32px 24px' }

// Order summary box
const summaryBox = { backgroundColor: '#fafafa', border: '1px solid #eaeaea', borderRadius: '8px', padding: '20px', margin: '20px 0' }
const summaryTitle = { fontSize: '13px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 12px' }
const summaryCell = { verticalAlign: 'top' as const, padding: '0 8px', width: '33.33%' }
const summaryLabel = { fontSize: '11px', color: '#F26B1F', fontWeight: 'bold' as const, margin: '0 0 6px', letterSpacing: '0.5px' }
const summaryValue = { fontSize: '12px', color: '#475569', margin: '0 0 4px', lineHeight: '1.4' }

// Light footer
const lightFooter = { borderTop: '1px solid #eaeaea', padding: '16px 32px 20px' }
const lightFooterMsg = { fontSize: '13px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 6px' }
const lightFooterContact = { fontSize: '11px', color: '#94a3b8', margin: 0 }
const lightFooterLink = { color: '#94a3b8', textDecoration: 'underline' }

// Dark footer (for confirmations)
const darkFooterStyle = { backgroundColor: '#0f172a', padding: '20px 32px', textAlign: 'center' as const }
const darkFooterMsg = { color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, margin: '0 0 8px', letterSpacing: '1px' }
const darkFooterContact = { color: '#cbd5e1', fontSize: '11px', margin: 0 }
const darkFooterLink = { color: '#cbd5e1', textDecoration: 'underline' }

// Reusable content styles for templates
export const styles = {
  h1: { fontSize: '28px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 4px', lineHeight: '1.2' },
  h1Accent: { fontSize: '28px', fontWeight: 'normal' as const, color: '#F26B1F', margin: '0 0 16px', lineHeight: '1.2' },
  idBadge: { display: 'inline-block', backgroundColor: '#fff4ec', color: '#F26B1F', fontSize: '11px', fontWeight: 'bold' as const, padding: '6px 12px', borderRadius: '4px', margin: '0 0 20px', letterSpacing: '0.5px' },
  greeting: { fontSize: '15px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 8px' },
  text: { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 12px' },
  strong: { color: '#F26B1F', fontWeight: 'bold' as const },
}
