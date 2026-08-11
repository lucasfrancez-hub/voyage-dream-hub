/* EditAir Desktop — processo principal.
   Local-first: mídia e edição na máquina; só a IA vai para a internet. */
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, Menu } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { dirs, lerSettings, salvarSettings, tamanhoDe, limparCache } = require("./lib/paths.cjs");
const media = require("./lib/media.cjs");
const library = require("./lib/library.cjs");
const projects = require("./lib/projects.cjs");
const updater = require("./lib/updater.cjs");

const URL_APP = process.env.EDITAIR_URL || "https://pedidos.viaair.tur.br/editair";
const ORIGEM_APP = new URL(URL_APP).origin;

const { responderMidia } = require("./lib/media-stream.cjs");

let janela = null;

// protocolo próprio para ler arquivos locais no <video>/<img> sem upload
protocol.registerSchemesAsPrivileged([
  {
    scheme: "editair-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

function criarJanela() {
  janela = new BrowserWindow({
    width: 1520,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0B0B0D",
    icon: path.join(__dirname, "assets", "icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // export roda em background: a janela não pode ser estrangulada nem em segundo plano
      backgroundThrottling: false,

    },
  });

  janela.loadURL(URL_APP);
  // sem internet: mostra tela própria com botão de tentar de novo (nunca tela branca)
  janela.webContents.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return;
    if (url.startsWith("file://")) return;
    janela.loadFile(path.join(__dirname, "offline.html"), { query: { url: URL_APP } });
  });
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  janela.on("closed", () => {
    janela = null;
  });
  updater.inicializar(janela);
  const s = lerSettings();
  if (s.autoCheckUpdates && app.isPackaged) setTimeout(() => updater.verificar().catch(() => {}), 4000);
}


app.whenReady().then(() => {
  // Serve arquivos locais com Range real. Vídeos MP4/MOV precisam de 206 para
  // buscar frames fora do início; encaminhar file:// pelo net.fetch não garante
  // esse comportamento em todas as versões/plataformas do Electron.
  protocol.handle("editair-media", (request) => responderMidia(request));

  criarJanela();
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function menuTemplate() {
  const mac = process.platform === "darwin";
  return [
    ...(mac
      ? [
          {
            label: "EditAir",
            submenu: [
              { role: "about", label: "Sobre o EditAir" },
              {
                label: "Verificar atualizações…",
                click: () => {
                  updater.verificar().catch(() => {});
                  janela?.webContents.send("editair:abrir-configuracoes", { aba: "atualizacoes" });
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide", label: "Ocultar EditAir" },
              { role: "hideOthers", label: "Ocultar outros" },
              { role: "unhide", label: "Mostrar tudo" },
              { type: "separator" },
              { role: "quit", label: "Encerrar EditAir" },
            ],
          },
        ]
      : []),
    {
      label: "Arquivo",
      submenu: [
        {
          label: "Importar mídia…",
          accelerator: "CmdOrCtrl+I",
          click: () => janela?.webContents.send("editair:menu", { acao: "importar" }),
        },
        {
          label: "Configurações",
          accelerator: "CmdOrCtrl+,",
          click: () => janela?.webContents.send("editair:abrir-configuracoes", { aba: "armazenamento" }),
        },
        mac ? { role: "close", label: "Fechar" } : { role: "quit", label: "Sair" },
      ],
    },
    { label: "Editar", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "Janela", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "minimize" }, { role: "zoom" }] },
  ];
}

/* ------------------------------ IPC ------------------------------ */

const responder = (canal, fn) =>
  ipcMain.handle(canal, async (_e, payload) => {
    try {
      return { ok: true, dados: await fn(payload ?? {}) };
    } catch (e) {
      return { ok: false, erro: String(e?.message || e) };
    }
  });

responder("app:info", async () => ({
  versao: app.getVersion(),
  plataforma: process.platform,
  arquitetura: process.arch,
  empacotado: app.isPackaged,
  capacidades: await media.capacidades(),
  settings: lerSettings(),
  pastas: { raiz: dirs.raiz(), cache: dirs.cache(), projetos: dirs.projetos(), biblioteca: dirs.biblioteca() },
}));

responder("settings:ler", async () => lerSettings());
responder("settings:salvar", async (patch) => {
  const novo = salvarSettings(patch);
  if (patch.updateChannel) updater.definirCanal(patch.updateChannel);
  return novo;
});

/* --- arquivos e biblioteca local --- */
responder("dialogo:escolherMidias", async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: "Importar mídia",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Mídia", extensions: ["mp4", "mov", "m4v", "webm", "mkv", "avi", "mp3", "wav", "m4a", "aac", "png", "jpg", "jpeg", "webp"] },
    ],
  });
  return r.canceled ? [] : r.filePaths;
});

responder("dialogo:escolherPasta", async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

responder("dialogo:localizarArquivo", async ({ nome }) => {
  const r = await dialog.showOpenDialog(janela, {
    title: nome ? `Localizar ${nome}` : "Localizar arquivo",
    properties: ["openFile"],
  });
  return r.canceled ? null : r.filePaths[0];
});

responder("dialogo:salvarComo", async ({ nomeSugerido = "video_final.mp4", pasta } = {}) => {
  const s = lerSettings();
  const base = pasta || s.ultimaPastaExport || app.getPath("movies");
  const r = await dialog.showSaveDialog(janela, { defaultPath: path.join(base, nomeSugerido) });
  if (r.canceled || !r.filePath) return null;
  salvarSettings({ ultimaPastaExport: path.dirname(r.filePath) });
  return r.filePath;
});

responder("dialogo:pastaExport", async () => {
  const s = lerSettings();
  return s.ultimaPastaExport || app.getPath("movies");
});

responder("arquivo:abrir", async ({ caminho }) => {
  const erro = await shell.openPath(caminho);
  if (erro) throw new Error(erro);
  return true;
});

/* Grava bytes vindos do renderer (ex.: mídia gerada por IA) num arquivo real
   dentro do cache, para que possa ser importado na Biblioteca como qualquer mídia. */
responder("arquivo:salvarBytes", async ({ nome = "midia.bin", bytes }) => {
  const pasta = path.join(dirs.cache(), "gerados");
  fs.mkdirSync(pasta, { recursive: true });
  const seguro = String(nome).replace(/[^\w.\-]+/g, "_").slice(-80) || "midia.bin";
  const destino = path.join(pasta, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${seguro}`);
  fs.writeFileSync(destino, Buffer.from(bytes));
  return destino;
});

responder("arquivo:revelar", async ({ caminho }) => {
  shell.showItemInFolder(caminho);
  return true;
});


responder("biblioteca:listar", async () => library.listar());
responder("biblioteca:importar", async ({ caminhos = [], copiar }) => {
  const s = lerSettings();
  const out = [];
  for (const c of caminhos) {
    out.push(
      await library.importar(c, {
        copiar: copiar ?? s.copiarParaBiblioteca,
        gerarProxy: s.proxyAutomatico,
        proxyAcimaDe: s.proxyAcimaDe,
      }),
    );
  }
  return out;
});
responder("biblioteca:remover", async ({ id, apagarArquivo }) => library.remover(id, { apagarArquivo }));
responder("biblioteca:renomear", async ({ id, nome }) => library.renomear(id, nome));
responder("biblioteca:relinkar", async ({ id, caminho }) => library.relinkar(id, caminho));
responder("biblioteca:revelar", async ({ caminho }) => {
  shell.showItemInFolder(caminho);
  return true;
});

/* --- engine local --- */
responder("midia:probe", async ({ caminho }) => media.probe(caminho));
responder("midia:thumbnail", async ({ caminho }) => media.thumbnail(caminho, await media.probe(caminho)));
responder("midia:waveform", async ({ caminho, pontos }) => media.waveform(caminho, pontos));
responder("midia:proxy", async ({ caminho }) => media.proxy(caminho, await media.probe(caminho)));
responder("midia:extrairTrecho", async ({ caminho, inicioMs, fimMs, somenteAudio }) =>
  media.extrairTrecho(caminho, inicioMs, fimMs, { somenteAudio }),
);

/* --- projetos locais --- */
responder("projeto:listar", async () => projects.listar());
responder("projeto:criar", async (dados) => projects.criar(dados));
responder("projeto:abrir", async ({ id }) => projects.abrir(id));
responder("projeto:salvar", async ({ id, patch }) => projects.salvar(id, patch));
responder("projeto:autosave", async ({ id, estado }) => projects.autosave(id, estado));
responder("projeto:descartarRecuperacao", async ({ id }) => projects.descartarRecuperacao(id));
responder("projeto:excluir", async ({ id }) => projects.excluir(id));

/* --- cache --- */
responder("cache:tamanho", async () => ({ bytes: tamanhoDe(dirs.cache()), caminho: dirs.cache() }));
responder("cache:limpar", async () => ({ bytes: limparCache(), caminho: dirs.cache() }));
responder("cache:mover", async ({ destino }) => {
  const novo = salvarSettings({ cacheDir: destino });
  return { caminho: dirs.cache(), settings: novo };
});

/* --- render local --- */
const renders = new Map();

responder("render:iniciar", async (spec) => {
  const id = crypto.randomUUID();
  const destino = spec.destino || path.join(dirs.renders(), `EditAir_${Date.now()}.${spec.formato || "mp4"}`);
  updater.marcarExportacao(id);
  renders.set(id, { destino, estado: "rodando" });
  const duracaoTotal =
    (spec.segmentos || []).reduce((t, s) => t + Math.max(0, (s.sourceOutMs ?? 0) - (s.sourceInMs ?? 0)), 0) / 1000;

  media
    .renderEDL({ ...spec, destino }, (linha) => {
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(linha);
      if (!m || !janela) return;
      const seg = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      janela.webContents.send("editair:render", {
        id,
        estado: "rodando",
        percentual: duracaoTotal ? Math.min(99, Math.round((seg / duracaoTotal) * 100)) : null,
      });
    })
    .then(() => {
      renders.set(id, { destino, estado: "concluido" });
      janela?.webContents.send("editair:render", { id, estado: "concluido", percentual: 100, destino });
    })
    .catch((e) => {
      renders.set(id, { destino, estado: "erro", erro: String(e.message || e) });
      janela?.webContents.send("editair:render", { id, estado: "erro", mensagem: String(e.message || e) });
    })
    .finally(() => updater.encerrarExportacao(id));

  return { id, destino };
});

responder("render:estado", async ({ id }) => renders.get(id) ?? null);

/* --- render por quadros (background, mesmo motor do preview) --- */
const rf = require("./lib/render-frames.cjs");
const { powerSaveBlocker } = require("electron");
const jobsQuadros = new Map();

responder("render:quadros:iniciar", async (spec) => {
  const id = crypto.randomUUID();
  const destino =
    spec.destino || path.join(dirs.renders(), `EditAir_${Date.now()}.${spec.formato || "mp4"}`);
  updater.marcarExportacao(id);
  const bloqueio = powerSaveBlocker.start("prevent-app-suspension");
  const job = await rf.iniciar({ ...spec, destino }, (frames, total) => {
    janela?.webContents.send("editair:render", {
      id,
      estado: "rodando",
      frame: frames,
      totalFrames: total,
      percentual: total ? Math.min(99, Math.round((frames / total) * 100)) : null,
    });
  });
  job.bloqueio = bloqueio;
  jobsQuadros.set(id, job);
  renders.set(id, { destino, estado: "rodando" });
  return { id, destino };
});

responder("render:quadros:quadro", async ({ id, quadro }) => {
  const job = jobsQuadros.get(id);
  if (!job) throw new Error("Render não encontrado");
  const buf = Buffer.from(quadro);
  await rf.enviarQuadro(job, buf);
  return { frames: job.frames };
});

function encerrarJob(id, job) {
  try {
    if (job.bloqueio != null) powerSaveBlocker.stop(job.bloqueio);
  } catch {
    /* ignora */
  }
  updater.encerrarExportacao(id);
  jobsQuadros.delete(id);
}

responder("render:quadros:finalizar", async ({ id }) => {
  const job = jobsQuadros.get(id);
  if (!job) throw new Error("Render não encontrado");
  try {
    const destino = await rf.finalizar(job);
    let bytes = 0;
    try {
      bytes = fs.statSync(destino).size;
    } catch {
      /* ignora */
    }
    renders.set(id, { destino, bytes, estado: "concluido" });
    janela?.webContents.send("editair:render", { id, estado: "concluido", percentual: 100, destino, bytes });
    return { destino, bytes };
  } catch (e) {
    renders.set(id, { destino: job.destino, estado: "erro", erro: String(e.message || e) });
    janela?.webContents.send("editair:render", { id, estado: "erro", mensagem: String(e.message || e) });
    throw e;
  } finally {
    encerrarJob(id, job);
  }
});

responder("render:quadros:cancelar", async ({ id }) => {
  const job = jobsQuadros.get(id);
  if (!job) return true;
  rf.cancelar(job);
  renders.set(id, { destino: job.destino, estado: "cancelado" });
  encerrarJob(id, job);
  janela?.webContents.send("editair:render", { id, estado: "cancelado" });
  return true;
});


/* --- atualização --- */
responder("update:estado", async () => updater.estado());
responder("update:verificar", async () => updater.verificar());
responder("update:baixar", async () => updater.baixar());
responder("update:instalar", async ({ forcar } = {}) => updater.instalar({ forcar }));
responder("update:canal", async ({ canal }) => {
  salvarSettings({ updateChannel: canal });
  return { canal: updater.definirCanal(canal) };
});

// segurança: nenhuma outra origem pode falar com o processo principal
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== ORIGEM_APP) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
