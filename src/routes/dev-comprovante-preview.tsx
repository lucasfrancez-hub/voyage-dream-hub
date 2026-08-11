import { createFileRoute } from '@tanstack/react-router'
import { ComprovanteReceipt } from '@/components/financial/ComprovanteReceipt'

export const Route = createFileRoute('/dev-comprovante-preview')({
  component: Page,
  head: () => ({
    meta: [
      { title: 'Preview interno do comprovante | VIA AIR' },
      { name: 'description', content: 'Tela interna de conferência visual do comprovante VIA AIR.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
})

function Page() {
  return (
    <div className="min-h-screen bg-background p-8">
      <ComprovanteReceipt
        open
        onOpenChange={() => {}}
        data={{
          valor: 2499.99,
          favorecido: 'CVC OPERADORA LTDA',
          cpfCnpj: '10760260000119',
          instituicao: 'BANCO ITAU S.A.',
          chavePix: 'financeiro@cvc.com.br',
          dataPagamento: '2026-08-11T20:30:09-03:00',
          formaPagamento: 'Pix',
          transacaoId: 'E09089356202608112030s0a1b2c3d4e5',
          concluido: true,
        }}
      />
    </div>
  )
}
