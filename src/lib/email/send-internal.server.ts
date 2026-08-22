import { sendTemplateEmail } from '@/lib/email-templates/send-email'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

/**
 * Envio interno de e-mail transacional a partir do servidor (cron, webhooks
 * verificados, etc.). Usa a entrega gerenciada da Lovable: supressão, retries,
 * rate limit e unsubscribe são responsabilidade da plataforma.
 */

export interface SendInternalParams {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, any>
}

async function log(row: {
  template_name: string
  recipient_email: string
  status: 'sent' | 'suppressed' | 'failed'
  error_message?: string
}) {
  const { error } = await supabaseAdmin.from('email_send_log').insert(row)
  if (error) {
    console.error('Falha ao registrar email_send_log', {
      code: error.code,
      message: error.message,
    })
  }
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

  try {
    const result = await sendTemplateEmail(params.templateName, to, {
      templateData: params.templateData ?? {},
      idempotencyKey: params.idempotencyKey,
    })

    if (!result.sent) {
      await log({
        template_name: params.templateName,
        recipient_email: to,
        status: 'suppressed',
      })
      return { success: false, reason: result.reason }
    }

    await log({
      template_name: params.templateName,
      recipient_email: to,
      status: 'sent',
    })
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await log({
      template_name: params.templateName,
      recipient_email: to,
      status: 'failed',
      error_message: message,
    })
    return { success: false, error: message }
  }
}
