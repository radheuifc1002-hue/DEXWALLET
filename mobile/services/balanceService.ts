import { ethers } from 'ethers';
import type { Blockchain, Network, Token } from '../../context/WalletContext';
import { getCentralEvmChainId, getCentralRpcUrl, serverRpcRequest } from './serverRpc';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];
const COIN_IDS: Record<Blockchain,string> = {
  ethereum:'ethereum', bnb:'binancecoin', polygon:'matic-network', solana:'solana',
};
const priceCache: Record<string,{price:number;at:number}> = {};
async function price(chain:Blockchain):Promise<number>{
  const id=COIN_IDS[chain],cached=priceCache[id];
  if(cached&&Date.now()-cached.at<60_000)return cached.price;
  try{
    const response=await fetch('https://api.coingecko.com/api/v3/simple/price?ids='+id+'&vs_currencies=usd');
    if(!response.ok)throw new Error('price_unavailable');
    const data=await response.json(),value=Number(data?.[id]?.usd||0);
    if(Number.isFinite(value)&&value>=0){priceCache[id]={price:value,at:Date.now()};return value;}
  }catch{}
  return cached?.price??0;
}
function evmProvider(chain:Exclude<Blockchain,'solana'>,network:Network){
  return new ethers.JsonRpcProvider(getCentralRpcUrl(chain,network),getCentralEvmChainId(chain,network),{staticNetwork:true});
}
export async function refreshWalletTokenBalances(addresses:Record<Blockchain,string>,tokens:Token[],network:Network):Promise<Token[]>{
  const prices=await Promise.all((['ethereum','solana','bnb','polygon'] as Blockchain[]).map(async c=>[c,await price(c)] as const));
  const priceMap=Object.fromEntries(prices) as Record<Blockchain,number>;
  const jobs=tokens.map(async token=>{
    const address=addresses[token.blockchain];
    if(!address)return token;
    try{
      let balance:number;
      if(!token.contractAddress){
        if(token.blockchain==='solana'){
          const result=await serverRpcRequest<{value:number}>('solana',network,'getBalance',[address,{commitment:'confirmed'}]);
          balance=Number(ethers.formatUnits(BigInt(result.value),9));
        }else{
          const provider=evmProvider(token.blockchain,network);
          const raw=await provider.getBalance(address);
          balance=Number(ethers.formatEther(raw));
        }
      }else if(token.blockchain==='solana'){
        const result=await serverRpcRequest<any>('solana',network,'getTokenAccountsByOwner',[address,{mint:token.contractAddress},{encoding:'jsonParsed',commitment:'confirmed'}]);
        const rows=Array.isArray(result?.value)?result.value:[];
        const raw=rows.reduce((sum:bigint,row:any)=>sum+BigInt(row?.account?.data?.parsed?.info?.tokenAmount?.amount||'0'),0n);
        const decimals=Number(rows[0]?.account?.data?.parsed?.info?.tokenAmount?.decimals??token.decimals??0);
        balance=Number(ethers.formatUnits(raw,decimals));
      }else{
        const provider=evmProvider(token.blockchain,network);
        const contract=new ethers.Contract(token.contractAddress,ERC20_ABI,provider);
        const [raw,decimalsRaw]=await Promise.all([contract.balanceOf(address),contract.decimals()]);
        balance=Number(ethers.formatUnits(raw,Number(decimalsRaw)));
      }
      if(!Number.isFinite(balance))throw new Error('invalid_balance');
      return {...token,balance,balanceUSD:balance*priceMap[token.blockchain]};
    }catch{
      // Preserve the last known value on transient provider or token-contract failures.
      return token;
    }
  });
  return Promise.all(jobs);
}
