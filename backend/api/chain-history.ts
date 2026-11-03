import { consumeRateLimit } from './_lib/rate-limit.js';

type Chain = 'bitcoin' | 'tron';
type Network = 'mainnet' | 'testnet';
const HOST: Record<Chain, Record<Network,string>> = {
  bitcoin: { mainnet: 'bitcoin-mainnet', testnet: 'bitcoin-testnet' },
  tron: { mainnet: 'tron-mainnet', testnet: 'tron-testnet' },
};
const EXPLORER: Record<Chain, Record<Network,string>> = {
  bitcoin: { mainnet: 'https://mempool.space/tx/', testnet: 'https://mempool.space/testnet4/tx/' },
  tron: { mainnet: 'https://tronscan.org/#/transaction/', testnet: 'https://nile.tronscan.org/#/transaction/' },
};
function validAddress(chain: Chain, value: string): boolean {
  return chain === 'bitcoin'
    ? /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value) || /^(bc1|tb1)[ac-hj-np-z02-9]{20,90}$/i.test(value)
    : /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
}
function amount(value: unknown): bigint { try { return BigInt(String(value ?? '0')); } catch { return 0n; } }
function btcAmount(sats: bigint): string {
  const whole=sats/100000000n, fraction=(sats%100000000n).toString().padStart(8,'0').replace(/0+$/,'');
  return fraction ? whole.toString()+'.'+fraction : whole.toString();
}
function short(value: string): string { return value.length>18 ? value.slice(0,9)+'…'+value.slice(-7) : value; }
async function fetchJson(url:string, init?:RequestInit):Promise<any> {
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(url,{...init,headers:{Accept:'application/json',...(init?.headers||{})},signal:controller.signal});
    const payload=await response.json().catch(()=>null);
    if(!response.ok) throw new Error('upstream_http_'+response.status);
    if(payload?.error) throw new Error('upstream_error');
    return payload;
  } finally { clearTimeout(timeout); }
}
export default async function handler(req:any,res:any) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') { res.setHeader('Allow','POST, OPTIONS'); return res.status(405).json({error:{code:'method_not_allowed'}}); }
  const rate=consumeRateLimit(req,'chain-history',30);
  if(!rate.allowed) return res.status(429).json({error:{code:'rate_limit_exceeded'}});
  const chain=String(req.body?.chain||'').toLowerCase() as Chain;
  const network=String(req.body?.network||'').toLowerCase() as Network;
  const address=String(req.body?.walletAddress||'');
  if(!['bitcoin','tron'].includes(chain)||!['mainnet','testnet'].includes(network)||!validAddress(chain,address))
    return res.status(400).json({error:{code:'invalid_request'}});
  const key=process.env['ALCHEMY_'+chain.toUpperCase()+'_'+network.toUpperCase()+'_API_KEY']||process.env.ALCHEMY_API_KEY;
  if(!key) return res.status(503).json({error:{code:'rpc_not_configured'}});
  const base='https://'+HOST[chain][network]+'.g.alchemy.com/v2/'+encodeURIComponent(key);
  try {
    if(chain==='bitcoin') {
      const page=await fetchJson(base+'/api/v2/address/'+encodeURIComponent(address)+'?details=txids&page=1&pageSize=50');
      const txids=(Array.isArray(page?.txids)?page.txids:[]).slice(0,50);
      const txs=await Promise.all(txids.map((id:string)=>fetchJson(base+'/api/v2/tx/'+encodeURIComponent(id))));
      const rows=txs.map((tx:any)=>{
        const inputs=Array.isArray(tx?.vin)?tx.vin:[];
        const outputs=Array.isArray(tx?.vout)?tx.vout:[];
        const sent=inputs.filter((v:any)=>Array.isArray(v.addresses)&&v.addresses.includes(address)).reduce((n:bigint,v:any)=>n+amount(v.value),0n);
        const received=outputs.filter((v:any)=>Array.isArray(v.addresses)&&v.addresses.includes(address)).reduce((n:bigint,v:any)=>n+amount(v.value),0n);
        const delta=received-sent, incoming=delta>=0n, hash=String(tx?.txid||'');
        const other=incoming?inputs.find((v:any)=>v.addresses?.some((a:string)=>a!==address))?.addresses?.[0]:outputs.find((v:any)=>v.addresses?.some((a:string)=>a!==address))?.addresses?.[0];
        const time=Number(tx?.blockTime||0);
        return {id:hash,hash,title:incoming?'Received BTC':'Sent BTC',subtitle:other?(incoming?'From ':'To ')+short(String(other)):'Bitcoin transaction',
          amount:(incoming?'+':'-')+btcAmount(delta<0n?-delta:delta)+' BTC',timestamp:time,status:Number(tx?.confirmations||0)>0?'Confirmed':'Pending',
          incoming,explorerUrl:EXPLORER.bitcoin[network]+hash};
      }).filter((row:any)=>row.hash);
      return res.status(200).json({chain,network,walletAddress:address,rows,limit:50,complete:Number(page?.totalPages||1)<=1,source:'alchemy-bitcoin-utxo'});
    }
    const account={address};
    const [sent,received]=await Promise.all([
      fetchJson(base+'/walletextension/gettransactionsfromthis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account,offset:0,limit:50,visible:true})}),
      fetchJson(base+'/walletextension/gettransactionstothis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account,offset:0,limit:50,visible:true})}),
    ]);
    const extract=(payload:any)=>Array.isArray(payload?.transaction)?payload.transaction:Array.isArray(payload?.transactions)?payload.transactions:[];
    const merged=[...extract(sent).map((tx:any)=>({tx,incoming:false})),...extract(received).map((tx:any)=>({tx,incoming:true}))];
    const seen=new Set<string>();
    const rows=merged.map(({tx,incoming}:any)=>{
      const raw=tx?.raw_data||{}, contract=raw?.contract?.[0], value=contract?.parameter?.value||{};
      const hash=String(tx?.txID||tx?.txid||'');
      const rawAmount=amount(value?.amount), ts=Number(raw?.timestamp||0);
      const id=hash+(incoming?':in':':out');
      return {id,hash,title:incoming?'Received TRX':'Sent TRX',subtitle:incoming?'Incoming transfer':'Outgoing transfer',
        amount:(incoming?'+':'-')+(Number(rawAmount)/1_000_000).toString()+' TRX',timestamp:Math.floor(ts/1000),
        status:tx?.ret?.[0]?.contractRet==='SUCCESS'?'Confirmed':'Pending',incoming,explorerUrl:EXPLORER.tron[network]+hash};
    }).filter((row:any)=>row.hash&&!seen.has(row.id)&&Boolean(seen.add(row.id)))
      .sort((a:any,b:any)=>b.timestamp-a.timestamp).slice(0,50);
    return res.status(200).json({chain,network,walletAddress:address,rows,limit:50,complete:false,source:'alchemy-tron-address-history'});
  } catch(error) {
    console.error('chain_history_failed',chain,network,error instanceof Error?error.message:'unknown');
    return res.status(502).json({error:{code:'history_provider_unavailable'}});
  }
}
