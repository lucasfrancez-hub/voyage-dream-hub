#!/usr/bin/env bash
# Gate pré-empacotamento: os sidecars precisam existir e ser arm64 executáveis.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/bin/darwin/arm64"
falhar() { echo "ERRO: $*" >&2; exit 1; }

echo "== Conferindo sidecars em $DEST"
ls -l "$DEST" 2>&1 || falhar "pasta $DEST não existe (rode npm run prepare:mac-binaries)"

for nome in ffmpeg ffprobe whisper-cli; do
  bin="$DEST/$nome"
  [ -f "$bin" ] || falhar "$bin ausente"
  chmod 755 "$bin"
  echo "-- $nome"
  file -b "$bin" | sed 's/^/   file: /'
  lipo -archs "$bin" | sed 's/^/   lipo: /'
  shasum -a 256 "$bin" | sed 's/^/   sha256: /'
  [ "$(lipo -archs "$bin")" = "arm64" ] || falhar "$nome não é arm64 exclusivo"
  file -b "$bin" | grep -q "arm64" || falhar "$nome não é Mach-O arm64"
  if [ "$nome" = "whisper-cli" ]; then
    "$bin" -h >/dev/null 2>&1 || falhar "$nome não executou"
    echo "   ok: alinhador local responde"
  else
    "$bin" -version | head -n1 || falhar "$nome não executou"
  fi
done
echo "OK: sidecars arm64 prontos para o electron-builder"
