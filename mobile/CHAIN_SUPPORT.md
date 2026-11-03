# XU Wallet — Seven-chain support matrix

This branch adds derivation and API routing metadata for seven networks.

| Network | SLIP-44 coin type | Derivation | Mainnet | Testnet / devnet |
|---|---:|---|---|---|
| Ethereum | 60 | BIP-44 / BIP-32: `m/44'/60'/0'/0/{index}` | Chain ID 1 · `eth-mainnet` | Sepolia 11155111 · `eth-sepolia` |
| BNB Smart Chain | 60 | Same EVM account path | Chain ID 56 · `bnb-mainnet` | BNB testnet 97 · `bnb-testnet` |
| Polygon PoS | 60 | Same EVM account path | Chain ID 137 · `polygon-mainnet` | Amoy 80002 · `polygon-amoy` |
| Arbitrum One | 60 | Same EVM account path | Chain ID 42161 · `arb-mainnet` | Arbitrum Sepolia 421614 · `arb-sepolia` |
| Solana | 501 | SLIP-0010 Ed25519; account zero retains XU legacy seed derivation | Mainnet-beta · `solana-mainnet` | Devnet · `solana-devnet` |
| Bitcoin | 0 | BIP-44 / BIP-32: `m/44'/0'/0'/0/{index}`; legacy P2PKH Base58Check | `bitcoin-mainnet` | `bitcoin-testnet` |
| TRON | 195 | BIP-44 / BIP-32: `m/44'/195'/0'/0/{index}`; TRON Base58Check | `tron-mainnet` | `tron-testnet` |

## Address compatibility

- Ethereum, BNB, Polygon and Arbitrum share the same EVM address for a given account index.
- Solana account zero intentionally preserves the existing XU address; changing it would break access to existing funds.
- Bitcoin currently derives mainnet P2PKH addresses. Testnet-specific coin-type-1 address derivation and storage are still pending; do not use the Bitcoin testnet selector for funds until that is completed.
- TRON addresses are generated from the secp256k1 key using the 0x41 prefix and Base58Check.

## API routing

The APK calls the XU API gateway only. Provider URLs and API keys remain server-side.

- EVM, Solana, Bitcoin and TRON RPC routes are registered under `/api/rpc`.
- Bitcoin and TRON native account balances use `/api/chain-data` because Bitcoin address data is UTXO/indexer-shaped and Alchemy's TRON API exposes its native HTTP method surface.
- API keys are read from `ALCHEMY_<CHAIN>_<NETWORK>_API_KEY`, falling back to `ALCHEMY_API_KEY`.
- Alchemy network slugs are configured in `backend/api/_lib/rpc-manager.ts`; no key is embedded in the Android app.

## Current functional coverage

- HD create/import, private-key import, watch-only entries, address display and derivation metadata are wired for all seven chains.
- Native balances are wired for the four EVM networks and Solana, plus Bitcoin and TRX through the server account-data route.
- Arbitrum EVM transaction history uses the existing EVM history pipeline.
- Bitcoin/TRON send signing and transaction-history indexing are not yet implemented in the Android app. TRC-20 token support is also pending.
- Automated typecheck, derivation vectors, APK build and manual device regression remain required before release.
