import { randomUUID } from 'node:crypto';
import { proxyRpc, type RpcChain, type RpcNetwork } from './_lib/rpc-manager.js';

type Chain = Exclude<RpcChain, 'solana'>;
type Network = RpcNetwork;
type Transfer = {
  hash?: string; from?: string; to?: string; value?: string | number | null; asset?: string | null;
  category?: string; rawContract?: { address?: string | null; value?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string | null };
};
type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { setHeader(name:string,value:string):void; status(code:number):ApiResponse; json(value:unknown):void; end():void };

const NETWORKS: Record<Chain, Partial<Record<Network,string>>> = {
  ethereum:{mainnet:'eth-mainnet',testnet:'eth-sepolia'},
  bnb:{mainnet:'bnb-mainnet',testnet:'bnb-testnet'},
  polygon:{mainnet:'polygon-mainnet',testnet:'polygon-amoy'},
};
const EXPLORERS: Record<Chain,Partial<Record<Network,string>>> = {
  ethereum:{mainnet:'https://etherscan.io/tx/',testnet:'https://sepolia.etherscan.io/tx/'},
  bnb:{mainnet:'https://bscscan.com/tx/',testnet:'https://testnet.bscscan.com/tx/'},
  polygon:{mainnet:'https://polygonscan.com/tx/',testnet:'https://amoy.polygonscan.com/tx/'},
};
const MAX_ROWS = 50;
const TRANSFER_PAGE_SIZE = 100;
const MAX_TRANSFER_PAGES = 5;

function parseBody(value:unknown): Record<string,unknown>|null {
  if(typeof value==='string'){if(value.length>8192)return null;try{value=JSON.parse(value);}catch{return null;}}
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  try { if(JSON.stringify(value).length>8192)return null; } catch { return null; }
  return value as Record<string,unknown>;
}
function rawAmount(raw:string|null|undefined, decimals:string|null|undefined):string {
  try {
    const n=BigInt(raw||'0'), d=Math.max(0,Math.min(36,Number(decimals||'18')));
    const unit=10n**BigInt(d), whole=n/unit;
    const fraction=(n%unit).toString().padStart(d,'0').slice(0,8).replace(/0+$/,'');
    return fraction?whole.toString()+'.'+fraction:whole.toString();
  } catch { return '0'; }
}
function formatTimestamp(value:string|null|undefined):number {
  const n=value?Math.floor(Date.parse(value)/1000):0;
  return Number.isFinite(n)?n:0;
}
function shortAddress(value:string):string { return value.slice(0,10)+'…'+value.slice(-6); }

async function receiptStatus(chain:Chain,network:Network,hash:string):Promise<'success'|'failed'|null>{
  const result=await proxyRpc(chain,network,{jsonrpc:'2.0',id:randomUUID(),method:'eth_getTransactionReceipt',params:[hash]});
  if(result.status<200||result.status>=300)return null;
  try{
    const payload=JSON.parse(result.body) as {result?:{status?:string}|null;error?:unknown};
    if(payload.error||!payload.result)return null;
    if(payload.result.status==='0x0')return 'failed';
    if(payload.result.status==='0x1')return 'success';
    return null;
  }catch{return null;}
}

/**
 * Alchemy's Transfers API uses the singular "category" parameter.
 * Fetch both directions independently. Each direction returns up to 100 newest
 * transfers, which is enough to select the newest 50 after merging. Continue
 * through pageKey if a provider returns a short page while more results exist.
 */
async function transfers(
  chain:Chain, network:Network, wallet:string, direction:'from'|'to',
  category:'external'|'erc20', contract?:string,
):Promise<{rows:Transfer[];complete:boolean}> {
  const rows:Transfer[]=[];
  let pageKey:string|undefined;
  let pages=0;
  do {
    const params:Record<string,unknown> = {
      fromBlock:'0x0',toBlock:'latest',
      fromAddress:direction==='from'?wallet:undefined,
      toAddress:direction==='to'?wallet:undefined,
      category:[category],withMetadata:true,excludeZeroValue:false,
      maxCount:'0x64',order:'desc',
    };
    if(contract) params.contractAddresses=[contract];
    if(pageKey) params.pageKey=pageKey;
    const result=await proxyRpc(chain,network,{jsonrpc:'2.0',id:randomUUID(),method:'alchemy_getAssetTransfers',params:[params]});
    if(result.status<200||result.status>=300) throw new Error('history_provider_unavailable');
    const payload=JSON.parse(result.body) as {result?:{transfers?:Transfer[];pageKey?:string};error?:unknown};
    if(payload?.error) throw new Error('history_provider_unavailable');
    const batch=Array.isArray(payload?.result?.transfers)?payload.result.transfers:[];
    rows.push(...batch);
    pageKey=payload?.result?.pageKey;
    pages++;
  } while(pageKey && rows.length<TRANSFER_PAGE_SIZE && pages<MAX_TRANSFER_PAGES);
  return {rows:rows.slice(0,TRANSFER_PAGE_SIZE),complete:rows.length>=TRANSFER_PAGE_SIZE||!pageKey};
}

export default async function handler(req:ApiRequest,res:ApiResponse) {
  const requestId=randomUUID();
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Request-Id',requestId);
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');res.status(405).json({error:{code:'method_not_allowed',requestId}});return;}
  const body=parseBody(req.body);
  if(!body){res.status(400).json({error:{code:'invalid_request_body',requestId}});return;}
  const chain=String(body.chain||'').toLowerCase() as Chain;
  const network=String(body.network||'').toLowerCase() as Network;
  const wallet=String(body.walletAddress||'');
  const isNative=body.isNative!==false;
  const contract=String(body.contractAddress||'').toLowerCase();
  const requestedLimit=body.limit===undefined?MAX_ROWS:Number(body.limit);
  const limit=Number.isInteger(requestedLimit)?Math.min(MAX_ROWS,Math.max(1,requestedLimit)):MAX_ROWS;
  if(!NETWORKS[chain]?.[network]){res.status(400).json({error:{code:'unsupported_chain_or_network',requestId}});return;}
  if(!/^0x[a-fA-F0-9]{40}$/.test(wallet)){res.status(400).json({error:{code:'invalid_wallet_address',requestId}});return;}
  if(!isNative&&!/^0x[a-fA-F0-9]{40}$/.test(contract)){res.status(400).json({error:{code:'invalid_token_contract',requestId}});return;}
  const category=isNative?'external':'erc20';
  try {
    // Asset history intentionally includes direct incoming/outgoing asset
    // transfers only. Internal traces and generic contract calls are out of scope.
    const settled=await Promise.allSettled([
      transfers(chain,network,wallet,'from',category,isNative?undefined:contract),
      transfers(chain,network,wallet,'to',category,isNative?undefined:contract),
    ]);
    const outgoing=settled[0]?.status==='fulfilled'?settled[0].value.rows:[];
    const incoming=settled[1]?.status==='fulfilled'?settled[1].value.rows:[];
    const querySucceeded=settled.some(item=>item.status==='fulfilled');
    if(!querySucceeded)throw new Error('history_provider_unavailable');
    const grouped=new Map<string,{item:Transfer;incoming:boolean;rawValue:bigint;decimals:string|undefined;fallbackValue:number}>();
    for(const {item,incoming:isIncoming} of [...outgoing.map(item=>({item,incoming:false})),...incoming.map(item=>({item,incoming:true}))]){
      const hash=String(item.hash||''),from=String(item.from||''),to=String(item.to||'');
      if(!/^0x[a-fA-F0-9]{64}$/.test(hash)||!from||!to)continue;
      const tokenAddress=String(item.rawContract?.address||'').toLowerCase();
      if(!isNative&&tokenAddress!==contract)continue;
      const direction=isIncoming?'incoming':'outgoing';
      const id=hash.toLowerCase()+':'+(isNative?'native':contract)+':'+direction;
      let rawValue=0n;
      try{if(item.rawContract?.value)rawValue=BigInt(item.rawContract.value);}catch{}
      const fallbackValue=rawValue===0n?Number(item.value??0):0;
      const current=grouped.get(id);
      if(current){
        current.rawValue+=rawValue;
        current.fallbackValue+=fallbackValue;
      }else{
        grouped.set(id,{item,incoming:isIncoming,rawValue,decimals:item.rawContract?.decimal||undefined,fallbackValue});
      }
    }
    const rows=[...grouped.entries()].map(([id,entry])=>{
      const {item,incoming:isIncoming,rawValue,decimals,fallbackValue}=entry;
      const hash=String(item.hash||''),from=String(item.from||''),to=String(item.to||'');
      const symbol=String(item.asset||(chain==='bnb'?'BNB':chain==='polygon'?'POL':'ETH'));
      const amount=rawValue!==0n?rawAmount(rawValue.toString(),decimals):String(fallbackValue);
      return {
        id,hash,title:(isIncoming?'Received ':'Sent ')+symbol,
        detail:(isIncoming?'From ':'To ')+shortAddress(isIncoming?from:to),
        amount:(isIncoming?'+':'-')+amount+' '+symbol,
        timestamp:formatTimestamp(item.metadata?.blockTimestamp),incoming:isIncoming,
        failed:false,status:'unknown' as const,direction:isIncoming?'incoming':'outgoing',
        asset:{type:isNative?'native':'token',address:isNative?null:contract},
        explorerUrl:(EXPLORERS[chain]?.[network]||'')+hash,from,to,
        contractAddress:String(item.rawContract?.address||'').toLowerCase()||null,
        category:item.category||category,
      };
    }).sort((a,b)=>b.timestamp-a.timestamp||b.hash.localeCompare(a.hash)).slice(0,limit);
    const hashes=[...new Set(rows.map(row=>row.hash))];
    const receiptResults=await Promise.allSettled(hashes.map(hash=>receiptStatus(chain,network,hash)));
    const receiptByHash=new Map<string,'success'|'failed'|null>();
    hashes.forEach((hash,index)=>{
      const result=receiptResults[index];
      receiptByHash.set(hash,result?.status==='fulfilled'?result.value:null);
    });
    const receiptCoverage=receiptResults.every(result=>result.status==='fulfilled'&&result.value!==null);
    const finalRows=rows.map(row=>{
      const status=receiptByHash.get(row.hash)||'unknown';
      return {...row,status,failed:status==='failed'};
    });
    const streamsComplete=settled.every(item=>item.status==='fulfilled'&&item.value.complete);
    const complete=streamsComplete&&receiptCoverage;
    res.status(200).json({
      chain,network,walletAddress:wallet,
      asset:{type:isNative?'native':'token',address:isNative?null:contract,contractAddress:isNative?null:contract},
      rows:finalRows,limit,requestId,source:'alchemy-asset-transfers',complete,
      ...(complete?{}:{warning:'partial_history_result'}),
    });
  } catch {
    res.status(502).json({error:{code:'history_provider_unavailable',requestId}});
  }
}
