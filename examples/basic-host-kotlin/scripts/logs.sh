#!/bin/bash
# Stream logs from the app running on device/emulator
# Usage: ./scripts/logs.sh [filter]

PACKAGE_ID="com.example.mcpappshost"
FILTER="${1:-}"

echo "📋 Streaming logs from $PACKAGE_ID..."
echo "   Press Ctrl+C to stop"
echo ""

# Get the PID of our app
PID=$(adb shell pidof "$PACKAGE_ID" 2>/dev/null)

if [ -n "$PID" ]; then
    echo "   App PID: $PID"
    echo ""
    # Filter logcat to show only our app's logs
    if [ -n "$FILTER" ]; then
        adb logcat --pid="$PID" | grep -i "$FILTER"
    else
        adb logcat --pid="$PID"
    fi
else
    echo "   App not running, showing all logs tagged with our package..."
    echo ""
    # Fallback: filter by tag patterns common in our app
    if [ -n "$FILTER" ]; then
        adb logcat "*:S" "McpApps:V" "WebView:V" "MainActivity:V" | grep -i "$FILTER"
    else
        adb logcat "*:S" "McpApps:V" "WebView:V" "MainActivity:V" "System.out:V"
    fi
fi
