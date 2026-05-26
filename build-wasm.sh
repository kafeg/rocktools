#!/bin/bash
# Build rocktools WASM modules using Emscripten Docker image
#
# Usage: ./build-wasm.sh [target]
#   ./build-wasm.sh                  # builds rockcreate (default)
#   ./build-wasm.sh all              # builds all available tools
#   ./build-wasm.sh wasm/rockdetail.mjs  # builds specific tool

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-wasm/rockcreate.mjs}"

echo "Building WASM target: $TARGET"

docker run --rm \
  -v "$SCRIPT_DIR":/src \
  -w /src \
  -u "$(id -u):$(id -g)" \
  emscripten/emsdk:3.1.61 \
  emmake make -f Makefile.wasm "$TARGET"

echo ""
echo "Build complete. Output:"
ls -lh "$SCRIPT_DIR/wasm/"*.{mjs,wasm} 2>/dev/null || echo "  (no output files found)"
