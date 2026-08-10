/**
 * Ponte entre a tela "Novo projeto" e o editor.
 * Os arquivos escolhidos ficam em memória (não dá para serializar em rota)
 * e o editor consome assim que abre, disparando a edição automática.
 */
export type EditairHandoff = {
  arquivos: File[];
  instrucao: string;
};

const mapa = new Map<string, EditairHandoff>();

export function guardarHandoff(projectId: string, dados: EditairHandoff) {
  mapa.set(projectId, dados);
}

export function consumirHandoff(projectId: string): EditairHandoff | null {
  const v = mapa.get(projectId) ?? null;
  mapa.delete(projectId);
  return v;
}
