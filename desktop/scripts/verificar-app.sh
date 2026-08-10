#!/usr/bin/env bash
# Validação do .app empacotado (roda no CI antes de publicar o artefato).
# Uso: scripts/verificar-app.sh "dist/mac-arm64/EditAir.app"
#
# Regra: NENHUM exit 1 sem diagnóstico. Toda falha imprime comando, caminho,
# `ls -l`, `file` e a saída bruta do `lipo` antes de abortar.
set -uo pipefail

APP="${1:?caminho do .app}"
echo "== Verificando $APP"
echo "-- ambiente"
echo "   pwd=$(pwd)"
echo "   uname=$(uname -m)  bash=${BASH_VERSION}"
echo "   lipo=$(command -v lipo || echo 'AUSENTE')  file=$(command -v file || echo 'AUSENTE')  codesign=$(command -v codesign || echo 'AUSENTE')"

falhar() {
  echo "ERRO: $1"
  shift || true
  for p in "$@"; do
    echo "   -- diagnóstico de: $p"
    ls -l "$p" 2>&1 | sed 's/^/      ls: /' || true
    file -b "$p" 2>&1 | sed 's/^/      file: /' || true
    lipo -archs "$p" 2>&1 | sed 's/^/      lipo: /' || true
  done
  echo "   -- conteúdo relevante do bundle"
  ls -l "$APP/Contents/MacOS" 2>&1 | sed 's/^/      /' || true
  exit 1
}

# Arquiteturas de um binário: usa lipo e, se ele falhar, cai para `file`.
arquiteturas() {
  local bin="$1" out
  if out=$(lipo -archs "$bin" 2>&1); then
    echo "$out"
    return 0
  fi
  echo "   aviso: 'lipo -archs' falhou ($out); usando 'file' como fallback" >&2
  file -b "$bin" 2>/dev/null | tr ',' '\n' | grep -oE 'arm64|x86_64' | sort -u | tr '\n' ' '
}

if [ ! -d "$APP" ]; then
  echo "ERRO: .app não encontrado em $APP"
  echo "   -- conteúdo de dist/"
  ls -lR dist 2>&1 | head -n 60 | sed 's/^/      /' || true
  exit 1
fi

EXEC="$APP/Contents/MacOS/EditAir"
echo "-- executável principal: $EXEC"
ls -l "$APP/Contents/MacOS" | sed 's/^/   /'
[ -f "$EXEC" ] || falhar "executável principal ausente" "$EXEC"
[ -x "$EXEC" ] || falhar "executável principal sem +x" "$EXEC"

echo "-- arquitetura do executável principal (comando: lipo -archs \"$EXEC\")"
ARCHS_EXEC="$(arquiteturas "$EXEC")"
echo "   archs: '${ARCHS_EXEC}'"
echo "   file: $(file -b "$EXEC" 2>&1)"
case "$ARCHS_EXEC" in
  *arm64*) : ;;
  *) falhar "app não é arm64 (archs='${ARCHS_EXEC}')" "$EXEC" ;;
esac

echo "-- sidecars FFmpeg/FFprobe"
UNPACKED="$APP/Contents/Resources/app.asar.unpacked/node_modules"
[ -d "$UNPACKED" ] || falhar "app.asar.unpacked ausente (asarUnpack não aplicou)" "$APP/Contents/Resources"

FFPROBE_BIN_DIR="$UNPACKED/ffprobe-static/bin"
if [ -d "$FFPROBE_BIN_DIR" ]; then
  echo "   -- árvore de ffprobe-static/bin"
  find "$FFPROBE_BIN_DIR" -mindepth 1 -maxdepth 2 | sed 's/^/      /'
  EXTRAS=$(find "$FFPROBE_BIN_DIR" -mindepth 1 -maxdepth 2 -type d | grep -vE "/bin/darwin$|/bin/darwin/arm64$" || true)
  if [ -n "$EXTRAS" ]; then
    echo "ERRO: bundle contém binários de ffprobe de outras plataformas:"
    echo "$EXTRAS" | sed 's/^/      /'
    exit 1
  fi
else
  falhar "ffprobe-static não foi desempacotado" "$UNPACKED"
fi

FFPROBE="$FFPROBE_BIN_DIR/darwin/arm64/ffprobe"
FFMPEG=$(find "$UNPACKED/ffmpeg-static" -name ffmpeg -type f 2>/dev/null | head -n1 || true)
[ -n "$FFMPEG" ] || falhar "ffmpeg não encontrado no bundle" "$UNPACKED/ffmpeg-static"

for BIN in "$FFMPEG" "$FFPROBE"; do
  echo "   -- checando $BIN"
  [ -f "$BIN" ] || falhar "binário ausente: $BIN" "$(dirname "$BIN")"
  [ -x "$BIN" ] || falhar "sem permissão de execução: $BIN" "$BIN"
  A="$(arquiteturas "$BIN")"
  echo "      archs: '${A}'  file: $(file -b "$BIN" 2>&1)"
  case "$A" in
    *arm64*) : ;;
    *) falhar "$BIN não tem slice arm64 (archs='${A}')" "$BIN" ;;
  esac
  if ! "$BIN" -version >/dev/null 2>&1; then
    echo "      saída do teste de execução:"
    "$BIN" -version 2>&1 | head -n 5 | sed 's/^/         /' || true
    falhar "$BIN não executou" "$BIN"
  fi
  echo "      OK ($("$BIN" -version 2>&1 | head -n1))"
done

echo "-- assinatura"
codesign --verify --deep --strict --verbose=2 "$APP" || falhar "codesign --verify falhou" "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E "Identifier|Signature|Format" || true

echo "-- Gatekeeper (informativo: build sem Apple Developer é rejeitado aqui)"
spctl -a -vvv -t exec "$APP" || true

echo "OK: bundle íntegro, arm64 e assinado (ad-hoc)."
