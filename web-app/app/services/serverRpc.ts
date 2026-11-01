import { ethers } from "ethers";
import type { Blockchain, Network } from "../context/WalletContext";

const RPC_API = (import.meta.env.VITE_RPC_API_URL as string | undefined) || "https://dexwallet-api.vercel.app/api/rpc";
const CHAIN_IDS: Record<Exclude<Blockchain, "solana">, Record<Network, number>> = {
  ethereum: { mainnet: 1, testnet: 11155111 },
  bnb: { mainnet: 56, testnet: 97 },
  polygon: { mainnet: 137, testnet: 80002 },
};
export function getCentralRpcUrl(chain: Blockchain, network: Network): string {
  const separator = RPC_API.includes("?") ? "&" : "?";
  return RPC_API + separator + "chain=" + encodeURIComponent(chain) + "&network=" + encodeURIComponent(network);
}
export function getCentralEvmChainId(chain: Exclude<Blockchain, "solana">, network: Network): number {
  return CHAIN_IDS[chain][network];
}
export async function serverRpcRequest<T>(
  chain: Blockchain, network: Network, method: string, params: unknown[] = []
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(getCentralRpcUrl(chain, network), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "dexwallet-web", method, params }), signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok || payload?.error) throw new Error(String(payload?.error?.message || "Blockchain provider unavailable."));
    if (!Object.prototype.hasOwnProperty.call(payload || {}, "result")) throw new Error("Invalid RPC gateway response.");
    return payload.result as T;
  } finally { clearTimeout(timeout); }
}
