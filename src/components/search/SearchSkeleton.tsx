import { Plane, BedDouble, Car, ShieldCheck, Sparkles } from "lucide-react";

/** Barra com brilho animado usada nos esqueletos de busca. */
function ShimmerBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-muted/60 after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-foreground/10 after:to-transparent ${className}`}
    />
  );
}

const PRESETS = {
  flight: {
    icon: Plane,
    title: "Consultando companhias aéreas…",
    subtitle: "Comparando tarifas e bagagens — pode levar até 30 segundos",
  },
  hotel: {
    icon: BedDouble,
    title: "Consultando hotéis disponíveis…",
    subtitle: "Comparando quartos, regimes e tarifas — pode levar até 30 segundos",
  },
  car: {
    icon: Car,
    title: "Consultando locadoras…",
    subtitle: "Comparando categorias, proteções e diárias — pode levar até 30 segundos",
  },
  insurance: {
    icon: ShieldCheck,
    title: "Consultando as seguradoras…",
    subtitle: "Comparando coberturas e valores — pode levar até 30 segundos",
  },
  exclusive: {
    icon: Sparkles,
    title: "Buscando produtos exclusivos…",
    subtitle: "Comparando ofertas e destinos — pode levar até 30 segundos",
  },
} as const;

export type SearchSkeletonKind = keyof typeof PRESETS;

/**
 * Esqueleto animado padrão dos motores de busca (aéreo, hotel, carro e aéreo+hotel).
 * Mostra filtros fantasma, barra de progresso e cards em cascata.
 */
export function SearchSkeleton({
  kind = "flight",
  rows = 4,
}: {
  kind?: SearchSkeletonKind;
  rows?: number;
}) {
  const preset = PRESETS[kind];
  const Icon = preset.icon;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="hidden space-y-4 lg:block">
        {[0, 1, 2].map((b) => (
          <div key={b} className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4">
            <ShimmerBar className="h-3 w-24" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <ShimmerBar className="h-4 w-4 rounded" />
                <ShimmerBar className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ))}
      </aside>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <Icon className="h-4 w-4 animate-pulse text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{preset.title}</p>
            <p className="text-xs text-muted-foreground">{preset.subtitle}</p>
          </div>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-primary/70" />
        </div>

        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/60 bg-card/60 p-5"
            style={{ animation: `fade-in .4s ease-out ${i * 0.09}s both` }}
          >
            <div className="mb-4 flex items-center justify-between">
              <ShimmerBar className="h-4 w-32" />
              <ShimmerBar className="h-5 w-20" />
            </div>
            <div className="flex items-center gap-6">
              {kind === "flight" ? (
                <>
                  <div className="space-y-2">
                    <ShimmerBar className="h-6 w-16" />
                    <ShimmerBar className="h-3 w-12" />
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                    <ShimmerBar className="h-px flex-1 rounded-none" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                  </div>
                  <div className="space-y-2 text-right">
                    <ShimmerBar className="ml-auto h-6 w-16" />
                    <ShimmerBar className="ml-auto h-3 w-12" />
                  </div>
                </>
              ) : (
                <>
                  <ShimmerBar className="h-20 w-28 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <ShimmerBar className="h-4 w-2/3" />
                    <ShimmerBar className="h-3 w-1/3" />
                    <div className="flex gap-2 pt-1">
                      <ShimmerBar className="h-3 w-20" />
                      <ShimmerBar className="h-3 w-16" />
                      <ShimmerBar className="h-3 w-24" />
                    </div>
                  </div>
                </>
              )}
              <div className="hidden w-36 space-y-2 sm:block">
                <ShimmerBar className="ml-auto h-6 w-28" />
                <ShimmerBar className="ml-auto h-8 w-36 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
