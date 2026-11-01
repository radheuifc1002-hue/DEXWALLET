import { randomUUID } from 'node:crypto';
import { proxyRpc } from './_lib/rpc-manager.js';
type RpcResult<T>={result?:T;error?:{message?:string}};
type SignatureInfo={signature:string;slot:number;blockTime?:number|null;err?:unknown};
type TokenBalance={accountIndex:number;mint:string;owner?:string;uiTokenAmount?:{amount?:string;decimals?:number}};
type AccountKey=string|{pubkey?:string};
type SolanaHistoryRow={id:string;hash:string;title:string;detail:string;amount:string;timestamp:number;incoming:boolean;failed:boolean;explorerUrl:string;assetType:'native'|'token';mintAddress:string|null;direction:'incoming'|'outgoing'|'self';status:'success'|'failed';asset:{type:'native'|'token';address:string|null}};
type Transaction={blockTime?:number|null;meta?:{err?:unknown;fee?:number;preBalances?:number[];postBalances?:number[];preTokenBalances?:TokenBalance[];postTokenBalances?:TokenBalance[]};transaction?:{message?:{accountKeys?:AccountKey[]}}};
type CursorState={v:1;before:Record<string,string|null>};
type ApiRequest={method?:string;body?:unknown};
type ApiResponse={setHeader(name:string,value:string):void;status(code:number):ApiResponse;json(value:unknown):void;end():void};
const MAX_ROWS=50,SIGNATURE_PAGE=50,MAX_TOKEN_ACCOUNTS=20,TX_CONCURRENCY=5,EXPLORER='https://solscan.io/tx/';
function parseBody(value:unknown):Record<string,unknown>|null{
 if(typeof value==='string'){if(value.length>8192)return null;try{value=JSON.parse(value);}catch{return null;}}
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 try{if(JSON.stringify(value).length>8192)return null;}catch{return null;}return value as Record<string,unknown>;
}
function parseRawAmount(value?:string):bigint{if(typeof value!=='string'||!/^\d+$/.test(value))return 0n;try{return BigInt(value);}catch{return 0n;}}
function formatUnits(raw:bigint,decimals:number):string{
 const d=Math.max(0,Math.min(18,Number.isInteger(decimals)?decimals:0)),unit=10n**BigInt(d),whole=raw/unit,fraction=raw%unit;
 const tail=d?fraction.toString().padStart(d,'0').slice(0,8).replace(/0+$/,''):'';
 return whole.toString()+(tail?'.'+tail:'');
}
function accountKey(value:AccountKey):string{return typeof value==='string'?value:String(value?.pubkey||'');}
function decodeCursor(value:string):CursorState|null{
 if(!value)return{v:1,before:{}};
 if(value.length>12000||!/^[A-Za-z0-9_-]+$/.test(value))return null;
 try{
  const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as CursorState;
  if(parsed?.v!==1||!parsed.before||typeof parsed.before!=='object'||Array.isArray(parsed.before))return null;
  for(const [address,signature] of Object.entries(parsed.before)){
   if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)||(signature!==null&&(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(signature))))return null;
  }return parsed;
 }catch{return null;}
}
function encodeCursor(cursor:CursorState):string{return Buffer.from(JSON.stringify(cursor)).toString('base64url');}
async function rpc<T>(network:'mainnet'|'testnet',method:string,params:unknown[]):Promise<T>{
 const response=await proxyRpc('solana',network,{jsonrpc:'2.0',id:randomUUID(),method,params});
 if(response.status<200||response.status>=300)throw new Error('solana_rpc_unavailable');
 const payload=JSON.parse(response.body) as RpcResult<T>;
 if(payload.error||payload.result===undefined)throw new Error('solana_rpc_unavailable');return payload.result;
}
async function mapLimitStrict<T,R>(items:T[],limit:number,mapper:(item:T)=>Promise<R>):Promise<R[]>{
 const output=new Array<R>(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;output[i]=await mapper(items[i]);}}));
 return output;
}
function tokenDelta(tx:Transaction,wallet:string,mint:string,tokenAccounts:Set<string>,keys:string[]){
 const balances=[...(tx.meta?.preTokenBalances||[]),...(tx.meta?.postTokenBalances||[])];
 const relevant=balances.filter(item=>item.mint===mint&&(item.owner===wallet||tokenAccounts.has(keys[item.accountIndex]||'')));
 const indexes=new Set(relevant.map(item=>item.accountIndex));
 const pre=(tx.meta?.preTokenBalances||[]).filter(item=>item.mint===mint&&indexes.has(item.accountIndex));
 const post=(tx.meta?.postTokenBalances||[]).filter(item=>item.mint===mint&&indexes.has(item.accountIndex));
 const decimals=post[0]?.uiTokenAmount?.decimals??pre[0]?.uiTokenAmount?.decimals??0;
 return{delta:post.reduce((s,i)=>s+parseRawAmount(i.uiTokenAmount?.amount),0n)-pre.reduce((s,i)=>s+parseRawAmount(i.uiTokenAmount?.amount),0n),decimals,touched:indexes.size>0};
}
export default async function handler(req:ApiRequest,res:ApiResponse){
 const requestId=randomUUID();
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',requestId);
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
 if(req.method==='OPTIONS'){res.status(204).end();return;}
 if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');res.status(405).json({error:{code:'method_not_allowed',requestId}});return;}
 const body=parseBody(req.body);if(!body){res.status(400).json({error:{code:'invalid_request_body',requestId}});return;}
 const wallet=String(body.walletAddress||''),network=String(body.network||'mainnet').toLowerCase(),isNative=body.isNative!==false,mint=String(body.mintAddress||'');
 const cursor=decodeCursor(String(body.before||'')),limitValue=Number(body.limit??MAX_ROWS),limit=Number.isInteger(limitValue)?Math.max(1,Math.min(MAX_ROWS,limitValue)):MAX_ROWS;
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)){res.status(400).json({error:{code:'invalid_wallet_address',requestId}});return;}
 if(network!=='mainnet'&&network!=='testnet'){res.status(400).json({error:{code:'unsupported_network',requestId}});return;}
 if(!isNative&&!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)){res.status(400).json({error:{code:'invalid_token_mint',requestId}});return;}
 if(!cursor){res.status(400).json({error:{code:'invalid_cursor',requestId}});return;}
 try{
  let tokenAccounts:string[]=[];
  if(!isNative){
   const result=await rpc<{value:Array<{pubkey:string}>}>(network,'getTokenAccountsByOwner',[wallet,{mint},{encoding:'jsonParsed',commitment:'confirmed'}]);
   tokenAccounts=[...new Set((result.value||[]).map(x=>String(x.pubkey||'')).filter(Boolean))];
   if(tokenAccounts.length>MAX_TOKEN_ACCOUNTS){res.status(422).json({error:{code:'too_many_token_accounts',requestId,maxTokenAccounts:MAX_TOKEN_ACCOUNTS}});return;}
  }
  const addresses=[wallet,...tokenAccounts],nextBefore:Record<string,string|null>={...cursor.before};
  for(const address of addresses)if(!(address in nextBefore))nextBefore[address]='';
  const active=addresses.filter(address=>nextBefore[address]!==null);
  const pages=await mapLimitStrict(active,Math.min(5,active.length),async address=>{
   const before=nextBefore[address],config:any={limit:SIGNATURE_PAGE,commitment:'confirmed'};if(before)config.before=before;
   const page=await rpc<SignatureInfo[]>(network,'getSignaturesForAddress',[address,config]);return{address,page:Array.isArray(page)?page:[]};
  });
  const pageByAddress=new Map<string,SignatureInfo[]>(),bySignature=new Map<string,SignatureInfo>();
  for(const entry of pages){pageByAddress.set(entry.address,entry.page);for(const item of entry.page)if(!bySignature.has(item.signature))bySignature.set(item.signature,item);}
  const signatures=[...bySignature.values()].sort((a,b)=>b.slot-a.slot);
  const transactions=await mapLimitStrict(signatures,TX_CONCURRENCY,item=>rpc<Transaction|null>(network,'getTransaction',[item.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}]));
  const tokenSet=new Set(tokenAccounts),rows:SolanaHistoryRow[]=[],consumed=new Set<string>();
  for(let i=0;i<transactions.length;i++){
   const tx=transactions[i],sig=signatures[i];if(!sig)continue;consumed.add(sig.signature);
   const failed=Boolean(tx?.meta?.err??sig.err),timestamp=Number(tx?.blockTime??sig.blockTime??0);
   const keys=(tx?.transaction?.message?.accountKeys||[]).map(accountKey),explorerUrl=EXPLORER+sig.signature+(network==='testnet'?'?cluster=devnet':'');
   if(isNative&&tx){
    const wi=keys.indexOf(wallet);
    if(wi>=0){
     const preN=Number(tx.meta?.preBalances?.[wi]??0),postN=Number(tx.meta?.postBalances?.[wi]??0),feeN=Number(tx.meta?.fee??0);
     if(!Number.isSafeInteger(preN)||!Number.isSafeInteger(postN)||!Number.isSafeInteger(feeN))throw new Error('unsafe_lamport_value');
     let delta=BigInt(Math.max(0,postN))-BigInt(Math.max(0,preN));if(wi===0&&!failed)delta+=BigInt(Math.max(0,feeN));
     if(delta!==0n||failed){const incoming=delta>0n,other=keys.find(k=>k&&k!==wallet)||'';
      rows.push({id:sig.signature+':sol',hash:sig.signature,title:failed?'Failed SOL transaction':incoming?'Received SOL':'Sent SOL',
       detail:other?(incoming?'From ':'To ')+other.slice(0,8)+'…'+other.slice(-6):'Solana transaction',
       amount:delta===0n?'':(incoming?'+':'-')+formatUnits(delta<0n?-delta:delta,9)+' SOL',timestamp,incoming,failed,explorerUrl,assetType:'native',mintAddress:null,direction:delta===0n?'self':incoming?'incoming':'outgoing',status:failed?'failed':'success',asset:{type:'native',address:null}});
     }
    }
   }else if(!isNative&&tx){
    const {delta,decimals,touched}=tokenDelta(tx,wallet,mint,tokenSet,keys);
    if(touched&&(delta!==0n||failed)){const incoming=delta>0n,other=keys.find(k=>k&&k!==wallet&&!tokenSet.has(k))||'';
     rows.push({id:sig.signature+':'+mint,hash:sig.signature,title:failed?'Failed token transaction':incoming?'Received token':'Sent token',
      detail:other?(incoming?'From ':'To ')+other.slice(0,8)+'…'+other.slice(-6):'Token account activity',
      amount:delta===0n?'':(incoming?'+':'-')+formatUnits(delta<0n?-delta:delta,decimals),timestamp,incoming,failed,explorerUrl,assetType:'token',mintAddress:mint,direction:delta===0n?'self':incoming?'incoming':'outgoing',status:failed?'failed':'success',asset:{type:'token',address:mint}});
    }
   }
   if(rows.length>=limit)break;
  }
  for(const address of addresses){
   const page=pageByAddress.get(address)||[],used=page.filter(item=>consumed.has(item.signature));
   if(page.length<SIGNATURE_PAGE&&used.length===page.length)nextBefore[address]=null;
   else if(used.length)nextBefore[address]=used[used.length-1].signature;
  }
  rows.sort((a,b)=>b.timestamp-a.timestamp||b.hash.localeCompare(a.hash));
  const hasMore=addresses.some(address=>nextBefore[address]!==null),next=hasMore?encodeCursor({v:1,before:nextBefore}):null;
  res.status(200).json({chain:'solana',network,walletAddress:wallet,asset:{type:isNative?'native':'token',mintAddress:isNative?null:mint},
   rows:rows.slice(0,limit),limit,requestId,source:'solana-rpc',nextBefore:next,hasMore,complete:!hasMore});
 }catch{res.status(502).json({error:{code:'history_provider_unavailable',requestId}});}
}
