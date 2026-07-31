import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";

interface Props {
  url: string;
  filename?: string;
  onClose: () => void;
}

export function ImageLightbox({ url, filename, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={filename || "Imagem"}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate text-sm font-medium opacity-90">{filename || "Imagem"}</span>
        <div className="flex items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={filename}
            className="rounded-full p-2 hover:bg-white/15"
            title="Baixar"
          >
            <Download className="h-5 w-5" />
          </a>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/15" title="Fechar (Esc)" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={url}
          alt={filename || "Imagem"}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}
