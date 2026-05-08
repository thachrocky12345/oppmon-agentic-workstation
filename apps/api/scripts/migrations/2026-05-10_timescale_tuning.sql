-- TimescaleDB tuning — hypertables, retention, compression, CAGGs
--
-- Converts the hot append-only tables to hypertables:
--   events            (created_at)
--   tool_calls        (created_at)
--   llm_messages      (created_at)
--   mcp_proxy_logs    (created_at)
--
-- Adds retention + compression policies on every hypertable, and creates a
-- continuous aggregate `daily_stats_cagg` so dashboard queries don't have
-- to scan raw events.
--
-- Idempotent. Safe to run on dev DBs with no data.
-- Skipped automatically if TimescaleDB extension is not installed (no-op).

-- =========================================================================
-- 0. Bail out cleanly if Timescale is not present
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    RAISE NOTICE 'TimescaleDB extension not installed; skipping tuning migration';
    RETURN;
  END IF;
END
$$;

-- =========================================================================
-- 1. Convert hot tables to hypertables
-- =========================================================================
-- TimescaleDB constraint: every UNIQUE index must include the partitioning
-- column. The base tables have PRIMARY KEY (id); we drop+recreate it as a
-- composite (id, created_at). gen_random_uuid()::text + cuid IDs stay
-- unique across the composite. No FK references these tables (verified).

-- ---- events ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'events'
  ) THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'public' AND hypertable_name = 'events'
  ) THEN
    -- Move PK to (id, created_at) so the partitioning column is part of
    -- every unique constraint. Find the actual PK name (Prisma vs raw SQL
    -- naming drifts).
    PERFORM 1;
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'events' AND c.contype = 'p'
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE events DROP CONSTRAINT ' || quote_ident(c.conname)
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'events' AND c.contype = 'p'
         LIMIT 1
      );
    END IF;
    ALTER TABLE events ADD PRIMARY KEY (id, created_at);
    PERFORM create_hypertable('events', 'created_at',
      if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
END
$$;

-- ---- tool_calls ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tool_calls'
  ) THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'public' AND hypertable_name = 'tool_calls'
  ) THEN
    -- created_at on tool_calls is nullable in some envs; tighten before
    -- partitioning, since hypertables forbid nullable partitioning cols.
    UPDATE tool_calls SET created_at = NOW() WHERE created_at IS NULL;
    ALTER TABLE tool_calls ALTER COLUMN created_at SET NOT NULL;

    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'tool_calls' AND c.contype = 'p'
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE tool_calls DROP CONSTRAINT ' || quote_ident(c.conname)
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'tool_calls' AND c.contype = 'p'
         LIMIT 1
      );
    END IF;
    ALTER TABLE tool_calls ADD PRIMARY KEY (id, created_at);
    PERFORM create_hypertable('tool_calls', 'created_at',
      if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
END
$$;

-- ---- llm_messages ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'llm_messages'
  ) THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'public' AND hypertable_name = 'llm_messages'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'llm_messages' AND c.contype = 'p'
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE llm_messages DROP CONSTRAINT ' || quote_ident(c.conname)
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'llm_messages' AND c.contype = 'p'
         LIMIT 1
      );
    END IF;
    ALTER TABLE llm_messages ADD PRIMARY KEY (id, created_at);
    PERFORM create_hypertable('llm_messages', 'created_at',
      if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
END
$$;

-- ---- mcp_proxy_logs ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mcp_proxy_logs'
  ) THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'public' AND hypertable_name = 'mcp_proxy_logs'
  ) THEN
    UPDATE mcp_proxy_logs SET created_at = NOW() WHERE created_at IS NULL;
    ALTER TABLE mcp_proxy_logs ALTER COLUMN created_at SET NOT NULL;

    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'mcp_proxy_logs' AND c.contype = 'p'
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE mcp_proxy_logs DROP CONSTRAINT ' || quote_ident(c.conname)
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
         WHERE t.relname = 'mcp_proxy_logs' AND c.contype = 'p'
         LIMIT 1
      );
    END IF;
    ALTER TABLE mcp_proxy_logs ADD PRIMARY KEY (id, created_at);
    PERFORM create_hypertable('mcp_proxy_logs', 'created_at',
      if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
END
$$;

-- =========================================================================
-- 2. Retention policies
-- =========================================================================
-- Cost-driven retention: PII-heavy tables are tighter.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;

  -- 90 days for analytics-heavy events.
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'events') THEN
    PERFORM add_retention_policy('events',         INTERVAL '90 days', if_not_exists => TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'tool_calls') THEN
    PERFORM add_retention_policy('tool_calls',     INTERVAL '90 days', if_not_exists => TRUE);
  END IF;
  -- 30 days for high-PII chat content.
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'llm_messages') THEN
    PERFORM add_retention_policy('llm_messages',   INTERVAL '30 days', if_not_exists => TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'mcp_proxy_logs') THEN
    PERFORM add_retention_policy('mcp_proxy_logs', INTERVAL '30 days', if_not_exists => TRUE);
  END IF;
  -- 30 days on the existing node_metrics hypertable.
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'node_metrics') THEN
    PERFORM add_retention_policy('node_metrics',   INTERVAL '30 days', if_not_exists => TRUE);
  END IF;
END
$$;

-- =========================================================================
-- 3. Compression policies
-- =========================================================================
-- 7-day rolling window of hot uncompressed data; older chunks compress.
-- segmentby picks the column with high cardinality + frequent filter; in
-- our case it's whatever ID we usually GROUP BY on dashboards.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;

  -- events
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'events') THEN
    EXECUTE $sql$
      ALTER TABLE events SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'agent_id',
        timescaledb.compress_orderby   = 'created_at DESC'
      )
    $sql$;
    PERFORM add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;

  -- tool_calls
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'tool_calls') THEN
    EXECUTE $sql$
      ALTER TABLE tool_calls SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'agent_id',
        timescaledb.compress_orderby   = 'created_at DESC'
      )
    $sql$;
    PERFORM add_compression_policy('tool_calls', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;

  -- llm_messages — segment by session for chat-history queries.
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'llm_messages') THEN
    EXECUTE $sql$
      ALTER TABLE llm_messages SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'session_id',
        timescaledb.compress_orderby   = 'created_at DESC'
      )
    $sql$;
    PERFORM add_compression_policy('llm_messages', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;

  -- mcp_proxy_logs — segment by server for per-server troubleshooting.
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'mcp_proxy_logs') THEN
    EXECUTE $sql$
      ALTER TABLE mcp_proxy_logs SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'server_id',
        timescaledb.compress_orderby   = 'created_at DESC'
      )
    $sql$;
    PERFORM add_compression_policy('mcp_proxy_logs', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;

  -- traces / spans — already hypertables; turn on compression too.
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'traces') THEN
    EXECUTE $sql$
      ALTER TABLE traces SET (
        timescaledb.compress,
        timescaledb.compress_orderby = 'started_at DESC'
      )
    $sql$;
    PERFORM add_compression_policy('traces', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'spans') THEN
    EXECUTE $sql$
      ALTER TABLE spans SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'trace_id',
        timescaledb.compress_orderby   = 'started_at DESC'
      )
    $sql$;
    PERFORM add_compression_policy('spans', INTERVAL '7 days', if_not_exists => TRUE);
  END IF;
END
$$;

-- =========================================================================
-- 4. Continuous aggregate — daily_stats_cagg
-- =========================================================================
-- Replaces the hand-rolled `daily_stats` rollup. Dashboard queries should
-- read from this view; the policy keeps it within ~30min of real-time.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'events') THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.continuous_aggregates
    WHERE view_name = 'daily_stats_cagg'
  ) THEN
    EXECUTE $sql$
      CREATE MATERIALIZED VIEW daily_stats_cagg
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', created_at) AS day,
        agent_id,
        event_type,
        COUNT(*)                         AS event_count,
        SUM(COALESCE(token_estimate, 0)) AS total_tokens
      FROM events
      GROUP BY day, agent_id, event_type
      WITH NO DATA
    $sql$;

    PERFORM add_continuous_aggregate_policy(
      'daily_stats_cagg',
      start_offset      => INTERVAL '7 days',
      end_offset        => INTERVAL '1 hour',
      schedule_interval => INTERVAL '30 minutes',
      if_not_exists     => TRUE
    );
  END IF;
END
$$;

-- =========================================================================
-- 5. Continuous aggregate — hourly mcp_proxy traffic per server
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'mcp_proxy_logs') THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.continuous_aggregates
    WHERE view_name = 'mcp_calls_hourly_cagg'
  ) THEN
    EXECUTE $sql$
      CREATE MATERIALIZED VIEW mcp_calls_hourly_cagg
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', created_at) AS hour,
        server_id,
        mcp_method,
        COUNT(*)              AS call_count,
        AVG(duration_ms)      AS avg_duration_ms,
        SUM(request_size)     AS total_request_bytes,
        SUM(response_size)    AS total_response_bytes
      FROM mcp_proxy_logs
      GROUP BY hour, server_id, mcp_method
      WITH NO DATA
    $sql$;

    PERFORM add_continuous_aggregate_policy(
      'mcp_calls_hourly_cagg',
      start_offset      => INTERVAL '24 hours',
      end_offset        => INTERVAL '15 minutes',
      schedule_interval => INTERVAL '15 minutes',
      if_not_exists     => TRUE
    );
  END IF;
END
$$;
