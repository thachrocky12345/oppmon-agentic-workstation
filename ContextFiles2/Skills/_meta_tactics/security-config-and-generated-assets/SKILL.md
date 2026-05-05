---
name: security-config-and-generated-assets
description: Track secrets, env config, and generated assets that should not be committed.
---
# Skill: security-config-and-generated-assets

Description: Use this to prevent accidental leaks or noisy diffs.

## Instructions
- Identify environment files, secrets, and local overrides used by each service.
- Record any generated build artifacts or caches that should be ignored.
- Call out security-sensitive defaults (debug flags, permissive CORS, etc.).
- Prefer examples and templates over real secret values.

Hints / next steps: Add or update `.gitignore` entries when new generated assets appear.
