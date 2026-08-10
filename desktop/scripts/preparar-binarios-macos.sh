#!/usr/bin/env bash
# Provisiona FFmpeg + FFprobe nativos macOS arm64 para o empacotamento.
#
# 100% reprodutível no CI: nada aqui depende de arquivo local do desenvolvedor.
# Os binários são baixados de fontes confiáveis (pacotes npm oficiais dos
# instaladores FFmpeg/FFprobe, com fallback para distribuições públicas),
# validados por arquitetura e execução, e gravados em:
#
#   desktop/bin/darwin/arm64/ffmpeg
#   desktop/bin/darwin/arm64/ffprobe
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/bin/darwin/arm64"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

falhar() { echo "ERRO: $*" >&2; exit 1; }

diagnostico() {
  local p="$1"
  echo "   caminho: $p"
  ls -l "$p" 2>&1 | sed 's/^/   ls: /' || true
  file "$p" 2>&1 | sed 's/^/   file: /' || true
  lipo -archs "$p" 2>&1 | sed 's/^/   lipo: /' || true
  shasum -a 256 "$p" 2>&1 | sed 's/^/   sha256: /' || true
}

archs_de() { lipo -archs "$1" 2>/dev/null || true; }

# Copia o binário garantindo fatia arm64 exclusiva.
instalar() {
  local nome="${1:?nome do binário não informado}"
  local origem="${2:?origem do binário não informada}"
  local archs=""
  archs="$(archs_de "$origem")"
  case " $archs " in *" arm64 "*) ;; *) return 1;; esac
  mkdir -p "$DEST"
  if [ "$archs" = "arm64" ]; then
    cp -f "$origem" "$DEST/$nome"
  else
    lipo "$origem" -thin arm64 -output "$DEST/$nome" || return 1
  fi
  chmod 755 "$DEST/$nome"
  return 0
}

# ---- Fonte 1: pacotes npm dos instaladores oficiais (arm64 nativo) ----------
tentar_npm() {
  local nome="${1:?nome do binário não informado}"
  local pacote="${2:?pacote npm não informado}"
  local dir="$TMP/npm-$nome"
  local tgz="" origem=""
  echo "-- fonte npm: $pacote"
  mkdir -p "$dir"
  ( cd "$dir" && npm pack "$pacote" --silent >/dev/null 2>&1 ) || return 1
  tgz="$(ls "$dir"/*.tgz 2>/dev/null | head -n1)"
  [ -n "$tgz" ] || return 1
  tar -xzf "$tgz" -C "$dir" || return 1
  origem="$(find "$dir/package" -type f -name "$nome" | head -n1)"
  [ -n "$origem" ] || return 1
  chmod 755 "$origem"
  diagnostico "$origem"
  instalar "$nome" "$origem"
}

# ---- Fonte 2: zips públicos (osxexperts / evermeet) ------------------------
tentar_zip() {
  local nome="${1:?nome do binário não informado}"
  local url="${2:?url não informada}"
  local dir="$TMP/zip-$nome-$RANDOM"
  local origem=""
  echo "-- fonte zip: $url"
  mkdir -p "$dir"
  curl --fail --location --retry 3 --silent --show-error "$url" -o "$dir/pkg.zip" || return 1
  ditto -x -k "$dir/pkg.zip" "$dir/x" >/dev/null 2>&1 || return 1
  origem="$(find "$dir/x" -type f -name "$nome" | head -n1)"
  [ -n "$origem" ] || return 1
  chmod 755 "$origem"
  diagnostico "$origem"
  instalar "$nome" "$origem"
}

provisionar() {
  local nome="$1" pacote="$2"; shift 2
  echo "== Provisionando $nome (macOS arm64)"
  if tentar_npm "$nome" "$pacote"; then echo "   origem aceita: npm $pacote"; return 0; fi
  for url in "$@"; do
    if tentar_zip "$nome" "$url"; then echo "   origem aceita: $url"; return 0; fi
    echo "   fonte recusada (sem fatia arm64 ou download falhou): $url"
  done
  falhar "não foi possível obter um $nome arm64 de nenhuma fonte"
}

validar() {
  local nome="$1" bin="$DEST/$nome"
  echo "-- Validando binário final: $nome"
  [ -f "$bin" ] || falhar "$bin não existe"
  diagnostico "$bin"
  [ "$(archs_de "$bin")" = "arm64" ] || falhar "$bin não é exclusivamente arm64"
  file -b "$bin" | grep -q "arm64" || falhar "file não confirmou Mach-O arm64 em $bin"
  [ -x "$bin" ] || falhar "$bin não é executável"
  "$bin" -version | head -n 1 || falhar "$bin não executou"
}

rm -rf "$DEST"
mkdir -p "$DEST"

provisionar ffmpeg "@ffmpeg-installer/darwin-arm64" \
  "https://www.osxexperts.net/ffmpeg711arm.zip" \
  "https://evermeet.cx/ffmpeg/getrelease/zip"

provisionar ffprobe "@ffprobe-installer/darwin-arm64" \
  "https://www.osxexperts.net/ffprobe711arm.zip" \
  "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"

validar ffmpeg
validar ffprobe

echo "OK: FFmpeg/FFprobe macOS arm64 prontos em $DEST"
ls -l "$DEST"
