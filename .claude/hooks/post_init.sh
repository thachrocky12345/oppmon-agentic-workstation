#!/bin/bash
# Post-init hook for Claude Code project synchronization
# This script runs after /init to update timestamps and detect dependency changes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔄 Running post-init hook..."

# 1. Update Last Updated timestamp in docs/architecture.md
ARCH_FILE="$PROJECT_ROOT/docs/architecture.md"
TODAY=$(date +%Y-%m-%d)

if [ -f "$ARCH_FILE" ]; then
    # Update the Last Updated line if it exists
    if grep -q "Last Updated:" "$ARCH_FILE"; then
        sed -i "s/Last Updated:.*/Last Updated: $TODAY/" "$ARCH_FILE" 2>/dev/null || \
        sed -i '' "s/Last Updated:.*/Last Updated: $TODAY/" "$ARCH_FILE"
    fi
    echo "✅ Updated timestamp in docs/architecture.md"
else
    echo "⚠️  docs/architecture.md not found, skipping timestamp update"
fi

# 2. Regenerate docs/structure.md with current file tree
STRUCTURE_FILE="$PROJECT_ROOT/docs/structure.md"
echo "# Project Structure" > "$STRUCTURE_FILE"
echo "" >> "$STRUCTURE_FILE"
echo "Last Updated: $TODAY" >> "$STRUCTURE_FILE"
echo "" >> "$STRUCTURE_FILE"
echo '```' >> "$STRUCTURE_FILE"

# Use tree if available, otherwise use find
if command -v tree &> /dev/null; then
    tree -I 'node_modules|.git|__pycache__|.venv|venv|*.pyc|dist|.next|coverage' \
         --dirsfirst -L 3 "$PROJECT_ROOT" >> "$STRUCTURE_FILE" 2>/dev/null || true
else
    # Fallback to find for Windows/systems without tree
    cd "$PROJECT_ROOT"
    find . -maxdepth 3 \
        -not -path '*/node_modules/*' \
        -not -path '*/.git/*' \
        -not -path '*/__pycache__/*' \
        -not -path '*/.venv/*' \
        -not -path '*/venv/*' \
        -not -path '*/dist/*' \
        -not -path '*/.next/*' \
        -not -path '*/coverage/*' \
        -not -name '*.pyc' \
        -type f -o -type d 2>/dev/null | sort >> "$STRUCTURE_FILE" || true
fi

echo '```' >> "$STRUCTURE_FILE"
echo "✅ Regenerated docs/structure.md"

# 3. Detect dependency changes
DECISIONS_DIR="$PROJECT_ROOT/docs/decisions"
SNAPSHOT_FILE="$DECISIONS_DIR/.last_deps_snapshot"
PENDING_FILE="$DECISIONS_DIR/.pending_adr_review"

# Ensure decisions directory exists
mkdir -p "$DECISIONS_DIR"

# Collect current dependencies from all package.json files
CURRENT_DEPS=""

# Frontend dependencies
if [ -f "$PROJECT_ROOT/arkon-frontend/package.json" ]; then
    CURRENT_DEPS+="=== arkon-frontend/package.json ===$'\n'"
    CURRENT_DEPS+=$(cat "$PROJECT_ROOT/arkon-frontend/package.json" | grep -E '^\s+"[^"]+":' | sort || true)
    CURRENT_DEPS+=$'\n'
fi

# Backend dependencies
if [ -f "$PROJECT_ROOT/arkon-backend/package.json" ]; then
    CURRENT_DEPS+="=== arkon-backend/package.json ===$'\n'"
    CURRENT_DEPS+=$(cat "$PROJECT_ROOT/arkon-backend/package.json" | grep -E '^\s+"[^"]+":' | sort || true)
    CURRENT_DEPS+=$'\n'
fi

# Main arkon package
if [ -f "$PROJECT_ROOT/arkon/package.json" ]; then
    CURRENT_DEPS+="=== arkon/package.json ===$'\n'"
    CURRENT_DEPS+=$(cat "$PROJECT_ROOT/arkon/package.json" | grep -E '^\s+"[^"]+":' | sort || true)
    CURRENT_DEPS+=$'\n'
fi

# Compare with last snapshot
if [ -f "$SNAPSHOT_FILE" ]; then
    LAST_DEPS=$(cat "$SNAPSHOT_FILE")
    if [ "$CURRENT_DEPS" != "$LAST_DEPS" ]; then
        echo "⚠️  Dependency changes detected!"
        echo "# Dependency Changes Detected" > "$PENDING_FILE"
        echo "" >> "$PENDING_FILE"
        echo "Detected on: $TODAY" >> "$PENDING_FILE"
        echo "" >> "$PENDING_FILE"
        echo "Review these changes and create/update ADRs as needed:" >> "$PENDING_FILE"
        echo "" >> "$PENDING_FILE"
        echo '```diff' >> "$PENDING_FILE"
        diff <(echo "$LAST_DEPS") <(echo "$CURRENT_DEPS") >> "$PENDING_FILE" 2>/dev/null || true
        echo '```' >> "$PENDING_FILE"
        echo ""
        echo "📝 Wrote changes to docs/decisions/.pending_adr_review"
    else
        echo "✅ No dependency changes detected"
    fi
else
    echo "📝 Creating initial dependency snapshot"
fi

# Update snapshot
echo "$CURRENT_DEPS" > "$SNAPSHOT_FILE"
echo "✅ Updated dependency snapshot"

# 4. Final reminder
echo ""
echo "👉 Claude will update diagrams and flows on next /init"
echo ""
echo "🎉 Post-init hook complete!"
