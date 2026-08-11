import { createFileRoute } from '@tanstack/react-router'

/**
 * Dispara os pagamentos do financeiro que foram agendados com HORA.
 * Roda a cada 1 minuto via pg_cron.
 */
export const Route = createFileRoute('/api/public/hooks/financial-schedule-dispatch')({
  server: {
    handlers: {
      POST: async () => {
        const { processarAgendamentosFinanceiros } = await import('@/lib/financial-dispatch.server')
        try {
          const r = await processarAgendamentosFinanceiros()
          return new Response(JSON.stringify({ success: true, ...r }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          return new Response(
            JSON.stringify({ success: false, error: (e as Error).message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
