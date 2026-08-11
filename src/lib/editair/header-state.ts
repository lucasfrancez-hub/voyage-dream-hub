/**
 * Estado mínimo compartilhado com o header global do EditAir:
 * nome do projeto aberto + status do salvamento automático.
 * A rota do editor publica; o header apenas lê (nada de lógica de autosave aqui).
 */
export type StatusSalvamento = "salvo" | "salvando" | "erro";

export type HeaderProjeto = {
  nome: string | null;
  status: StatusSalvamento;
};

let atual: HeaderProjeto = { nome: null, status: "salvo" };
const ouvintes = new Set<() => void>();

export function definirHeaderProjeto(p: Partial<HeaderProjeto>) {
  const proximo = { ...atual, ...p };
  if (proximo.nome === atual.nome && proximo.status === atual.status) return;
  atual = proximo;
  ouvintes.forEach((f) => f());
}

export function limparHeaderProjeto() {
  definirHeaderProjeto({ nome: null, status: "salvo" });
}

export function assinarHeaderProjeto(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

export function lerHeaderProjeto(): HeaderProjeto {
  return atual;
}
