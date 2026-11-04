import { consumeRateLimit } from './_lib/rate-limit.js';

type Chain='bitcoin'|'tron'; type Network='mainnet'|'testnet';
const ALCHEMY_NETWORK:Record<Chain,Record<Network,string>>={
 bitcoin:{mainnet:'bitcoin-mainnet',testnet:'bitcoin-testnet4'},
 tron:{mainnet:'tron-mainnet',testnet:'tron-testnet'},
};
function alchemyBase(chain:Chain,network:Network):string{
 const scoped=process.env['ALCHEMY_'+chain.toUpperCase()+'_'+network.toUpperCase()+'_API_KEY'];
 const key=scoped||process.env.ALCHEMY_API_KEY;
 if(!key)throw new Error('alchemy_api_key_not_configured');
 return 'https://'+ALCHEMY_NETWORK[chain][network]+'.g.alchemy.com/v2/'+encodeURIComponent(key);
}
function validAddress(chain:Chain,value:string,network:Network):boolean {
  if(chain==='tron') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
  if(network==='mainnet') return /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)||/^bc1[ac-hj-np-z02-9]{20,90}$/i.test(value);
  return /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)||/^tb1[ac-hj-np-z02-9]{20,90}$/i.test(value);
}
async function getJson(url:string,headers:Record<string,string>={}):Promise<any>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(url,{headers:{Accept:'application/json',...headers},signal:controller.signal});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error('upstream_http_'+response.status);return data;}
 finally{clearTimeout(timer);}
}
export default async function handler(req:any,res:any){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
 if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET'){res.setHeader('Allow','GET, OPTIONS');return res.status(405).json({error:{code:'method_not_allowed'}});}
 const rate=consumeRateLimit(req,'chain-data',120);if(!rate.allowed)return res.status(429).json({error:{code:'rate_limit_exceeded'}});
 const chain=String(req.query?.chain||'') as Chain,network=String(req.query?.network||'') as Network,address=String(req.query?.address||'');
 if(!['bitcoin','tron'].includes(chain)||!['mainnet','testnet'].includes(network)||!validAddress(chain,address,network))return res.status(400).json({error:{code:'invalid_request'}});
 try{
  if(chain==='bitcoin'){
   const data=await getJson(alchemyBase('bitcoin',network)+'/api/v2/address/'+encodeURIComponent(address)+'?details=basic');
   const confirmed=BigInt(String(data?.balance||'0'));
   const pending=BigInt(String(data?.unconfirmedBalance||'0'));
   return res.status(200).json({chain,network,address,balanceSatoshis:(confirmed+pending).toString(),confirmedBalanceSatoshis:confirmed.toString(),unconfirmedBalanceSatoshis:pending.toString()});
  }
  // Alchemy's TRON account endpoint is POST-only.
  const response=await fetch(alchemyBase('tron',network)+'/wallet/getaccount',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({address,visible:true})});
  const account=await response.json().catch(()=>null);
  if(!response.ok)throw new Error('upstream_http_'+response.status);
  return res.status(200).json({chain,network,address,balanceSun:String(account?.balance??'0'),accountExists:Boolean(account?.address)});
 }catch(error){console.error('chain_data_failed',chain,network,error instanceof Error?error.message:'unknown');return res.status(502).json({error:{code:'upstream_unavailable'}});}
}
