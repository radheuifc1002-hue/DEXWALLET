import type { RpcNetwork } from './rpc-manager.js';
type Chain='bitcoin'|'tron';
type RpcBody={jsonrpc?:string;id?:string|number|null;method?:string;params?:unknown[]};
const ALCHEMY_NETWORK: Record<Chain, Record<RpcNetwork, string>> = {
 bitcoin: { mainnet: 'bitcoin-mainnet', testnet: 'bitcoin-testnet' },
 tron: { mainnet: 'tron-mainnet', testnet: 'tron-testnet' },
};
function alchemyBase(chain: Chain, network: RpcNetwork): string {
 const scoped = process.env['ALCHEMY_' + chain.toUpperCase() + '_' + network.toUpperCase() + '_API_KEY'];
 const key = scoped || process.env.ALCHEMY_API_KEY;
 if (!key) throw new Error('alchemy_api_key_not_configured');
 return 'https://' + ALCHEMY_NETWORK[chain][network] + '.g.alchemy.com/v2/' + encodeURIComponent(key);
}
const TRON_CHAIN_ID:Record<RpcNetwork,number>={mainnet:728126428,testnet:3448148188};
const BTC_READ=new Set(['getblockchaininfo','getblockcount','getblockhash','getblockheader','getrawtransaction','estimatesmartfee']);
const BTC_WRITE=new Set(['sendrawtransaction']);
const TRON_READ=new Set(['net_version','eth_chainId','getaccount','getaccountresource','getnowblock','getblockbynum','gettransactionbyid','gettransactioninfobyid']);
const TRON_WRITE=new Set(['broadcasttransaction','eth_sendRawTransaction']);
const TRON_EVM=new Set(['eth_chainId','eth_blockNumber','eth_getBalance','eth_call','eth_getCode','eth_gasPrice','eth_estimateGas','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_sendRawTransaction']);
async function request(url:string,init?:RequestInit):Promise<any>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(url,{...init,headers:{Accept:'application/json',...(init?.headers||{})},signal:controller.signal});const text=await response.text();if(!response.ok)throw new Error('upstream_http_'+response.status);try{return JSON.parse(text)}catch{return text;}}
 finally{clearTimeout(timer);}
}
function result(id:unknown,value:unknown){return{status:200,body:JSON.stringify({jsonrpc:'2.0',id:id??null,result:value}),provider:'chain-adapter',attempts:1,requestId:'chain-adapter'};}
function failure(id:unknown,message:string,code=-32000,status=502){return{status,body:JSON.stringify({jsonrpc:'2.0',id:id??null,error:{code,message}}),provider:'chain-adapter',attempts:1,requestId:'chain-adapter'};}
export async function proxyChainRpc(chain:Chain,network:RpcNetwork,body:unknown){
 if(!body||typeof body!=='object'||Array.isArray(body))return failure(null,'Invalid JSON-RPC request',-32600,400);
 const req=body as RpcBody,method=String(req.method||''),id=req.id??null,params=Array.isArray(req.params)?req.params:[];
 if(req.jsonrpc!=='2.0'||!method)return failure(id,'Invalid JSON-RPC request',-32600,400);
 try{
  if(chain==='bitcoin'){
   if(!BTC_READ.has(method)&&!BTC_WRITE.has(method))return failure(id,'Unsupported Bitcoin RPC method: '+method,-32601,400);
   if(BTC_WRITE.has(method)&&(typeof params[0]!=='string'||!/^[0-9a-f]+$/i.test(params[0])))return failure(id,'A signed raw transaction hex string is required.',-32602,400);
   const payload=await request(alchemyBase('bitcoin',network),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
   if(payload?.error)return failure(id,String(payload.error.message||'Bitcoin RPC error'),Number(payload.error.code)||-32000,200);
   return {status:200,body:JSON.stringify({...payload,id}),provider:'alchemy',attempts:1,requestId:'alchemy'};
  }
  if(!TRON_READ.has(method)&&!TRON_WRITE.has(method)&&!TRON_EVM.has(method))return failure(id,'Unsupported TRON RPC method: '+method,-32601,400);
  if(method==='net_version')return result(id,String(TRON_CHAIN_ID[network]));
  const base=alchemyBase('tron',network);
  if(method.startsWith('eth_')){
   const payload=await request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
   if(payload?.error)return failure(id,String(payload.error.message||'TRON RPC error'),Number(payload.error.code)||-32000,200);
   return {status:200,body:JSON.stringify({...payload,id}),provider:'alchemy',attempts:1,requestId:'alchemy'};
  }
  const routes:Record<string,string>={getaccount:'/wallet/getaccount',getaccountresource:'/wallet/getaccountresource',getnowblock:'/wallet/getnowblock',getblockbynum:'/wallet/getblockbynum',gettransactionbyid:'/wallet/gettransactionbyid',gettransactioninfobyid:'/wallet/gettransactioninfobyid',broadcasttransaction:'/wallet/broadcasttransaction'};
  const payload=await request(base+routes[method],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params[0]??{})});
  return result(id,payload);
 }catch(error){return failure(id,error instanceof Error?error.message:'Upstream provider unavailable',-32000,502);}
}
export async function probeChainRpc(chain:Chain,network:RpcNetwork):Promise<{name:string;configured:boolean;healthy:boolean;circuit:'closed'|'open';cooldownMs:number;latencyMs:number|null;consecutiveFailures:number;lastCheckedAt:number;lastFailure?:string}>{
 const started=Date.now();
 try{
  if(chain==='bitcoin'){const payload=await request(alchemyBase('bitcoin',network),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getblockcount',params:[]})});if(payload?.error||!Number.isFinite(Number(payload?.result)))throw new Error('Invalid Bitcoin Alchemy health response');}
  else{const block=await request(alchemyBase('tron',network)+'/wallet/getnowblock',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!block?.block_header?.raw_data?.number)throw new Error('Invalid TRON block response');}
  return{name:'alchemy',configured:true,healthy:true,circuit:'closed',cooldownMs:0,latencyMs:Date.now()-started,consecutiveFailures:0,lastCheckedAt:Date.now()};
 }catch(error){return{name:'alchemy',configured:true,healthy:false,circuit:'closed',cooldownMs:0,latencyMs:null,consecutiveFailures:1,lastCheckedAt:Date.now(),lastFailure:error instanceof Error?error.message:'provider unavailable'};}
}
