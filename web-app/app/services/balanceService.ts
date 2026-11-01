import { ethers } from "ethers";
import type { Blockchain, Network } from "../context/WalletContext";
import { getCentralEvmChainId, getCentralRpcUrl, serverRpcRequest } from "./serverRpc";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
];

export const getProvider = (chain: Exclude<Blockchain, "solana">, network: Network = "mainnet"): ethers.JsonRpcProvider => {
  const chainId = getCentralEvmChainId(chain, network);
  return new ethers.JsonRpcProvider(getCentralRpcUrl(chain, network), chainId);
};

export const fetchEvmNativeBalance = async (
  address: string, chain: Exclude<Blockchain, "solana">, network: Network = "mainnet"
): Promise<{ balance: number; balanceUSD: number }> => {
  const provider = getProvider(chain, network);
  const rawBalance = await provider.getBalance(address);
  const balance = Number(ethers.formatEther(rawBalance));
  const price = await fetchCoinPrice(chain);
  return { balance, balanceUSD: balance * price };
};

export const fetchSolanaBalance = async (
  address: string, network: Network = "mainnet"
): Promise<{ balance: number; balanceUSD: number }> => {
  const result = await serverRpcRequest<{ value: number }>("solana", network, "getBalance", [address]);
  const balance = Number(result.value) / 1e9;
  const price = await fetchCoinPrice("solana");
  return { balance, balanceUSD: balance * price };
};

const priceCache: Record<string, { price: number; time: number }> = {};
export const fetchCoinPrice = async (chain: string): Promise<number> => {
  const coinIds: Record<string, string> = {
    ethereum: "ethereum", bnb: "binancecoin", polygon: "matic-network", solana: "solana",
  };
  const id = coinIds[chain] || chain;
  const cached = priceCache[id];
  if (cached && Date.now() - cached.time < 60000) return cached.price;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`);
    if (!res.ok) throw new Error("price_unavailable");
    const data = await res.json();
    const price = Number(data?.[id]?.usd ?? 0);
    priceCache[id] = { price, time: Date.now() };
    return price;
  } catch {
    return cached?.price ?? 0;
  }
};

export const fetchSolanaTokenBalance = async (
  mint: string, owner: string, network: Network = "mainnet"
): Promise<{ balance: number; balanceUSD: number }> => {
  const result = await serverRpcRequest<any>("solana", network, "getTokenAccountsByOwner", [
    owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  const rows = Array.isArray(result?.value) ? result.value : [];
  const raw = rows.reduce((sum: bigint, row: any) =>
    sum + BigInt(row?.account?.data?.parsed?.info?.tokenAmount?.amount || "0"), 0n);
  const decimals = Number(rows[0]?.account?.data?.parsed?.info?.tokenAmount?.decimals ?? 0);
  const balance = Number(ethers.formatUnits(raw, decimals));
  const price = await fetchCoinPrice("solana");
  return { balance, balanceUSD: balance * price };
};

export interface ERC20TokenInfo {
  name: string; symbol: string; decimals: number; balance: number; balanceUSD: number;
}
export const fetchERC20Info = async (
  contractAddress: string, ownerAddress: string,
  chain: Exclude<Blockchain, "solana">, network: Network = "mainnet"
): Promise<ERC20TokenInfo> => {
  const provider = getProvider(chain, network);
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
  const [name, symbol, decimalsRaw, rawBalance] = await Promise.all([
    contract.name(), contract.symbol(), contract.decimals(), contract.balanceOf(ownerAddress),
  ]);
  const decimals = Number(decimalsRaw);
  const balance = Number(ethers.formatUnits(rawBalance, decimals));
  return { name, symbol, decimals, balance, balanceUSD: 0 };
};

export interface Transaction {
  hash: string; from: string; to: string; value: string; timestamp: number;
  status: "success" | "failed"; type: "send" | "receive"; fee?: string;
}
export const fetchEvmTransactions = async (
  address: string, chain: string
): Promise<Transaction[]> => {
  const baseUrl: Record<string, string> = {
    ethereum: "https://api.etherscan.io/api", bnb: "https://api.bscscan.com/api",
    polygon: "https://api.polygonscan.com/api",
  };
  const url = baseUrl[chain];
  if (!url) return [];
  try {
    const res = await fetch(`${url}?module=account&action=txlist&address=${encodeURIComponent(address)}&startblock=0&endblock=99999999&sort=desc&offset=20&page=1`);
    const data = await res.json();
    if (data.status !== "1" || !Array.isArray(data.result)) return [];
    return data.result.slice(0, 20).map((tx: any) => ({
      hash: tx.hash, from: tx.from, to: tx.to, value: ethers.formatEther(tx.value),
      timestamp: Number(tx.timeStamp) * 1000, status: tx.isError === "0" ? "success" : "failed",
      type: tx.from.toLowerCase() === address.toLowerCase() ? "send" : "receive",
      fee: ethers.formatEther(BigInt(tx.gasUsed) * BigInt(tx.gasPrice)),
    }));
  } catch { return []; }
};
export const fetchSolanaTransactions = async (_address: string): Promise<Transaction[]> => [];
export const fetchTransactions = async (address: string, chain: Blockchain): Promise<Transaction[]> =>
  chain === "solana" ? fetchSolanaTransactions(address) : fetchEvmTransactions(address, chain);
