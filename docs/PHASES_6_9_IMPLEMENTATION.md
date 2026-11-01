# DEXWALLET Phases 6–9

## Phase 6 — Native Android backend integration

- EVM and Solana balance reads use the Vercel RPC gateway.
- EVM token contract validation and metadata/balance reads use `eth_chainId`, `eth_getCode`, and `eth_call` through the gateway.
- EVM send preparation obtains balance, gas price, nonce, and gas estimate from the backend.
- EVM transaction signing remains on-device. The app submits only the signed raw transaction through `eth_sendRawTransaction`.
- Solana message construction and signing remain on-device; RPC reads, submission and confirmation checks use the backend.
- DApp browser EVM requests use the central gateway. Wallet secrets are not sent to the API.
- The canonical mobile API host is `https://dexwallet-api.vercel.app`.

## Phase 7 — Asset-specific transaction history

- History is shown in the selected native/token asset detail view.
- EVM history is restricted to incoming/outgoing native and ERC-20 transfers; internal traces and generic contract calls are intentionally excluded.
- Solana SOL/SPL history uses an opaque cursor and a Load older action.
- Each response is capped at 50 visible rows; explorer links are included.
- EVM receipts are labelled success, failed, or unknown. Unknown is not silently treated as success.
- Partial history is surfaced to the UI.

## Phase 8 — Runtime resilience and security guardrails

- Provider calls have request timeouts, bounded provider concurrency, request-rate caps, retries with jitter, and per-provider circuit breakers.
- Compatible read-only calls can fail over to configured providers; signed transaction broadcasts are never replayed to a second provider.
- Safe, short-lived RPC read results are cached and identical in-flight reads are coalesced.
- RPC, history, and health routes have bounded per-client request limits.
- Structured provider diagnostics include request IDs, chain/network, method names, provider labels, attempt counts, status and latency. Upstream URLs, API keys, seed phrases, private keys and transaction payloads are not logged.

### Scale boundary

The limiter, cache, in-flight map, provider health and provider concurrency counters are process-local because the current backend is deployed as stateless Vercel Functions. They protect each warm instance, but are not a globally coordinated quota/cache across all instances. A 5,000-concurrent-user capacity claim requires a shared Redis-compatible store or edge rate-limit product, provider-plan capacity validation, and a representative load test. No such external store or production load test is configured by this repository change; do not treat the 5,000-user objective as certified.

## Phase 9 — Validation and release gates

- GitHub Actions type-checks the Expo application and backend independently and runs the regression suite.
- The main-branch Android workflow builds an ARM64 standalone release APK, verifies that the JavaScript bundle is embedded, and uploads the APK artifact plus a prerelease download.
- Production API deployment and post-deploy endpoint/log checks must be verified against the intended Vercel backend project before calling the release complete.
