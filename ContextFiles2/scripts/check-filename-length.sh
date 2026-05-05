#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"
MAX_BYTES="${MAX_FILENAME_BYTES:-140}"

# Check .md filenames against a conservative byte limit (e.g., eCryptFS ~143).
while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  byte_len=$(printf '%s' "$name" | wc -c | tr -d ' ')
  if [ "$byte_len" -gt "$MAX_BYTES" ]; then
    printf '%s\t%s\n' "$byte_len" "$file"
  fi
done < <(find "$ROOT_DIR" -type f -name '*.md' -print0)
