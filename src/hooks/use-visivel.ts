import { useEffect, useRef, useState } from "react";

/** Retorna se o elemento está (perto de) visível — usado pra não animar cards fora da viewport. */
export function useVisivel<T extends HTMLElement>(margem = "120px") {
  const ref = useRef<T>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const io = new IntersectionObserver((entradas) => setVisivel(entradas.some((e) => e.isIntersecting)), {
      rootMargin: margem,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [margem]);

  return { ref, visivel };
}
