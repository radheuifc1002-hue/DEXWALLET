import type { RpcNetwork } from './rpc-manager.js';
type Chain='bitcoin'|'tron';
type RpcBody={jsonrpc?:string;id?:string|number|null;method?:string;params?:unknown[]};
const BTC:Record<RpcNetwork,string>={mainnet:'https://mempool.space/api',testnet:'https://mempool.space/testnet4/api'};
const TRON:Record<RpcNetwork,string>={mainnet:'https://api.trongrid.io',testnet:'https://nile.trongrid.io'};
const TRON_CHAIN_ID:Record<RpcNetwork,number>={mainnet:728126428,testnet:3448148188};
const BTC_READ=new Set(['getblockchaininfo','getblockcount','getblockhash','getblockheader','getrawtransaction','estimatesmartfee']);
const BTC_WRITE=new Set(['sendrawtransaction']);
const TRON_READ=new Set(['net_version','eth_chainId','getaccount','getaccountresource','getnowblock','getblockbynum','gettransactionbyid','gettransactioninfobyid']);
const TRON_WRITE=new Set(['broadcasttransaction','eth_sendRawTransaction']);\nconst TRON_EVM=new Set(['eth_chainId','eth_blockNumber','eth_getBalance','eth_call','eth_getCode','eth_gasPrice','eth_estimateGas','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_sendRawTransaction']);
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
   if(BTC_WRITE.has(method)){
    if(typeof params[0]!=='string'||!/^[0-9a-f]+$/i.test(params[0]))return failure(id,'A signed raw transaction hex string is required.',-32602,400);
    const txid=await request(BTC[network]+'/tx',{method:'POST',headers:{'Content-Type':'text/plain'},body:params[0]});
    return result(id,txid);
   }
   if(!BTC_READ.has(method))return failure(id,'Unsupported Bitcoin RPC method: '+method,-32601,400);
   if(method==='getblockcount')return result(id,Number(await request(BTC[network]+'/blocks/tip/height')));
   if(method==='getblockhash'){
    const height=Number(params[0]);if(!Number.isSafeInteger(height)||height<0)return failure(id,'Invalid block height',-32602,400);
    return result(id,await request(BTC[network]+'/block-height/'+height));
   }
   if(method==='getblockchaininfo'){
    const [height,mempool]=await Promise.all([request(BTC[network]+'/blocks/tip/height'),request(BTC[network]+'/mempool')]);
    return result(id,{chain:network==='mainnet'?'main':'test',blocks:Number(height),headers:Number(height),verificationprogress:1,initialblockdownload:false,size_on_disk:0,mempool:{size:Number(mempool?.count||0)}});
   }
   if(method==='getblockheader'){
    const hash=String(params[0]||'');if(!/^[0-9a-f]{64}$/i.test(hash))return failure(id,'Invalid block hash',-32602,400);
    const verbose=params[1]!==false;
    return result(id,verbose?await request(BTC[network]+'/block/'+hash):await request(BTC[network]+'/block/'+hash+'/header'));
   }
   if(method==='getrawtransaction'){
    const txid=String(params[0]||'');if(!/^[0-9a-f]{64}$/i.test(txid))return failure(id,'Invalid transaction id',-32602,400);
    const verbose=params[1]!==false;
    return result(id,verbose?await request(BTC[network]+'/tx/'+txid):await request(BTC[network]+'/tx/'+txid+'/hex'));
   }
   const fees=await request(BTC[network]+'/v1/fees/recommended');
   const target=Math.max(1,Math.min(1008,Number(params[0]||6)));
   const rate=target<=1?fees.fastestFee:target<=3?fees.halfHourFee:target<=6?fees.hourFee:fees.economyFee;
   return result(id,{feerate:Number(rate)*0.00001,blocks:target});
  }
  if(!TRON_READ.has(method)&&!TRON_WRITE.has(method)&&!TRON_EVM.has(method))return failure(id,'Unsupported TRON RPC method: '+method,-32601,400);
  if(method==='net_version')return result(id,String(TRON_CHAIN_ID[network]));
  if(method==='eth_chainId')return result(id,'0x'+TRON_CHAIN_ID[network].toString(16));
  if(TRON_EVM.has(method)){
   const response=await request(TRON[network]+'/jsonrpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
   if(response?.error)return failure(id,String(response.error.message||'TRON JSON-RPC error'),Number(response.error.code)||-32000);
   return result(id,response?.result);
  }
  const routes:Record<string,string>={getaccount:'/wallet/getaccount',getaccountresource:'/wallet/getaccountresource',getnowblock:'/wallet/getnowblock',getblockbynum:'/wallet/getblockbynum',gettransactionbyid:'/wallet/gettransactionbyid',gettransactioninfobyid:'/wallet/gettransactioninfobyid',broadcasttransaction:'/wallet/broadcasttransaction'};
  const apiKey=process.env.TRONGRID_API_KEY;
  const response=await request(TRON[network]+routes[method],{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{'TRON-PRO-API-KEY':apiKey}:{})},body:JSON.stringify(params[0]??{})});
  return result(id,response);
 }catch(error){return failure(id,error instanceof Error?error.message:'Upstream provider unavailable',-32000,502);}
}
export async function probeChainRpc(chain:Chain,network:RpcNetwork):Promise<{name:string;configured:boolean;healthy:boolean;latencyMs:number|null;lastFailure?:string}>{
 const started=Date.now();
 try{
  if(chain==='bitcoin'){const height=await request(BTC[network]+'/blocks/tip/height');if(!Number.isFinite(Number(height)))throw new Error('Invalid Bitcoin tip height');}
  else{const key=process.env.TRONGRID_API_KEY;const block=await request(TRON[network]+'/wallet/getnowblock',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'TRON-PRO-API-KEY':key}:{})},body:'{}'});if(!block?.block_header?.raw_data?.number)throw new Error('Invalid TRON block response');}
  return{name:chain==='bitcoin'?'mempool.space':'TronGrid',configured:true,healthy:true,circuit:'closed',cooldownMs:0,latencyMs:Date.now()-started,consecutiveFailures:0,lastCheckedAt:Date.now()};
 }catch(error){return{name:chain==='bitcoin'?'mempool.space':'TronGrid',configured:true,healthy:false,circuit:'closed',cooldownMs:0,latencyMs:null,consecutiveFailures:1,lastCheckedAt:Date.now(),lastFailure:error instanceof Error?error.message:'provider unavailable'};}
}
