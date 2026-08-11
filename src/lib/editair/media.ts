/* Miniaturas e picos de áudio reais para a timeline (cache em memória). */

const thumbCache = new Map<string, string>();
const videoPool = new Map<string, HTMLVideoElement>();
const filaPorAsset = new Map<string, Promise<unknown>>();
const picosCache = new Map<string, number[]>();
const picosPend = new Map<string, Promise<number[] | null>>();

function pegarVideo(assetId: string, url: string) {
  let el = videoPool.get(assetId);
  if (!el) {
    el = document.createElement("video");
    el.src = url;
    // arquivos locais do Desktop (editair-media://) recusam CORS explícito
    if (!/^(editair-media:|blob:|file:)/.test(url)) el.crossOrigin = "anonymous";
    el.muted = true;
    el.preload = "metadata";
    el.playsInline = true;
    videoPool.set(assetId, el);
  }
  return el;
}

/** Miniatura do frame no instante ms do arquivo original. */
export async function obterThumb(assetId: string, url: string, ms: number, largura = 72): Promise<string | null> {
  const chave = `${assetId}:${Math.round(ms / 250)}:${largura}`;
  const pronto = thumbCache.get(chave);
  if (pronto) return pronto;

  const anterior = filaPorAsset.get(assetId) ?? Promise.resolve();
  const tarefa = anterior.then(async () => {
    const cached = thumbCache.get(chave);
    if (cached) return cached;
    const el = pegarVideo(assetId, url);
    try {
      if (el.readyState < 1) {
        await new Promise<void>((r) => {
          const ok = () => r();
          el.onloadedmetadata = ok;
          el.onerror = ok;
          setTimeout(ok, 6000);
        });
      }
      await new Promise<void>((r) => {
        const ok = () => r();
        el.onseeked = ok;
        el.onerror = ok;
        try {
          el.currentTime = Math.max(0, Math.min((el.duration || 0) - 0.05, ms / 1000));
        } catch {
          ok();
        }
        setTimeout(ok, 4000);
      });
      const vw = el.videoWidth || 16;
      const vh = el.videoHeight || 9;
      const c = document.createElement("canvas");
      c.width = largura;
      c.height = Math.max(1, Math.round((largura * vh) / vw));
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.6);
      thumbCache.set(chave, data);
      return data;
    } catch (e) {
      console.error(`[thumbnail:error] asset=${assetId}`, e);
      return null;
    }
  });
  filaPorAsset.set(assetId, tarefa.catch(() => null));
  return tarefa;
}

/** Picos normalizados (0..1) do áudio real do arquivo. */
export async function obterPicos(assetId: string, url: string, pontos = 900): Promise<number[] | null> {
  const c = picosCache.get(assetId);
  if (c) return c;
  const pend = picosPend.get(assetId);
  if (pend) return pend;

  const p = (async () => {
    try {
      const resp = await fetch(url);
      const buf = await resp.arrayBuffer();
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const audio = await ctx.decodeAudioData(buf);
      void ctx.close();
      const canal = audio.getChannelData(0);
      const passo = Math.max(1, Math.floor(canal.length / pontos));
      const out: number[] = [];
      let pico = 0.0001;
      for (let i = 0; i < pontos; i++) {
        let max = 0;
        const ini = i * passo;
        for (let j = 0; j < passo; j += 8) max = Math.max(max, Math.abs(canal[ini + j] ?? 0));
        out.push(max);
        pico = Math.max(pico, max);
      }
      const norm = out.map((v) => v / pico);
      picosCache.set(assetId, norm);
      return norm;
    } catch (e) {
      console.warn(`[thumbnail] sem forma de onda asset=${assetId}`, e);
      return null;
    } finally {
      picosPend.delete(assetId);
    }
  })();
  picosPend.set(assetId, p);
  return p;
}

export function limparCacheMidia() {
  thumbCache.clear();
  for (const [, el] of videoPool) el.src = "";
  videoPool.clear();
  picosCache.clear();
}
