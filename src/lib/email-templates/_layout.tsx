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
import planeAsset from '@/assets/icons/plane.png.asset.json'
import hotelAsset from '@/assets/icons/hotel.png.asset.json'
import briefcaseAsset from '@/assets/icons/briefcase.png.asset.json'
import phoneAsset from '@/assets/icons/phone.png.asset.json'
import mailAsset from '@/assets/icons/mail.png.asset.json'
import globeAsset from '@/assets/icons/globe.png.asset.json'
import docAsset from '@/assets/icons/doc.png.asset.json'

const APP_BASE_URL = 'https://pedidos.viaair.tur.br'
const abs = (u: string) => (u.startsWith('http') ? u : `${APP_BASE_URL}${u}`)
const LOGO_URL = abs(logoAsset.url)
export const ICONS = {
  plane: abs(planeAsset.url),
  hotel: abs(hotelAsset.url),
  briefcase: abs(briefcaseAsset.url),
  phone: abs(phoneAsset.url),
  mail: abs(mailAsset.url),
  globe: abs(globeAsset.url),
  doc: abs(docAsset.url),
}

// Real company contacts
export const CONTACTS = {
  phone: '(44) 99951-4838',
  email: 'comercial@voeair.com',
  site: 'www.viaair.tur.br',
  siteUrl: 'https://www.viaair.tur.br',
}

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
        {/* Header: brand + step badge */}
        <Section style={headerRow}>
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tr>
              <td style={{ textAlign: 'left' as const, verticalAlign: 'middle' as const }}>
                <Img src={LOGO_URL} alt="VIA AIR" width="150" height="45" style={brandLogo} />
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

        {/* Footer contact */}
        {darkFooter ? (
          <Section style={darkFooterStyle}>
            {footerMessage && <Text style={darkFooterMsg}>{footerMessage}</Text>}
            <Text style={darkFooterContact}>
              {CONTACTS.phone} &nbsp;|&nbsp; {CONTACTS.email} &nbsp;|&nbsp;{' '}
              <Link href={CONTACTS.siteUrl} style={darkFooterLink}>{CONTACTS.site}</Link>
            </Text>
          </Section>
        ) : (
          <Section style={lightFooter}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tr>
                <td style={{ width: '48px', verticalAlign: 'middle' as const }}>
                  <div style={helpBadge}>?</div>
                </td>
                <td style={{ verticalAlign: 'middle' as const, paddingLeft: '14px' }}>
                  <Text style={lightFooterMsg}>
                    {footerMessage || 'Dúvidas? Estamos à disposição!'}
                  </Text>
                  <table cellPadding={0} cellSpacing={0} role="presentation">
                    <tr>
                      <td style={contactCell}>
                        <Img src={ICONS.phone} alt="" width="14" height="14" style={contactIcon} />
                        <span style={contactText}>{CONTACTS.phone}</span>
                      </td>
                      <td style={contactSep}>|</td>
                      <td style={contactCell}>
                        <Img src={ICONS.mail} alt="" width="14" height="14" style={contactIcon} />
                        <span style={contactText}>{CONTACTS.email}</span>
                      </td>
                      <td style={contactSep}>|</td>
                      <td style={contactCell}>
                        <Img src={ICONS.globe} alt="" width="14" height="14" style={contactIcon} />
                        <Link href={CONTACTS.siteUrl} style={contactText}>{CONTACTS.site}</Link>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </Section>
        )}

        {/* Brand strip */}
        <Section style={brandStrip}>
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tr>
              <td style={{ width: '170px', verticalAlign: 'middle' as const, paddingRight: '16px', borderRight: '1px solid #1e293b' }}>
                <Img src={LOGO_URL} alt="VIA AIR" width="130" height="38" style={{ display: 'block' }} />
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

// Order summary (Aéreo / Hotel / Serviço) — line icons, editable via props
interface OrderSummaryProps {
  title?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
}

export const OrderSummary = ({ title = 'O que está incluso no seu pedido:', aereo, hotel, servico }: OrderSummaryProps) => {
  const cells: React.ReactNode[] = []
  if (aereo) {
    cells.push(
      <td key="a" style={summaryCell}>
        <Text style={summaryLabel}>
          <Img src={ICONS.plane} alt="" width="20" height="20" style={summaryIconImg} />
          <span style={summaryLabelText}>AÉREO</span>
        </Text>
        <Text style={summaryValueStrong}>{aereo.origem}</Text>
        <Text style={summaryValueStrong}>→ {aereo.destino}</Text>
        <Text style={summaryValue}>{aereo.datas}</Text>
      </td>
    )
  }
  if (hotel) {
    cells.push(
      <td key="h" style={summaryCell}>
        <Text style={summaryLabel}>
          <Img src={ICONS.hotel} alt="" width="20" height="20" style={summaryIconImg} />
          <span style={summaryLabelText}>HOTEL</span>
        </Text>
        <Text style={summaryValueStrong}>{hotel.nome}</Text>
        <Text style={summaryValue}>{hotel.noites}</Text>
        <Text style={summaryValue}>{hotel.datas}</Text>
        {hotel.categoria && <Text style={summaryValue}>{hotel.categoria}</Text>}
      </td>
    )
  }
  if (servico && servico.length > 0) {
    cells.push(
      <td key="s" style={summaryCell}>
        <Text style={summaryLabel}>
          <Img src={ICONS.briefcase} alt="" width="20" height="20" style={summaryIconImg} />
          <span style={summaryLabelText}>SERVIÇO</span>
        </Text>
        {servico.map((s, i) => (
          <Text key={i} style={summaryValue}>{s}</Text>
        ))}
      </td>
    )
  }
  if (cells.length === 0) return null
  const withDividers: React.ReactNode[] = []
  cells.forEach((c, i) => {
    if (i > 0) withDividers.push(<td key={`d${i}`} style={summaryDivider} />)
    withDividers.push(c)
  })
  return (
    <Section style={summaryBox}>
      <Text style={summaryTitle}>{title}</Text>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>{withDividers}</tr>
      </table>
    </Section>
  )
}

// ---------- Styles ----------
const main = { backgroundColor: '#f5f5f5', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", margin: 0, padding: '20px 0' }
const container = { padding: '0', maxWidth: '640px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' as const, border: '1px solid #eaeaea' }
const headerRow = { padding: '28px 36px 18px' }
const brandLogo = { display: 'block', margin: 0 }
const divider = { borderTop: '1px solid #F26B1F', margin: '0 36px' }
const stepNum = { fontSize: '26px', fontWeight: 'bold' as const, color: '#0f1b3d', margin: 0, textAlign: 'right' as const, lineHeight: '1' }
const stepLbl = { fontSize: '10px', color: '#0f1b3d', margin: '4px 0 0', letterSpacing: '1.8px', fontWeight: 'bold' as const, textAlign: 'right' as const }
const card = { padding: '24px 36px 28px' }
const brandStrip = { backgroundColor: '#0f1b3d', padding: '18px 36px' }
const brandStripText = { color: '#ffffff', fontSize: '14px', margin: 0, lineHeight: '1.4' }

// Order summary
const summaryBox = { padding: '22px 0 8px', margin: '24px 0 0', borderTop: '1px solid #eaeaea' }
const summaryTitle = { fontSize: '15px', color: '#0f1b3d', fontWeight: 'bold' as const, margin: '0 0 18px' }
const summaryCell = { verticalAlign: 'top' as const, padding: '0 14px', width: '32%' }
const summaryDivider = { width: '1px', backgroundColor: '#e2e8f0', padding: 0 }
const summaryLabel = { fontSize: '12px', color: '#0f1b3d', fontWeight: 'bold' as const, margin: '0 0 12px', letterSpacing: '1px', lineHeight: '20px' }
const summaryIconImg = { display: 'inline-block', verticalAlign: 'middle' as const, marginRight: '8px' }
const summaryLabelText = { verticalAlign: 'middle' as const }
const summaryValueStrong = { fontSize: '13px', color: '#0f1b3d', margin: '0 0 3px', lineHeight: '1.5', fontWeight: 'bold' as const }
const summaryValue = { fontSize: '13px', color: '#475569', margin: '0 0 4px', lineHeight: '1.5' }

// Light footer
const lightFooter = { backgroundColor: '#eef2f7', padding: '18px 24px', margin: '0 36px 22px', borderRadius: '12px' }
const helpBadge = { width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #0f1b3d', color: '#0f1b3d', fontSize: '20px', fontWeight: 'bold' as const, textAlign: 'center' as const, lineHeight: '32px', display: 'inline-block' }
const lightFooterMsg = { fontSize: '14px', color: '#0f1b3d', fontWeight: 'bold' as const, margin: '0 0 6px' }
const contactCell = { verticalAlign: 'middle' as const, padding: '0', whiteSpace: 'nowrap' as const }
const contactSep = { color: '#cbd5e1', padding: '0 10px', fontSize: '12px', verticalAlign: 'middle' as const }
const contactIcon = { display: 'inline-block', verticalAlign: 'middle' as const, marginRight: '6px' }
const contactText = { fontSize: '12px', color: '#0f1b3d', textDecoration: 'none', verticalAlign: 'middle' as const }

// Dark footer
const darkFooterStyle = { backgroundColor: '#0f1b3d', padding: '20px 32px', textAlign: 'center' as const }
const darkFooterMsg = { color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, margin: '0 0 8px', letterSpacing: '1px' }
const darkFooterContact = { color: '#cbd5e1', fontSize: '12px', margin: 0 }
const darkFooterLink = { color: '#cbd5e1', textDecoration: 'underline' }

// Reusable content styles
export const styles = {
  h1: { fontSize: '38px', fontWeight: 'bold' as const, color: '#0f1b3d', margin: '0 0 4px', lineHeight: '1.1', letterSpacing: '-0.5px' },
  h1Accent: { fontSize: '38px', fontWeight: 'bold' as const, color: '#F26B1F', margin: '0 0 24px', lineHeight: '1.1', letterSpacing: '-0.5px' },
  idBadge: { display: 'inline-block', backgroundColor: '#eef2f7', color: '#0f1b3d', fontSize: '14px', fontWeight: 'bold' as const, padding: '12px 18px', borderRadius: '10px', margin: '24px 0 0', letterSpacing: '0.5px' },
  idBadgeAccent: { color: '#F26B1F', fontWeight: 'bold' as const },
  greeting: { fontSize: '16px', color: '#0f1b3d', fontWeight: 'bold' as const, margin: '0 0 12px' },
  text: { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 12px' },
  strong: { color: '#F26B1F', fontWeight: 'bold' as const },
}
