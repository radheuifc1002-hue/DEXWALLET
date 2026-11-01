import { randomUUID } from 'node:crypto';
import { proxyRpc, type RpcChain, type RpcNetwork } from './_lib/rpc-manager.js';

type Chain = Exclude<RpcChain, 'solana'>;
type Network = RpcNetwork;
type Transfer = {
  hash?: string; from?: string; to?: string; value?: number | null; asset?: string | null;
  category?: string; rawContract?: { address?: string | null; value?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string | null };
};
type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { setHeader(name:string,value:string):void; status(code:number):ApiResponse; json(value:unknown):void; end():void };

const NETWORKS: Record<Chain, Partial<Record<Network,string>>> = {
  ethereum:{mainnet:'eth-mainnet',testnet:'eth-sepolia'},
  bnb:{mainnet:'bnb-mainnet',testnet:'bnb-testnet'},
  polygon:{mainnet:'polygon-mainnet',testnet:'polygon-amoy'},
  arbitrum:{mainnet:'arb-mainnet'},
  optimism:{mainnet:'opt-mainnet'},
  base:{mainnet:'base-mainnet'},
  avalanche:{mainnet:'avax-mainnet'},
  linea:{mainnet:'linea-mainnet'},
};
const EXPLORERS: Record<Chain,Partial<Record<Network,string>>> = {
  ethereum:{mainnet:'https://etherscan.io/tx/',testnet:'https://sepolia.etherscan.io/tx/'},
  bnb:{mainnet:'https://bscscan.com/tx/',testnet:'https://testnet.bscscan.com/tx/'},
  polygon:{mainnet:'https://polygonscan.com/tx/',testnet:'https://amoy.polygonscan.com/tx/'},
  arbitrum:{mainnet:'https://arbiscan.io/tx/'}, optimism:{mainnet:'https://optimistic.etherscan.io/tx/'},
  base:{mainnet:'https://basescan.org/tx/'}, avalanche:{mainnet:'https://snowtrace.io/tx/'},
  linea:{mainnet:'https://lineascan.build/tx/'},
};
const MAX_ROWS = 50;
const TIMEOUT_MS = 16_000;

function parseBody(value:unknown): Record<string,unknown>|null {
  if(typeof value==='string'){if(value.length>8192)return null;try{value=JSON.parse(value);}catch{return null;}}
  if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>8192)return null;
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
function isZeroValue(value:string|null|undefined):boolean {
  if(value===null||value===undefined||value==='') return true;
  try { return BigInt(value)===0n; } catch { return false; }
}
function formatTimestamp(value:string|null|undefined):number {
  const n=value?Math.floor(Date.parse(value)/1000):0;
  return Number.isFinite(n)?n:0;
}
function shortAddress(value:string):string { return value.slice(0,10)+'…'+value.slice(-6); }

async function transfers(chain:Chain, network:Network, wallet:string, direction:'from'|'to', category:'external'|'erc20', contract?:string):Promise<Transfer[]> {
  const params:Record<string,unknown> = {
    fromBlock:'0x0',toBlock:'latest',fromAddress:direction==='from'?wallet:undefined,
    toAddress:direction==='to'?wallet:undefined,categories:[category],withMetadata:true,
    excludeZeroValue:false,maxCount:'0x64',order:'desc',
  };
  if(contract) params.contractAddresses=[contract];
  const result=await proxyRpc(chain,network,{jsonrpc:'2.0',id:randomUUID(),method:'alchemy_getAssetTransfers',params:[params]});
  if(result.status<200||result.status>=300) throw new Error('history_provider_unavailable');
  const payload=JSON.parse(result.body) as any;
  if(payload?.error) throw new Error('history_provider_unavailable');
  return Array.isArray(payload?.result?.transfers)?payload.result.transfers:[];
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
  const networkName=NETWORKS[chain]?.[network];
  if(!networkName){res.status(400).json({error:{code:'unsupported_chain_or_network',requestId}});return;}
  if(!/^0x[a-fA-F0-9]{40}$/.test(wallet)){res.status(400).json({error:{code:'invalid_wallet_address',requestId}});return;}
  if(!isNative&&!/^0x[a-fA-F0-9]{40}$/.test(contract)){res.status(400).json({error:{code:'invalid_token_contract',requestId}});return;}
  const category=isNative?'external':'erc20';
  try {
    const transferQueries:Promise<Transfer[]>[]=[
      transfers(chain,network,wallet,'from',category,isNative?undefined:contract),
      transfers(chain,network,wallet,'to',category,isNative?undefined:contract),
    ];
    if(!isNative){
      transferQueries.push(
        transfers(chain,network,wallet,'from','external'),
        transfers(chain,network,wallet,'to','external'),
      );
    }
    const settled=await Promise.allSettled(transferQueries);
    const outgoing=settled[0]?.status==='fulfilled'?settled[0].value:[];
    const incoming=settled[1]?.status==='fulfilled'?settled[1].value:[];
    const interactionTransfers=settled.slice(2).flatMap(item=>item.status==='fulfilled'?item.value:[]);
    const requiredStreamsSucceeded=settled.every(item=>item.status==='fulfilled');
    if(!outgoing.length&&!incoming.length&&!interactionTransfers.length&&!requiredStreamsSucceeded)
      throw new Error('history_provider_unavailable');
    const seen=new Set<string>();
    const rows=[...outgoing,...incoming,...interactionTransfers.filter(item=>
      String(item.to||'').toLowerCase()===contract && isZeroValue(item.rawContract?.value)
    )].flatMap((item)=>{
      const hash=String(item.hash||'');
      const from=String(item.from||''),to=String(item.to||'');
      if(!/^0x[a-fA-F0-9]{64}$/.test(hash)||!from||!to)return [];
      const isIncoming=to.toLowerCase()===wallet.toLowerCase();
      const tokenAddress=String(item.rawContract?.address||'').toLowerCase();
      const isInteraction=!isNative&&String(item.to||'').toLowerCase()===contract&&Number(item.value??0)===0;
      if(!isNative&&!isInteraction&&tokenAddress!==contract)return [];
      const id=hash.toLowerCase()+':'+(isNative?'native':isInteraction?'interaction':contract)+':'+(isIncoming?'in':'out');
      if(seen.has(id))return [];
      seen.add(id);
      const symbol=String(item.asset||(chain==='bnb'?'BNB':chain==='polygon'?'POL':chain==='avalanche'?'AVAX':'ETH'));
      const raw=item.rawContract?.value;
      const amount=raw?rawAmount(raw,item.rawContract?.decimal):String(item.value??0);
      const timestamp=formatTimestamp(item.metadata?.blockTimestamp);
      return [{
        id,hash,title:isInteraction?'Contract interaction':(isIncoming?'Received ':'Sent ')+symbol,
        detail:(isIncoming?'From ':'To ')+shortAddress(isIncoming?from:to),
        amount:isInteraction?'':(isIncoming?'+':'-')+amount+' '+symbol,timestamp,incoming:isIncoming,failed:false,
        explorerUrl:(EXPLORERS[chain]?.[network]||'')+hash,
        from,to,contractAddress:tokenAddress||null,category:isInteraction?'contract_interaction':item.category||category,
      }];
    }).sort((a,b)=>b.timestamp-a.timestamp||b.hash.localeCompare(a.hash)).slice(0,limit);
    res.status(200).json({chain,network,walletAddress:wallet,asset:{type:isNative?'native':'token',contractAddress:isNative?null:contract},
      rows,limit,requestId,source:'alchemy-transfers',complete:requiredStreamsSucceeded,
      ...(requiredStreamsSucceeded?{}:{warning:'partial_history_result'})});
  } catch {
    res.status(502).json({error:{code:'history_provider_unavailable',requestId}});
  }
}
