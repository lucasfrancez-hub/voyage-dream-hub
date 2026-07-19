import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  flightNumber?: string
  boardingPassUrl?: string
  orderNumber?: string
}

const Email = ({ name, flightNumber, boardingPassUrl, orderNumber }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu cartão de embarque está pronto ✈️</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>✈️ Check-in feito!</Heading>
        <Text style={p}>Olá{ name ? `, ${name}` : '' }! Fizemos seu check-in {flightNumber ? `no voo ${flightNumber} ` : ''}e seu cartão de embarque já está disponível.</Text>
        <Section style={{ textAlign: 'center', marginTop: 24, marginBottom: 24 }}>
          <Button href={boardingPassUrl || '#'} style={btn}>Baixar cartão de embarque (PDF)</Button>
        </Section>
        <Text style={small}>Sugerimos chegar ao aeroporto com pelo menos 2 horas de antecedência para voos nacionais e 3 horas para internacionais.</Text>
        {orderNumber && <Text style={small}>Pedido #{orderNumber}</Text>}
        <Text style={small}>Boa viagem! 💛<br/>Equipe VIA AIR</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, unknown>) => `✈️ Cartão de embarque ${d.flightNumber || ''}`.trim(),
  displayName: 'Cartão de embarque',
  previewData: { name: 'João', flightNumber: 'LA3456', boardingPassUrl: 'https://example.com/pass.pdf', orderNumber: '12345678' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: 560 }
const h1 = { color: '#F26B1F', fontSize: 24, marginBottom: 16 }
const p = { fontSize: 15, lineHeight: '22px', color: '#111' }
const small = { fontSize: 13, color: '#555', lineHeight: '20px' }
const btn = { backgroundColor: '#F26B1F', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }
