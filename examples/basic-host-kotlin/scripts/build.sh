#!/bin/bash
# Build the Android app
# Usage: ./scripts/build.sh [debug|release]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$PROJECT_DIR")")"
BUILD_TYPE="${1:-debug}"

cd "$ROOT_DIR"

echo "Building MCP Apps Host for Android ($BUILD_TYPE)..."

if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew :examples:basic-host-kotlin:assembleRelease
else
    ./gradlew :examples:basic-host-kotlin:assembleDebug
fi

APK_PATH="$PROJECT_DIR/build/outputs/apk/$BUILD_TYPE/basic-host-kotlin-$BUILD_TYPE.apk"

if [ -f "$APK_PATH" ]; then
    echo "✅ Build succeeded"
    echo "   APK: $APK_PATH"
else
    echo "✅ Build succeeded"
    echo "   Output: $PROJECT_DIR/build/outputs/apk/$BUILD_TYPE/"
fi
