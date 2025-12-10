#!/bin/bash
# Generate Swift types from JSON Schema
# Usage: ./scripts/generate-swift-types.sh
#
# Requires: quicktype (npm install -g quicktype)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCHEMA_FILE="$PROJECT_DIR/src/generated/schema.json"
OUTPUT_FILE="$PROJECT_DIR/sdk/swift/Sources/McpApps/Generated/Types.swift"

# Use npx to run quicktype (no global install needed)
QUICKTYPE="npm --registry https://registry.npmjs.org exec quicktype --"

# Create output directory
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "🔧 Generating Swift types from schema.json..."

$QUICKTYPE \
    --src "$SCHEMA_FILE" \
    --src-lang schema \
    --lang swift \
    --density normal \
    --swift-5-support \
    --struct-or-class struct \
    --acronym-style camel \
    --protocol equatable \
    --protocol codable \
    --mutable-properties \
    --out "$OUTPUT_FILE"

# Add header comment
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << 'EOF'
// Generated from src/generated/schema.json
// DO NOT EDIT - Run ./scripts/generate-swift-types.sh to regenerate
//
// This file contains Swift types that match the MCP Apps protocol specification.

import Foundation

EOF

cat "$OUTPUT_FILE" >> "$TEMP_FILE"
mv "$TEMP_FILE" "$OUTPUT_FILE"

echo "✅ Generated: $OUTPUT_FILE"
