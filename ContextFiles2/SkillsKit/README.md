# Portable SkillsKit (Agent Skill Library + Focused Indexes)

This folder is intended to be copied into **another repository** to bootstrap:
- a reusable agent **skills library** (`ContextFiles/Skills/**`)
- a set of **focused documentation indexes** to keep context small and navigable

## What to copy

Copy the entire `ContextFiles/Portable/SkillsKit/` folder into the target repository (or just the `Prompts/`, `Runbooks/`, and `Templates/` subfolders).

## How to use

1) Run `Prompts/01_SkillsLibrary_Bootstrap.md` to create the initial `ContextFiles/Skills/**` structure and indexes.
2) Optionally run `Prompts/02_MetaTactics_Aggregation.md` to produce a portable `_meta_tactics` tactic set (generic, non-domain).

## Non-domain constraint

All files under this folder should remain **free of project/company/domain terms**. Use placeholders (e.g., `<APP_PROJECT>`, `<DB_PROVIDER>`) and link to real project docs via indexes instead of copying content.

