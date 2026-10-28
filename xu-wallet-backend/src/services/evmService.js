import { ethers } from 'ethers';
import axios from 'axios';

const ETHERSCAN_API_KEY = 'YOUR_ETHERSCAN_API_KEY'; // Replace with your Etherscan API key
const ETHERSCAN_BASE_URL = 'https://api.etherscan.io/api';

export const fetchEvmBalance = async (address, chain) => {
    let url;
    switch (chain) {
        case 'Ethereum':
            url = `${ETHERSCAN_BASE_URL}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
            break;
        case 'BNB':
            url = `https://api.bscscan.com/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
            break;
        case 'Polygon':
            url = `https://api.polygonscan.com/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
            break;
        default:
            throw new Error('Unsupported chain');
    }

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            return ethers.utils.formatEther(response.data.result);
        } else {
            throw new Error(response.data.message);
        }
    } catch (error) {
        throw new Error(`Error fetching balance: ${error.message}`);
    }
};

export const fetchEvmTransactionHistory = async (address, chain) => {
    let url;
    switch (chain) {
        case 'Ethereum':
            url = `${ETHERSCAN_BASE_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
            break;
        case 'BNB':
            url = `https://api.bscscan.com/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
            break;
        case 'Polygon':
            url = `https://api.polygonscan.com/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
            break;
        default:
            throw new Error('Unsupported chain');
    }

    try {
        const response = await axios.get(url);
        if (response.data.status === '1') {
            return response.data.result;
        } else {
            throw new Error(response.data.message);
        }
    } catch (error) {
        throw new Error(`Error fetching transaction history: ${error.message}`);
    }
};