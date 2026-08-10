/* Diretórios, settings e cache do EditAir Desktop.
   Regra do briefing: dados do usuário (biblioteca, projetos, configurações) vivem
   FORA do bundle do app, para que uma atualização nunca os apague. */
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const raiz = () => path.join(app.getPath("userData"), "EditAir");
const arquivoSettings = () => path.join(raiz(), "settings.json");

const PADRAO = {
  schema: 1,
  updateChannel: "stable",
  autoCheckUpdates: true,
  cacheDir: null, // null = padrão dentro de raiz()/Cache
  copiarParaBiblioteca: false,
  proxyAutomatico: true,
  proxyAcimaDe: 1440, // altura mínima para gerar proxy
  aceleracaoHardware: true,
};

function garantir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function lerSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(arquivoSettings(), "utf8"));
    return { ...PADRAO, ...raw };
  } catch {
    return { ...PADRAO };
  }
}

function salvarSettings(patch) {
  const novo = { ...lerSettings(), ...patch };
  garantir(raiz());
  fs.writeFileSync(arquivoSettings(), JSON.stringify(novo, null, 2));
  return novo;
}

function cacheRaiz() {
  const s = lerSettings();
  return garantir(s.cacheDir || path.join(raiz(), "Cache"));
}

const dirs = {
  raiz: () => garantir(raiz()),
  biblioteca: () => garantir(path.join(raiz(), "Biblioteca")),
  projetos: () => garantir(path.join(raiz(), "Projetos")),
  cache: () => cacheRaiz(),
  thumbnails: () => garantir(path.join(cacheRaiz(), "thumbnails")),
  waveforms: () => garantir(path.join(cacheRaiz(), "waveforms")),
  proxies: () => garantir(path.join(cacheRaiz(), "proxies")),
  transcripts: () => garantir(path.join(cacheRaiz(), "transcripts")),
  renders: () => garantir(path.join(cacheRaiz(), "renders")),
};

function tamanhoDe(dir) {
  let total = 0;
  const pilha = [dir];
  while (pilha.length) {
    const atual = pilha.pop();
    let itens = [];
    try {
      itens = fs.readdirSync(atual, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const it of itens) {
      const p = path.join(atual, it.name);
      if (it.isDirectory()) pilha.push(p);
      else {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* ignora */
        }
      }
    }
  }
  return total;
}

function limparCache() {
  const base = cacheRaiz();
  for (const nome of ["thumbnails", "waveforms", "proxies", "transcripts"]) {
    const p = path.join(base, nome);
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
    garantir(p);
  }
  return tamanhoDe(base);
}

module.exports = { dirs, lerSettings, salvarSettings, tamanhoDe, limparCache, garantir };
