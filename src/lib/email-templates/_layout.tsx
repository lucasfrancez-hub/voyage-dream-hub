import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
} from '@react-email/components'
import logoAsset from '@/assets/viaair-logo.png.asset.json'

const APP_BASE_URL = 'https://pedidos.viaair.tur.br'
const abs = (u: string) => (u.startsWith('http') ? u : `${APP_BASE_URL}${u}`)
export const LOGO_URL = abs(logoAsset.url)

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
  footerMessage?: string
  /** @deprecated kept for compatibility with older templates */
  darkFooter?: boolean
}

export const EmailLayout = ({
  preview,
  stepNumber,
  stepLabel,
  children,
  footerMessage,
}: LayoutProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={{ margin: 0, padding: 0, background: '#f4f6f9', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0b2d67' }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ background: '#f4f6f9' }}>
        <tr>
          <td align="center" style={{ padding: '24px 10px' }}>
            <Container style={{ maxWidth: '760px', background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 4, overflow: 'hidden', boxShadow: '0 2px 10px rgba(11,45,103,.06)', padding: 0 }}>
              {/* HEADER */}
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
                <tr>
                  <td style={{ padding: '34px 36px 24px 36px' }}>
                    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
                      <tr>
                        <td valign="middle">
                          <Img src={LOGO_URL} alt="VIA AIR" width={160} height={48} style={{ display: 'block', margin: 0 }} />
                        </td>
                        <td align="right" valign="top">
                          <div style={{ fontSize: 25, fontWeight: 700, color: '#ff6900', lineHeight: 1 }}>{stepNumber}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0b2d67', letterSpacing: '.4px', marginTop: 5 }}>{stepLabel}</div>
                        </td>
                      </tr>
                    </table>
                    <div style={{ height: 2, background: '#ff6900', marginTop: 28 }} />
                  </td>
                </tr>

                {/* BODY */}
                <tr>
                  <td>{children}</td>
                </tr>

                {/* CONTACT BOX */}
                <tr>
                  <td style={{ padding: '0 46px 36px 46px' }}>
                    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ background: '#f2f5fa', borderRadius: 16 }}>
                      <tr>
                        <td width={76} align="center" style={{ padding: '22px 0 22px 18px' }}>
                          <div style={{ width: 42, height: 42, border: '3px solid #0b2d67', borderRadius: '50%', lineHeight: '36px', fontSize: 24, fontWeight: 700, color: '#0b2d67', textAlign: 'center' as const }}>?</div>
                        </td>
                        <td style={{ padding: '22px 22px 22px 10px' }}>
                          <div style={{ fontSize: 17, fontWeight: 700, color: '#0b2d67', marginBottom: 10 }}>
                            {footerMessage || 'Dúvidas? Estamos à disposição!'}
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1f2937' }}>
                            ☎ {CONTACTS.phone} &nbsp;&nbsp; | &nbsp;&nbsp;
                            ✉ {CONTACTS.email} &nbsp;&nbsp; | &nbsp;&nbsp;
                            ◉ <Link href={CONTACTS.siteUrl} style={{ color: '#1f2937', textDecoration: 'none' }}>{CONTACTS.site}</Link>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* FOOTER STRIP */}
                <tr>
                  <td style={{ background: '#06265d', padding: '28px 46px', textAlign: 'center' as const }}>
                    <div style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, letterSpacing: '1px', marginBottom: 6 }}>VIA AIR</div>
                    <div style={{ color: '#ffffff', fontSize: 16 }}>
                      Conectando destinos,{' '}
                      <span style={{ color: '#ff6900', fontWeight: 700 }}>realizando sonhos.</span>{' '}
                      <span style={{ color: '#ff6900', fontSize: 20 }}>♡</span>
                    </div>
                  </td>
                </tr>
              </table>
            </Container>
          </td>
        </tr>
      </table>
    </Body>
  </Html>
)

// Order summary block (Aéreo / Hotel / Serviço) — all fields editable via props
interface OrderSummaryProps {
  title?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
}

export const OrderSummary = ({ title = 'O que está incluso no seu pedido:', aereo, hotel, servico }: OrderSummaryProps) => {
  const items: Array<{ key: string; icon: string; label: string; content: React.ReactNode }> = []
  if (aereo) {
    items.push({
      key: 'a', icon: '✈', label: 'AÉREO',
      content: (<>{aereo.origem}<br />→ {aereo.destino}<br />{aereo.datas}</>),
    })
  }
  if (hotel) {
    items.push({
      key: 'h', icon: '▦', label: 'HOTEL',
      content: (<>{hotel.nome}<br />{hotel.noites}<br />{hotel.datas}{hotel.categoria ? (<><br />Categoria: {hotel.categoria}</>) : null}</>),
    })
  }
  if (servico && servico.length > 0) {
    items.push({
      key: 's', icon: '◆', label: 'SERVIÇO',
      content: (<>{servico.map((s, i) => (<React.Fragment key={i}>{s}{i < servico.length - 1 ? <br /> : null}</React.Fragment>))}</>),
    })
  }
  if (items.length === 0) return null
  const colWidth = `${(100 / items.length).toFixed(2)}%`
  return (
    <>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tr><td style={{ height: 1, background: '#e5e7eb' }} /></tr>
      </table>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tr>
          <td style={{ padding: '34px 46px 38px 46px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0b2d67', marginBottom: 28 }}>{title}</div>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tr>
                {items.map((it, i) => {
                  const isLast = i === items.length - 1
                  const isFirst = i === 0
                  const padding = isFirst ? '0 22px 0 0' : isLast ? '0 0 0 22px' : '0 22px'
                  return (
                    <td key={it.key} width={colWidth} valign="top" style={{ padding, borderRight: isLast ? undefined : '1px solid #d9dde5' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0b2d67', marginBottom: 18 }}>{it.icon} &nbsp; {it.label}</div>
                      <div style={{ fontSize: 15, lineHeight: 1.65, color: '#222' }}>{it.content}</div>
                    </td>
                  )
                })}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </>
  )
}

export const styles = {
  h1: { fontSize: 41, lineHeight: 1.08, fontWeight: 700 as const, color: '#0b2d67', margin: '0 0 4px' },
  h1Accent: { fontSize: 41, lineHeight: 1.08, fontWeight: 700 as const, color: '#ff6900', margin: '0 0 24px' },
  greeting: { fontSize: 19, fontWeight: 700 as const, color: '#0b2d67', margin: '0 0 12px' },
  text: { fontSize: 17, lineHeight: 1.55, color: '#1d2633', margin: '0 0 12px' },
  idBadge: { display: 'inline-block' as const, background: '#f2f5fa', color: '#0b2d67', fontSize: 17, fontWeight: 700 as const, padding: '18px 24px', borderRadius: 12, margin: '24px 0 0' },
  idBadgeAccent: { color: '#ff6900', fontWeight: 700 as const },
  strong: { color: '#ff6900', fontWeight: 700 as const },
}
