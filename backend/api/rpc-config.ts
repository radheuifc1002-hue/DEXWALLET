const rpcConfig = {
  version: 1,
  chains: {
    ethereum: {
      mainnet: { chainId: 1, endpoints: ['https://ethereum-rpc.publicnode.com', 'https://eth.api.pocket.network', 'https://eth-mainnet.g.alchemy.com/public'] },
      testnet: { chainId: 11155111, endpoints: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://eth-sepolia-testnet.api.pocket.network'] }
    },
    bnb: {
      mainnet: { chainId: 56, endpoints: ['https://bsc-rpc.publicnode.com', 'https://bsc.api.pocket.network', 'https://bsc-dataseed.bnbchain.org'] },
      testnet: { chainId: 97, endpoints: ['https://bsc-testnet-rpc.publicnode.com', 'https://bsc-testnet-dataseed.bnbchain.org'] }
    },
    polygon: {
      mainnet: { chainId: 137, endpoints: ['https://polygon-bor-rpc.publicnode.com', 'https://poly.api.pocket.network'] },
      testnet: { chainId: 80002, endpoints: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://poly-amoy-testnet.api.pocket.network'] }
    },
    solana: {
      mainnet: { endpoints: ['https://api.mainnet-beta.solana.com', 'https://solana.api.pocket.network', 'https://api.mainnet.solana.com'] },
      testnet: { endpoints: ['https://api.devnet.solana.com'] }
    }
  }
};

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(rpcConfig);
}
