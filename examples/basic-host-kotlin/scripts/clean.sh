#!/bin/bash
# Clean build artifacts
# Usage: ./scripts/clean.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$PROJECT_DIR")")"

echo "🧹 Cleaning build artifacts..."

cd "$ROOT_DIR"
./gradlew :examples:basic-host-kotlin:clean

rm -rf "$PROJECT_DIR/build"
rm -rf "$PROJECT_DIR/.gradle"

echo "✅ Clean complete"
