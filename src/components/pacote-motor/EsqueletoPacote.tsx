import { Sparkles } from "lucide-react";

/** Esqueleto animado do pacote recomendado — quadradinhos piscando até chegarem os resultados. */
function Bloco({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-white/[0.06] after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/15 after:to-transparent ${className}`}
    />
  );
}

function CardEsqueleto({ atraso = 0, foto = false }: { atraso?: number; foto?: boolean }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      style={{ animation: `fade-in .4s ease-out ${atraso}s both` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <Bloco className="h-3.5 w-28" />
        <Bloco className="h-5 w-20 rounded-full" />
      </div>
      {foto ? (
        <div className="flex gap-3">
          <Bloco className="h-24 w-28 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Bloco className="h-4 w-2/3" />
            <Bloco className="h-3 w-1/2" />
            <div className="flex gap-2 pt-1">
              <Bloco className="h-3 w-16" />
              <Bloco className="h-3 w-20" />
            </div>
            <Bloco className="h-8 w-full rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <Bloco className="h-6 w-14" />
              <Bloco className="h-3 w-10" />
            </div>
            <div className="flex flex-1 items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <Bloco className="h-px flex-1 rounded-none" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            </div>
            <div className="space-y-2 text-right">
              <Bloco className="ml-auto h-6 w-14" />
              <Bloco className="ml-auto h-3 w-10" />
            </div>
          </div>
          <Bloco className="h-3 w-1/3" />
          <Bloco className="h-8 w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

export function EsqueletoPacote() {
  return (
    <div className="overview">
      <div className="overview-main">
        {/* Aviso de progresso: mesma linguagem dos demais motores de busca. */}
        <div className="mb-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Buscando pacotes de viagem…</p>
              <p className="text-xs text-muted-foreground">
                Comparando voos, hotéis e serviços — pode levar até 30 segundos
              </p>
            </div>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-primary/70" />
          </div>
        </div>

        <div className="overview-grid">
          <CardEsqueleto atraso={0} />
          <CardEsqueleto atraso={0.12} foto />
        </div>
        <div
          className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          style={{ animation: "fade-in .4s ease-out .24s both" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <Bloco className="h-3.5 w-36" />
            <Bloco className="h-3 w-20" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Bloco className="h-14" />
            <Bloco className="h-14" />
            <Bloco className="h-14" />
          </div>
        </div>
      </div>

      <aside
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        style={{ animation: "fade-in .4s ease-out .3s both" }}
      >
        <Bloco className="mb-3 h-3 w-24" />
        <Bloco className="mb-4 h-5 w-2/3" />
        <div className="space-y-2">
          <Bloco className="h-3 w-full" />
          <Bloco className="h-3 w-5/6" />
          <Bloco className="h-20 w-full rounded-xl" />
          <Bloco className="h-3 w-2/3" />
        </div>
        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
          <Bloco className="h-3 w-28" />
          <Bloco className="h-7 w-40" />
          <Bloco className="h-3 w-36" />
          <Bloco className="h-10 w-full rounded-xl" />
        </div>
      </aside>
    </div>
  );
}
