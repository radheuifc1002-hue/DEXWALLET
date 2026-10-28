# XU Wallet Backend

## Overview
XU Wallet is a non-custodial crypto wallet application built with React Native (Expo). This backend service provides essential functionalities for wallet management, token handling, and secure storage, supporting multiple blockchain networks including Ethereum, BNB Chain, Polygon, and Solana.

## Features
- **Wallet Creation & Management**: Generate and import wallets securely using BIP39 and BIP44 standards.
- **Multi-Chain Support**: Interact with Ethereum, BNB Chain, Polygon, and Solana networks.
- **Token Management**: Import tokens and fetch metadata from IPFS and Supabase.
- **Secure Storage**: Store sensitive data securely using Expo Secure Store.
- **Transaction History**: Retrieve transaction history for EVM chains using the Etherscan API and for Solana using RPC or Helius API.
- **Dynamic QR Code Generation**: Generate QR codes for wallet addresses.

## Project Structure
```
xu-wallet-backend
├── src
│   ├── services          # Contains all service files for wallet and token management
│   ├── hooks             # Custom hooks for managing wallet state
│   └── types             # TypeScript types and interfaces
├── package.json          # NPM dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md             # Project documentation
```

## Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   cd xu-wallet-backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure environment variables as needed for API keys and other sensitive information.

## Usage
- Start the development server:
  ```
  npm start
  ```

- The backend services can be integrated with the frontend React Native application to handle wallet operations, token management, and secure storage.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.