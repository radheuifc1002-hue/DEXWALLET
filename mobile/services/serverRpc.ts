import type { Blockchain, Network } from '../../context/WalletContext';
export type RpcChain = Blockchain;
const RPC_API = 'https://dexwallet-api.vercel.app/api/rpc';
const EVM_CHAIN_IDS: Record<string, Record<Network, number>> = {
 ethereum:{mainnet:1,testnet:11155111},bnb:{mainnet:56,testnet:97},polygon:{mainnet:137,testnet:80002},arbitrum:{mainnet:42161,testnet:421614},
};
export function getCentralRpcUrl(chain:RpcChain,network:Network):string{return RPC_API+'?chain='+encodeURIComponent(chain)+'&network='+encodeURIComponent(network);}
export function getCentralEvmChainId(chain:Exclude<RpcChain,'solana'>,network:Network):number{const id=EVM_CHAIN_IDS[chain]?.[network];if(!id)throw new Error('This chain does not use EVM chain IDs.');return id;}
export async function serverChainDataRequest<T>(chain:'bitcoin'|'tron',network:Network,address:string):Promise<T>{
 const url=RPC_API.replace('/rpc','/chain-data')+'?chain='+encodeURIComponent(chain)+'&network='+encodeURIComponent(network)+'&address='+encodeURIComponent(address);
 const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'}});
 const payload=await response.json() as any;
 if(!response.ok){if(payload?.error?.code==='rpc_not_configured')throw new Error('RPC provider is not configured for this network.');throw new Error('Chain data provider is temporarily unavailable.');}
 return payload as T;
}
export async function serverRpcRequest<T>(chain:RpcChain,network:Network,method:string,params:unknown[]=[]):Promise<T>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),22000);
 try{
  const response=await fetch(getCentralRpcUrl(chain,network),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:'dexwallet-mobile',method,params}),signal:controller.signal});
  let payload:any;try{payload=await response.json();}catch{throw new Error('RPC gateway returned an invalid response.');}
  if(!response.ok){const code=String(payload?.error?.code||'');
   if(code==='rpc_not_configured')throw new Error('RPC provider is not configured for this network.');
   if(code==='invalid_json_rpc_request')throw new Error('This RPC method is not permitted by the gateway.');
   throw new Error('Network provider is temporarily unavailable.');
  }
  if(payload?.error){const error=new Error(String(payload.error.message||'Blockchain request failed.'));(error as Error&{code?:string}).code=String(payload.error.code??'');throw error;}
  if(!Object.prototype.hasOwnProperty.call(payload||{},'result'))throw new Error('RPC gateway returned an invalid response.');
  return payload.result as T;
 }finally{clearTimeout(timeout);}
}
