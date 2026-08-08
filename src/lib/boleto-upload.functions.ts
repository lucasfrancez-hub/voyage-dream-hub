import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { assertAdmin } from './boleto-pay.helpers'

export const uploadBoletoDocument = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(120),
        base64: z.string().min(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const bytes = Buffer.from(data.base64, 'base64')
    if (bytes.length > 12 * 1024 * 1024) throw new Error('Arquivo maior que 12MB.')

    const safe = data.filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`

    const { error } = await supabaseAdmin.storage
      .from('boletos')
      .upload(path, bytes, { contentType: data.contentType, upsert: false })
    if (error) throw new Error(`Falha no upload: ${error.message}`)

    return { path }
  })

export const getBoletoUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: signed, error } = await supabaseAdmin.storage
      .from('boletos')
      .createSignedUrl(data.path, 60 * 10)
    if (error) throw new Error(error.message)
    return { url: signed.signedUrl }
  })
