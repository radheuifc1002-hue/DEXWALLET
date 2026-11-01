import { proxyRpc, type RpcChain, type RpcNetwork } from './_lib/rpc-manager.js';

const CHAINS = new Set<RpcChain>(['ethereum','bnb','polygon','arbitrum','optimism','base','avalanche','linea','solana']);
const NETWORKS = new Set<RpcNetwork>(['mainnet','testnet']);

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow','POST, OPTIONS'); return res.status(405).json({error:{code:'method_not_allowed'}}); }
  const chain = String(req.query?.chain || '').toLowerCase() as RpcChain;
  const network = String(req.query?.network || '').toLowerCase() as RpcNetwork;
  if (!CHAINS.has(chain) || !NETWORKS.has(network)) return res.status(400).json({error:{code:'unsupported_network'}});
  try {
    const result = await proxyRpc(chain,network,req.body);
    res.setHeader('X-Request-Id',result.requestId);
    res.setHeader('X-RPC-Provider',result.provider);
    res.setHeader('X-RPC-Attempts',String(result.attempts));
    return res.status(result.status).send(result.body);
  } catch { return res.status(502).json({error:{code:'upstream_unavailable'}}); }
}
