#!/usr/bin/env bash
# Validação do .app empacotado (roda no CI antes de publicar o artefato).
# Uso: scripts/verificar-app.sh "dist/mac-arm64/EditAir.app"
set -euo pipefail

APP="${1:?caminho do .app}"
echo "== Verificando $APP"

test -d "$APP" || { echo "ERRO: .app não encontrado"; exit 1; }

EXEC="$APP/Contents/MacOS/EditAir"
test -x "$EXEC" || { echo "ERRO: executável principal ausente ou sem +x"; exit 1; }

echo "-- arquitetura do executável principal"
lipo -archs "$EXEC"
lipo -archs "$EXEC" | grep -q arm64 || { echo "ERRO: app não é arm64"; exit 1; }

echo "-- sidecars FFmpeg/FFprobe"
UNPACKED="$APP/Contents/Resources/app.asar.unpacked/node_modules"

# ffprobe DEVE vir de bin/darwin/arm64 — qualquer outro diretório é erro de empacotamento
FFPROBE="$UNPACKED/ffprobe-static/bin/darwin/arm64/ffprobe"
if find "$UNPACKED/ffprobe-static/bin" -mindepth 1 -maxdepth 2 -type d 2>/dev/null | grep -vE "darwin(/arm64)?$" | grep -q .; then
  echo "ERRO: bundle contém binários de ffprobe de outras plataformas:"
  find "$UNPACKED/ffprobe-static/bin" -mindepth 1 -maxdepth 2 -type d
  exit 1
fi

FFMPEG=$(find "$UNPACKED/ffmpeg-static" -name ffmpeg -type f | head -n1 || true)
for BIN in "$FFMPEG" "$FFPROBE"; do
  test -n "$BIN" || { echo "ERRO: sidecar FFmpeg/FFprobe ausente"; exit 1; }
  test -f "$BIN" || { echo "ERRO: $BIN não existe"; exit 1; }
  test -x "$BIN" || { echo "ERRO: $BIN sem permissão de execução"; exit 1; }
  echo "   $BIN -> $(lipo -archs "$BIN")"
  lipo -archs "$BIN" | grep -q arm64 || { echo "ERRO: $BIN não tem slice arm64"; exit 1; }
  "$BIN" -version >/dev/null 2>&1 || { echo "ERRO: $BIN não executou"; exit 1; }
done

echo "-- assinatura"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E "Identifier|Signature|Format" || true

echo "-- Gatekeeper (informativo: build sem Apple Developer é rejeitado aqui)"
spctl -a -vvv -t exec "$APP" || true

echo "OK: bundle íntegro, arm64 e assinado (ad-hoc)."
