import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Janela flutuante (frame) usada para abrir o detalhe de reservas e bilhetes
 * por cima da listagem, com fundo escurecido e botão de fechar.
 */
export function JanelaDetalhe({
  aberto,
  onFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/70 p-3 backdrop-blur-sm md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={titulo || "Detalhe"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="relative w-full max-w-5xl">
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute -top-1 right-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#0c0d12]/90 text-white/70 shadow-lg backdrop-blur transition-colors hover:bg-white/10 hover:text-white md:-right-2 md:-top-2"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pt-8 md:pt-2">{children}</div>
      </div>
    </div>
  );
}
