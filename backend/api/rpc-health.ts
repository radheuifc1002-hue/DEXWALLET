import { randomUUID } from 'node:crypto';
import { getRpcProviderStatus, type RpcChain, type RpcNetwork } from './_lib/rpc-manager.js';

const CHAINS = new Set<RpcChain>(['ethereum','bnb','polygon','arbitrum','optimism','base','avalanche','linea','solana']);
const NETWORKS = new Set<RpcNetwork>(['mainnet','testnet']);

export default function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  res.setHeader('X-Request-Id',requestId);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') { res.setHeader('Allow','GET, OPTIONS'); return res.status(405).json({error:{code:'method_not_allowed',requestId}}); }
  const chain = String(req.query?.chain || '').toLowerCase() as RpcChain;
  const network = String(req.query?.network || '').toLowerCase() as RpcNetwork;
  if (!CHAINS.has(chain) || !NETWORKS.has(network)) return res.status(400).json({error:{code:'unsupported_network',requestId}});
  const providers = getRpcProviderStatus(chain,network);
  return res.status(providers.length?200:503).json({status:providers.length?'configured':'not_configured',chain,network,providers,requestId,
    note:'Reports configured providers and this function instance circuit state; it does not probe upstream providers.'});
}
