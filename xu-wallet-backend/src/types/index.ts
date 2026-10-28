export interface Wallet {
    address: string;
    mnemonic: string;
    privateKey: string;
    publicKey: string;
    chain: string;
}

export interface Transaction {
    id: string;
    from: string;
    to: string;
    amount: number;
    timestamp: Date;
    status: 'pending' | 'completed' | 'failed';
    chain: string;
}

export interface TokenMetadata {
    name: string;
    symbol: string;
    logoURI: string;
    contractAddress: string;
    chain: string;
}

export interface Balance {
    token: string;
    amount: number;
    chain: string;
}