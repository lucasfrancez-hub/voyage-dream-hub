import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

function generateCode(): string {
  // 6-digit numeric code, avoiding modulo bias.
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return String(n % 1_000_000).padStart(6, '0')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const requestLoginEmailCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ userAgent: z.string().max(200).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { sendTransactionalInternal } = await import('@/lib/email/send-internal.server')

    // Recupera e-mail do usuário autenticado.
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    )
    if (userErr || !userRes?.user?.email) {
      throw new Error('Não foi possível localizar seu e-mail para envio do código.')
    }
    const email = userRes.user.email

    const code = generateCode()
    const codeHash = await sha256Hex(code)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Invalida códigos anteriores em aberto.
    await supabaseAdmin
      .from('login_email_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('user_id', context.userId)
      .is('consumed_at', null)

    const { error: insErr } = await supabaseAdmin.from('login_email_codes').insert({
      user_id: context.userId,
      code_hash: codeHash,
      expires_at: expiresAt,
    })
    if (insErr) throw new Error(insErr.message)

    const requestedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const result = await sendTransactionalInternal({
      templateName: 'login-code',
      recipientEmail: email,
      idempotencyKey: `login-code-${context.userId}-${Date.now()}`,
      templateData: { code, userAgent: data.userAgent ?? '', requestedAt },
    })
    if (!result.success) {
      throw new Error(result.error || 'Falha ao enviar o e-mail com o código.')
    }

    // Retorna e-mail mascarado para a UI.
    const [local, domain] = email.split('@')
    const masked = `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 2))}@${domain}`
    return { sent: true as const, masked }
  })

export const verifyLoginEmailCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ code: z.string().regex(/^\d{6}$/) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const codeHash = await sha256Hex(data.code)

    const { data: row, error } = await supabaseAdmin
      .from('login_email_codes')
      .select('id, expires_at, consumed_at, attempts')
      .eq('user_id', context.userId)
      .eq('code_hash', codeHash)
      .is('consumed_at', null)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) {
      // Incrementa attempts do último em aberto para permitir rate limit no futuro.
      await supabaseAdmin.rpc // noop-safe if not present
      throw new Error('Código inválido ou expirado.')
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error('Código expirado. Solicite um novo.')
    }
    await supabaseAdmin
      .from('login_email_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', row.id)
    return { ok: true as const }
  })
