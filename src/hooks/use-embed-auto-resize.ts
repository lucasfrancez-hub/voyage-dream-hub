import { useEffect } from "react";
import { isEmbedPath, isInsideIframe, resizeEmbedToContent } from "@/lib/embed-resize";

/** Mantém a altura do iframe do widget sempre igual à altura real do conteúdo. */
export function useEmbedAutoResize() {
  useEffect(() => {
    if (!isEmbedPath() || !isInsideIframe()) return;

    const updateHeight = () => resizeEmbedToContent();
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(updateHeight);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    window.addEventListener("resize", updateHeight);
    const interval = window.setInterval(updateHeight, 1000);

    // O script do widget pede o fechamento dos painéis (troca de aba, rotação
    // da tela). Simulamos Esc — todos os popovers/calendários fecham com ele.
    const onParentMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (!data || data.type !== "VIAAIR_EMBED_CLOSE_FLOATING") return;
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    };
    window.addEventListener("message", onParentMessage);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("message", onParentMessage);
      window.clearInterval(interval);
    };
  }, []);
}
