import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail na {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>VIA AIR</Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>Confirme seu e-mail</Heading>
          <Text style={text}>
            Bem-vindo à{' '}
            <Link href={siteUrl} style={link}>
              <strong>{siteName}</strong>
            </Link>
            ! Confirme seu endereço de e-mail ({recipient}) clicando no botão abaixo:
          </Text>
          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button style={button} href={confirmationUrl}>
              Confirmar e-mail
            </Button>
          </Section>
          <Text style={footer}>
            Se você não criou uma conta, pode ignorar este e-mail com segurança.
          </Text>
        </Section>
        <Text style={legal}>
          © {new Date().getFullYear()} VIA AIR · Agência de viagens
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0f172a',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const link = { color: '#F26B1F', textDecoration: 'underline' }
const button = {
  backgroundColor: '#F26B1F',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '999px',
  padding: '12px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '20px 0 0', lineHeight: '1.5' }
const legal = { fontSize: '11px', color: '#94a3b8', textAlign: 'center' as const, margin: '20px 0 0' }
