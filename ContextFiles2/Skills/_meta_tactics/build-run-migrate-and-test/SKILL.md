---
name: build-run-migrate-and-test
description: Locate and run the canonical build, dev, migration, and test commands.
---
# Skill: build-run-migrate-and-test

Description: Use this to find and execute the core workflows for local development.

## Instructions
- Look for `package.json`, `Makefile`, `pyproject.toml`, or `requirements.txt` to discover scripts.
- Prefer the repo’s documented “golden path” commands before inventing new ones.
- Record the minimal steps for: install deps, configure env, migrate/seed, run, and test.
- Note expected ports, required services (DB/cache), and where logs appear.
- If multiple services exist, list commands per service with paths.

Hints / next steps: Add missing scripts or README updates rather than relying on tribal knowledge.
