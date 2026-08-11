/* Alinhador de fala LOCAL (whisper.cpp) — fonte oficial dos timestamps por palavra.
 *
 * Regra do briefing: o tempo é ACÚSTICO. Nada aqui pede tempo para LLM.
 * Pipeline: arquivo -> ffmpeg (WAV 16k mono) -> whisper-cli (-ojf, DTW) -> palavras.
 * O texto pode depois ser refinado pelo Gemini, mas os tempos NUNCA mudam.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { dirs } = require("./paths.cjs");

/** versão do pipeline: entra na chave de cache (mudou pipeline = recalcula) */
const VERSAO_PIPELINE = "1";

const MODELO = {
  id: "large-v3-turbo-q5_0",
  arquivo: "ggml-large-v3-turbo-q5_0.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin?download=true",
  bytesAprox: 574_041_600,
  /** presets de alinhamento DTW do whisper.cpp para este modelo */
  dtw: "large.v3.turbo",
};

function resolverBinario(nome) {
  const arquivo = process.platform === "win32" ? `${nome}.exe` : nome;
  const candidatos = [
    path.join(process.resourcesPath || "", "bin", arquivo),
    path.join(__dirname, "..", "bin", process.platform, process.arch, arquivo),
  ];
  return candidatos.find((p) => p && fs.existsSync(p)) || candidatos[0];
}

const WHISPER = resolverBinario("whisper-cli");
const FFMPEG = resolverBinario("ffmpeg");

const caminhoModelo = () => path.join(dirs.modelos(), MODELO.arquivo);

function existeBinario() {
  try {
    return Boolean(WHISPER && fs.existsSync(WHISPER));
  } catch {
    return false;
  }
}

function tamanho(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function estado() {
  const mp = caminhoModelo();
  const bytes = tamanho(mp);
  return {
    disponivel: existeBinario(),
    binario: WHISPER,
    versaoPipeline: VERSAO_PIPELINE,
    modelo: {
      id: MODELO.id,
      arquivo: MODELO.arquivo,
      caminho: mp,
      presente: bytes > 100_000_000,
      bytes,
      bytesAprox: MODELO.bytesAprox,
    },
    cacheDir: dirs.transcripts(),
  };
}

/* ------------------------- download do modelo ------------------------- */

let baixando = null;

function baixarModelo(onProgress) {
  if (baixando) return baixando;
  const destino = caminhoModelo();
  if (tamanho(destino) > 100_000_000) return Promise.resolve(estado().modelo);

  baixando = new Promise((resolve, reject) => {
    const tmp = `${destino}.part`;
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignora */
    }
    const saida = fs.createWriteStream(tmp);
    let recebido = 0;
    let total = MODELO.bytesAprox;

    const pedir = (url, redirecoes = 0) => {
      https
        .get(url, { headers: { "User-Agent": "EditAir" } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirecoes > 5) return reject(new Error("Muitos redirecionamentos ao baixar o modelo"));
            res.resume();
            return pedir(res.headers.location, redirecoes + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Download do modelo falhou (HTTP ${res.statusCode})`));
          }
          const len = Number(res.headers["content-length"] || 0);
          if (len > 0) total = len;
          res.on("data", (c) => {
            recebido += c.length;
            if (onProgress) onProgress({ recebido, total, percentual: Math.min(99, Math.round((recebido / total) * 100)) });
          });
          res.pipe(saida);
          saida.on("finish", () => {
            saida.close(() => {
              try {
                fs.renameSync(tmp, destino);
                resolve(estado().modelo);
              } catch (e) {
                reject(e);
              }
            });
          });
        })
        .on("error", (e) => {
          try {
            fs.rmSync(tmp, { force: true });
          } catch {
            /* ignora */
          }
          reject(e);
        });
    };
    pedir(MODELO.url);
  }).finally(() => {
    baixando = null;
  });

  return baixando;
}

/* ------------------------------ execução ------------------------------ */

function exec(bin, args, { onStderr, sinal } = {}) {
  return new Promise((resolve, reject) => {
    const ps = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    ps.stdout.on("data", (d) => {
      out += d.toString();
      if (out.length > 8_000_000) out = out.slice(-4_000_000);
    });
    ps.stderr.on("data", (d) => {
      const t = d.toString();
      err += t;
      if (err.length > 200_000) err = err.slice(-100_000);
      if (onStderr) onStderr(t);
    });
    if (sinal) sinal.cancelar = () => ps.kill("SIGKILL");
    ps.on("error", reject);
    ps.on("close", (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(err.slice(-1500) || `código ${code}`))));
  });
}

/** WAV 16 kHz mono PCM — formato exigido pelo whisper.cpp. */
async function paraWav16k(entrada, saida, { inicioMs = 0, fimMs } = {}) {
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  if (inicioMs > 0) args.push("-ss", (inicioMs / 1000).toFixed(3));
  args.push("-i", entrada);
  if (typeof fimMs === "number" && fimMs > inicioMs) args.push("-t", ((fimMs - inicioMs) / 1000).toFixed(3));
  args.push("-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", saida);
  await exec(FFMPEG, args);
  if (!fs.existsSync(saida) || tamanho(saida) < 1024) throw new Error("Não foi possível extrair o áudio deste arquivo");
  return saida;
}

const NAO_FALA = /^\s*\[[^\]]*\]\s*$/; // [_BEG_], [BLANK_AUDIO], [MÚSICA]…

/**
 * Agrupa tokens do whisper em PALAVRAS.
 * Token com espaço à esquerda inicia palavra nova; subtokens continuam a atual.
 * O tempo da palavra é o do primeiro/último token que a compõem — puro acústico.
 */
function tokensParaPalavras(transcricao) {
  const palavras = [];
  let atual = null;
  const fechar = () => {
    if (atual && atual.w.trim()) {
      const w = atual.w.trim();
      palavras.push({
        w,
        start: Math.max(0, Math.round(atual.start)),
        end: Math.max(Math.round(atual.start) + 20, Math.round(atual.end)),
        conf: Number(Math.max(0, Math.min(1, atual.p)).toFixed(3)),
      });
    }
    atual = null;
  };

  for (const seg of transcricao || []) {
    const tokens = seg.tokens && seg.tokens.length ? seg.tokens : null;
    if (!tokens) {
      // fallback: segmento inteiro vira uma "palavra" (nunca deveria acontecer com -ojf)
      const txt = String(seg.text || "").trim();
      if (txt && !NAO_FALA.test(txt)) {
        palavras.push({
          w: txt,
          start: Math.round(seg.offsets?.from ?? 0),
          end: Math.round(seg.offsets?.to ?? 0),
          conf: 0.5,
        });
      }
      continue;
    }
    for (const t of tokens) {
      const texto = String(t.text ?? "");
      if (!texto || NAO_FALA.test(texto) || texto.startsWith("[_")) continue;
      const de = Math.round(t.offsets?.from ?? seg.offsets?.from ?? 0);
      const ate = Math.round(t.offsets?.to ?? seg.offsets?.to ?? de);
      const p = typeof t.p === "number" ? t.p : 0.8;
      if (/^\s/.test(texto) || !atual) {
        fechar();
        atual = { w: texto.trim(), start: de, end: ate, p };
      } else {
        atual.w += texto;
        atual.end = Math.max(atual.end, ate);
        atual.p = Math.min(atual.p, p);
      }
    }
    fechar();
  }
  return palavras.filter((p) => p.w.length > 0 && p.end > p.start);
}

function chaveCache({ caminho, idioma, inicioMs, fimMs }) {
  let st = { size: 0, mtimeMs: 0 };
  try {
    st = fs.statSync(caminho);
  } catch {
    /* ignora */
  }
  return crypto
    .createHash("sha1")
    .update([caminho, st.size, Math.round(st.mtimeMs), MODELO.id, VERSAO_PIPELINE, idioma, inicioMs, fimMs ?? ""].join("|"))
    .digest("hex")
    .slice(0, 24);
}

/**
 * Transcreve/alinha um arquivo local.
 * @returns { words, fonte, modelo, versaoPipeline, msDecorridos, cache }
 */
async function transcrever({ caminho, idioma = "pt", inicioMs = 0, fimMs = null, ignorarCache = false }, onProgress) {
  if (!caminho || !fs.existsSync(caminho)) throw new Error("Arquivo de mídia não encontrado no disco");
  if (!existeBinario()) throw new Error("Alinhador local (whisper.cpp) não está instalado neste build");

  const chave = chaveCache({ caminho, idioma, inicioMs, fimMs });
  const arquivoCache = path.join(dirs.transcripts(), `whisper-${chave}.json`);
  if (!ignorarCache && fs.existsSync(arquivoCache)) {
    try {
      const dados = JSON.parse(fs.readFileSync(arquivoCache, "utf8"));
      if (Array.isArray(dados.words) && dados.words.length) {
        if (onProgress) onProgress({ etapa: "cache", percentual: 100 });
        return { ...dados, cache: true };
      }
    } catch {
      /* cache corrompido: recalcula */
    }
  }

  const modelo = caminhoModelo();
  if (tamanho(modelo) < 100_000_000) {
    if (onProgress) onProgress({ etapa: "modelo", percentual: 0 });
    await baixarModelo((p) => onProgress && onProgress({ etapa: "modelo", ...p }));
  }

  const t0 = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "editair-whisper-"));
  const wav = path.join(tmpDir, "audio.wav");
  const base = path.join(tmpDir, "saida");

  try {
    if (onProgress) onProgress({ etapa: "audio", percentual: 0 });
    await paraWav16k(caminho, wav, { inicioMs, fimMs: fimMs ?? undefined });

    const args = [
      "-m", modelo,
      "-f", wav,
      "-l", idioma || "auto",
      "-ojf",                 // JSON completo (tokens + offsets)
      "-of", base,
      "-pp",                  // imprime progresso no stderr
      "-np",                  // sem prints decorativos
      "-t", String(Math.max(2, Math.min(8, os.cpus().length - 2))),
      "-mc", "0",             // sem contexto entre janelas: evita alucinação/deriva
      "-et", "2.8",           // corta looping de entropia
      "-dtw", MODELO.dtw,     // alinhamento DTW = timestamps acústicos por token
    ];

    const rodar = (lista) =>
      exec(WHISPER, lista, {
        onStderr: (t) => {
          const m = /progress\s*=\s*(\d+)%/i.exec(t);
          if (m && onProgress) onProgress({ etapa: "transcrever", percentual: Number(m[1]) });
        },
      });

    try {
      await rodar(args);
    } catch (e) {
      // build sem preset DTW: repete sem -dtw (timestamps por token continuam acústicos)
      if (/dtw|aheads/i.test(String(e.message || ""))) {
        await rodar(args.filter((a, i, arr) => a !== "-dtw" && arr[i - 1] !== "-dtw"));
      } else {
        throw e;
      }
    }

    if (onProgress) onProgress({ etapa: "alinhar", percentual: 100 });
    const arquivoJson = `${base}.json`;
    if (!fs.existsSync(arquivoJson)) throw new Error("O alinhador não gerou saída");
    const json = JSON.parse(fs.readFileSync(arquivoJson, "utf8"));
    const palavras = tokensParaPalavras(json.transcription).map((p) => ({
      ...p,
      start: p.start + inicioMs,
      end: p.end + inicioMs,
    }));

    const resultado = {
      words: palavras,
      fonte: "whisper-local",
      modelo: MODELO.id,
      versaoPipeline: VERSAO_PIPELINE,
      idioma,
      msDecorridos: Date.now() - t0,
      cache: false,
    };
    try {
      fs.writeFileSync(arquivoCache, JSON.stringify(resultado));
    } catch {
      /* cache é best-effort */
    }
    return resultado;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
}

function limparCacheTranscricoes() {
  const dir = dirs.transcripts();
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("whisper-")) {
      try {
        fs.rmSync(path.join(dir, f), { force: true });
        n++;
      } catch {
        /* ignora */
      }
    }
  }
  return { removidos: n };
}

module.exports = { estado, baixarModelo, transcrever, limparCacheTranscricoes, MODELO, VERSAO_PIPELINE };
