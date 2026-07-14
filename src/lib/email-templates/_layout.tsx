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
              <td style={{ textAlign: 'left' as const, verticalAlign: 'middle' as const }}>
                <Img src={LOGO_URL} alt="VIA AIR" width="140" height="42" style={brandLogo} />
              </td>
              <td style={{ textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
                <Text style={stepNum}>{stepNumber}</Text>
                <Text style={stepLbl}>{stepLabel}</Text>
              </td>
            </tr>
          </table>
        </Section>

        <Section style={divider} />

        {/* Main card */}
        <Section style={card}>{children}</Section>

        {/* Footer */}
        {darkFooter ? (
          <Section style={darkFooterStyle}>
            {footerMessage && <Text style={darkFooterMsg}>{footerMessage}</Text>}
            <Text style={darkFooterContact}>
              (44) 99951-4838 &nbsp;|&nbsp; comercial@voeair.com &nbsp;|&nbsp;{' '}
              <Link href="https://www.viaair.tur.br" style={darkFooterLink}>
                www.viaair.tur.br
              </Link>
            </Text>
          </Section>
        ) : (
          <Section style={lightFooter}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tr>
                <td style={{ width: '40px', verticalAlign: 'middle' as const }}>
                  <div style={helpBadge}>?</div>
                </td>
                <td style={{ verticalAlign: 'middle' as const, paddingLeft: '12px' }}>
                  <Text style={lightFooterMsg}>
                    {footerMessage || 'Dúvidas? Estamos à disposição!'}
                  </Text>
                  <Text style={lightFooterContact}>
                    <span style={{ color: '#0f172a' }}>📞</span>&nbsp;(44) 99951-4838
                    &nbsp;&nbsp;|&nbsp;&nbsp;
                    <span style={{ color: '#0f172a' }}>✉</span>&nbsp;comercial@voeair.com
                    &nbsp;&nbsp;|&nbsp;&nbsp;
                    <span style={{ color: '#0f172a' }}>🌐</span>&nbsp;
                    <Link href="https://www.viaair.tur.br" style={lightFooterLink}>
                      www.viaair.tur.br
                    </Link>
                  </Text>
                </td>
              </tr>
            </table>

          </Section>
        )}

        {/* Brand strip */}
        <Section style={brandStrip}>
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tr>
              <td style={{ width: '160px', verticalAlign: 'middle' as const, paddingRight: '16px', borderRight: '1px solid #1e293b' }}>
                <Img src={LOGO_URL} alt="VIA AIR" width="120" height="36" style={{ display: 'block' }} />
              </td>
              <td style={{ verticalAlign: 'middle' as const, paddingLeft: '20px' }}>
                <Text style={brandStripText}>
                  Conectando destinos, <span style={{ color: '#F26B1F', fontWeight: 'bold' }}>realizando sonhos.</span> <span style={{ color: '#F26B1F' }}>♡</span>
                </Text>
              </td>
            </tr>
          </table>
        </Section>
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
const headerRow = { padding: '24px 32px 16px' }
const brandLogo = { display: 'block', margin: 0 }
const divider = { borderTop: '1px solid #F26B1F', margin: '0 32px' }
const stepNum = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0f172a', margin: 0, textAlign: 'right' as const }
const stepLbl = { fontSize: '10px', color: '#0f172a', margin: 0, letterSpacing: '1.5px', fontWeight: 'bold' as const, textAlign: 'right' as const }
const card = { padding: '20px 32px 24px' }
const brandStrip = { backgroundColor: '#0f172a', padding: '18px 32px' }
const brandStripText = { color: '#ffffff', fontSize: '14px', margin: 0, lineHeight: '1.4' }

// Order summary box
const summaryBox = { backgroundColor: '#fafafa', border: '1px solid #eaeaea', borderRadius: '8px', padding: '20px', margin: '20px 0' }
const summaryTitle = { fontSize: '13px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 12px' }
const summaryCell = { verticalAlign: 'top' as const, padding: '0 8px', width: '33.33%' }
const summaryLabel = { fontSize: '11px', color: '#F26B1F', fontWeight: 'bold' as const, margin: '0 0 6px', letterSpacing: '0.5px' }
const summaryValue = { fontSize: '12px', color: '#475569', margin: '0 0 4px', lineHeight: '1.4' }

// Light footer
const lightFooter = { backgroundColor: '#f1f5f9', padding: '20px 32px', margin: '0 32px 20px', borderRadius: '10px' }
const helpBadge = { width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #0f172a', color: '#0f172a', fontSize: '18px', fontWeight: 'bold' as const, textAlign: 'center' as const, lineHeight: '28px', display: 'inline-block' }
const lightFooterMsg = { fontSize: '14px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 6px' }
const lightFooterContact = { fontSize: '12px', color: '#475569', margin: 0 }
const lightFooterLink = { color: '#475569', textDecoration: 'none' }

// Dark footer (for confirmations)
const darkFooterStyle = { backgroundColor: '#0f172a', padding: '20px 32px', textAlign: 'center' as const }
const darkFooterMsg = { color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, margin: '0 0 8px', letterSpacing: '1px' }
const darkFooterContact = { color: '#cbd5e1', fontSize: '11px', margin: 0 }
const darkFooterLink = { color: '#cbd5e1', textDecoration: 'underline' }

// Reusable content styles for templates
export const styles = {
  h1: { fontSize: '32px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 4px', lineHeight: '1.15' },
  h1Accent: { fontSize: '32px', fontWeight: 'bold' as const, color: '#F26B1F', margin: '0 0 20px', lineHeight: '1.15' },
  idBadge: { display: 'inline-block', backgroundColor: '#f1f5f9', color: '#0f172a', fontSize: '13px', fontWeight: 'bold' as const, padding: '10px 16px', borderRadius: '8px', margin: '20px 0 0', letterSpacing: '0.5px' },
  idBadgeAccent: { color: '#F26B1F', fontWeight: 'bold' as const },
  greeting: { fontSize: '15px', color: '#0f172a', fontWeight: 'bold' as const, margin: '0 0 10px' },
  text: { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 12px' },
  strong: { color: '#F26B1F', fontWeight: 'bold' as const },
}

