#!/usr/bin/env bash
# Provisiona o alinhador acústico local (whisper.cpp) para macOS arm64.
#
# Compila whisper-cli estático com Metal/Accelerate a partir do código oficial e
# grava em desktop/bin/darwin/arm64/whisper-cli.
#
# O MODELO NÃO entra no DMG: ele é baixado na primeira transcrição e guardado em
# ~/Library/Application Support/EditAir/EditAir/Modelos (sobrevive a updates).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/bin/darwin/arm64"
VERSAO="${WHISPER_CPP_VERSION:-v1.7.4}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

falhar() { echo "ERRO: $*" >&2; exit 1; }

echo "== whisper.cpp $VERSAO (macOS arm64)"
mkdir -p "$DEST"

curl --fail --location --retry 3 --silent --show-error \
  "https://github.com/ggerganov/whisper.cpp/archive/refs/tags/${VERSAO}.tar.gz" -o "$TMP/src.tgz" \
  || falhar "download do whisper.cpp falhou"
tar -xzf "$TMP/src.tgz" -C "$TMP" || falhar "extração falhou"
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'whisper.cpp-*' | head -n1)"
[ -n "$SRC" ] || falhar "código-fonte não encontrado"

cmake -S "$SRC" -B "$SRC/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_ACCELERATE=ON \
  || falhar "configuração do cmake falhou"

cmake --build "$SRC/build" --config Release -j"$(sysctl -n hw.ncpu)" --target whisper-cli \
  || falhar "compilação falhou"

BIN="$(find "$SRC/build" -type f -name 'whisper-cli' -perm -111 | head -n1)"
[ -n "$BIN" ] || falhar "whisper-cli não foi gerado"

cp -f "$BIN" "$DEST/whisper-cli"
chmod 755 "$DEST/whisper-cli"

echo "-- validando"
file -b "$DEST/whisper-cli" | sed 's/^/   file: /'
lipo -archs "$DEST/whisper-cli" | sed 's/^/   lipo: /'
shasum -a 256 "$DEST/whisper-cli" | sed 's/^/   sha256: /'
ls -lh "$DEST/whisper-cli" | sed 's/^/   tamanho: /'
[ "$(lipo -archs "$DEST/whisper-cli")" = "arm64" ] || falhar "whisper-cli não é arm64 exclusivo"
"$DEST/whisper-cli" --help >/dev/null 2>&1 || "$DEST/whisper-cli" -h >/dev/null 2>&1 || falhar "whisper-cli não executou"

echo "OK: alinhador local pronto em $DEST/whisper-cli"
