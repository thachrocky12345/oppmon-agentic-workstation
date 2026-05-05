-- Migration: add_search_vectors
-- Description: Add tsvector columns and triggers for hybrid search (BM25 + vector + RRF)

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
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, description ON agents
FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update();

UPDATE agents SET
  search_vector =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B');

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
