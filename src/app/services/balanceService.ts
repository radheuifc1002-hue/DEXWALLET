import { ethers } from "ethers";
import { Blockchain } from "../context/WalletContext";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
];

const RPC_URLS: Record<string, string> = {
  ethereum: "https://eth.llamarpc.com",
  bnb: "https://bsc-dataseed.binance.org",
  polygon: "https://polygon-rpc.com",
};

const EXPLORER_URLS: Record<string, string> = {
  ethereum: "https://api.etherscan.io/api",
  bnb: "https://api.bscscan.com/api",
  polygon: "https://api.polygonscan.com/api",
};

const ETHERSCAN_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || "";
const BSCSCAN_KEY = import.meta.env.VITE_BSCSCAN_API_KEY || ETHERSCAN_KEY;
const POLYGONSCAN_KEY = import.meta.env.VITE_POLYGONSCAN_API_KEY || ETHERSCAN_KEY;

const EXPLORER_KEYS: Record<string, string> = {
  ethereum: ETHERSCAN_KEY,
  bnb: BSCSCAN_KEY,
  polygon: POLYGONSCAN_KEY,
};

export const getProvider = (chain: string): ethers.JsonRpcProvider => {
  return new ethers.JsonRpcProvider(RPC_URLS[chain]);
};

export const fetchEvmNativeBalance = async (address: string, chain: string): Promise<{ balance: number; balanceUSD: number }> => {
  try {
    const provider = getProvider(chain);
    const rawBalance = await provider.getBalance(address);
    const balance = parseFloat(ethers.formatEther(rawBalance));
    const price = await fetchCoinPrice(chain);
    return { balance, balanceUSD: balance * price };
  } catch {
    return { balance: 0, balanceUSD: 0 };
  }
};

export const fetchSolanaBalance = async (address: string): Promise<{ balance: number; balanceUSD: number }> => {
  try {
    const response = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address],
      }),
    });
    const data = await response.json();
    const lamports = data.result?.value ?? 0;
    const balance = lamports / 1e9;
    const price = await fetchCoinPrice("solana");
    return { balance, balanceUSD: balance * price };
  } catch {
    return { balance: 0, balanceUSD: 0 };
  }
};

const priceCache: Record<string, { price: number; time: number }> = {};

export const fetchCoinPrice = async (chain: string): Promise<number> => {
  const coinIds: Record<string, string> = {
    ethereum: "ethereum",
    bnb: "binancecoin",
    polygon: "matic-network",
    solana: "solana",
  };
  const id = coinIds[chain] || chain;
  const cached = priceCache[id];
  if (cached && Date.now() - cached.time < 60000) return cached.price;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const data = await res.json();
    const price = data[id]?.usd ?? 0;
    priceCache[id] = { price, time: Date.now() };
    return price;
  } catch {
    return cached?.price ?? 0;
  }
};

export interface ERC20TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  balance: number;
  balanceUSD: number;
}

export const fetchERC20Info = async (
  contractAddress: string,
  ownerAddress: string,
  chain: string
): Promise<ERC20TokenInfo> => {
  const provider = getProvider(chain);
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

  const [name, symbol, decimalsRaw, rawBalance] = await Promise.all([
    contract.name(),
    contract.symbol(),
    contract.decimals(),
    contract.balanceOf(ownerAddress),
  ]);

  const decimals = Number(decimalsRaw);
  const balance = parseFloat(ethers.formatUnits(rawBalance, decimals));
  return { name, symbol, decimals, balance, balanceUSD: 0 };
};

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  status: "success" | "failed";
  type: "send" | "receive";
  fee?: string;
}

export const fetchEvmTransactions = async (
  address: string,
  chain: string
): Promise<Transaction[]> => {
  const baseUrl = EXPLORER_URLS[chain];
  const apiKey = EXPLORER_KEYS[chain];
  const keyParam = apiKey ? `&apikey=${apiKey}` : "";

  try {
    const url = `${baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=20&page=1${keyParam}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    return data.result.slice(0, 20).map((tx: any) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: ethers.formatEther(tx.value),
      timestamp: parseInt(tx.timeStamp) * 1000,
      status: tx.isError === "0" ? "success" : "failed",
      type: tx.from.toLowerCase() === address.toLowerCase() ? "send" : "receive",
      fee: ethers.formatEther(BigInt(tx.gasUsed) * BigInt(tx.gasPrice)),
    }));
  } catch {
    return [];
  }
};

export const fetchSolanaTransactions = async (address: string): Promise<Transaction[]> => {
  try {
    const sigRes = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [address, { limit: 10 }],
      }),
    });
    const sigData = await sigRes.json();
    const signatures: any[] = sigData.result ?? [];

    return signatures.slice(0, 10).map((sig: any) => ({
      hash: sig.signature,
      from: address,
      to: "",
      value: "—",
      timestamp: (sig.blockTime ?? 0) * 1000,
      status: sig.err ? "failed" : "success",
      type: "send",
    }));
  } catch {
    return [];
  }
};

export const fetchTransactions = async (
  address: string,
  chain: Blockchain
): Promise<Transaction[]> => {
  if (chain === "solana") return fetchSolanaTransactions(address);
  return fetchEvmTransactions(address, chain);
};
