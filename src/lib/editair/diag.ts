/* Registro central de diagnósticos do EditAir.

   Motivo: os diagnósticos viviam apenas como `window.xxx` dentro de um useEffect
   de um componente (Timeline). Se o componente não estivesse montado — ou o
   console do Desktop rodasse em outro contexto — o resultado era
   `ReferenceError: editairTimelineDiag is not defined`.

   Agora cada tela registra a sonda AQUI (módulo, imune a tree-shaking porque é
   importado) e o espelho em `window` é só uma conveniência. A UI
   (Ajustes → Diagnóstico) lê do registro, nunca do console. */

export type SondaDiag = () => unknown;

const sondas = new Map<string, SondaDiag>();

/** Registra (ou substitui) uma sonda. Devolve a função de baixa. */
export function registrarDiag(nome: string, fn: SondaDiag) {
  sondas.set(nome, fn);
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>)[`editair${nome[0].toUpperCase()}${nome.slice(1)}Diag`] = fn;
  }
  return () => {
    if (sondas.get(nome) === fn) sondas.delete(nome);
  };
}

export function temDiag(nome: string) {
  return sondas.has(nome);
}

/** Executa uma sonda; devolve `{ indisponivel: true }` quando a tela não está aberta. */
export function lerDiag(nome: string): unknown {
  const fn = sondas.get(nome);
  if (!fn) return { indisponivel: true, motivo: `sonda "${nome}" não registrada — abra a tela correspondente` };
  try {
    return fn();
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

export function listarDiag() {
  return Array.from(sondas.keys());
}
