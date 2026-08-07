import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Mantém a lista de mensagens sempre no fim.
 *
 * Por que o simples `scrollTo(scrollHeight)` falhava: ele rodava antes de
 * imagens/áudios/vídeos terminarem de carregar, então a altura crescia depois
 * e a conversa "parava no meio". Aqui a gente:
 *  - vai ao fim sem animação quando a conversa abre (ou troca de conversa);
 *  - reobserva o tamanho do conteúdo (ResizeObserver + <img>/<video> load) e
 *    volta ao fim enquanto o usuário não tiver rolado pra cima de propósito;
 *  - respeita a leitura do histórico: se o usuário subiu, não puxa mais.
 */
const MARGEM_FIM = 120; // px de tolerância pra considerar "está no fim"

export function useStickToBottom<T extends HTMLElement>(
  chaveConversa: string | number | null | undefined,
  qtdItens: number,
) {
  const ref = useRef<T | null>(null);
  const grudado = useRef(true);
  const chaveAtual = useRef<typeof chaveConversa>(undefined);

  const irAoFim = (suave: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
  };

  // troca de conversa → volta a grudar
  if (chaveAtual.current !== chaveConversa) {
    chaveAtual.current = chaveConversa;
    grudado.current = true;
  }

  // posiciona antes da pintura pra não aparecer "no meio"
  useLayoutEffect(() => {
    if (grudado.current) irAoFim(false);
  }, [chaveConversa, qtdItens]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
      grudado.current = distancia <= MARGEM_FIM;
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    // conteúdo que cresce depois (mídias, fontes, balões expandindo)
    const ro = new ResizeObserver(() => {
      if (grudado.current) irAoFim(false);
    });
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c as Element));

    const onMedia = () => {
      if (grudado.current) irAoFim(false);
    };
    el.querySelectorAll("img, video").forEach((m) => {
      m.addEventListener("load", onMedia);
      m.addEventListener("loadeddata", onMedia);
    });

    // últimos ajustes assíncronos do layout
    const timers = [60, 200, 500, 1000].map((ms) =>
      window.setTimeout(() => {
        if (grudado.current) irAoFim(false);
      }, ms),
    );

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      el.querySelectorAll("img, video").forEach((m) => {
        m.removeEventListener("load", onMedia);
        m.removeEventListener("loadeddata", onMedia);
      });
      timers.forEach((t) => clearTimeout(t));
    };
  }, [chaveConversa, qtdItens]);

  return ref;
}
