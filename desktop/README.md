# EditAir Desktop (macOS / Windows)

App Electron local-first: mídia, biblioteca, projetos, FFmpeg e render rodam no
computador; só a IA vai para a internet.

## Instalação para o usuário final (macOS)

1. Baixar `EditAir-<versão>-arm64.dmg`
2. Dois cliques no DMG → abre a janela com o ícone do EditAir e a seta para `Applications`
3. Arrastar **EditAir → Applications**
4. Ejetar o DMG e abrir o EditAir pelo Launchpad

Nada de Terminal, Homebrew, Node, npm ou FFmpeg: o FFmpeg/FFprobe vão
empacotados dentro do `.app` (`asarUnpack`).

> Enquanto não houver conta Apple Developer, o build é **não assinado**. Na
> primeira abertura o macOS mostra o aviso de app não verificado: botão direito
> no app → **Abrir** → **Abrir**. Depois de assinarmos + notarizarmos
> (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` nos
> secrets do repositório) o aviso some — a estrutura de build já está pronta
> para isso (Hardened Runtime + entitlements).

## Onde ficam os dados (nunca dentro do .app)

| Conteúdo | Local |
| --- | --- |
| Configurações, banco local, biblioteca, projetos, presets, autosave | `~/Library/Application Support/EditAir/` |
| Cache, thumbnails, waveforms | `~/Library/Caches/EditAir/` |
| Proxies / arquivos grandes | pasta escolhida pelo usuário nas Configurações |

Atualizar o app substitui só `/Applications/EditAir.app`; projetos e biblioteca
continuam intactos.

## Gerar builds

```bash
cd desktop
npm install
npm run build:mac        # DMG + ZIP arm64 (Apple Silicon) em desktop/dist
npm run build:mac:x64    # opcional, Macs Intel
npm run build:win        # instalador Windows
```

O build precisa rodar **em um Mac** (ou no runner `macos-14` do GitHub Actions);
o macOS é obrigatório para criar o `.dmg` e o `.icns`.

## Pipeline (GitHub Actions — `.github/workflows/editair-desktop.yml`)

- **Build de teste:** _Run workflow_ → canal `dev` ou `beta`. Gera
  `EditAir-1.0.0-dev.N-arm64.dmg` como artefato para download. **Não publica**
  nada, nenhum usuário instalado recebe update.
- **Release:** criar a tag `editair-vX.Y.Z`. Aí sim faz build, assina (se houver
  certificado), publica no GitHub Releases e o auto-update dos apps instalados
  detecta a nova versão.

Antes do primeiro release, preencher `owner`/`repo` em `desktop/package.json`
(`build.publish`).

## Checklist de aceite do DMG

1. Abrir o DMG e arrastar para Applications · 2. ejetar o DMG · 3. abrir pelo
Launchpad · 4. importar vídeo pelo Finder (drag-and-drop) · 5. thumbnail,
waveform, proxy e preview funcionando · 6. fechar e reabrir → projeto no mesmo
ponto (autosave) · 7. exportar vídeo localmente.

## Build de desenvolvimento no macOS (sem Apple Developer)

O build dev é assinado **ad-hoc** (`codesign --sign -`) pelo hook
`scripts/adhoc-sign.cjs`, com `hardenedRuntime` desligado. Isso é obrigatório no
Apple Silicon: sem assinatura válida o macOS acusa *"EditAir está danificado"*.
O workflow valida o pacote antes de publicar o artefato:

- `codesign --verify --deep --strict`
- arquitetura arm64 do app e dos sidecars FFmpeg/FFprobe
- presença, permissão `+x` e execução real (`-version`) dos binários
- `hdiutil verify` + montagem do DMG e revalidação do `.app` de dentro da imagem

### Primeira abertura (quarentena)

O Gatekeeper marca qualquer arquivo baixado pelo navegador com o atributo
`com.apple.quarantine`. Como ainda não há certificado Apple Developer, faça
**apenas** isto — nada de desligar a segurança do sistema:

1. Arraste o EditAir para `/Applications`.
2. Botão direito no app → **Abrir** → **Abrir**.

Se ainda assim aparecer "danificado", remova a quarentena **somente deste app**:

```bash
xattr -dr com.apple.quarantine /Applications/EditAir.app
```

Isso não altera nenhuma configuração global do macOS. Quando tivermos conta
Apple Developer, o release assinado + notarizado dispensa esse passo.
