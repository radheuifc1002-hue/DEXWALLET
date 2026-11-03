import { consumeRateLimit } from './_lib/rate-limit.js';
import bs58 from 'bs58';

type Chain='bitcoin'|'tron';type Network='mainnet'|'testnet';
const BTC_API:Record<Network,string>={mainnet:'https://mempool.space/api',testnet:'https://mempool.space/testnet4/api'};
const BTC_EXPLORER:Record<Network,string>={mainnet:'https://mempool.space/tx/',testnet:'https://mempool.space/testnet4/tx/'};
const TRON_API:Record<Network,string>={mainnet:'https://api.trongrid.io',testnet:'https://nile.trongrid.io'};
const TRON_EXPLORER:Record<Network,string>={mainnet:'https://tronscan.org/#/transaction/',testnet:'https://nile.tronscan.org/#/transaction/'};
function validAddress(chain:Chain,value:string,network:Network):boolean{
 if(chain==='tron')return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
 if(network==='mainnet')return /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)||/^bc1[ac-hj-np-z02-9]{20,90}$/i.test(value);
 return /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)||/^tb1[ac-hj-np-z02-9]{20,90}$/i.test(value);
}
async function getJson(url:string,headers:Record<string,string>={}):Promise<any>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url,{headers:{Accept:'application/json',...headers},signal:controller.signal});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error('upstream_http_'+response.status);return data;}
 finally{clearTimeout(timer);}
}
const short=(s:string)=>s.length>18?s.slice(0,9)+'…'+s.slice(-7):s;
function btc(sats:bigint):string{const whole=sats/100000000n,frac=(sats%100000000n).toString().padStart(8,'0').replace(/0+$/,'');return frac?whole+'.'+frac:String(whole);}
function tronAddressHex(address:string):string{
 // TronGrid returns base58check addresses in some fields and 41-prefixed hex in raw transaction data.
 return address;
}
export default async function handler(req:any,res:any){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
 if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return res.status(405).json({error:{code:'method_not_allowed'}});}
 const rate=consumeRateLimit(req,'chain-history',30);if(!rate.allowed)return res.status(429).json({error:{code:'rate_limit_exceeded'}});
 const chain=String(req.body?.chain||'') as Chain,network=String(req.body?.network||'') as Network,address=String(req.body?.walletAddress||'');
 if(!['bitcoin','tron'].includes(chain)||!['mainnet','testnet'].includes(network)||!validAddress(chain,address,network))return res.status(400).json({error:{code:'invalid_request'}});
 try{
  if(chain==='bitcoin'){
   const txs=await getJson(BTC_API[network]+'/address/'+encodeURIComponent(address)+'/txs') as any[];
   const rows=(Array.isArray(txs)?txs:[]).slice(0,50).map(tx=>{
    const vin=Array.isArray(tx?.vin)?tx.vin:[],vout=Array.isArray(tx?.vout)?tx.vout:[];
    const sent=vin.filter((v:any)=>v?.prevout?.scriptpubkey_address===address).reduce((n:bigint,v:any)=>n+BigInt(v?.prevout?.value||0),0n);
    const received=vout.filter((v:any)=>v?.scriptpubkey_address===address).reduce((n:bigint,v:any)=>n+BigInt(v?.value||0),0n);
    const delta=received-sent, incoming=delta>=0n, hash=String(tx?.txid||'');
    const other=incoming?vin.find((v:any)=>v?.prevout?.scriptpubkey_address&&v.prevout.scriptpubkey_address!==address)?.prevout?.scriptpubkey_address:vout.find((v:any)=>v?.scriptpubkey_address&&v.scriptpubkey_address!==address)?.scriptpubkey_address;
    const confirmed=Boolean(tx?.status?.confirmed);
    return {id:hash,hash,title:incoming?'Received BTC':'Sent BTC',subtitle:other?(incoming?'From ':'To ')+short(String(other)):'Bitcoin transaction',amount:(incoming?'+':'-')+btc(delta<0n?-delta:delta)+' BTC',timestamp:confirmed?Number(tx.status.block_time||0):0,status:confirmed?'Confirmed':'Pending',incoming,explorerUrl:BTC_EXPLORER[network]+hash};
   }).filter(row=>row.hash);
   return res.status(200).json({chain,network,walletAddress:address,rows,limit:50,complete:rows.length<50,source:'mempool-space'});
  }
  const headers=process.env.TRONGRID_API_KEY?{'TRON-PRO-API-KEY':process.env.TRONGRID_API_KEY}:{};
  const url=TRON_API[network]+'/v1/accounts/'+encodeURIComponent(address)+'/transactions?limit=50&order_by=block_timestamp,desc&only_confirmed=false';
  const data=await getJson(url,headers),items=Array.isArray(data?.data)?data.data:[];
  const rows=items.map((tx:any)=>{
   const contract=tx?.raw_data?.contract?.[0],type=String(contract?.type||''),value=contract?.parameter?.value||{};
   if(type!=='TransferContract')return null;
   const owner=String(value?.owner_address||''),to=String(value?.to_address||'');
   const incoming=owner.toLowerCase()!==address.toLowerCase();
   const amount=BigInt(String(value?.amount||0));
   const hash=String(tx?.txID||''),ts=Math.floor(Number(tx?.block_timestamp||tx?.raw_data?.timestamp||0)/1000);
   const confirmed=Boolean(tx?.blockNumber||tx?.block_number);
   const success=tx?.ret?.[0]?.contractRet==='SUCCESS';\n   return {id:hash,hash,title:incoming?'Received TRX':'Sent TRX',subtitle:incoming?'Incoming transfer':'Outgoing transfer',amount:(incoming?'+':'-')+(Number(amount)/1_000_000).toString()+' TRX',timestamp:ts,status:confirmed?(success?'Confirmed':'Failed'):'Pending',incoming,explorerUrl:TRON_EXPLORER[network]+hash};
  }).filter(Boolean).slice(0,50);
  return res.status(200).json({chain,network,walletAddress:address,rows,limit:50,complete:!data?.meta?.fingerprint,source:'trongrid-v1'});
 }catch(error){console.error('chain_history_failed',chain,network,error instanceof Error?error.message:'unknown');return res.status(502).json({error:{code:'history_provider_unavailable'}});}
}
