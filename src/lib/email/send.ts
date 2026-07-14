import { supabase } from '@/integrations/supabase/client'

export type TransactionalTemplateName =
  | 'pedido-realizado'
  | 'pagamento-analise'
  | 'orcamento-enviado'
  | 'contrato-enviado'
  | 'contrato-confirmado'
  | 'viagem-confirmada'

export interface SendEmailParams {
  templateName: TransactionalTemplateName
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, unknown>
}

/**
 * Enfileira um e-mail transacional via /lovable/email/transactional/send.
 * Requer usuário autenticado (JWT do Supabase).
 */
export async function sendTransactionalEmail(params: SendEmailParams) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error('Usuário não autenticado — não é possível enviar e-mail.')
  }

  const res = await fetch('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Falha ao enviar e-mail (${res.status}): ${text}`)
  }
  return res.json().catch(() => ({}))
}
