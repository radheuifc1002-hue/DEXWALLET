-- DEXWALLET Phase 2: indexed history and provider observability.
-- Additive-only migration. Never stores wallet secrets or signing material.

CREATE TABLE IF NOT EXISTS public.provider_registry (
  id BIGSERIAL PRIMARY KEY,
  provider_key TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('rpc_read','rpc_broadcast','native_history','token_history','token_metadata','price','market_discovery')),
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  access_mode TEXT NOT NULL CHECK (access_mode IN ('device_direct','server_only')),
  endpoint_label TEXT NOT NULL,
  endpoint_origin TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority SMALLINT NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_key, capability, chain, network, endpoint_label)
);

CREATE TABLE IF NOT EXISTS public.provider_health (
  id BIGSERIAL PRIMARY KEY,
  provider_key TEXT NOT NULL,
  capability TEXT NOT NULL,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  endpoint_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy','degraded','unhealthy','disabled','unknown')),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  http_status SMALLINT CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  error_category TEXT,
  retry_after_seconds INTEGER CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_key, capability, chain, network, endpoint_label, checked_at)
);
CREATE INDEX IF NOT EXISTS provider_health_latest_idx
  ON public.provider_health (provider_key, capability, chain, network, endpoint_label, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.address_sync_state (
  id BIGSERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  address_key TEXT NOT NULL,
  address_display TEXT NOT NULL,
  cursor TEXT,
  last_indexed_block BIGINT CHECK (last_indexed_block IS NULL OR last_indexed_block >= 0),
  last_indexed_at TIMESTAMPTZ,
  confirmed_through_block BIGINT CHECK (confirmed_through_block IS NULL OR confirmed_through_block >= 0),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','syncing','idle','degraded','failed')),
  last_error_category TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain, network, address_key)
);
CREATE INDEX IF NOT EXISTS address_sync_due_idx
  ON public.address_sync_state (sync_status, lease_expires_at, updated_at);

CREATE TABLE IF NOT EXISTS public.indexed_transactions (
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT CHECK (block_number IS NULL OR block_number >= 0),
  block_hash TEXT,
  transaction_index INTEGER CHECK (transaction_index IS NULL OR transaction_index >= 0),
  block_timestamp TIMESTAMPTZ,
  from_address TEXT,
  to_address TEXT,
  value_raw NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (value_raw >= 0),
  value_decimals SMALLINT NOT NULL DEFAULT 18 CHECK (value_decimals BETWEEN 0 AND 36),
  asset_symbol TEXT,
  tx_status TEXT NOT NULL DEFAULT 'pending' CHECK (tx_status IN ('pending','success','failed','replaced','dropped','unknown')),
  tx_type TEXT NOT NULL DEFAULT 'transfer' CHECK (tx_type IN ('transfer','contract_interaction','token_transfer','approval','other')),
  gas_used NUMERIC(78,0),
  gas_price_raw NUMERIC(78,0),
  fee_raw NUMERIC(78,0),
  nonce NUMERIC(78,0),
  explorer_url TEXT,
  source_provider TEXT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain, network, tx_hash)
);
CREATE INDEX IF NOT EXISTS indexed_transactions_from_time_idx
  ON public.indexed_transactions (chain, network, lower(from_address), block_timestamp DESC);
CREATE INDEX IF NOT EXISTS indexed_transactions_to_time_idx
  ON public.indexed_transactions (chain, network, lower(to_address), block_timestamp DESC);
CREATE INDEX IF NOT EXISTS indexed_transactions_block_idx
  ON public.indexed_transactions (chain, network, block_number DESC);

CREATE TABLE IF NOT EXISTS public.indexed_token_transfers (
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL CHECK (event_index >= 0),
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  token_decimals SMALLINT NOT NULL DEFAULT 18 CHECK (token_decimals BETWEEN 0 AND 36),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_raw NUMERIC(78,0) NOT NULL CHECK (amount_raw >= 0),
  block_number BIGINT,
  block_timestamp TIMESTAMPTZ,
  source_provider TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain, network, tx_hash, event_index),
  FOREIGN KEY (chain, network, tx_hash)
    REFERENCES public.indexed_transactions (chain, network, tx_hash)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS token_transfers_from_time_idx
  ON public.indexed_token_transfers (chain, network, lower(from_address), block_timestamp DESC);
CREATE INDEX IF NOT EXISTS token_transfers_to_time_idx
  ON public.indexed_token_transfers (chain, network, lower(to_address), block_timestamp DESC);
CREATE INDEX IF NOT EXISTS token_transfers_contract_time_idx
  ON public.indexed_token_transfers (chain, network, lower(token_address), block_timestamp DESC);

CREATE TABLE IF NOT EXISTS public.token_metadata (
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  decimals SMALLINT CHECK (decimals IS NULL OR decimals BETWEEN 0 AND 36),
  logo_uri TEXT,
  source_provider TEXT NOT NULL,
  source_confidence TEXT NOT NULL DEFAULT 'unverified' CHECK (source_confidence IN ('verified','community','unverified')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (chain, network, token_address)
);
CREATE INDEX IF NOT EXISTS token_metadata_expiry_idx ON public.token_metadata (expires_at);

CREATE TABLE IF NOT EXISTS public.indexer_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL CHECK (job_type IN ('initial_sync','incremental_sync','reconcile','refresh_metadata')),
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  address_key TEXT,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','retry','dead_letter','cancelled')),
  priority SMALLINT NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 100),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS indexer_jobs_claim_idx
  ON public.indexer_jobs (status, available_at, priority, created_at);
CREATE INDEX IF NOT EXISTS indexer_jobs_address_idx
  ON public.indexer_jobs (chain, network, address_key, status);

CREATE TABLE IF NOT EXISTS public.api_metric_events (
  id BIGSERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  operation TEXT NOT NULL,
  chain TEXT,
  network TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','error','timeout','rate_limited','cache_hit','cache_miss','failover')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  provider_key TEXT,
  error_category TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS api_metric_events_time_idx
  ON public.api_metric_events (occurred_at DESC, service, operation);
CREATE INDEX IF NOT EXISTS api_metric_events_provider_idx
  ON public.api_metric_events (provider_key, occurred_at DESC);
