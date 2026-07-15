import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

/**
 * Envio interno de e-mail transacional a partir do servidor (cron, webhooks
 * verificados, etc.) sem exigir JWT do usuário. Espelha /lovable/email/transactional/send
 * mas usa service role e pula suppression/unsubscribe (uso interno para admins).
 */

const SITE_NAME = 'VIA AIR'
const SENDER_DOMAIN = 'notify.viaair.tur.br'
const FROM_DOMAIN = 'notify.viaair.tur.br'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface SendInternalParams {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, any>
}

export async function sendTransactionalInternal(
  params: SendInternalParams,
): Promise<{ success: boolean; reason?: string; error?: string }> {
  const template = TEMPLATES[params.templateName]
  if (!template) {
    return { success: false, error: `template ${params.templateName} não registrado` }
  }
  const to = template.to || params.recipientEmail
  if (!to) return { success: false, error: 'recipientEmail obrigatório' }

  const messageId = crypto.randomUUID()
  const templateData = params.templateData ?? {}

  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const plainText = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  // Token de unsubscribe é obrigatório no payload; para envios internos ao admin
  // criamos/reusamos um por endereço.
  const normalizedEmail = to.toLowerCase()
  let unsubscribeToken: string
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (existing?.token) {
    unsubscribeToken = existing.token
  } else {
    unsubscribeToken = generateToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalizedEmail }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  }

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: params.templateName,
    recipient_email: to,
    status: 'pending',
  })

  const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: params.templateName,
      idempotency_key: params.idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: to,
      status: 'failed',
      error_message: enqueueError.message,
    })
    return { success: false, error: enqueueError.message }
  }

  return { success: true }
}
