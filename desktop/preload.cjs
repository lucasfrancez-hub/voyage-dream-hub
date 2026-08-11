/* Ponte segura entre o app web do EditAir e as capacidades nativas.
   Nenhum acesso direto ao Node é exposto — apenas os canais listados. */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const chamar = async (canal, payload) => {
  const r = await ipcRenderer.invoke(canal, payload);
  if (!r?.ok) throw new Error(r?.erro || "Falha na operação local");
  return r.dados;
};

const ouvintes = (canal) => (cb) => {
  const fn = (_e, dados) => cb(dados);
  ipcRenderer.on(canal, fn);
  return () => ipcRenderer.removeListener(canal, fn);
};

contextBridge.exposeInMainWorld("editairDesktop", {
  disponivel: true,

  info: () => chamar("app:info"),
  settings: {
    ler: () => chamar("settings:ler"),
    salvar: (patch) => chamar("settings:salvar", patch),
  },

  // caminho real de um File arrastado do Finder (sem upload)
  caminhoDoArquivo: (file) => {
    try {
      return webUtils.getPathForFile(file) || null;
    } catch {
      return null;
    }
  },
  urlLocal: (caminho) => `editair-media://arquivo?p=${encodeURIComponent(caminho)}`,

  dialogo: {
    escolherMidias: () => chamar("dialogo:escolherMidias"),
    escolherPasta: () => chamar("dialogo:escolherPasta"),
    localizarArquivo: (nome) => chamar("dialogo:localizarArquivo", { nome }),
    salvarComo: (nomeSugerido, pasta) => chamar("dialogo:salvarComo", { nomeSugerido, pasta }),
    pastaExport: () => chamar("dialogo:pastaExport"),
  },

  arquivo: {
    abrir: (caminho) => chamar("arquivo:abrir", { caminho }),
    revelar: (caminho) => chamar("arquivo:revelar", { caminho }),
    salvarBytes: (nome, bytes) => chamar("arquivo:salvarBytes", { nome, bytes }),
  },


  diagnostico: {
    salvarTexto: (nome, texto) => chamar("diagnostico:salvarTexto", { nome, texto }),
    devTools: () => chamar("app:devTools"),
    importacao: () => chamar("diagnostico:importacao"),
  },

  biblioteca: {
    listar: () => chamar("biblioteca:listar"),
    importar: (caminhos, opcoes = {}) => chamar("biblioteca:importar", { caminhos, ...opcoes }),
    remover: (id, apagarArquivo = false) => chamar("biblioteca:remover", { id, apagarArquivo }),
    renomear: (id, nome) => chamar("biblioteca:renomear", { id, nome }),
    relinkar: (id, caminho) => chamar("biblioteca:relinkar", { id, caminho }),
    revelar: (caminho) => chamar("biblioteca:revelar", { caminho }),
  },

  midia: {
    probe: (caminho) => chamar("midia:probe", { caminho }),
    thumbnail: (caminho) => chamar("midia:thumbnail", { caminho }),
    waveform: (caminho, pontos) => chamar("midia:waveform", { caminho, pontos }),
    proxy: (caminho) => chamar("midia:proxy", { caminho }),
    extrairTrecho: (caminho, inicioMs, fimMs, somenteAudio = false) =>
      chamar("midia:extrairTrecho", { caminho, inicioMs, fimMs, somenteAudio }),
  },

  transcricao: {
    estado: () => chamar("transcricao:estado"),
    baixarModelo: () => chamar("transcricao:baixarModelo"),
    local: (opcoes) => chamar("transcricao:local", opcoes),
    limparCache: () => chamar("transcricao:limparCache"),
    aoProgredir: ouvintes("editair:transcricao"),
  },


  projeto: {
    listar: () => chamar("projeto:listar"),
    criar: (dados) => chamar("projeto:criar", dados),
    abrir: (id) => chamar("projeto:abrir", { id }),
    salvar: (id, patch) => chamar("projeto:salvar", { id, patch }),
    autosave: (id, estado) => chamar("projeto:autosave", { id, estado }),
    descartarRecuperacao: (id) => chamar("projeto:descartarRecuperacao", { id }),
    excluir: (id) => chamar("projeto:excluir", { id }),
  },

  cache: {
    tamanho: () => chamar("cache:tamanho"),
    limpar: () => chamar("cache:limpar"),
    mover: (destino) => chamar("cache:mover", { destino }),
  },

  render: {
    iniciar: (spec) => chamar("render:iniciar", spec),
    estado: (id) => chamar("render:estado", { id }),
    aoProgredir: ouvintes("editair:render"),
    quadros: {
      iniciar: (spec) => chamar("render:quadros:iniciar", spec),
      quadro: (id, quadro) => chamar("render:quadros:quadro", { id, quadro }),
      finalizar: (id) => chamar("render:quadros:finalizar", { id }),
      cancelar: (id) => chamar("render:quadros:cancelar", { id }),
    },
  },


  update: {
    estado: () => chamar("update:estado"),
    verificar: () => chamar("update:verificar"),
    baixar: () => chamar("update:baixar"),
    instalar: (forcar = false) => chamar("update:instalar", { forcar }),
    canal: (canal) => chamar("update:canal", { canal }),
    aoMudar: ouvintes("editair:update"),
  },

  aoAbrirConfiguracoes: ouvintes("editair:abrir-configuracoes"),
  aoAcionarMenu: ouvintes("editair:menu"),
});
