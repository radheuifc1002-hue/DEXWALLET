const rpcConfig = {
  version: 1,
  chains: {
    ethereum: {
      mainnet: { chainId: 1, endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=ethereum&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=ethereum&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=ethereum&network=mainnet'] },
      testnet: { chainId: 11155111, endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=ethereum&network=testnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=ethereum&network=testnet'] }
    },
    bnb: {
      mainnet: { chainId: 56, endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=bnb&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=bnb&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=bnb&network=mainnet'] },
      testnet: { chainId: 97, endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=bnb&network=testnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=bnb&network=testnet'] }
    },
    polygon: {
      mainnet: { chainId: 137, endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=polygon&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=polygon&network=mainnet'] },
      testnet: { chainId: 80002, endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=polygon&network=testnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=polygon&network=testnet'] }
    },
    solana: {
      mainnet: { endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=solana&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=solana&network=mainnet', 'https://dexwallet-omega.vercel.app/api/rpc?chain=solana&network=mainnet'] },
      testnet: { endpoints: ['https://dexwallet-omega.vercel.app/api/rpc?chain=solana&network=testnet'] }
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
