# Phase 3 — Remove unused database and indexer architecture

**Status: Implemented in the infrastructure pull request.**  
**Database state: No database or indexer had been deployed or used, as confirmed by the project owner.**

## Scope and completed work

Phase 3 removes the unused persistent transaction-history/indexer design and leaves the active API stateless.

- Removed the database-backed indexed-history endpoint.
- Removed wallet-address registration and indexer-job API routes.
- Removed the BNB internal trace-scanning history endpoint.
- Removed the indexer worker, Dockerfile, indexer package and schema migration.
- Removed indexer-specific regression tests and stale TypeScript/config references.
- Removed the mobile indexed-history preference service and its Settings opt-in control.
- Removed unused Neon/Supabase integrations and dependencies from the active backend/legacy scaffold where they existed solely for the retired database flow.
- Kept the stateless EVM history API and central RPC proxy.
- Kept readiness independent of a database connection or database environment variables.
- Updated CI to type-check the backend independently as well as the mobile application and Android JavaScript bundle.
- Rewrote the infrastructure roadmap and marked the old backend scaffold as reference-only rather than a deployable database backend.

## Data and migration safety

No database was deployed or used. No production database credentials, tables, records or migrations were operated on. Consequently, Phase 3 required no database migration, table drop, data export or deletion. No database resource was created or modified as part of this phase.

## Security and architecture invariants retained

- Wallet seed phrases, private keys, key derivation and signing remain on-device.
- The backend handles public addresses and public chain data only.
- No custom indexer, persistent history store, address registration system or database-backed job queue remains in the active history architecture.
- The backend may broadcast an already-signed transaction in a later phase, but must never receive wallet secrets.

## Verification

The latest Phase 3 commit passed the GitHub Actions **Mobile quality gates** workflow:
- Expo dependency alignment
- Mobile TypeScript check
- Independent backend TypeScript check
- Android JavaScript bundle export
- Bundle output verification

This validates static types and JS bundle export. It is not an APK build, production deployment, live provider integration test or database migration test.

## Explicitly out of scope

Phase 3 did not build the Solana history adapter, migrate all mobile RPC reads, change asset-detail UI, build an APK or deploy production.
