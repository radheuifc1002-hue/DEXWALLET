# XU - Non-Custodial Crypto Wallet

A modern, production-ready mobile crypto wallet UI built with React, TypeScript, and Tailwind CSS.

## Features

### Multi-Chain Support
- Solana
- Ethereum (EVM)
- BNB Chain (EVM)
- Polygon (EVM)

### Core Functionality
- ✅ Wallet Creation & Import
- ✅ PIN Security with Biometric Option
- ✅ 12-Word Seed Phrase Generation
- ✅ Token Management (Import Custom Tokens)
- ✅ Send & Receive Crypto
- ✅ DApp Browser with Wallet Connect
- ✅ Network Toggle (Mainnet/Testnet)
- ✅ Auto-Lock Security

## Screen Flow

1. **Splash Screen** - Animated logo with "Your Keys. Your Crypto."
2. **Onboarding** - Create or Import Wallet
3. **Set PIN** - 6-digit PIN with biometric toggle
4. **Generate Seed** - Display 12-word mnemonic
5. **Confirm Seed** - Verify seed phrase
6. **Home Dashboard** - Multi-chain token list
7. **Token Details** - View token info and actions
8. **Send/Receive** - Transfer crypto
9. **DApp Browser** - Explore Web3 apps
10. **Settings** - Security and preferences

## Tech Stack

- **React 18** - UI Framework
- **TypeScript** - Type Safety
- **React Router 7** - Navigation
- **Tailwind CSS v4** - Styling
- **Motion** - Animations
- **Radix UI** - Accessible Components
- **QRCode** - QR Generation
- **Lucide React** - Icons

## Color Scheme

- Primary: `#6C4CF1` (Purple)
- Secondary: `#EDE9FE` (Light Lavender)
- Background: `#FFFFFF` (White)
- Border Radius: `0.75rem`

## Project Structure

```
/src/app
├── components/
│   ├── ui/              # Shadcn UI components
│   ├── PinInput.tsx     # PIN entry keypad
│   ├── TokenListItem.tsx
│   └── BottomNav.tsx
├── screens/
│   ├── Splash.tsx
│   ├── Onboarding.tsx
│   ├── SetPin.tsx
│   ├── GenerateSeedPhrase.tsx
│   ├── ConfirmSeedPhrase.tsx
│   ├── ImportWallet.tsx
│   ├── Home.tsx
│   ├── TokenDetails.tsx
│   ├── ImportToken.tsx
│   ├── Send.tsx
│   ├── Receive.tsx
│   ├── Browser.tsx
│   ├── DAppView.tsx
│   ├── Settings.tsx
│   ├── ExportSeedPhrase.tsx
│   ├── ChangePin.tsx
│   └── PinLock.tsx
├── context/
│   └── WalletContext.tsx  # Global wallet state
├── routes.tsx
└── App.tsx
```

## Key Components

### PinInput
Reusable PIN entry component with:
- Dot display visualization
- Number pad (0-9)
- Error state animations
- Auto-completion

### BottomNav
Navigation bar with:
- Assets
- Browser
- Settings

### TokenListItem
Token display with:
- Icon
- Name & Symbol
- Balance (Token & USD)

## Security Features

1. **PIN Protection**
   - 6-digit PIN required for sensitive actions
   - Biometric authentication option
   - Auto-lock after inactivity

2. **Seed Phrase Security**
   - PIN required to view
   - Warning messages
   - Copy protection notice

3. **DApp Browser Security**
   - Connection approval
   - Transaction confirmation
   - Domain verification
   - Unsafe site warnings

## Mock Data

The app includes realistic mock data for:
- Native tokens (SOL, ETH, BNB, MATIC)
- Stablecoins (USDC, USDT)
- Custom tokens
- DApps (Uniswap, OpenSea, PancakeSwap, etc.)

## Getting Started

1. Install dependencies: `npm install`
2. Run development server: `npm run dev`
3. Build for production: `npm run build`

## Usage Flow

1. Open app → Splash screen
2. Click "Continue" → Onboarding
3. Choose "Create Wallet"
4. Set 6-digit PIN
5. Save 12-word seed phrase
6. Verify seed phrase
7. Access Home Dashboard
8. Select blockchain (tabs)
9. View/send/receive tokens
10. Browse DApps
11. Manage settings

## Notes

- All wallet operations are simulated (no real blockchain integration)
- Transaction confirmations require PIN entry
- Network fees are displayed but not executed
- DApp browser shows simulated Web3 interactions
