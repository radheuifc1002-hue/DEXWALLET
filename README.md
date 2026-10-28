# XU - Non-Custodial Crypto Wallet

<div align="center">

![XU Wallet](https://img.shields.io/badge/XU-Crypto%20Wallet-6C4CF1?style=for-the-badge&logo=ethereum&logoColor=white)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

**Your Keys. Your Crypto.**

A modern, production-ready mobile crypto wallet UI with multi-chain support, DApp browser, and premium fintech design.

[Features](#-features) • [Screenshots](#-screenshots) • [Getting Started](#-getting-started) • [Documentation](#-documentation)

</div>

---

## ✨ Features

### 🔐 Security First
- **PIN Protection** - 6-digit PIN with biometric option
- **Seed Phrase Management** - Secure 12-word mnemonic generation and backup
- **Auto-Lock** - Configurable inactivity timeout (1/5/15 min)
- **Transaction Confirmation** - PIN required for all sensitive actions

### ⛓️ Multi-Chain Support
- **Solana** - Native SOL and SPL tokens
- **Ethereum** - ETH and ERC-20 tokens
- **BNB Chain** - BNB and BEP-20 tokens
- **Polygon** - MATIC and ERC-20 tokens

### 💰 Wallet Features
- Token balance tracking with USD conversion
- Send and receive crypto
- QR code generation
- Custom token import
- Network switching (Mainnet/Testnet)

### 🌐 DApp Browser
- Popular DApps integration (Uniswap, OpenSea, PancakeSwap, etc.)
- Category filtering (DeFi, NFT, Gaming)
- Wallet Connect simulation
- Transaction approval flow
- Security warnings and domain verification

### 🎨 Premium Design
- Purple (#6C4CF1) theme with light lavender accents
- Smooth animations and transitions
- Clean, minimal fintech aesthetic
- Mobile-first responsive design
- Custom scrollbars and selection colors

---

## 🖼️ Screenshots

### Onboarding Flow
| Splash | Onboarding | Set PIN |
|--------|-----------|---------|
| Animated XU logo with purple glow | Create or Import wallet options | 6-digit PIN with biometric toggle |

### Wallet Management
| Seed Phrase | Home Dashboard | Token Details |
|------------|----------------|---------------|
| 12-word mnemonic with warnings | Multi-chain token list | Individual token view with actions |

### DApp Integration
| Browser | DApp View | Transaction |
|---------|-----------|-------------|
| Popular DApps grid | In-app browser simulation | Approval with PIN confirmation |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone <repository-url>

# Navigate to project
cd xu-wallet

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Quick Start

1. Launch the app and click "Continue"
2. Choose "Create Wallet"
3. Set a 6-digit PIN
4. Save the 12-word seed phrase
5. Verify the seed phrase
6. Start using your wallet!

---

## 📚 Documentation

- **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** - Technical architecture and structure
- **[FEATURES.md](./FEATURES.md)** - Complete feature checklist
- **[USER_GUIDE.md](./USER_GUIDE.md)** - Step-by-step usage instructions

---

## 🏗️ Project Structure

```
/src/app
├── components/
│   ├── ui/              # Radix UI components (Shadcn)
│   ├── PinInput.tsx     # PIN entry keypad
│   ├── TokenListItem.tsx
│   ├── BottomNav.tsx
│   └── WalletCard.tsx
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
│   └── WalletContext.tsx
├── routes.tsx
└── App.tsx
```

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 18.3.1 |
| **Language** | TypeScript |
| **Routing** | React Router 7 |
| **Styling** | Tailwind CSS v4 |
| **UI Components** | Radix UI |
| **Animations** | Motion (Framer Motion) |
| **Icons** | Lucide React |
| **QR Codes** | qrcode |
| **State Management** | React Context API |

---

## 🎨 Design System

### Colors
```css
Primary: #6C4CF1 (Purple)
Secondary: #EDE9FE (Light Lavender)
Background: #FFFFFF (White)
Destructive: #d4183d (Red)
```

### Typography
- Default: System font stack
- Font sizes: Tailwind default scale
- Font weights: 400 (normal), 500 (medium)

### Spacing
- Border radius: 0.75rem (12px)
- Padding: Consistent 1.5rem (24px) on screens
- Gap: 0.75rem - 1rem between elements

### Shadows
- Cards: `shadow-lg` with purple tint
- Buttons: Subtle elevation on hover
- Modals: Prominent shadow with backdrop

---

## 🔑 Key Features Explained

### Multi-Chain Architecture
The wallet uses a blockchain selector to filter tokens and addresses. Each blockchain maintains its own token list, and the UI adapts based on the selected chain.

### Security Model
- **PIN**: Required for wallet creation, transactions, and sensitive data access
- **Seed Phrase**: Generated on wallet creation, verifiable, exportable
- **Auto-Lock**: Automatically locks wallet after configured inactivity
- **Biometric**: Optional fingerprint/face unlock (UI toggle only)

### DApp Browser Flow
1. User browses available DApps
2. Clicks to open DApp in simulated webview
3. DApp requests wallet connection
4. User approves connection with network selection
5. DApp can request transactions
6. User approves with PIN confirmation

---

## 📱 Mobile Optimization

- Designed for 360x800px baseline (mobile-first)
- Touch-friendly button sizes (minimum 44px)
- Fixed bottom navigation for easy thumb access
- Responsive layouts scale up to tablet sizes
- Smooth scrolling and momentum
- Custom touch feedback animations

---

## 🔒 Security Best Practices

### Implemented
- ✅ PIN protection for sensitive actions
- ✅ Seed phrase verification
- ✅ Clear security warnings
- ✅ Transaction preview before approval
- ✅ DApp connection warnings
- ✅ Network verification

### For Production
- 🔐 Implement actual cryptographic key generation
- 🔐 Use hardware security modules (HSM)
- 🔐 Add encrypted local storage
- 🔐 Implement actual biometric authentication
- 🔐 Add transaction signing
- 🔐 Integrate with real blockchain networks

---

## 🧪 Mock Data & Simulation

This is a **UI/UX demo**. All blockchain interactions are simulated:

- Wallet addresses are hardcoded
- Token balances are mock data
- Transactions don't execute on-chain
- DApp connections are simulated
- Gas fees are estimated placeholders

**For production use**, integrate with:
- Web3.js / Ethers.js for EVM chains
- @solana/web3.js for Solana
- WalletConnect for DApp integration
- Real-time price feeds
- Actual blockchain RPC nodes

---

## 🎯 Use Cases

- **Portfolio Showcase** - Demonstrate Web3 UI/UX design skills
- **Design Reference** - Use as inspiration for crypto wallet projects
- **Client Presentation** - Show modern fintech design capabilities
- **Educational Tool** - Learn crypto wallet user flows
- **Prototype Base** - Fork and build actual wallet functionality

---

## 🤝 Contributing

This is a demo project, but suggestions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

This project is for demonstration purposes. Use freely for personal and commercial projects.

---

## ⚠️ Disclaimer

**This is a UI/UX demonstration only.**

- Do not use for real cryptocurrency management
- No actual blockchain integration
- Not audited for security
- For educational and showcase purposes only

For production crypto wallets:
- Conduct thorough security audits
- Implement proper key management
- Use established cryptographic libraries
- Follow industry best practices
- Comply with relevant regulations

---

## 🌟 Highlights

- 🎨 **18 Screens** - Complete wallet experience
- 🔐 **Security First** - PIN, seed phrase, auto-lock
- ⛓️ **4 Blockchains** - Solana, Ethereum, BNB, Polygon
- 🌐 **DApp Browser** - Web3 integration simulation
- 📱 **Mobile First** - Optimized for touch devices
- ⚡ **Production Ready** - Clean code, TypeScript, documented

---

<div align="center">

**Built with ❤️ for the Web3 community**

[Report Bug](../../issues) · [Request Feature](../../issues) · [Documentation](./PROJECT_OVERVIEW.md)

</div>
