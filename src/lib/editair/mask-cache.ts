/* Cache das máscaras de recorte do EditAir.
   A IA de segmentação é cara, então guardamos a máscara BRUTA (baixa resolução,
   1 byte por pixel) por asset + frame + versão do modelo. Refinamentos
   (feather, expandir/contrair, halo) e o contorno são aplicados na hora de
   desenhar — trocar cor/espessura nunca reprocessa a IA. */

export const VERSAO_MODELO = "selfie-v1";

export type MascaraBruta = { w: number; h: number; dados: Uint8Array };

const DB = "editair-mascaras";
const STORE = "mascaras";

let dbp: Promise<IDBDatabase | null> | null = null;

function abrir(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export function chaveMascara(assetId: string, qualidade: string, frame: number) {
  return `${assetId}|${VERSAO_MODELO}|${qualidade}|${frame}`;
}

/** cache quente em memória (evita ida ao IndexedDB durante a reprodução) */
const memoria = new Map<string, MascaraBruta>();
const LIMITE_MEM = 900;

export function lerMemoria(chave: string) {
  return memoria.get(chave) ?? null;
}

export function gravarMemoria(chave: string, m: MascaraBruta) {
  if (memoria.size > LIMITE_MEM) {
    const primeiro = memoria.keys().next().value as string | undefined;
    if (primeiro) memoria.delete(primeiro);
  }
  memoria.set(chave, m);
}

export async function lerMascara(chave: string): Promise<MascaraBruta | null> {
  const quente = memoria.get(chave);
  if (quente) return quente;
  const db = await abrir();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(chave);
      req.onsuccess = () => {
        const v = req.result as MascaraBruta | undefined;
        if (v) gravarMemoria(chave, v);
        resolve(v ?? null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function gravarMascara(chave: string, m: MascaraBruta) {
  gravarMemoria(chave, m);
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(m, chave);
  } catch {
    /* cache é best-effort */
  }
}

/** Remove todas as máscaras de um asset (ex.: mídia recarregada/substituída). */
export async function limparAsset(assetId: string) {
  for (const k of [...memoria.keys()]) if (k.startsWith(`${assetId}|`)) memoria.delete(k);
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openKeyCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      if (String(cur.key).startsWith(`${assetId}|`)) store.delete(cur.key);
      cur.continue();
    };
  } catch {
    /* ignora */
  }
}

/** Quantos frames do intervalo já estão em cache (0..1). */
export async function coberturaCache(assetId: string, qualidade: string, frames: number[]) {
  if (!frames.length) return 0;
  let ok = 0;
  for (const f of frames) {
    if (await lerMascara(chaveMascara(assetId, qualidade, f))) ok++;
  }
  return ok / frames.length;
}
