import * as React from 'react'
import type { TemplateEntry } from './registry'
import { EmailLayout, CONTACTS, styles } from './_layout'

interface Props {
  recipientName?: string
  orderId?: string
  aereo?: { origem: string; destino: string; datas: string }
  hotel?: { nome: string; noites: string; datas: string; categoria?: string }
  servico?: string[]
  prazoAnalise?: string
}

export const PagamentoAnalise = ({
  recipientName = 'Cliente',
  orderId = 'VA00000000',
  aereo,
  hotel,
  servico,
  prazoAnalise = 'em até 3h úteis',
}: Props) => {
  const servicos = servico && servico.length > 0 ? servico : []

  return (
    <EmailLayout
      preview="Seu pagamento está em análise pela nossa equipe."
      stepNumber="02"
      stepLabel="PAGAMENTO EM ANÁLISE"
      hideContactBox
    >
      {/* HERO */}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tr>
          <td style={{ padding: '28px 46px 30px 46px' }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tr>
                <td width="56%" valign="top" style={{ paddingRight: 22 }}>
                  <div style={{ fontSize: 41, lineHeight: 1.08, fontWeight: 700, color: '#0b2d67' }}>
                    Pagamento<br />
                    <span style={{ color: '#ff6900' }}>em análise</span>
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700, marginTop: 34, color: '#0b2d67' }}>
                    Olá, {recipientName}!
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1.6, color: '#1d2633', marginTop: 18 }}>
                    Seu pagamento foi recebido e está em análise pela nossa equipe financeira.
                    Assim que aprovado, você receberá a confirmação e os próximos passos da sua viagem.
                  </div>
                  <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ marginTop: 28, background: '#f2f5fa', borderRadius: 12 }}>
                    <tr>
                      <td style={{ padding: '16px 22px', fontSize: 17, fontWeight: 700, color: '#0b2d67' }}>
                        ID DO PEDIDO: <span style={styles.strong}>#{orderId}</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td width="44%" align="center" valign="middle">
                  <div style={{ width: 230, height: 230, border: '2px solid #dce1ea', borderRadius: '50%', position: 'relative', boxSizing: 'border-box' as const, margin: '0 auto' }}>
                    <div style={{ width: 155, height: 95, border: '6px solid #0b2d67', borderRadius: 14, position: 'absolute', left: 35, top: 72, boxSizing: 'border-box' as const, background: '#fff' }}>
                      <div style={{ height: 24, background: '#0b2d67', marginTop: 16 }} />
                      <div style={{ width: 55, height: 5, background: '#0b2d67', borderRadius: 4, position: 'absolute', left: 22, bottom: 24 }} />
                      <div style={{ width: 55, height: 5, background: '#0b2d67', borderRadius: 4, position: 'absolute', left: 22, bottom: 10 }} />
                    </div>
                    <div style={{ width: 82, height: 82, borderRadius: '50%', background: '#ff6900', position: 'absolute', right: 0, bottom: 15 }}>
                      <div style={{ width: 26, height: 30, background: '#fff', borderRadius: 5, position: 'absolute', left: 28, top: 34 }} />
                      <div style={{ width: 26, height: 24, border: '6px solid #fff', borderBottom: 0, borderRadius: '18px 18px 0 0', position: 'absolute', left: 22, top: 14, boxSizing: 'border-box' as const }} />
                      <div style={{ width: 5, height: 11, background: '#ff6900', position: 'absolute', left: 39, top: 45, borderRadius: 3 }} />
                    </div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      {/* RESUMO */}
      {(aereo || hotel || servicos.length > 0) && (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
          <tr>
            <td style={{ padding: '10px 40px 24px 40px' }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ border: '1px solid #dfe3ea', borderRadius: 16 }}>
                <tr>
                  <td style={{ padding: '26px 30px 14px 30px', fontSize: 18, fontWeight: 700, color: '#0b2d67' }}>
                    Resumo do pedido
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 30px 30px 30px' }}>
                    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
                      <tr>
                        {aereo && (
                          <td width="33.33%" valign="top" style={{ paddingRight: 22, borderRight: '1px solid #d9dde5' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0b2d67', marginBottom: 18 }}>✈ &nbsp; AÉREO</div>
                            <div style={{ fontSize: 15, lineHeight: 1.7, color: '#222' }}>
                              {aereo.origem}<br />
                              → {aereo.destino}<br />
                              {aereo.datas}
                            </div>
                          </td>
                        )}
                        {hotel && (
                          <td width="33.33%" valign="top" style={{ padding: '0 22px', borderRight: servicos.length > 0 ? '1px solid #d9dde5' : undefined }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0b2d67', marginBottom: 18 }}>▦ &nbsp; HOTEL</div>
                            <div style={{ fontSize: 15, lineHeight: 1.7, color: '#222' }}>
                              {hotel.nome}<br />
                              {hotel.noites}<br />
                              {hotel.datas}
                              {hotel.categoria ? (<><br />Categoria: {hotel.categoria}</>) : null}
                            </div>
                          </td>
                        )}
                        {servicos.length > 0 && (
                          <td width="33.33%" valign="top" style={{ paddingLeft: 22 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0b2d67', marginBottom: 18 }}>▣ &nbsp; SERVIÇO</div>
                            <div style={{ fontSize: 15, lineHeight: 1.7, color: '#222' }}>
                              {servicos.map((s, i) => (
                                <React.Fragment key={i}>{s}{i < servicos.length - 1 ? <br /> : null}</React.Fragment>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      )}

      {/* PREVISÃO */}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tr>
          <td style={{ padding: '0 40px 30px 40px' }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ border: '1px solid #dfe3ea', borderRadius: 16 }}>
              <tr>
                <td width={92} align="center" style={{ padding: '26px 0 26px 18px' }}>
                  <div style={{ width: 52, height: 52, border: '4px solid #ff6900', borderRadius: '50%', position: 'relative', margin: '0 auto' }}>
                    <div style={{ width: 4, height: 17, background: '#ff6900', position: 'absolute', left: 20, top: 6, borderRadius: 3 }} />
                    <div style={{ width: 15, height: 4, background: '#ff6900', position: 'absolute', left: 20, top: 21, borderRadius: 3, transform: 'rotate(40deg)', transformOrigin: 'left center' }} />
                  </div>
                </td>
                <td style={{ padding: '26px 26px 26px 10px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0b2d67', marginBottom: 10 }}>
                    Previsão de retorno: <span style={{ color: '#ff6900' }}>{prazoAnalise}</span>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, color: '#1f2937' }}>
                    Acompanhe o andamento respondendo este e-mail.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      {/* CONTATO */}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tr>
          <td style={{ padding: '0 46px 34px 46px' }}>
            <div style={{ height: 1, background: '#dfe3ea', marginBottom: 24 }} />
            <div style={{ textAlign: 'center' as const, fontSize: 14, lineHeight: 1.7, color: '#1f2937' }}>
              ☎ {CONTACTS.phone} &nbsp;&nbsp; | &nbsp;&nbsp;
              ✉ {CONTACTS.email} &nbsp;&nbsp; | &nbsp;&nbsp;
              ◉ {CONTACTS.site}
            </div>
          </td>
        </tr>
      </table>
    </EmailLayout>
  )
}

export default PagamentoAnalise

export const template = {
  component: PagamentoAnalise,
  subject: (data) => `Pagamento em análise · Pedido #${data?.orderId ?? ''}`.trim(),
  displayName: 'Pagamento em análise',
  previewData: {
    recipientName: 'Camila',
    orderId: 'VA25051248',
    prazoAnalise: 'em até 3h úteis',
    aereo: { origem: 'São Paulo (GRU)', destino: 'Paris (CDG)', datas: '10/08/2025 – 20/08/2025' },
    hotel: { nome: 'Hotel Louvre Saint-Honoré', noites: '10 noites', datas: '10/08/2025 – 20/08/2025', categoria: '4 estrelas' },
    servico: ['Transfer aeroporto ⇄ hotel', 'City tour em Paris'],
  },
} satisfies TemplateEntry
