import { randomUUID } from 'node:crypto';
import { proxyRpc, getRpcChainId, type RpcChain, type RpcNetwork } from './rpc-manager.js';

export type EvmChain = Exclude<RpcChain, 'solana'>;
export type EvmOperation = 'native_balance' | 'token_balance' | 'gas_price' | 'nonce' | 'estimate_gas' | 'call' | 'receipt' | 'broadcast';
type RpcPayload<T> = { result?: T; error?: { code?: number; message?: string } };

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const HEX = /^0x(?:[a-fA-F0-9]{2})*$/;

async function request<T>(chain:EvmChain,network:RpcNetwork,method:string,params:unknown[]):Promise<T>{
  const response=await proxyRpc(chain,network,{jsonrpc:'2.0',id:randomUUID(),method,params});
  if(response.status<200||response.status>=300) throw new Error('evm_rpc_unavailable');
  const payload=JSON.parse(response.body) as RpcPayload<T>;
  if(payload.error||payload.result===undefined) throw new Error('evm_rpc_request_failed');
  return payload.result;
}

export function getEvmChainId(chain:EvmChain,network:RpcNetwork):number|undefined {
  return getRpcChainId(chain,network);
}
export async function getNativeBalance(chain:EvmChain,network:RpcNetwork,address:string):Promise<string>{
  if(!ADDRESS.test(address)) throw new Error('invalid_address');
  return request(chain,network,'eth_getBalance',[address,'latest']);
}
export async function getTokenBalance(chain:EvmChain,network:RpcNetwork,contract:string,owner:string):Promise<string>{
  if(!ADDRESS.test(contract)||!ADDRESS.test(owner)) throw new Error('invalid_address');
  return request(chain,network,'eth_call',[{to:contract,data:'0x70a08231'+owner.toLowerCase().replace(/^0x/,'').padStart(64,'0')},'latest']);
}
export async function getGasPrice(chain:EvmChain,network:RpcNetwork):Promise<string>{
  return request(chain,network,'eth_gasPrice',[]);
}
export async function getNonce(chain:EvmChain,network:RpcNetwork,address:string):Promise<string>{
  if(!ADDRESS.test(address)) throw new Error('invalid_address');
  return request(chain,network,'eth_getTransactionCount',[address,'pending']);
}
export async function estimateGas(chain:EvmChain,network:RpcNetwork,transaction:Record<string,unknown>):Promise<string>{
  if(transaction.from!==undefined&&!ADDRESS.test(String(transaction.from))) throw new Error('invalid_address');
  if(transaction.to!==undefined&&!ADDRESS.test(String(transaction.to))) throw new Error('invalid_address');
  return request(chain,network,'eth_estimateGas',[transaction]);
}
export async function callContract(chain:EvmChain,network:RpcNetwork,transaction:Record<string,unknown>,blockTag='latest'):Promise<string>{
  if(transaction.to!==undefined&&!ADDRESS.test(String(transaction.to))) throw new Error('invalid_address');
  if(!/^latest$|^pending$|^safe$|^finalized$|^0x[0-9a-fA-F]+$/.test(blockTag)) throw new Error('invalid_block_tag');
  return request(chain,network,'eth_call',[transaction,blockTag]);
}
export async function getTransactionReceipt(chain:EvmChain,network:RpcNetwork,hash:string):Promise<unknown|null>{
  if(!HASH.test(hash)) throw new Error('invalid_transaction_hash');
  return request(chain,network,'eth_getTransactionReceipt',[hash]);
}
export async function broadcastSignedTransaction(chain:EvmChain,network:RpcNetwork,signedTransaction:string):Promise<string>{
  if(!HEX.test(signedTransaction)||signedTransaction.length<4) throw new Error('invalid_signed_transaction');
  const hash=await request<string>(chain,network,'eth_sendRawTransaction',[signedTransaction]);
  if(!HASH.test(hash)) throw new Error('invalid_broadcast_response');
  return hash;
}
