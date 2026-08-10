/* Biblioteca local persistente: referências a arquivos do computador.
   Guardada em JSON fora do bundle do app — uma atualização não a apaga. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { dirs } = require("./paths.cjs");
const media = require("./media.cjs");

const arquivo = () => path.join(dirs.raiz(), "library.json");

function ler() {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo(), "utf8"));
    return Array.isArray(j.assets) ? j : { schema: 1, assets: [] };
  } catch {
    return { schema: 1, assets: [] };
  }
}

function gravar(db) {
  fs.writeFileSync(arquivo(), JSON.stringify(db, null, 2));
  return db;
}

function comStatus(a) {
  const existe = a.localPath ? fs.existsSync(a.localPath) : false;
  return { ...a, missing: !existe };
}

function codecPrecisaProxy(a) {
  if (a.type !== "video") return false;
  const codec = String(a.videoCodec || "").toLowerCase();
  return !["h264", "av1", "vp8", "vp9"].includes(codec);
}

async function garantirProxyDePreview(a) {
  if (!codecPrecisaProxy(a) || !a.localPath || !fs.existsSync(a.localPath)) return a;
  if (a.proxyPath && fs.existsSync(a.proxyPath)) return a;
  const p = await media.proxy(a.localPath, a).catch(() => null);
  if (!p) return a;
  const db = ler();
  const salvo = db.assets.find((item) => item.id === a.id);
  if (salvo) {
    salvo.proxyPath = p;
    gravar(db);
  }
  return { ...a, proxyPath: p };
}

async function listar() {
  const assets = ler().assets;
  // HEVC/ProRes e outros codecs comuns em iPhone/câmeras não são decodificados
  // pelo Chromium. Antes de entregar a URL ao editor, garante H.264 local.
  const preparados = await Promise.all(assets.map(garantirProxyDePreview));
  return preparados.map(comStatus).sort((x, y) => String(y.importedAt).localeCompare(String(x.importedAt)));
}

function porId(id) {
  const a = ler().assets.find((x) => x.id === id);
  return a ? comStatus(a) : null;
}

/** Importa um arquivo local. Por padrão apenas referencia; pode copiar para a Biblioteca. */
async function importar(arquivoLocal, { copiar = false, gerarProxy = true, proxyAcimaDe = 1440 } = {}) {
  if (!fs.existsSync(arquivoLocal)) throw new Error(`Arquivo não encontrado: ${arquivoLocal}`);
  const db = ler();
  const jaTem = db.assets.find((a) => a.localPath === arquivoLocal);
  if (jaTem) return comStatus(jaTem);

  let destino = arquivoLocal;
  if (copiar) {
    const pasta = path.join(dirs.biblioteca(), crypto.randomUUID());
    fs.mkdirSync(pasta, { recursive: true });
    destino = path.join(pasta, path.basename(arquivoLocal));
    fs.copyFileSync(arquivoLocal, destino);
  }

  const meta = await media.probe(destino);
  let thumb = null;
  try {
    thumb = meta.kind === "audio" ? null : await media.thumbnail(destino, meta);
  } catch {
    thumb = null;
  }

  const asset = {
    id: crypto.randomUUID(),
    name: path.basename(destino),
    type: meta.kind,
    sourceType: "local",
    localPath: destino,
    copiado: copiar,
    thumbPath: thumb,
    proxyPath: null,
    durationMs: meta.durationMs,
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    sizeBytes: meta.sizeBytes,
    videoCodec: meta.videoCodec,
    audioCodec: meta.audioCodec,
    importedAt: new Date().toISOString(),
  };
  db.assets.push(asset);
  gravar(db);

  if (gerarProxy && meta.kind === "video" && meta.height >= proxyAcimaDe) {
    if (codecPrecisaProxy(asset)) {
      const p = await media.proxy(destino, meta).catch(() => null);
      if (p) {
        asset.proxyPath = p;
        const atual = ler();
        const alvo = atual.assets.find((a) => a.id === asset.id);
        if (alvo) {
          alvo.proxyPath = p;
          gravar(atual);
        }
      }
    } else {
      media
        .proxy(destino, meta)
        .then((p) => {
          if (!p) return;
          const atual = ler();
          const alvo = atual.assets.find((a) => a.id === asset.id);
          if (alvo) {
            alvo.proxyPath = p;
            gravar(atual);
          }
        })
        .catch(() => {});
    }
  }
  return comStatus(asset);
}

function remover(id, { apagarArquivo = false } = {}) {
  const db = ler();
  const alvo = db.assets.find((a) => a.id === id);
  if (alvo && apagarArquivo && alvo.copiado && alvo.localPath) {
    try {
      fs.rmSync(path.dirname(alvo.localPath), { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
  db.assets = db.assets.filter((a) => a.id !== id);
  gravar(db);
  return true;
}

function renomear(id, nome) {
  const db = ler();
  const alvo = db.assets.find((a) => a.id === id);
  if (!alvo) throw new Error("Mídia não encontrada");
  alvo.name = nome;
  gravar(db);
  return comStatus(alvo);
}

/** Arquivo movido no Finder: relinka mantendo o projeto e os cortes. */
async function relinkar(id, novoCaminho) {
  if (!fs.existsSync(novoCaminho)) throw new Error("Arquivo não encontrado");
  const db = ler();
  const alvo = db.assets.find((a) => a.id === id);
  if (!alvo) throw new Error("Mídia não encontrada");
  const meta = await media.probe(novoCaminho);
  alvo.localPath = novoCaminho;
  alvo.durationMs = meta.durationMs || alvo.durationMs;
  alvo.width = meta.width || alvo.width;
  alvo.height = meta.height || alvo.height;
  alvo.fps = meta.fps || alvo.fps;
  alvo.sizeBytes = meta.sizeBytes;
  alvo.proxyPath = null;
  try {
    alvo.thumbPath = meta.kind === "audio" ? null : await media.thumbnail(novoCaminho, meta);
  } catch {
    /* mantém */
  }
  gravar(db);
  return comStatus(alvo);
}

module.exports = { listar, porId, importar, remover, renomear, relinkar };
