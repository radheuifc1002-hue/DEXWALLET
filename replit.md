# XU - Non-Custodial Crypto Wallet

## Overview
A production-ready multi-chain crypto wallet with two versions:
1. **Web App** (React + Vite) — runs on port 5000
2. **Mobile App** (Expo/React Native) — started via `npx expo start` on port 8081

Supports Solana, Ethereum, BNB Chain, and Polygon with real BIP39 mnemonic generation, wallet address derivation, PIN security, and biometric authentication.

## Tech Stack

### Web App (`src/`)
- **Frontend:** React 18 + TypeScript + Vite 6
- **Styling:** Tailwind CSS v4
- **UI:** Radix UI (Shadcn-based)
- **Routing:** React Router 7

### Mobile App (`app/`, `context/`, `mobile/`)
- **Framework:** Expo SDK 55 + React Native 0.84
- **Routing:** Expo Router (file-based, like Next.js)
- **Styling:** React Native StyleSheet
- **Storage:** expo-secure-store (PIN, mnemonic, biometric flag), AsyncStorage (addresses)
- **Biometrics:** expo-local-authentication (Touch ID / Face ID / Fingerprint)
- **Navigation:** Stack + Bottom Tabs

### Shared
- **Crypto:** ethers v6, bip39, @noble/ed25519, bs58
- **QR:** react-native-qrcode-svg + react-native-svg

## Mobile App Structure
```
app/
  _layout.tsx          # Root layout: WalletProvider + NavigationGuard
  index.tsx            # Splash / redirect based on wallet state
  onboarding.tsx       # Create or Import wallet choice
  set-pin.tsx          # 6-digit PIN setup (enter + confirm)
  generate-seed.tsx    # Display generated 12-word seed phrase
  confirm-seed.tsx     # Verify user wrote down seed phrase
  import-wallet.tsx    # Import via mnemonic phrase
  pin-lock.tsx         # PIN / biometric unlock
  send.tsx             # Send tokens
  receive.tsx          # Receive with QR code
  export-seed.tsx      # Export seed phrase (PIN-gated)
  change-pin.tsx       # Change PIN (verify old, set new)
  (tabs)/
    _layout.tsx        # Bottom tab bar
    home.tsx           # Wallet home: balances, Send/Receive
    browser.tsx        # DApp WebView browser
    settings.tsx       # Security, biometric, auto-lock, remove wallet

context/
  WalletContext.tsx    # React context: state + async storage operations

mobile/services/
  walletService.ts     # Crypto (bip39/ethers/ed25519) + SecureStore/AsyncStorage I/O

components/
  PinPad.tsx           # Native PIN keypad component
```

## Security Model
- **PIN:** Stored in expo-secure-store (hardware-backed encrypted storage)
- **Mnemonic:** Stored in expo-secure-store
- **Biometric:** Flag stored in SecureStore; uses device biometrics via expo-local-authentication
- **Auto-lock:** App locks when sent to background (configurable: 1/5/15/30 min or never)

## Running the Mobile App
From the Replit shell:
```bash
npx expo start
```
- Scan the QR code with **Expo Go** (iOS App Store / Google Play)
- Or use `--android` / `--ios` flags for emulators
- For EAS builds: `npx eas-cli build`

## Running the Web App
The "Start application" workflow runs `npm run dev` on port 5000.

## Web App Navigation
PIN persistence, biometric auth via WebAuthn, seed phrase management, import wallet flow, and DApp browser all work in the web version too.

## Key Decisions
- `"type": "module"` kept for Vite compatibility; babel config uses `.cjs` extension to avoid ESM/CJS conflict
- Polyfills (`react-native-get-random-values`, `buffer`) imported first in `app/_layout.tsx`
- `NavigationGuard` component in root layout handles redirects based on wallet state
- Seed phrase encrypted in SecureStore for persistent export capability
