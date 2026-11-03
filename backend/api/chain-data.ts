import { consumeRateLimit } from './_lib/rate-limit.js';

const BASES: Record<'bitcoin'|'tron', Record<'mainnet'|'testnet', string>> = {
  bitcoin: { mainnet: 'https://bitcoin-mainnet.g.alchemy.com/v2/', testnet: 'https://bitcoin-testnet.g.alchemy.com/v2/' },
  tron: { mainnet: 'https://tron-mainnet.g.alchemy.com/v2/', testnet: 'https://tron-testnet.g.alchemy.com/v2/' },
};
function validAddress(chain: 'bitcoin'|'tron', value: string): boolean {
  if (chain === 'tron') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
  return /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{20,80}$/.test(value) || /^tb1[a-zA-HJ-NP-Z0-9]{20,80}$/.test(value);
}
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET'){res.setHeader('Allow','GET, OPTIONS');return res.status(405).json({error:{code:'method_not_allowed'}});}
  const rate=consumeRateLimit(req,'chain-data',120);
  if(!rate.allowed)return res.status(429).json({error:{code:'rate_limit_exceeded'}});
  const chain=String(req.query?.chain||'') as 'bitcoin'|'tron';
  const network=String(req.query?.network||'') as 'mainnet'|'testnet';
  const address=String(req.query?.address||'');
  if(!['bitcoin','tron'].includes(chain)||!['mainnet','testnet'].includes(network)||!validAddress(chain,address))return res.status(400).json({error:{code:'invalid_request'}});
  const scoped='ALCHEMY_'+chain.toUpperCase()+'_'+network.toUpperCase()+'_API_KEY';
  const key=process.env[scoped]||process.env.ALCHEMY_API_KEY;
  if(!key)return res.status(503).json({error:{code:'rpc_not_configured'}});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const base=BASES[chain][network]+encodeURIComponent(key);
    const url=chain==='bitcoin'?base+'/api/v2/address/'+encodeURIComponent(address)+'?details=basic':base+'/wallet/getaccount';
    const response=await fetch(url,{method:chain==='bitcoin'?'GET':'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      ...(chain==='tron'?{body:JSON.stringify({address,visible:true})}:{}),signal:controller.signal});
    const payload=await response.json() as any;
    if(!response.ok)return res.status(response.status>=500?502:response.status).json({error:{code:'upstream_unavailable'}});
    if(chain==='bitcoin'){
      const satoshis=BigInt(String(payload?.balance??'0'));
      return res.status(200).json({chain,network,address,balanceSatoshis:satoshis.toString(),confirmed: true});
    }
    return res.status(200).json({chain,network,address,balanceSun:String(payload?.balance??'0'),accountExists:Boolean(payload?.address)});
  }catch{return res.status(502).json({error:{code:'upstream_unavailable'}});}
  finally{clearTimeout(timeout);}
}
