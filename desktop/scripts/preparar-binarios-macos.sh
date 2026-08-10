#!/usr/bin/env bash
# Prepara FFmpeg + FFprobe da mesma distribuição, exclusivamente arm64.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/bin/darwin/arm64"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FFMPEG_URL="${EDITAIR_FFMPEG_URL:-https://evermeet.cx/ffmpeg/getrelease/zip}"
FFPROBE_URL="${EDITAIR_FFPROBE_URL:-https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip}"

diagnostico() {
  local p="$1"
  echo "   caminho: $p"
  ls -l "$p" 2>&1 | sed 's/^/   ls: /' || true
  file "$p" 2>&1 | sed 's/^/   file: /' || true
  lipo -archs "$p" 2>&1 | sed 's/^/   lipo: /' || true
}

baixar() {
  local nome="$1" url="$2" zip="$TMP/$nome.zip" extraido="$TMP/$nome" origem archs
  echo "== Baixando $nome (distribuição Evermeet)"
  curl --fail --location --retry 3 --silent --show-error "$url" -o "$zip"
  mkdir -p "$extraido"
  ditto -x -k "$zip" "$extraido"
  origem="$(find "$extraido" -type f -name "$nome" -perm -111 | head -n 1)"
  [ -n "$origem" ] || { echo "ERRO: $nome ausente no download de $url"; find "$extraido" -type f; exit 1; }
  diagnostico "$origem"
  archs="$(lipo -archs "$origem" 2>/dev/null || true)"
  case " $archs " in *" arm64 "*) ;; *) echo "ERRO: $nome não contém arm64 (archs='$archs')"; exit 1;; esac
  mkdir -p "$DEST"
  if [ "$archs" = "arm64" ]; then cp "$origem" "$DEST/$nome"; else lipo "$origem" -thin arm64 -output "$DEST/$nome"; fi
  chmod 755 "$DEST/$nome"
}

validar() {
  local nome="$1" bin="$DEST/$nome"
  echo "-- Validando binário final: $nome"
  diagnostico "$bin"
  [ "$(lipo -archs "$bin")" = "arm64" ] || { echo "ERRO: $bin não é exclusivamente arm64"; exit 1; }
  file "$bin" | grep -q "Mach-O 64-bit executable arm64" || { echo "ERRO: file não confirmou Mach-O arm64"; exit 1; }
  "$bin" -version | head -n 1
}

rm -rf "$DEST"
baixar ffmpeg "$FFMPEG_URL"
baixar ffprobe "$FFPROBE_URL"
validar ffmpeg
validar ffprobe
echo "OK: FFmpeg/FFprobe macOS arm64 prontos em $DEST"