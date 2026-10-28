import { fetchTokenDataFromRpc } from './evmService';
import { queryTokenMetadata, saveTokenMetadata } from './supabaseService';
import { fetchMetadataFromIpfs } from './ipfsService';

export const importToken = async (contractAddress, chain) => {
    try {
        const tokenData = await fetchTokenDataFromRpc(contractAddress, chain);
        const metadata = await queryTokenMetadata(contractAddress, chain);

        if (metadata && metadata.cid) {
            const ipfsData = await fetchMetadataFromIpfs(metadata.cid);
            return { ...tokenData, ...ipfsData };
        }

        return tokenData;
    } catch (error) {
        throw new Error('Failed to import token: ' + error.message);
    }
};

export const fetchTokenData = async (contractAddress, chain) => {
    try {
        const tokenData = await fetchTokenDataFromRpc(contractAddress, chain);
        return tokenData;
    } catch (error) {
        throw new Error('Failed to fetch token data: ' + error.message);
    }
};