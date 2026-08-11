/* Camada de dados do EditAir.
   No Desktop (Electron) tudo é local: projetos em disco, biblioteca por referência
   ao arquivo do usuário, zero upload. No navegador continua usando a nuvem. */
import {
  criarProjetoEditair,
  excluirAssetEditair,
  excluirProjetoEditair,
  listarMidiasEditair,
  listarProjetosEditair,
  obterProjetoEditair,
  registrarEventoEditair,
  renomearAssetEditair,
  salvarEstadoEditair,
} from "./projects.functions";
import { hidratarMidias, importarParaGaleria, type MidiaGaleria } from "./gallery";
import { assetLocalParaMidia, caminhosDeArquivos, pontoDesktop, type AssetLocal } from "./desktop";
import { estadoVazio, type ProjectState, type Transcript } from "./types";

export type MidiaEditair = MidiaGaleria & {
  local?: boolean;
  localPath?: string;
  existe?: boolean;
  fps?: number;
};

export type ProjetoResumo = {
  id: string;
  name: string;
  format: string;
  width: number;
  height: number;
  status: string;
  updated_at: string;
  local?: boolean;
};

export type ProjetoAberto = {
  name: string;
  width: number;
  height: number;
  fps: number;
  state: ProjectState | null;
  transcript: Transcript | null;
  instructions: string | null;
  midias: MidiaEditair[];
};

export function ehLocal() {
  return !!pontoDesktop();
}

/* ------------------------------- projetos ------------------------------- */

export async function listarProjetos(): Promise<ProjetoResumo[]> {
  const api = pontoDesktop();
  if (api) {
    const locais = (await api.projeto.listar()) as Array<Record<string, unknown>>;
    return locais.map((p) => ({
      id: String(p.id),
      name: String(p.name ?? "Projeto"),
      format: "custom",
      width: Number(p.width ?? 1080),
      height: Number(p.height ?? 1920),
      status: "editando",
      updated_at: String(p.updatedAt ?? new Date().toISOString()),
      local: true,
    }));
  }
  return (await listarProjetosEditair()) as unknown as ProjetoResumo[];
}

export async function criarProjeto(dados: {
  name: string;
  width: number;
  height: number;
  fps: number;
  instructions: string | null;
  assetIds: string[];
  state?: ProjectState | null;
}): Promise<string> {
  const api = pontoDesktop();
  if (api) {
    const p = (await api.projeto.criar({
      name: dados.name,
      width: dados.width,
      height: dados.height,
      fps: dados.fps,
      assets: dados.assetIds,
      timeline: (dados.state ?? estadoVazio(dados.width, dados.height, dados.fps)) as unknown as Record<
        string,
        unknown
      >,
      settings: { instructions: dados.instructions ?? null },
    })) as Record<string, unknown>;
    return String(p.id);
  }
  const r = (await criarProjetoEditair({ data: dados })) as unknown as { id: string };
  return r.id;
}

export async function abrirProjeto(id: string): Promise<ProjetoAberto> {
  const api = pontoDesktop();
  if (api) {
    const r = (await api.projeto.abrir(id)) as unknown as {
      projeto: Record<string, unknown>;
      recuperacao: { estado?: Record<string, unknown> } | null;
    } | null;
    if (!r?.projeto) throw new Error("Projeto não encontrado neste computador.");
    const p = r.projeto;
    const ids = new Set((Array.isArray(p.assets) ? p.assets : []).map((x) => String(x)));
    const biblioteca = (await api.biblioteca.listar()) as AssetLocal[];
    const midias = biblioteca.filter((a) => ids.has(a.id)).map(assetLocalParaMidia) as MidiaEditair[];
    const recuperado = r.recuperacao?.estado as ProjectState | undefined;
    const timeline = (recuperado ?? (p.timeline as ProjectState | undefined)) ?? null;
    return {
      name: String(p.name ?? "Projeto"),
      width: Number(p.width ?? 1080),
      height: Number(p.height ?? 1920),
      fps: Number(p.fps ?? 30),
      state: timeline && typeof timeline === "object" && "clips" in timeline ? timeline : null,
      transcript: (p.transcript as Transcript | null) ?? null,
      instructions:
        (p.settings as { instructions?: string | null } | undefined)?.instructions ?? null,
      midias,
    };
  }

  const res = (await obterProjetoEditair({ data: { id } })) as unknown as {
    projeto: Record<string, unknown>;
    assets: Array<Record<string, unknown>>;
  };
  const p = res.projeto;
  const midias = await hidratarMidias(res.assets);
  const bruto = p.state as ProjectState | undefined;
  return {
    name: String(p.name ?? "Projeto"),
    width: Number(p.width) || 1080,
    height: Number(p.height) || 1920,
    fps: Number(p.fps ?? 30),
    state: bruto && typeof bruto === "object" && "clips" in bruto ? bruto : null,
    transcript:
      p.transcript && typeof p.transcript === "object" && "words" in (p.transcript as object)
        ? (p.transcript as Transcript)
        : null,
    instructions: (p.instructions as string | null) ?? null,
    midias,
  };
}

export async function salvarProjeto(
  id: string,
  dados: { state: ProjectState; transcript: Transcript | null; assetIds?: string[] },
) {
  const api = pontoDesktop();
  if (api) {
    await api.projeto.salvar(id, {
      timeline: dados.state as unknown as Record<string, unknown>,
      transcript: (dados.transcript ?? null) as unknown as Record<string, unknown>,
      ...(dados.assetIds ? { assets: dados.assetIds } : {}),
    });
    return;
  }
  await salvarEstadoEditair({
    data: { id, state: dados.state as unknown, transcript: dados.transcript as unknown, status: "editando" },
  });
}

/** Autosave contínuo (desktop): protege contra queda de energia/app. */
export async function autosaveProjeto(id: string, state: ProjectState) {
  const api = pontoDesktop();
  if (!api) return;
  await api.projeto.autosave(id, state as unknown as Record<string, unknown>).catch(() => null);
}

export async function excluirProjeto(id: string) {
  const api = pontoDesktop();
  if (api) {
    await api.projeto.excluir(id);
    return;
  }
  await excluirProjetoEditair({ data: { id } });
}

/* ------------------------------ biblioteca ------------------------------ */

export async function listarBiblioteca(): Promise<MidiaEditair[]> {
  const api = pontoDesktop();
  if (api) {
    const locais = (await api.biblioteca.listar()) as AssetLocal[];
    return locais.map(assetLocalParaMidia) as MidiaEditair[];
  }
  const rows = (await listarMidiasEditair()) as unknown as Array<Record<string, unknown>>;
  return (await hidratarMidias(rows)) as MidiaEditair[];
}

export type ProgressoImport = {
  fase: "lendo" | "enviando" | "pronto";
  mensagem: string;
};

/**
 * Importa mídia. No Desktop é só leitura local (FFprobe + thumbnail); nunca sobe arquivo.
 * `entrada` pode ser um FileList (drag & drop) ou caminhos absolutos.
 */
export async function importarMidias(
  entrada: FileList | File[] | string[] | null,
  opcoes: { projectId?: string | null; aoProgredir?: (p: ProgressoImport) => void } = {},
): Promise<MidiaEditair[]> {
  const api = pontoDesktop();
  if (!entrada || (Array.isArray(entrada) ? entrada.length === 0 : entrada.length === 0)) return [];

  if (api) {
    let caminhos =
      typeof (entrada as string[])[0] === "string"
        ? (entrada as string[])
        : caminhosDeArquivos(entrada as FileList | File[]);
    /* mídia criada em memória (ex.: cena gerada pela IA) não tem caminho no disco:
       grava os bytes no cache do app e importa esse arquivo como qualquer outra mídia */
    if (!caminhos.length && typeof (entrada as string[])[0] !== "string" && api.arquivo.salvarBytes) {
      opcoes.aoProgredir?.({ fase: "lendo", mensagem: "Salvando mídia gerada…" });
      const arquivos = Array.from(entrada as FileList | File[]);
      const salvos: string[] = [];
      for (const f of arquivos) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        salvos.push(await api.arquivo.salvarBytes(f.name || "midia.bin", bytes));
      }
      caminhos = salvos;
    }
    if (!caminhos.length) {
      throw new Error(
        api.arquivo.salvarBytes
          ? "Não consegui ler esses arquivos do disco. Use Importar mídia para escolhê-los."
          : "Esta versão do app não consegue salvar mídia gerada. Atualize o EditAir Desktop.",
      );
    }
    opcoes.aoProgredir?.({
      fase: "lendo",
      mensagem: caminhos.length > 1 ? `Importando ${caminhos.length} mídias…` : "Importando mídia…",
    });
    const novos = (await api.biblioteca.importar(caminhos)) as AssetLocal[];
    opcoes.aoProgredir?.({ fase: "pronto", mensagem: "" });
    return novos.map(assetLocalParaMidia) as MidiaEditair[];
  }

  const arquivos = Array.from(entrada as FileList | File[]);
  const out: MidiaEditair[] = [];
  for (const arquivo of arquivos) {
    const m = await importarParaGaleria(arquivo, {
      projectId: opcoes.projectId ?? null,
      aoProgredir: (msg) =>
        opcoes.aoProgredir?.({ fase: msg.startsWith("Enviando") ? "enviando" : "lendo", mensagem: msg }),
    });
    out.push(m as MidiaEditair);
  }
  opcoes.aoProgredir?.({ fase: "pronto", mensagem: "" });
  return out;
}

export async function renomearMidia(m: MidiaEditair, nome: string) {
  const api = pontoDesktop();
  if (api && m.local) {
    await api.biblioteca.renomear(m.id, nome);
    return;
  }
  await renomearAssetEditair({ data: { id: m.id, name: nome } });
}

export async function excluirMidia(m: MidiaEditair) {
  const api = pontoDesktop();
  if (api && m.local) {
    await api.biblioteca.remover(m.id, false);
    return;
  }
  await excluirAssetEditair({ data: { id: m.id } });
}

/** Mídia offline: usuário aponta onde o arquivo está agora e a timeline volta a funcionar. */
export async function relinkarMidia(m: MidiaEditair): Promise<MidiaEditair | null> {
  const api = pontoDesktop();
  if (!api) return null;
  const caminho = await api.dialogo.localizarArquivo(m.nome);
  if (!caminho) return null;
  const atualizado = (await api.biblioteca.relinkar(m.id, caminho)) as AssetLocal;
  return assetLocalParaMidia(atualizado) as MidiaEditair;
}

export async function escolherMidiasLocais(): Promise<string[]> {
  const api = pontoDesktop();
  if (!api) return [];
  return api.dialogo.escolherMidias();
}

export async function registrarEvento(dados: {
  projectId: string;
  actor: string;
  message: string;
  ops: unknown;
}) {
  if (pontoDesktop()) return; // histórico local já vive no arquivo do projeto
  await registrarEventoEditair({ data: dados }).catch(() => null);
}
