#!/bin/bash
# Build and run the app on Android emulator or device
# Usage: ./scripts/run.sh [emulator-name]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$PROJECT_DIR")")"
EMULATOR_NAME="${1:-}"
PACKAGE_ID="com.example.mcpappshost"
ACTIVITY="$PACKAGE_ID.MainActivity"

cd "$ROOT_DIR"

# Check if adb is available
if ! command -v adb &> /dev/null; then
    echo "❌ adb not found. Install Android SDK platform-tools."
    echo "   brew install --cask android-platform-tools"
    exit 1
fi

# Start emulator if specified and no device is connected
start_emulator() {
    if [ -n "$EMULATOR_NAME" ]; then
        # Check if emulator is already running
        if ! adb devices | grep -q "emulator"; then
            echo "📱 Starting emulator '$EMULATOR_NAME'..."
            emulator -avd "$EMULATOR_NAME" -no-snapshot-load &

            echo "   Waiting for emulator to boot..."
            adb wait-for-device

            # Wait for boot to complete
            while [ "$(adb shell getprop sys.boot_completed 2>/dev/null)" != "1" ]; do
                sleep 1
            done
            echo "   Emulator ready!"
        fi
    fi
}

# Check for connected devices
check_device() {
    if ! adb devices | grep -q -E "device$"; then
        echo "❌ No Android device/emulator connected."
        echo ""
        echo "   Available emulators:"
        emulator -list-avds 2>/dev/null || echo "   (none found)"
        echo ""
        echo "   Start an emulator with: ./scripts/run.sh <emulator-name>"
        echo "   Or connect a physical device via USB"
        exit 1
    fi
}

start_emulator
check_device

echo "🔨 Building..."
"$SCRIPT_DIR/build.sh" debug

echo ""
echo "📦 Installing..."
./gradlew :examples:basic-host-kotlin:installDebug

echo ""
echo "🚀 Launching..."
adb shell am force-stop "$PACKAGE_ID" 2>/dev/null || true
adb shell am start -n "$PACKAGE_ID/$ACTIVITY"

echo ""
echo "✅ App is running"
echo "   View logs: ./scripts/logs.sh"
