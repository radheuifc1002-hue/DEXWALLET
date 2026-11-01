# DEXWALLET API Infrastructure Roadmap

## Security invariant

DEXWALLET is non-custodial. Seed phrases, private keys, wallet derivation and transaction signing remain on-device. The backend receives public addresses and public chain data requests; it may broadcast an already-signed transaction but must never receive wallet secrets.

## Current architecture

- **Server RPC:** `backend/api/rpc.ts` routes JSON-RPC through `backend/api/_lib/rpc-manager.ts`.
- **Provider health:** `GET /api/rpc-health` reports configured providers and per-function-instance circuit state. It is not a live probe or globally shared health registry.
- **EVM history:** `POST /api/history` queries Alchemy Transfers API on demand. There is no custom address indexer, persistent history store, database-backed job queue or wallet registration service.
- **Solana history:** `POST /api/solana-history` uses the central server RPC manager to page signatures and fetch confirmed transaction details; native SOL activity is derived from lamport deltas and SPL-token activity from owner/mint token-balance deltas.
- **Readiness:** `GET /api/ready` checks that the stateless API is ready; no database is required.
- **Mobile secrets:** Wallet creation, recovery, key derivation and signing stay on the device.

## Phase 1 — Central RPC foundation

Implemented on the infrastructure branch:
- Server-side provider selection and secret handling.
- Explicit allowlist for idempotent read methods.
- Bounded timeouts, retry/backoff, circuit-breaker state and configured provider fallback.
- Transaction broadcasts and unknown methods are not blindly replayed.
- Health endpoint avoids exposing provider URLs or credentials.

Limitations: circuit state is per Vercel function instance, not globally coordinated. Provider fallback only works when a compatible fallback URL is configured for that chain and method.

## Phase 2 — Generic EVM history

Implemented in the current infrastructure pull request:
- One EVM history endpoint for supported chains.
- Incoming and outgoing asset-transfer queries run concurrently.
- Native transfers and ERC-20 transfers are normalized, deduplicated and capped at 50 rows.
- Token asset history also requests top-level external transactions to identify calls directed to the selected token contract.
- Mobile EVM history calls the backend API rather than embedding an Alchemy key.

Known limitations to close before production:
- Alchemy Transfers API pagination and partial-category support need explicit handling; a bounded first page is not proof that the latest 50 relevant events were returned.
- A zero-value external transfer heuristic is not a full receipt/log-based contract-interaction decoder.
- Failed transactions and transaction status require receipt lookup.
- Alchemy-specific methods must only be sent to Alchemy-compatible providers; generic JSON-RPC fallbacks cannot be assumed to implement them.
- Provider coverage, quotas and live API behavior must be verified per chain/network.

## Phase 3 — Remove unused database/indexer architecture

**Implemented.** See [PHASE_3_DATABASE_INDEXER_REMOVAL.md](./PHASE_3_DATABASE_INDEXER_REMOVAL.md) for the detailed change record.
- Retired database-backed history, address registration, indexer jobs and BNB trace scanning.
- Removed the worker, Docker/package artifacts, schema migration and mobile indexer opt-in.
- Removed unused database integrations/dependencies from the relevant backend packages.
- Kept readiness and active history stateless.
- No database migration or data deletion was performed because the project owner confirmed no database/indexer was deployed or used.

## Phase 4 — Non-EVM data adapters

**Solana adapter implemented; automated code gates are in place. Live provider validation remains an environment-dependent release gate.**
- Separate `POST /api/solana-history` adapter, not mixed into EVM-specific logic.
- Uses the central Solana RPC manager; no provider credential or direct provider URL in the mobile service.
- Per-address signature pagination with an opaque versioned cursor; token history discovers wallet-owned SPL token accounts for the selected mint and merges their signature streams without sharing a single cursor across accounts.
- Token account pubkeys are used as an attribution fallback when historical RPC token-balance owner metadata is absent; account discovery is bounded to 20 accounts per mint to avoid unbounded provider fan-out.
- Fetches transaction details with bounded concurrency.
- Native SOL activity derives from wallet lamport balance changes.
- SPL-token activity derives from wallet-owned pre/post token-balance deltas for the selected mint.
- Normalized rows include signature, direction, amount, timestamp, failure status and Solscan transaction URL.
- Added a typed mobile service with cursor metadata.
- Known constraints: rows represent net wallet balance changes per transaction, not each instruction-level transfer. Token history is bounded to 20 associated token accounts per mint; larger sets return an explicit error instead of silently omitting activity. Unsupported transaction versions or pruned historical data may still be unavailable.
- Mobile asset-detail history now uses the backend service for both native SOL and SPL tokens; it no longer calls a provider RPC endpoint directly.
- Automated regression fixtures cover cursor validation/encoding, account pagination merging, token-account attribution, fee-only SOL changes, malformed raw amounts and failed transactions. Live mainnet/devnet and provider failover/quota checks remain release gates because they require configured live provider credentials.

## Phase 5 — Centralize remaining RPC access

- Audit balances, token import, gas estimation, nonce lookup, transaction preparation and signed-transaction broadcast.
- Route public data reads through the server RPC interface where appropriate.
- Signing remains local.
- Broadcast retries must reuse the exact signed payload and must not create a replacement transaction after an ambiguous timeout.

## Phase 6 — Mobile history and provider migration

- Render history inside the selected native/token asset detail view.
- Show the latest 50 relevant events, newest first.
- Avoid a separate history button/screen.
- Make transaction hashes and addresses open the correct chain explorer.
- Do not display intermediate router/internal trace noise.
- Keep chain selection independent so one slow network does not block another.

## Phase 7 — Verification and release

Before production:
- Type-check the mobile and backend projects.
- Run Android bundle export and APK build.
- Exercise history on each supported chain with known incoming/outgoing transfers, token transfers, swaps, approvals and contract calls.
- Test provider outages, 429/403/5xx, timeout, malformed response and fallback behavior.
- Run parallel-load tests and enforce per-provider concurrency/rate limits.
- Verify the APK contains no provider secrets or private RPC URLs.
- Production deployment and release require explicit approval.
