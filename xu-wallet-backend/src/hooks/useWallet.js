import { useState, useEffect, createContext, useContext } from 'react';
import { fetchEvmBalance, fetchSolanaBalance } from '../services/walletService';
import { useSecureStore } from '../services/securityService';

const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
    const [wallet, setWallet] = useState(null);
    const [balance, setBalance] = useState({ evm: 0, solana: 0 });
    const { getSecureData } = useSecureStore();

    useEffect(() => {
        const loadWallet = async () => {
            const storedWallet = await getSecureData('wallet');
            if (storedWallet) {
                setWallet(storedWallet);
                updateBalance(storedWallet.chain);
            }
        };
        loadWallet();
    }, []);

    const updateBalance = async (chain) => {
        if (chain === 'EVM') {
            const evmBalance = await fetchEvmBalance(wallet.address);
            setBalance((prev) => ({ ...prev, evm: evmBalance }));
        } else if (chain === 'Solana') {
            const solanaBalance = await fetchSolanaBalance(wallet.address);
            setBalance((prev) => ({ ...prev, solana: solanaBalance }));
        }
    };

    const createWallet = async () => {
        // Logic to create a new wallet
    };

    const importWallet = async (mnemonic) => {
        // Logic to import an existing wallet
    };

    return (
        <WalletContext.Provider value={{ wallet, balance, createWallet, importWallet }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    return useContext(WalletContext);
};