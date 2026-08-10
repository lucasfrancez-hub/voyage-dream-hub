/**
 * Ponte entre a galeria e o editor.
 * Quando a mídia já foi salva na galeria, só a instrução viaja aqui;
 * `arquivos` é usado apenas em fluxos que ainda enviam do zero.
 */
export type EditairHandoff = {
  arquivos?: File[];
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
