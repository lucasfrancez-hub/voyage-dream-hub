import { CreditCard, Plane, Sparkles } from "lucide-react";
import pixLogo from "@/assets/pix-logo.png.asset.json";

function BrandChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-6 min-w-[46px] items-center justify-center gap-1 rounded-md border border-border/50 bg-background/60 px-2">
      {children}
    </span>
  );
}

/** Cards de Pix e Cartão (usados lado a lado no rodapé do motor público). */
export function PaymentMethodsBar() {
  return (
    <>
      {/* Pix */}
      <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-6 transition-colors hover:border-emerald-500/40">
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            À vista
          </span>
          <img src={pixLogo.url} alt="Pix" className="h-7 w-auto shrink-0 object-contain" />
        </div>
        <h3 className="text-xl font-bold">Pix</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Pagamento instantâneo com aprovação imediata para garantir sua reserva na hora.
        </p>
      </div>

      {/* Cartão */}
      <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-6 transition-colors hover:border-primary/40">
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            Parcelado
          </span>
          <CreditCard className="h-8 w-8 shrink-0 text-primary" />
        </div>
        <h3 className="text-xl font-bold">Cartão de crédito</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Divida em até 3 cartões diferentes.
        </p>

        <div className="mt-4 space-y-2">
          <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
            <Plane className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 text-xs">
              <div className="font-semibold">Parcelamento de passagens aéreas</div>
              <div className="text-muted-foreground">
                O número de parcelas varia conforme a companhia aérea.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 text-xs">
              <div className="font-semibold">Parcelamento de demais serviços</div>
              <div className="text-muted-foreground">Em até 6x no cartão de crédito.</div>
            </div>
          </div>
        </div>

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
    </>
  );
}
