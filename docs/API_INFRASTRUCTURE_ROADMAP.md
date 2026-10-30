# DEXWALLET API Infrastructure — Production Roadmap

Status: Phase 1 foundation exists. Phase 2 is in progress.
Security invariant: the wallet is non-custodial. Seed phrases, private keys and signing material stay on the device.

## 1. Target architecture

DEXWALLET has two complementary request paths.

**Device-direct path:** The app downloads a public endpoint registry from the control plane, measures providers from the device, selects a healthy provider and calls it directly. Use this for public RPC reads and public APIs whose terms permit client access.

**Server data path:** The app calls DEXWALLET's data API for expensive, reusable information such as indexed transaction history and cached token metadata. Background workers fetch upstream indexer data, normalize it and persist it. Our server must not become a generic proxy for every blockchain request.

Vercel is the control plane and lightweight API runtime. It should not host permanently running indexer loops, long-running Python jobs or high-volume queue consumers. Add a managed database, queue and worker runtime as those services are introduced.

## 2. Four phases

### Phase 1 — Foundation (existing; verify)
- Network registry and chain IDs for Ethereum, BNB Chain, Polygon and Solana.
- Vercel endpoint configuration route.
- Device-side configuration cache and bundled defaults.
- Initial transaction-history provider fallback.
- Local wallet key storage and signing.

Exit criteria: verify all screens use shared services, remote config validates against expected chain IDs, and no wallet secret is sent to any server. A source file existing does not prove every feature uses it.

### Phase 2 — Reliability, indexing and observability (current priority)

**RPC provider manager**
- Per-chain/per-network endpoint registry and capability labels.
- Per-device latency measurement and health state.
- Chain ID / cluster verification before accepting an endpoint.
- Timeouts, bounded retries, exponential backoff and jitter.
- Circuit breaker with cooldown and gradual recovery.
- Safe read-only failover. Never blindly retry a state-changing request.
- Request IDs and sanitized error categories.

**Server-side transaction indexer**
- Introduce a DEXWALLET transaction-history API backed by indexer adapters.
- Start with Ethereum and Polygon mainnet, then add Sepolia, Amoy and BNB when provider coverage and quotas are verified.
- Use existing indexed-history providers first; do not operate full archival nodes as the first step.
- Normalize native transfers, token transfers, contract interactions, status, timestamps, block height and explorer links.
- Persist with idempotent keys: chain + network + transaction hash + event/log index.
- Store per-address/per-chain cursors and last indexed block.
- Incrementally sync new activity; do not rescan all history on every request.
- Handle pagination, rate limits, provider failover, reorgs and confirmation depth.
- Keep address data separate from account identity. No names, seed phrases or private keys are needed. Public addresses and their activity are public blockchain data.

**Cache and database**
- Cache recent history responses and token metadata.
- Use stale-while-revalidate for non-critical display data.
- Keep transaction records durable; update pending/confirmation status as blocks advance.
- Add schema migrations, indexes, retention rules and backups.
- Never cache seed phrases, private keys or signed transactions as application data.

**Health and observability**
- Monitor RPC, indexer, metadata, price, database, queue and worker dependencies independently.
- Track uptime, latency percentiles, error rates, HTTP 429/403/5xx, timeout counts, failover counts, cache-hit rate, indexing lag and queue depth.
- Distinguish provider outage from invalid address, unsupported network, empty history and malformed data.
- Send actionable alerts with provider, chain, endpoint label, error class and first/last seen time. Never include secrets or sensitive request payloads in logs.
- Add an operator dashboard and controlled provider disable/enable mechanism.

Phase 2 exit criteria: read-only requests fail over correctly; wrong-chain endpoints are rejected; indexed history is served from our cache after initial sync; incremental indexing is idempotent; provider failures are observable; Android runtime tests pass.

### Phase 3 — Bitcoin and TRON non-custodial support

Bitcoin:
- Mainnet and testnet, address validation and derivation.
- UTXO discovery, coin selection, change outputs and fee estimation.
- Local transaction construction and signing; broadcast the exact signed transaction.
- Mempool/confirmation monitoring and indexed address history.
- Multiple providers for UTXO, fee, broadcast and history capabilities.
- Tests for dust, insufficient funds, fee spikes, RBF and reorgs.

TRON:
- Mainnet and Shasta testnet.
- TRX and TRC-20 balances/transfers, including TRC-20 USDT.
- Energy/bandwidth estimation and fee limits.
- Local signing, transaction broadcast and confirmation tracking.
- Indexed native and TRC-20 history, including pagination.
- Multiple providers and tests for resource exhaustion, contract failure and pending transactions.

Security gate: private keys stay on-device. Validate address derivation and transaction serialization against official vectors and independent implementations. Do not launch either chain until send/receive, fee calculation, recovery and testnet end-to-end tests pass.

### Phase 4 — Market data, metadata and discovery
- Price adapter framework with at least two independent providers for supported assets.
- Token metadata adapters: name, symbol, decimals, logo, contract/mint, chain, source and last-updated time.
- DEX pair, liquidity, volume and token-discovery adapters.
- Provider-specific terms, rate limits, attribution and credential requirements.
- Server-only adapters for providers requiring secret keys or disallowing direct mobile access.
- Direct client requests only when provider terms explicitly permit them.
- Freshness checks, source provenance, outlier detection and stale-data UI.
- Python workers for normalization, historical aggregation, anomaly screening and scheduled reconciliation.
- Never present indicative market prices as guaranteed execution quotes.

## 2A. Phase 2 implementation status (current branch)

The `infra/phase-2-indexer` branch builds on PR #6 and adds the first server-indexing slice:

- `api/indexed-history.ts`: POST-only history read API; validates EVM address, chain/network, token contract and pagination; caps responses at 50; returns stable cursor pagination; does not expose SQL/provider errors.
- `api/indexer/register-address.ts`: explicit address enrollment and durable initial/incremental job enqueue.
- `api/health.ts` and `api/ready.ts`: separate liveness and dependency readiness checks.
- `database/migrations/001_initial_indexer_schema.sql`: nine additive tables, including an HMAC-keyed API rate-limit bucket table. The migration is tested on an isolated Neon branch; it has not yet been applied to the Neon main branch.
- `indexer/worker.mjs`: separate long-running worker using atomic `FOR UPDATE SKIP LOCKED` claims, stale-job recovery, page-level jobs, idempotent upserts, bounded fetch timeouts, Retry-After-aware retries and dead-letter status.
- `indexer/Dockerfile`: isolated worker container.
- `mobile/services/transactionHistory.ts`: checks the server index first when the user opts in, then retains direct-provider fallback.
- `app/(tabs)/settings.tsx`: opt-in control explains that public addresses and history are sent to the XU indexer; wallet secrets remain device-only.
- API environment requirements: `DATABASE_URL` and a random `API_RATE_LIMIT_SECRET` of at least 32 characters. Keep both server-side and never use `EXPO_PUBLIC_*` for these values.

**Initial indexer adapters:** Ethereum mainnet, Ethereum Sepolia and Polygon mainnet via Blockscout v2. BNB Chain and Polygon Amoy remain on direct mobile history providers until indexed providers and quota policies are verified.

**Not yet production complete:** the main Neon migration and Vercel secrets are not active; the persistent worker has not been deployed to a worker host; periodic incremental scheduling, finality/reorg reconciliation, alert delivery, and operator dashboard remain to be completed. Do not advertise server-indexed history as active until readiness passes and worker sync has been observed end-to-end.

## 3. Provider registry: capability before URL

Each provider entry must declare:
- chain and network;
- capabilities (read RPC, broadcast, native history, token history, metadata, price, market discovery);
- access mode (device-direct or server-only);
- authentication type and secret location;
- documented quotas, rate limits and terms;
- timeout/retry policy and health-check method;
- response validation rules, priority and operational status.

A standard JSON-RPC endpoint cannot enumerate all transactions for an address. History requires an indexed-history provider.

## 4. Safe fallback rules

- Retry idempotent reads with bounded attempts, exponential backoff and jitter.
- Honor Retry-After on HTTP 429, reduce request rate and cool down the provider.
- Do not rotate IPs, disguise traffic or bypass provider quotas. Switch only to a provider whose terms permit the request.
- For broadcasts, determine whether the request may already have been accepted. EVM retries must reuse the same signed raw transaction/hash; never create a new transaction because an HTTP response timed out. Solana and Bitcoin retries must also reuse the exact signed payload.
- HTTP 200 is not enough: validate response shape and network identity.
- Isolate failures so one provider outage does not take down balances, history and prices together.

## 5. Initial database model

- provider_registry: provider, capability, chain/network, access mode, status and policy metadata (no plaintext secrets).
- provider_health: provider, capability, chain/network, latency, status, error category and check timestamp.
- address_sync_state: chain/network/address key, cursor, last indexed block/time and sync status.
- indexed_transactions: chain/network/hash, block number/hash, timestamp, status and normalized fields.
- indexed_token_transfers: transaction key, log/event index, token contract, from/to and raw integer amount.
- token_metadata: chain + normalized contract/mint, decimals, symbol, name, logo reference, source and freshness.
- price_snapshots: asset key, quote currency, price, provider, timestamp and freshness.
- indexer_jobs: job type, chain/network/address, cursor, attempts, next run and status.

Use unique constraints and upserts so replaying an indexer page cannot duplicate transactions. Normalize addresses by chain: EVM identity is case-insensitive (preserve checksum display); Solana and Bitcoin addresses are case-sensitive; TRON requires chain-aware canonicalization.

## 6. Security and operations baseline

- Keep API secrets only in server-side secret storage. Never put privileged keys in EXPO_PUBLIC variables, app config, source control or mobile bundles.
- Use least-privilege database credentials and row-level policies where applicable.
- Validate and rate-limit public data API inputs; cap page and response sizes.
- Add request correlation IDs, structured logs, metrics and traces.
- Avoid logging full wallet addresses by default; use truncation or keyed hashes for diagnostics.
- Separate liveness from readiness checks; readiness includes required database/queue dependencies.
- Add backups, migration rollback plans, dependency scanning and security review.
- Set SLOs only after measuring traffic; do not invent uptime guarantees.

## 7. Current repository observations

- mobile/services/rpcManager.ts contains a remote registry and local fallback list. Before this branch, getters returned only the first endpoint and did not measure provider health.
- app/_layout.tsx initializes the RPC manager.
- app/send.tsx uses the selected EVM/Solana endpoint directly for read and broadcast flows; safe read failover still needs to be wired into every caller.
- mobile/services/transactionHistory.ts uses direct provider fallback, but history is not yet served from a DEXWALLET-owned indexed cache.
- api/rpc-config.ts is static Vercel configuration, not a provider health service.
- xu-wallet-backend/src/services/supabaseService.js contains placeholder Supabase credentials and is not production-ready. Do not use it until environment configuration, schema, access policies and migrations exist.
- There is no complete production indexer, queue/worker, metrics pipeline or admin health dashboard yet.

## 8. Implementation sequence and release gates

1. Finish the shared device-side RPC manager and wire safe read fallback into every RPC read caller.
2. Add automated tests for wrong chain IDs, timeouts, 429, 5xx, malformed JSON, endpoint recovery and all-provider outage.
3. Design and provision the database schema and server-only indexer worker.
4. Add indexed-history API and migrate asset history to prefer cache, with direct-provider fallback.
5. Add monitoring, alerts and operator dashboard.
6. Complete EVM/Solana regression and Android runtime tests.
7. Only then start Bitcoin, followed by TRON.
8. Add price/metadata/discovery integrations after provider policy and credential handling are established.

A phase is complete only when its exit criteria and tests pass. A merged PR or successful TypeScript build alone is not proof of production readiness.
