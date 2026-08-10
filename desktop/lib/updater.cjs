/* Atualização real do aplicativo (electron-updater + GitHub Releases).
   Regras do briefing: canais stable/beta, download com progresso, changelog,
   nunca reiniciar durante uma exportação e rollback se o pacote for inválido. */
const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const { lerSettings } = require("./paths.cjs");

let janela = null;
let baixando = false;
let prontoParaInstalar = false;
let ultimaInfo = null;
const exportacoesEmAndamento = new Set();

function enviar(canal, payload) {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, payload);
}

function inicializar(win) {
  janela = win;
  const s = lerSettings();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = s.updateChannel === "beta";
  autoUpdater.channel = s.updateChannel === "beta" ? "beta" : "latest";

  autoUpdater.on("checking-for-update", () => enviar("editair:update", { estado: "verificando" }));
  autoUpdater.on("update-available", (info) => {
    ultimaInfo = info;
    enviar("editair:update", {
      estado: "disponivel",
      versao: info.version,
      notas: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
      data: info.releaseDate,
    });
  });
  autoUpdater.on("update-not-available", () => enviar("editair:update", { estado: "atualizado", versao: app.getVersion() }));
  autoUpdater.on("download-progress", (p) =>
    enviar("editair:update", {
      estado: "baixando",
      percentual: Math.round(p.percent),
      transferido: p.transferred,
      total: p.total,
      bytesPorSegundo: p.bytesPerSecond,
    }),
  );
  autoUpdater.on("update-downloaded", (info) => {
    baixando = false;
    prontoParaInstalar = true;
    enviar("editair:update", { estado: "pronto", versao: info.version, exportando: exportacoesEmAndamento.size > 0 });
  });
  autoUpdater.on("error", (err) => {
    baixando = false;
    // Falha de update nunca pode inutilizar o app: apenas informa e segue.
    enviar("editair:update", { estado: "erro", mensagem: String(err?.message || err) });
  });
}

async function verificar() {
  if (!app.isPackaged) return { estado: "dev", versao: app.getVersion() };
  try {
    const r = await autoUpdater.checkForUpdates();
    return r?.updateInfo
      ? { estado: "verificado", versao: r.updateInfo.version, atual: app.getVersion() }
      : { estado: "atualizado", versao: app.getVersion() };
  } catch (e) {
    return { estado: "erro", mensagem: String(e?.message || e) };
  }
}

async function baixar() {
  if (!app.isPackaged) throw new Error("Atualização só funciona no aplicativo instalado.");
  if (baixando) return { estado: "baixando" };
  baixando = true;
  await autoUpdater.downloadUpdate();
  return { estado: "baixando" };
}

function instalar({ forcar = false } = {}) {
  if (!prontoParaInstalar) throw new Error("Nenhuma atualização baixada.");
  if (exportacoesEmAndamento.size > 0 && !forcar) {
    return { estado: "adiado", motivo: "exportacao_em_andamento" };
  }
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { estado: "instalando" };
}

function definirCanal(canal) {
  autoUpdater.allowPrerelease = canal === "beta";
  autoUpdater.channel = canal === "beta" ? "beta" : "latest";
  return canal;
}

const marcarExportacao = (id) => exportacoesEmAndamento.add(id);
function encerrarExportacao(id) {
  exportacoesEmAndamento.delete(id);
  if (prontoParaInstalar && exportacoesEmAndamento.size === 0) {
    enviar("editair:update", { estado: "pronto", versao: ultimaInfo?.version ?? null, exportando: false });
  }
}

module.exports = {
  inicializar,
  verificar,
  baixar,
  instalar,
  definirCanal,
  marcarExportacao,
  encerrarExportacao,
  estado: () => ({
    versao: app.getVersion(),
    empacotado: app.isPackaged,
    baixando,
    prontoParaInstalar,
    canal: lerSettings().updateChannel,
    exportando: exportacoesEmAndamento.size > 0,
  }),
};
