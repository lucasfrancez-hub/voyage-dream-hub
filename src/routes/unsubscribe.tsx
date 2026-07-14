import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/unsubscribe')({
  ssr: false,
  component: UnsubscribePage,
})

type State =
  | { status: 'loading' }
  | { status: 'valid'; email: string }
  | { status: 'already' }
  | { status: 'invalid'; message: string }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; message: string }

function UnsubscribePage() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const token =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') ?? ''
      : ''

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid', message: 'Link inválido ou expirado.' })
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.valid) {
          if (data.already_unsubscribed) setState({ status: 'already' })
          else setState({ status: 'valid', email: data.email ?? '' })
        } else {
          setState({ status: 'invalid', message: data?.error ?? 'Link inválido.' })
        }
      })
      .catch(() => setState({ status: 'invalid', message: 'Não foi possível validar o link.' }))
  }, [token])

  async function confirm() {
    setState({ status: 'submitting' })
    try {
      const res = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) setState({ status: 'success' })
      else {
        const data = await res.json().catch(() => ({}))
        setState({ status: 'error', message: data?.error ?? 'Erro ao processar.' })
      }
    } catch {
      setState({ status: 'error', message: 'Erro de conexão.' })
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#fff', border: '1px solid #eaeaea', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
        <div style={{ color: '#F26B1F', fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '24px' }}>
          ✈ VIA AIR
        </div>

        {state.status === 'loading' && <p style={{ color: '#475569' }}>Validando link…</p>}

        {state.status === 'valid' && (
          <>
            <h1 style={{ fontSize: '20px', color: '#0f172a', marginBottom: '12px' }}>
              Deseja parar de receber nossos e-mails?
            </h1>
            {state.email && <p style={{ color: '#475569', marginBottom: '20px' }}>{state.email}</p>}
            <button
              onClick={confirm}
              style={{ backgroundColor: '#F26B1F', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '999px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Confirmar descadastro
            </button>
          </>
        )}

        {state.status === 'submitting' && <p style={{ color: '#475569' }}>Processando…</p>}

        {state.status === 'success' && (
          <>
            <h1 style={{ fontSize: '20px', color: '#0f172a', marginBottom: '12px' }}>Descadastro confirmado</h1>
            <p style={{ color: '#475569' }}>Você não receberá mais e-mails da VIA AIR.</p>
          </>
        )}

        {state.status === 'already' && (
          <>
            <h1 style={{ fontSize: '20px', color: '#0f172a', marginBottom: '12px' }}>Já descadastrado</h1>
            <p style={{ color: '#475569' }}>Este endereço já não recebe nossos e-mails.</p>
          </>
        )}

        {state.status === 'invalid' && (
          <>
            <h1 style={{ fontSize: '20px', color: '#0f172a', marginBottom: '12px' }}>Link inválido</h1>
            <p style={{ color: '#475569' }}>{state.message}</p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <h1 style={{ fontSize: '20px', color: '#0f172a', marginBottom: '12px' }}>Erro</h1>
            <p style={{ color: '#475569' }}>{state.message}</p>
          </>
        )}
      </div>
    </div>
  )
}
