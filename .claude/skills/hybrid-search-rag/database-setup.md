# Database Setup for Hybrid Search

## Overview

This guide covers setting up PostgreSQL full-text search (tsvector) alongside pgvector for hybrid retrieval.

## Prerequisites

- PostgreSQL 15+ (for improved tsvector performance)
- pgvector extension installed (for vector search)
- Prisma ORM

## Migration Script

Create a new migration file:

```sql
-- Migration: add_search_vectors
-- Description: Add tsvector columns and triggers for hybrid search

-- ============================================================================
-- Skills Table
-- ============================================================================

-- Add tsvector column
ALTER TABLE skills ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_skills_search_vector
ON skills USING gin(search_vector);

-- Create function to build search vector
CREATE OR REPLACE FUNCTION skills_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update on insert/update
DROP TRIGGER IF EXISTS skills_search_vector_trigger ON skills;
CREATE TRIGGER skills_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, description, content ON skills
FOR EACH ROW EXECUTE FUNCTION skills_search_vector_update();

-- Backfill existing records
UPDATE skills SET
  search_vector =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C');

-- ============================================================================
-- MCP Servers Table
-- ============================================================================

ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_mcp_servers_search_vector
ON mcp_servers USING gin(search_vector);

CREATE OR REPLACE FUNCTION mcp_servers_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.command, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.args, ' '), '')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mcp_servers_search_vector_trigger ON mcp_servers;
CREATE TRIGGER mcp_servers_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, description, command, args ON mcp_servers
FOR EACH ROW EXECUTE FUNCTION mcp_servers_search_vector_update();

UPDATE mcp_servers SET
  search_vector =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(command, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(args, ' '), '')), 'D');

-- ============================================================================
-- Agents Table
-- ============================================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_agents_search_vector
ON agents USING gin(search_vector);

CREATE OR REPLACE FUNCTION agents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."systemPrompt", '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, description, "systemPrompt" ON agents
FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update();

UPDATE agents SET
  search_vector =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce("systemPrompt", '')), 'C');

-- ============================================================================
-- Workflows Table
-- ============================================================================

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_workflows_search_vector
ON workflows USING gin(search_vector);

CREATE OR REPLACE FUNCTION workflows_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflows_search_vector_trigger ON workflows;
CREATE TRIGGER workflows_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, description ON workflows
FOR EACH ROW EXECUTE FUNCTION workflows_search_vector_update();

UPDATE workflows SET
  search_vector =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B');
```

## tsvector Weight System

PostgreSQL tsvector supports 4 weight levels (A, B, C, D):

| Weight | Multiplier | Use For |
|--------|------------|---------|
| A | 1.0 | Name, title (most important) |
| B | 0.4 | Description, summary |
| C | 0.2 | Content body |
| D | 0.1 | Metadata, tags |

## Prisma Schema Update

Add the search_vector field to your Prisma schema (for introspection):

```prisma
model Skill {
  id            String     @id @default(cuid())
  // ... existing fields
  searchVector  Unsupported("tsvector")?

  @@index([searchVector], type: Gin)
  @@map("skills")
}
```

Note: Prisma doesn't fully support tsvector, so we use `Unsupported()` and manage via raw SQL.

## Verifying Setup

```sql
-- Check index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'skills' AND indexname LIKE '%search%';

-- Check trigger exists
SELECT tgname, tgtype
FROM pg_trigger
WHERE tgrelid = 'skills'::regclass;

-- Test search
SELECT id, name, ts_rank(search_vector, query) as rank
FROM skills,
     plainto_tsquery('english', 'git commit') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;
```

## Performance Tuning

### GIN Index Options

```sql
-- Standard GIN (good for most cases)
CREATE INDEX idx_skills_search ON skills USING gin(search_vector);

-- GIN with fastupdate=off (better read performance, slower writes)
CREATE INDEX idx_skills_search ON skills
USING gin(search_vector) WITH (fastupdate = off);
```

### Vacuuming

GIN indexes need regular vacuuming:

```sql
-- Manual vacuum
VACUUM ANALYZE skills;

-- Check bloat
SELECT pg_size_pretty(pg_relation_size('idx_skills_search_vector'));
```

### Text Search Configuration

For technical content, consider a custom configuration:

```sql
-- Create custom config for technical terms
CREATE TEXT SEARCH DICTIONARY tech_synonyms (
    TEMPLATE = synonym,
    SYNONYMS = tech_synonyms
);

CREATE TEXT SEARCH CONFIGURATION tech_english (COPY = english);
ALTER TEXT SEARCH CONFIGURATION tech_english
    ALTER MAPPING FOR asciiword, word
    WITH tech_synonyms, english_stem;

-- Use in tsvector
to_tsvector('tech_english', content)
```

## Rollback Script

```sql
-- Remove triggers
DROP TRIGGER IF EXISTS skills_search_vector_trigger ON skills;
DROP TRIGGER IF EXISTS mcp_servers_search_vector_trigger ON mcp_servers;
DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
DROP TRIGGER IF EXISTS workflows_search_vector_trigger ON workflows;

-- Remove functions
DROP FUNCTION IF EXISTS skills_search_vector_update();
DROP FUNCTION IF EXISTS mcp_servers_search_vector_update();
DROP FUNCTION IF EXISTS agents_search_vector_update();
DROP FUNCTION IF EXISTS workflows_search_vector_update();

-- Remove indexes
DROP INDEX IF EXISTS idx_skills_search_vector;
DROP INDEX IF EXISTS idx_mcp_servers_search_vector;
DROP INDEX IF EXISTS idx_agents_search_vector;
DROP INDEX IF EXISTS idx_workflows_search_vector;

-- Remove columns
ALTER TABLE skills DROP COLUMN IF EXISTS search_vector;
ALTER TABLE mcp_servers DROP COLUMN IF EXISTS search_vector;
ALTER TABLE agents DROP COLUMN IF EXISTS search_vector;
ALTER TABLE workflows DROP COLUMN IF EXISTS search_vector;
```
