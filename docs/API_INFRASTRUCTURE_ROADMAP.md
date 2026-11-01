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
- Per-address signature pagination with an opaque versioned cursor; SPL history discovers token accounts for the selected mint and merges wallet/token-account signature streams without sharing one cursor.
- Token account pubkeys provide an attribution fallback when historical RPC owner metadata is absent. Discovery is bounded to 20 accounts per mint.
- Fetches transaction details with bounded concurrency.
- Native SOL activity derives from wallet lamport balance changes.
- SPL-token activity derives from wallet-owned pre/post token-balance deltas for the selected mint.
- Normalized rows include signature, direction, amount, timestamp, failure status and Solscan transaction URL.
- Added a typed mobile service with cursor metadata.
- Rows represent net wallet balance changes per transaction, not each instruction-level transfer. More than 20 associated token accounts returns an explicit error rather than silently omitting accounts. Closed token accounts no longer returned by owner discovery may not be fully enumerable without an indexer.
- Asset detail uses the backend client for native SOL and SPL; no direct RPC call remains in the screen.
- CI includes regression checks for per-account pagination, unconsumed signature preservation, token-account attribution, amount safety, failure status and mobile routing. Live mainnet/devnet and provider failover/quota checks remain environment-dependent release checks.

## Phase 5 — Centralize remaining RPC access

**Started.** Initial mobile migration is committed; full-wallet coverage and end-to-end validation remain in progress.
- Added a typed mobile JSON-RPC client targeting the server gateway, with bounded request timeout and normalized errors.
- Migrated send-screen native balance reads, SOL transaction preparation, SOL signed-message broadcast/status lookup, EVM balance/fee/gas estimation, and EVM wallet-provider operations to the central gateway URL.
- Migrated SPL mint/account lookup and EVM ERC-20 contract inspection/balance lookup to the central gateway.
- Wallet signing remains on-device. The gateway accepts an explicit read-only method allowlist and only signed raw broadcast methods (`eth_sendRawTransaction`, Solana `sendTransaction`) as non-replayable writes; unknown methods are rejected. Signed broadcasts are never retried against a secondary provider.
- Remaining audit: wallet home/portfolio balance refresh is currently a no-op; other web-app/legacy code and all provider URLs must be searched and migrated or explicitly classified. Nonce lookup, receipt polling, and send error/rebroadcast behavior need dedicated regression coverage.

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
