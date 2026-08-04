import { CreditCard } from "lucide-react";

function PixMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 94 94" className={className} fill="currentColor" aria-hidden>
      <path d="M47 0L31.3 15.7L15.5 0L0 15.5L15.7 31.3L0 47L15.5 62.5L31.3 46.8L47 62.5L62.5 47L46.8 31.3L62.5 15.5L47 0Z" transform="translate(16 16)" />
    </svg>
  );
}

function BrandChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-6 min-w-[46px] items-center justify-center gap-1 rounded-md border border-border/50 bg-background/60 px-2">
      {children}
    </span>
  );
}

export function PaymentMethodsBar() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Pix */}
      <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-6 transition-colors hover:border-emerald-500/40">
        <div className="mb-6 flex items-center justify-between">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            À vista
          </span>
          <PixMark className="h-8 w-8 text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold">Pix</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Pagamento instantâneo com aprovação imediata para garantir sua reserva na hora.
        </p>
      </div>

      {/* Cartão */}
      <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-6 transition-colors hover:border-primary/40">
        <div className="mb-6 flex items-center justify-between">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            Parcelado
          </span>
          <CreditCard className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold">Cartão de crédito</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Divida em até 3 cartões diferentes. O número de parcelas varia conforme a companhia aérea.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <BrandChip>
            <span className="text-[9px] font-black italic tracking-tight text-sky-300">VISA</span>
          </BrandChip>
          <BrandChip>
            <span className="flex -space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-[#EB001B]" />
              <span className="h-3 w-3 rounded-full bg-[#F79E1B] opacity-90" />
            </span>
          </BrandChip>
          <BrandChip>
            <span className="flex -space-x-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFCB05]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#00A4E0]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4123]" />
            </span>
            <span className="text-[9px] font-black lowercase italic">elo</span>
          </BrandChip>
          <BrandChip>
            <span className="text-[8px] font-black tracking-tight text-sky-400">AMEX</span>
          </BrandChip>
          <BrandChip>
            <span className="text-[8px] font-black italic text-red-500">Hipercard</span>
          </BrandChip>
          <BrandChip>
            <span className="flex items-center gap-1">
              <span className="flex h-3 w-3 items-center justify-center rounded-full border border-muted-foreground/60">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
              </span>
              <span className="text-[8px] font-semibold">Diners</span>
            </span>
          </BrandChip>
        </div>
      </div>
    </div>
  );
}
