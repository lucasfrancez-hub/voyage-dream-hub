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

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.clearInterval(interval);
    };
  }, []);
}
