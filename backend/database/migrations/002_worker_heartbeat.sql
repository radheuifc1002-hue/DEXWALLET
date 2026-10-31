-- DEXWALLET Phase 3: indexer worker liveness and supported-network heartbeat.
CREATE TABLE IF NOT EXISTS public.indexer_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running','degraded','stopped')),
  version TEXT NOT NULL,
  chains JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_job_at TIMESTAMPTZ,
  last_error_category TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS indexer_worker_heartbeats_live_idx
  ON public.indexer_worker_heartbeats (status, last_seen_at DESC);

GRANT SELECT ON public.indexer_worker_heartbeats TO dexwallet_api;
GRANT SELECT, INSERT, UPDATE ON public.indexer_worker_heartbeats TO dexwallet_indexer;
