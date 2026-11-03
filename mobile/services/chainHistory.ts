import type { Blockchain, Network } from '../../context/WalletContext';
export type ChainHistoryRow = {
  id:string; hash:string; title:string; subtitle:string; amount:string; timestamp:number;
  status:'Confirmed'|'Pending'|'Failed'; incoming:boolean; explorerUrl:string;
};
export async function fetchChainAssetHistory(chain:'bitcoin'|'tron',network:Network,walletAddress:string):Promise<{rows:ChainHistoryRow[];complete:boolean}> {
  if(!walletAddress) throw new Error('Wallet address is missing for this network.');
  const response=await fetch('https://dexwallet-api.vercel.app/api/chain-history',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({chain,network,walletAddress}),
  });
  const payload:any=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error?.code==='rpc_not_configured'
    ? 'RPC provider is not configured for this network.'
    : 'Transaction history is temporarily unavailable. Please try again.');
  if(!Array.isArray(payload?.rows)) throw new Error('The history service returned an invalid response.');
  return {rows:payload.rows as ChainHistoryRow[],complete:Boolean(payload.complete)};
}
export function isEvmHistoryChain(chain:Blockchain):chain is Exclude<Blockchain,'solana'|'bitcoin'|'tron'> {
  return chain!=='solana'&&chain!=='bitcoin'&&chain!=='tron';
}
