import { randomUUID } from 'node:crypto';

type Chain = 'ethereum' | 'bnb' | 'polygon' | 'arbitrum' | 'optimism' | 'base' | 'avalanche' | 'linea';
type Network = 'mainnet' | 'testnet';
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
function rawAmount(raw:string|undefined, decimals:string|undefined):string {
  try {
    const n=BigInt(raw||'0'), d=Math.max(0,Math.min(36,Number(decimals||'18')));
    const unit=10n**BigInt(d), whole=n/unit;
    const fraction=(n%unit).toString().padStart(d,'0').slice(0,8).replace(/0+$/,'');
    return fraction?whole.toString()+'.'+fraction:whole.toString();
  } catch { return '0'; }
}
function formatTimestamp(value:string|undefined):number {
  const n=value?Math.floor(Date.parse(value)/1000):0;
  return Number.isFinite(n)?n:0;
}
function shortAddress(value:string):string { return value.slice(0,10)+'…'+value.slice(-6); }

async function transfers(url:string, wallet:string, direction:'from'|'to', category:'external'|'erc20', contract?:string):Promise<Transfer[]> {
  const params:Record<string,unknown> = {
    fromBlock:'0x0',toBlock:'latest',fromAddress:direction==='from'?wallet:undefined,
    toAddress:direction==='to'?wallet:undefined,categories:[category],withMetadata:true,
    excludeZeroValue:false,maxCount:'0x64',order:'desc',
  };
  if(contract) params.contractAddresses=[contract];
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'alchemy_getAssetTransfers',params:[params]}),signal:controller.signal});
    if(!response.ok) throw new Error('provider_http_'+response.status);
    const payload=await response.json() as any;
    if(payload?.error) throw new Error('provider_rpc_error');
    return Array.isArray(payload?.result?.transfers)?payload.result.transfers:[];
  } finally {clearTimeout(timer);}
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
  const limit=Math.min(MAX_ROWS,Math.max(1,Number(body.limit||MAX_ROWS)));
  const networkName=NETWORKS[chain]?.[network];
  if(!networkName){res.status(400).json({error:{code:'unsupported_chain_or_network',requestId}});return;}
  if(!/^0x[a-fA-F0-9]{40}$/.test(wallet)){res.status(400).json({error:{code:'invalid_wallet_address',requestId}});return;}
  if(!isNative&&!/^0x[a-fA-F0-9]{40}$/.test(contract)){res.status(400).json({error:{code:'invalid_token_contract',requestId}});return;}
  const key=process.env['ALCHEMY_'+chain.toUpperCase()+'_'+network.toUpperCase()+'_API_KEY']||process.env.ALCHEMY_API_KEY;
  if(!key){res.status(503).json({error:{code:'history_provider_not_configured',requestId}});return;}
  const url='https://'+networkName+'.g.alchemy.com/v2/'+encodeURIComponent(key);
  const category=isNative?'external':'erc20';
  try {
    const [outgoing,incoming]=await Promise.all([
      transfers(url,wallet,'from',category,isNative?undefined:contract),
      transfers(url,wallet,'to',category,isNative?undefined:contract),
    ]);
    const seen=new Set<string>();
    const rows=[...outgoing,...incoming].flatMap((item)=>{
      const hash=String(item.hash||'');
      const from=String(item.from||''),to=String(item.to||'');
      if(!/^0x[a-fA-F0-9]{64}$/.test(hash)||!from||!to)return [];
      const isIncoming=to.toLowerCase()===wallet.toLowerCase();
      const tokenAddress=String(item.rawContract?.address||'').toLowerCase();
      if(!isNative&&tokenAddress!==contract)return [];
      const id=hash.toLowerCase()+':'+(isNative?'native':contract)+':'+(isIncoming?'in':'out');
      if(seen.has(id))return [];
      seen.add(id);
      const symbol=String(item.asset||(isNative?(chain==='ethereum'?'ETH':chain==='bnb'?'BNB':chain==='polygon'?'POL':chain==='avalanche'?'AVAX':chain==='arbitrum'?'ETH':chain==='optimism'?'ETH':chain==='base'?'ETH':'ETH'):'TOKEN'));
      const raw=item.rawContract?.value;
      const amount=raw?rawAmount(raw,item.rawContract?.decimal):String(item.value??0);
      const timestamp=formatTimestamp(item.metadata?.blockTimestamp);
      return [{
        id,hash,title:(isIncoming?'Received ':'Sent ')+symbol,
        detail:(isIncoming?'From ':'To ')+shortAddress(isIncoming?from:to),
        amount:(isIncoming?'+':'-')+amount+' '+symbol,timestamp,incoming:isIncoming,failed:false,
        explorerUrl:(EXPLORERS[chain]?.[network]||'')+hash,
        from,to,contractAddress:tokenAddress||null,category:item.category||category,
      }];
    }).sort((a,b)=>b.timestamp-a.timestamp||b.hash.localeCompare(a.hash)).slice(0,limit);
    res.status(200).json({chain,network,walletAddress:wallet,asset:{type:isNative?'native':'token',contractAddress:isNative?null:contract},
      rows,limit,requestId,source:'alchemy-transfers',complete:true});
  } catch {
    res.status(502).json({error:{code:'history_provider_unavailable',requestId}});
  }
}
