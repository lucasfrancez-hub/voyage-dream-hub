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

interface LoginCodeEmailProps {
  code: string
  userAgent?: string
  requestedAt?: string
}

export const LoginCodeEmail = ({ code, userAgent, requestedAt }: LoginCodeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de acesso VIA AIR: {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>VIA AIR</Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>Código de verificação</Heading>
          <Text style={text}>
            Detectamos um novo login no painel. Digite o código abaixo para confirmar que é você. O
            código expira em <strong>10 minutos</strong>.
          </Text>
          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Text style={codeStyle}>{code}</Text>
          </Section>
          {(userAgent || requestedAt) && (
            <Text style={meta}>
              {requestedAt ? <>Solicitado em <strong>{requestedAt}</strong>.<br /></> : null}
              {userAgent ? <>Dispositivo: <span style={{ color: '#475569' }}>{userAgent}</span></> : null}
            </Text>
          )}
          <Text style={footer}>
            Se você não tentou entrar, ignore este e-mail e troque sua senha imediatamente.
          </Text>
        </Section>
        <Text style={legal}>© {new Date().getFullYear()} VIA AIR · Acesso restrito</Text>
      </Container>
    </Body>
  </Html>
)

export default LoginCodeEmail

export const template: TemplateEntry = {
  component: LoginCodeEmail,
  subject: (data) => `Código de acesso VIA AIR: ${data.code ?? ''}`.trim(),
  displayName: 'Código de login por e-mail',
  previewData: { code: '482913', userAgent: 'Chrome no macOS', requestedAt: 'agora' },
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, padding: '8px 0 20px' }
const brand = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  letterSpacing: '4px',
  color: '#F26B1F',
  margin: 0,
}
const card = {
  border: '1px solid #eaeaea',
  borderRadius: '12px',
  padding: '28px 24px',
  backgroundColor: '#ffffff',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const codeStyle = {
  display: 'inline-block',
  fontSize: '34px',
  letterSpacing: '10px',
  fontWeight: 'bold' as const,
  color: '#0f172a',
  backgroundColor: '#FFF4EC',
  border: '1px solid #F26B1F',
  borderRadius: '12px',
  padding: '14px 22px',
  fontFamily: 'monospace',
  margin: 0,
}
const meta = { fontSize: '12px', color: '#94a3b8', margin: '0 0 12px', lineHeight: '1.5' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '20px 0 0', lineHeight: '1.5' }
const legal = { fontSize: '11px', color: '#94a3b8', textAlign: 'center' as const, margin: '20px 0 0' }
