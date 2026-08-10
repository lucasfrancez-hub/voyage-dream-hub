/* Galeria persistente do EditAir: upload no storage + miniatura real + registro no banco.
   As mídias pertencem ao usuário (não ao projeto) e podem ser reaproveitadas em vários projetos. */
import { supabase } from "@/integrations/supabase/client";
import { registrarAssetEditair } from "./projects.functions";
import { lerMetadados } from "./audio";

export type MidiaGaleria = {
  id: string;
  nome: string;
  kind: "video" | "audio" | "image";
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
  storagePath: string;
  thumbPath: string | null;
  url: string;
  thumbUrl: string | null;
  criadoEm: string;
};

const BUCKET = "editair-media";
const VALIDADE = 60 * 60 * 8;

export function tipoDoArquivo(f: File): "video" | "audio" | "image" {
  if (f.type.startsWith("audio")) return "audio";
  if (f.type.startsWith("image")) return "image";
  return "video";
}

function slug(nome: string) {
  return nome.replace(/[^\w.\-]/g, "_").slice(-80);
}

/** Miniatura real: frame a ~10% da duração do vídeo (ou a própria imagem reduzida). */
export async function gerarMiniatura(arquivo: File, kind: string): Promise<Blob | null> {
  try {
    if (kind === "image") return await reduzirImagem(arquivo);
    if (kind !== "video") return null;
    const url = URL.createObjectURL(arquivo);
    try {
      const el = document.createElement("video");
      el.src = url;
      el.muted = true;
      el.playsInline = true;
      el.preload = "auto";
      await new Promise<void>((r) => {
        const ok = () => r();
        el.onloadeddata = ok;
        el.onerror = ok;
        setTimeout(ok, 8000);
      });
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      await new Promise<void>((r) => {
        const ok = () => r();
        el.onseeked = ok;
        el.onerror = ok;
        try {
          el.currentTime = dur > 1 ? Math.min(dur - 0.1, dur * 0.1) : 0;
        } catch {
          ok();
        }
        setTimeout(ok, 6000);
      });
      const vw = el.videoWidth || 640;
      const vh = el.videoHeight || 360;
      const c = document.createElement("canvas");
      const largura = 480;
      c.width = largura;
      c.height = Math.max(1, Math.round((largura * vh) / vw));
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0, c.width, c.height);
      el.src = "";
      return await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.72));
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

async function reduzirImagem(arquivo: File): Promise<Blob | null> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((r) => {
      const ok = () => r();
      img.onload = ok;
      img.onerror = ok;
      setTimeout(ok, 6000);
    });
    const largura = 480;
    const c = document.createElement("canvas");
    c.width = largura;
    c.height = Math.max(1, Math.round((largura * (img.naturalHeight || 1)) / (img.naturalWidth || 1)));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.72));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function assinar(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, VALIDADE);
  return data?.signedUrl ?? null;
}

export function normalizarMidia(row: Record<string, unknown>, url: string, thumbUrl: string | null): MidiaGaleria {
  return {
    id: String(row.id),
    nome: String(row.name),
    kind: (String(row.kind) as MidiaGaleria["kind"]) ?? "video",
    durationMs: Number(row.duration_ms ?? 0),
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    sizeBytes: Number(row.size_bytes ?? 0),
    storagePath: String(row.storage_path),
    thumbPath: row.thumb_path ? String(row.thumb_path) : null,
    url,
    thumbUrl,
    criadoEm: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Assina as URLs de uma lista vinda do banco. */
export async function hidratarMidias(rows: Array<Record<string, unknown>>): Promise<MidiaGaleria[]> {
  const out: MidiaGaleria[] = [];
  for (const row of rows) {
    const url = await assinar(String(row.storage_path));
    if (!url) continue;
    const thumbUrl = await assinar(row.thumb_path ? String(row.thumb_path) : null);
    out.push(normalizarMidia(row, url, thumbUrl));
  }
  return out;
}

/** Faz upload permanente, gera miniatura e registra na galeria. */
export async function importarParaGaleria(
  arquivo: File,
  opcoes: { projectId?: string | null; aoProgredir?: (msg: string) => void } = {},
): Promise<MidiaGaleria> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error("Sessão expirada");

  const kind = tipoDoArquivo(arquivo);
  opcoes.aoProgredir?.(`Lendo ${arquivo.name}…`);
  const meta = kind === "image" ? { durationMs: 5000, width: 0, height: 0 } : await lerMetadados(arquivo);

  const base = `${uid}/galeria/${crypto.randomUUID()}`;
  const caminho = `${base}/${slug(arquivo.name)}`;
  opcoes.aoProgredir?.(`Enviando ${arquivo.name}…`);
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || (kind === "audio" ? "audio/mpeg" : "video/mp4"),
    upsert: false,
  });
  if (error) throw new Error(error.message);

  let thumbPath: string | null = null;
  const thumb = await gerarMiniatura(arquivo, kind);
  if (thumb) {
    thumbPath = `${base}/thumb.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (up.error) thumbPath = null;
  }

  const row = (await registrarAssetEditair({
    data: {
      projectId: opcoes.projectId ?? null,
      kind,
      name: arquivo.name,
      storagePath: caminho,
      thumbPath,
      mime: arquivo.type || null,
      sizeBytes: arquivo.size,
      durationMs: meta.durationMs,
      width: meta.width,
      height: meta.height,
    },
  })) as unknown as Record<string, unknown>;

  const url = await assinar(caminho);
  const thumbUrl = await assinar(thumbPath);
  if (!url) throw new Error("Não consegui liberar o arquivo enviado.");
  return normalizarMidia(row, url, thumbUrl);
}
