const API_BASE = 'https://dexwallet-api.vercel.app/api/rpc';
const endpoint = (chain: string, network: string) => `${API_BASE}?chain=${chain}&network=${network}`;
const rpcConfig = {
  version: 2,
  chains: {
    ethereum: { mainnet: { chainId: 1, endpoints: [endpoint('ethereum','mainnet')] }, testnet: { chainId: 11155111, endpoints: [endpoint('ethereum','testnet')] } },
    bnb: { mainnet: { chainId: 56, endpoints: [endpoint('bnb','mainnet')] }, testnet: { chainId: 97, endpoints: [endpoint('bnb','testnet')] } },
    polygon: { mainnet: { chainId: 137, symbol: 'POL', endpoints: [endpoint('polygon','mainnet')] }, testnet: { chainId: 80002, symbol: 'POL', endpoints: [endpoint('polygon','testnet')] } },
    arbitrum: { mainnet: { chainId: 42161, symbol: 'ETH', endpoints: [endpoint('arbitrum','mainnet')] }, testnet: { chainId: 421614, symbol: 'ETH', endpoints: [endpoint('arbitrum','testnet')] } },
    solana: { mainnet: { symbol: 'SOL', endpoints: [endpoint('solana','mainnet')] }, testnet: { symbol: 'SOL', endpoints: [endpoint('solana','testnet')] } },
    bitcoin: { mainnet: { coinType: 0, symbol: 'BTC', endpoints: [endpoint('bitcoin','mainnet')], addressApi: 'https://dexwallet-api.vercel.app/api/chain-data?chain=bitcoin&network=mainnet' }, testnet: { coinType: 1, symbol: 'BTC', endpoints: [endpoint('bitcoin','testnet')], addressApi: 'https://dexwallet-api.vercel.app/api/chain-data?chain=bitcoin&network=testnet' } },
    tron: { mainnet: { chainId: 728126428, coinType: 195, symbol: 'TRX', endpoints: [endpoint('tron','mainnet')], addressApi: 'https://dexwallet-api.vercel.app/api/chain-data?chain=tron&network=mainnet' }, testnet: { chainId: 3448148188, coinType: 195, symbol: 'TRX', endpoints: [endpoint('tron','testnet')], addressApi: 'https://dexwallet-api.vercel.app/api/chain-data?chain=tron&network=testnet' } }
  }
};
export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow','GET, HEAD, OPTIONS'); return res.status(405).json({ error: 'Method not allowed' }); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(rpcConfig);
}
