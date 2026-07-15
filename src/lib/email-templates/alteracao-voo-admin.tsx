import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  orderNumber?: string
  customerName?: string
  route?: string
  flightNumber?: string
  oldDepart?: string
  newDepart?: string
  oldArrive?: string
  newArrive?: string
  status?: string
  severityLabel?: string
  reservationCode?: string
  customerPhone?: string
}

const AlteracaoVooAdmin = ({
  orderNumber = '—',
  customerName = 'Cliente',
  route = '—',
  flightNumber = '—',
  oldDepart = '—',
  newDepart = '—',
  oldArrive,
  newArrive,
  status,
  severityLabel = 'Alteração detectada',
  reservationCode,
  customerPhone,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`${severityLabel} — voo ${flightNumber} do pedido #${orderNumber}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brand}>
          <Text style={brandText}>VIA AIR • ROBÔ DE VOOS</Text>
        </Section>
        <Heading style={h1}>{severityLabel}</Heading>
        <Text style={lead}>
          Detectamos uma alteração em um voo monitorado. O cliente já foi notificado
          automaticamente via WhatsApp.
        </Text>

        <Section style={card}>
          <Row label="Pedido" value={`#${orderNumber}`} />
          <Row label="Cliente" value={customerName} />
          {customerPhone ? <Row label="Telefone" value={customerPhone} /> : null}
          {reservationCode ? <Row label="Localizador" value={reservationCode} /> : null}
          <Row label="Voo" value={flightNumber} />
          <Row label="Rota" value={route} />
          {status ? <Row label="Status" value={status} /> : null}
        </Section>

        <Section style={diffCard}>
          <Text style={diffTitle}>⏰ Partida</Text>
          <Text style={diffOld}>Antes: {oldDepart}</Text>
          <Text style={diffNew}>Agora: {newDepart}</Text>
          {oldArrive || newArrive ? (
            <>
              <Text style={{ ...diffTitle, marginTop: '12px' }}>🛬 Chegada</Text>
              <Text style={diffOld}>Antes: {oldArrive || '—'}</Text>
              <Text style={diffNew}>Agora: {newArrive || '—'}</Text>
            </>
          ) : null}
        </Section>

        <Text style={footer}>
          Aviso automático — verifique o pedido no painel Admin › Pedidos.
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ marginBottom: '6px' }}>
    <tr>
      <td style={rowLabel}>{label}</td>
      <td style={rowValue}>{value}</td>
    </tr>
  </table>
)

const main: React.CSSProperties = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0 }
const container: React.CSSProperties = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const brand: React.CSSProperties = { marginBottom: '16px' }
const brandText: React.CSSProperties = { color: '#F26B1F', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', margin: 0 }
const h1: React.CSSProperties = { color: '#0f172a', fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }
const lead: React.CSSProperties = { color: '#475569', fontSize: '14px', lineHeight: '20px', margin: '0 0 20px' }
const card: React.CSSProperties = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }
const rowLabel: React.CSSProperties = { color: '#64748b', fontSize: '12px', padding: '4px 8px 4px 0', width: '35%', verticalAlign: 'top' }
const rowValue: React.CSSProperties = { color: '#0f172a', fontSize: '13px', fontWeight: 600, padding: '4px 0' }
const diffCard: React.CSSProperties = { border: '1px solid #F26B1F33', borderRadius: '12px', padding: '16px', marginBottom: '20px' }
const diffTitle: React.CSSProperties = { color: '#F26B1F', fontSize: '13px', fontWeight: 700, margin: '0 0 6px' }
const diffOld: React.CSSProperties = { color: '#94a3b8', fontSize: '13px', textDecoration: 'line-through', margin: '0 0 2px' }
const diffNew: React.CSSProperties = { color: '#0f172a', fontSize: '14px', fontWeight: 700, margin: '0 0 2px' }
const footer: React.CSSProperties = { color: '#94a3b8', fontSize: '12px', textAlign: 'center', margin: '16px 0 0' }

export const template = {
  component: AlteracaoVooAdmin,
  subject: (data: Record<string, any>) =>
    `${data.severityLabel ?? 'Alteração de voo'} — pedido #${data.orderNumber ?? '—'}`,
  displayName: 'Aviso interno: alteração de voo',
  previewData: {
    orderNumber: '20260714000012',
    customerName: 'Lucas Rocha',
    route: 'Maringá (MGF) → São Paulo (CGH)',
    flightNumber: 'LA3918',
    oldDepart: 'quarta, 03/06/2026 12:15',
    newDepart: 'quarta, 03/06/2026 15:00',
    oldArrive: 'quarta, 03/06/2026 13:10',
    newArrive: 'quarta, 03/06/2026 16:00',
    status: 'Rescheduled',
    severityLabel: 'Alteração significativa (> 30min)',
    reservationCode: 'OACFWW',
    customerPhone: '5544999093642',
  },
} satisfies TemplateEntry
