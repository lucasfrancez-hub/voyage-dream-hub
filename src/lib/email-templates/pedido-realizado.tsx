import * as React from 'react'
import type { TemplateEntry } from './registry'
import { EmailLayout, OrderSummary } from './_layout'

interface Props {
  recipientName?: string
  orderId?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
}

export const PedidoRealizado = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
  aereo,
  hotel,
  servico,
}: Props) => (
  <EmailLayout
    preview="Recebemos seu pedido com sucesso!"
    stepNumber="01"
    stepLabel="PEDIDO REALIZADO"
  >
    {/* HERO */}
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        <td style={{ padding: '28px 46px 34px 46px' }}>
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
            <tr>
              <td width="60%" valign="top" style={{ paddingRight: 24 }}>
                <div style={{ fontSize: 41, lineHeight: 1.08, fontWeight: 700, color: '#0b2d67' }}>
                  Pedido realizado<br />
                  <span style={{ color: '#ff6900' }}>com sucesso!</span>
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, marginTop: 34, color: '#0b2d67' }}>
                  Olá, {recipientName}!
                </div>
                <div style={{ fontSize: 17, lineHeight: 1.55, color: '#1d2633', marginTop: 18 }}>
                  Recebemos o seu pedido com sucesso.<br />
                  Em breve nossa equipe entrará em contato<br />
                  para dar continuidade.
                </div>
                <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ marginTop: 34, background: '#f2f5fa', borderRadius: 12 }}>
                  <tr>
                    <td style={{ padding: '18px 24px', fontSize: 17, fontWeight: 700, color: '#0b2d67' }}>
                      ID DO PEDIDO:{' '}
                      <span style={{ color: '#ff6900' }}>#{orderId}</span>
                    </td>
                  </tr>
                </table>
              </td>
              <td width="40%" align="center" valign="middle">
                {/* Clipboard icon drawn in CSS */}
                <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                  <tr>
                    <td align="center">
                      <div style={{ width: 150, height: 170, border: '7px solid #0b2d67', borderRadius: 14, position: 'relative' as const, boxSizing: 'border-box' as const }}>
                        <div style={{ width: 64, height: 26, border: '7px solid #0b2d67', borderBottom: 0, borderRadius: '14px 14px 0 0', position: 'absolute' as const, left: 36, top: -30, background: '#fff' }} />
                        <div style={{ width: 72, height: 6, background: '#0b2d67', position: 'absolute' as const, left: 33, top: 48, borderRadius: 5 }} />
                        <div style={{ width: 58, height: 6, background: '#0b2d67', position: 'absolute' as const, left: 33, top: 86, borderRadius: 5 }} />
                        <div style={{ width: 50, height: 6, background: '#0b2d67', position: 'absolute' as const, left: 33, top: 124, borderRadius: 5 }} />
                        <div style={{ width: 84, height: 84, border: '7px solid #ff6900', borderRadius: '50%', position: 'absolute' as const, right: -46, bottom: 10, background: '#fff' }}>
                          <div style={{ width: 42, height: 22, borderLeft: '7px solid #ff6900', borderBottom: '7px solid #ff6900', transform: 'rotate(-45deg)', position: 'absolute' as const, left: 19, top: 23 }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <OrderSummary aereo={aereo} hotel={hotel} servico={servico} />
  </EmailLayout>
)

export default PedidoRealizado

export const template = {
  component: PedidoRealizado,
  subject: (data) => `Pedido realizado com sucesso! #${data?.orderId ?? ''}`.trim(),
  displayName: 'Pedido realizado',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
    aereo: { origem: 'São Paulo (GRU)', destino: 'Paris (CDG)', datas: '10/08/2025 – 20/08/2025' },
    hotel: { nome: 'Hotel Louvre Saint-Honoré', noites: '10 noites', datas: '10/08/2025 – 20/08/2025', categoria: '4 estrelas' },
    servico: ['Transfer aeroporto ⇄ hotel', 'City tour em Paris'],
  },
} satisfies TemplateEntry
