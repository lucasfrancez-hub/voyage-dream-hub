import { CreditCard, Plane, Sparkles } from "lucide-react";
import pixLogo from "@/assets/pix-logo.png.asset.json";

function BrandChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-7 min-w-[50px] items-center justify-center gap-1 rounded-md border border-border/50 bg-background/50 px-2">
      {children}
    </span>
  );
}

/** Cards de Pix e Cartão (usados lado a lado no rodapé do motor público). */
export function PaymentMethodsBar() {
  return (
    <>
      {/* Pix */}
      <div className="group md:col-span-4">
        <div className="relative flex h-full flex-col items-center justify-between overflow-hidden rounded-3xl border border-border/50 bg-card/40 p-8 text-center backdrop-blur-xl transition-all duration-500 hover:border-emerald-500/40 hover:bg-card/60">
          <div className="self-start">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              À vista
            </span>
          </div>

          <div className="flex flex-col items-center gap-6 py-8">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-3xl transition-opacity duration-500 group-hover:opacity-80" />
              <img
                src={pixLogo.url}
                alt="Pix"
                className="relative h-24 w-auto object-contain drop-shadow-[0_0_18px_rgba(50,188,173,0.35)] transition-transform duration-500 group-hover:scale-105 sm:h-28"
              />
            </div>
            <div>
              <h3 className="text-2xl font-bold tracking-tight">Pix</h3>
              <p className="mt-3 px-2 text-sm leading-relaxed text-muted-foreground">
                Pagamento instantâneo com aprovação imediata para garantir sua reserva na hora.
              </p>
            </div>
          </div>

          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-emerald-500/15">
            <div className="h-full w-1/3 bg-emerald-500 transition-all duration-1000 group-hover:w-full" />
          </div>
        </div>
      </div>

      {/* Cartão */}
      <div className="group md:col-span-5">
        <div className="flex h-full flex-col rounded-3xl border border-border/50 bg-card/40 p-8 backdrop-blur-xl transition-all duration-500 hover:border-primary/40 hover:bg-card/60">
          <div className="flex items-start justify-between gap-3">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              Parcelado
            </span>
            <CreditCard className="h-8 w-8 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary/50" />
          </div>

          <div className="mt-6">
            <h3 className="text-2xl font-bold tracking-tight">Cartão de crédito</h3>
            <p className="mt-1 text-sm text-muted-foreground">Divida em até 3 cartões diferentes.</p>
          </div>

          <div className="mt-8 flex-1 space-y-4">
            <div className="flex gap-4 rounded-2xl border border-border/40 bg-background/30 p-4">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Plane className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold">Parcelamento de passagens aéreas</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  O número de parcelas varia conforme a companhia aérea.
                </p>
              </div>
            </div>
            <div className="flex gap-4 rounded-2xl border border-border/40 bg-background/30 p-4">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold">Parcelamento de demais serviços</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Em até 6x no cartão de crédito.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border/40 pt-6 opacity-80 transition-opacity group-hover:opacity-100">
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
    </>
  );
}
