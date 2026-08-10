/* Projetos locais (.editair) + autosave + recuperação de sessão.
   Migrações versionadas: uma atualização do app nunca destrói o projeto. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { dirs } = require("./paths.cjs");

const SCHEMA_ATUAL = 1;
const pastaProjeto = (id) => path.join(dirs.projetos(), id);
const arquivoProjeto = (id) => path.join(pastaProjeto(id), "project.json");
const arquivoRecuperacao = (id) => path.join(pastaProjeto(id), "autosave.json");

function migrar(dados) {
  let d = { ...dados };
  if (!d.schema) d.schema = 1;
  // futuras migrações: if (d.schema === 1) { ...; d.schema = 2 }
  return d;
}

function listar() {
  let ids = [];
  try {
    ids = fs.readdirSync(dirs.projetos(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    try {
      const j = JSON.parse(fs.readFileSync(arquivoProjeto(id), "utf8"));
      out.push({
        id,
        name: j.name ?? "Projeto",
        width: j.width ?? 1080,
        height: j.height ?? 1920,
        fps: j.fps ?? 30,
        updatedAt: j.updatedAt ?? null,
        temRecuperacao: fs.existsSync(arquivoRecuperacao(id)),
      });
    } catch {
      /* ignora projeto corrompido */
    }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function criar(dados = {}) {
  const id = dados.id || crypto.randomUUID();
  fs.mkdirSync(pastaProjeto(id), { recursive: true });
  const projeto = {
    schema: SCHEMA_ATUAL,
    id,
    name: dados.name || "Projeto sem título",
    width: dados.width ?? 1080,
    height: dados.height ?? 1920,
    fps: dados.fps ?? 30,
    assets: dados.assets ?? [],
    timeline: dados.timeline ?? { tracks: [] },
    transcript: dados.transcript ?? null,
    analysis: dados.analysis ?? null,
    settings: dados.settings ?? {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(arquivoProjeto(id), JSON.stringify(projeto, null, 2));
  return projeto;
}

function abrir(id) {
  if (!fs.existsSync(arquivoProjeto(id))) return null;
  const projeto = migrar(JSON.parse(fs.readFileSync(arquivoProjeto(id), "utf8")));
  const recuperacao = fs.existsSync(arquivoRecuperacao(id))
    ? JSON.parse(fs.readFileSync(arquivoRecuperacao(id), "utf8"))
    : null;
  return { projeto, recuperacao };
}

/** Escrita atômica: grava em .tmp e só então substitui — evita projeto corrompido. */
function salvar(id, patch) {
  const alvo = arquivoProjeto(id);
  const base = fs.existsSync(alvo) ? migrar(JSON.parse(fs.readFileSync(alvo, "utf8"))) : criar({ id });
  const novo = { ...base, ...patch, id, schema: SCHEMA_ATUAL, updatedAt: new Date().toISOString() };
  const tmp = `${alvo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(novo, null, 2));
  fs.renameSync(tmp, alvo);
  try {
    fs.rmSync(arquivoRecuperacao(id), { force: true });
  } catch {
    /* ignora */
  }
  return novo;
}

/** Autosave contínuo em arquivo separado: se o app cair, isso vira "recuperar projeto". */
function autosave(id, estado) {
  fs.mkdirSync(pastaProjeto(id), { recursive: true });
  const tmp = `${arquivoRecuperacao(id)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ estado, salvoEm: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, arquivoRecuperacao(id));
  return true;
}

function descartarRecuperacao(id) {
  fs.rmSync(arquivoRecuperacao(id), { force: true });
  return true;
}

function excluir(id) {
  fs.rmSync(pastaProjeto(id), { recursive: true, force: true });
  return true;
}

module.exports = { listar, criar, abrir, salvar, autosave, descartarRecuperacao, excluir, SCHEMA_ATUAL };
