# EditAir Desktop (macOS primeiro, Windows depois)

Shell nativo do EditAir: **mídia e edição locais, IA online, atualização automática**.
A interface é exatamente a mesma do EditAir web (`/editair`) — o shell só adiciona as capacidades nativas.

## Arquitetura

```
EditAir Desktop
├── main.cjs          processo principal (janela, menus, IPC, protocolo editair-media://)
├── preload.cjs       ponte segura (contextIsolation) exposta como window.editairDesktop
└── lib/
    ├── paths.cjs     pastas do usuário (Biblioteca, Projetos, Cache) + settings
    ├── media.cjs     FFmpeg/FFprobe: probe, thumbnail, waveform, proxy, trecho, render EDL
    ├── library.cjs   biblioteca local persistente (referência ou cópia) + relink
    ├── projects.cjs  projetos .editair com save atômico, autosave/recovery e migrações
    └── updater.cjs   electron-updater (GitHub), canais stable/beta, trava durante export
```

No lado web, a ponte é tipada em `src/lib/editair/desktop.ts` e a tela de configurações em
`src/components/editair/DesktopSettingsDialog.tsx`. Sem o shell, tudo continua funcionando no
navegador pelo caminho cloud atual.

### Por que Electron e não Tauri
O engine atual do EditAir (WebCodecs, canvas, MediaPipe, ffmpeg.wasm, Remotion) é JS puro e depende
do Chromium; o Electron mantém o mesmo runtime em todas as máquinas, empacota FFmpeg nativo por
`ffmpeg-static` e traz `electron-updater` (delta, canais, assinatura) pronto. Tauri exigiria reescrever
a camada de mídia em Rust e lidar com WebViews diferentes por SO.

## Mídia local sem upload
- Drag-and-drop do Finder: `webUtils.getPathForFile` devolve o caminho real do arquivo.
- Preview: protocolo `editair-media://arquivo?p=<caminho>` faz streaming com Range (seek funciona).
- Importar **referencia** o arquivo por padrão; copiar para a Biblioteca é opcional (Configurações → Importação).
- Arquivo movido: a biblioteca marca `existe: false` e a UI oferece “Localizar arquivo” (relink sem perder edição).
- Proxy automático (720p) para arquivos acima da altura configurada; a exportação sempre usa o original.

## Desenvolvimento

```bash
cd desktop
npm install
npm run dev      # aponta para http://localhost:8080/editair
npm start        # aponta para produção (EDITAIR_URL)
```

## Build e distribuição

```bash
npm run build:mac    # EditAir-<versão>-arm64.dmg + .zip em desktop/dist
npm run build:win    # instalador NSIS
```

Antes do primeiro release, trocar em `package.json` → `build.publish`:
`owner`/`repo` do repositório GitHub que hospedará as releases.

Assinatura/notarização macOS (evita o aviso de origem desconhecida) via variáveis:
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

Release automático: crie a tag `editair-v1.1.0` — o workflow `.github/workflows/editair-desktop.yml`
compila mac + windows e publica no GitHub Releases, que é a origem verificada do auto-update.

## Atualização
- Verificação silenciosa ao abrir (desligável) + botão em Configurações → Sobre.
- Download com progresso real, changelog da release e instalação com reinício.
- Nunca reinicia com exportação em andamento; instala ao terminar.
- Dados do usuário ficam em `userData/EditAir` — separados do app, preservados em qualquer update,
  com migrações versionadas de schema.
