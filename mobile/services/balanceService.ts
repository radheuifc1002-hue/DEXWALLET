import { ethers } from 'ethers';
import type { Blockchain, Network, Token } from '../../context/WalletContext';
import { serverRpcRequest, serverChainDataRequest } from './serverRpc';

const ERC20 = new ethers.Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);
const COIN_IDS: Record<Blockchain,string> = {
  ethereum:'ethereum', bnb:'binancecoin', polygon:'matic-network', arbitrum:'ethereum', solana:'solana', bitcoin:'bitcoin', tron:'tron',
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
async function evmTokenBalance(chain:Exclude<Blockchain,'solana'|'bitcoin'|'tron'>,network:Network,contract:string,owner:string){
  const [raw,decimalsRaw]=await Promise.all([
    serverRpcRequest<string>(chain,network,'eth_call',[{to:contract,data:ERC20.encodeFunctionData('balanceOf',[owner])},'latest']),
    serverRpcRequest<string>(chain,network,'eth_call',[{to:contract,data:ERC20.encodeFunctionData('decimals',[])},'latest']),
  ]);
  const [balance]=ERC20.decodeFunctionResult('balanceOf',raw);
  const [decimals]=ERC20.decodeFunctionResult('decimals',decimalsRaw);
  return Number(ethers.formatUnits(balance,Number(decimals)));
}
export async function refreshWalletTokenBalances(addresses:Record<Blockchain,string>,tokens:Token[],network:Network):Promise<Token[]>{
  const prices=await Promise.all((['ethereum','solana','bnb','polygon','arbitrum','bitcoin','tron'] as Blockchain[]).map(async c=>[c,await price(c)] as const));
  const priceMap=Object.fromEntries(prices) as Record<Blockchain,number>;
  const jobs=tokens.map(async token=>{
    const address=addresses[token.blockchain];
    if(!address)return token;
    try{
      let balance:number;
      if(!token.contractAddress){
        if(token.blockchain==='bitcoin'){
          const data=await serverChainDataRequest<{balanceSatoshis:string}>('bitcoin',network,address);
          balance=Number(ethers.formatUnits(BigInt(data.balanceSatoshis),8));
        }else if(token.blockchain==='tron'){
          const data=await serverChainDataRequest<{balanceSun:string}>('tron',network,address);
          balance=Number(ethers.formatUnits(BigInt(data.balanceSun),6));
        }else if(token.blockchain==='solana'){
          const result=await serverRpcRequest<{value:number}>('solana',network,'getBalance',[address,{commitment:'confirmed'}]);
          balance=Number(ethers.formatUnits(BigInt(result.value),9));
        }else{
          const raw=await serverRpcRequest<string>(token.blockchain,network,'eth_getBalance',[address,'latest']);
          balance=Number(ethers.formatEther(BigInt(raw)));
        }
      }else if(token.blockchain==='solana'){
        const result=await serverRpcRequest<any>('solana',network,'getTokenAccountsByOwner',[address,{mint:token.contractAddress},{encoding:'jsonParsed',commitment:'confirmed'}]);
        const rows=Array.isArray(result?.value)?result.value:[];
        const raw=rows.reduce((sum:bigint,row:any)=>sum+BigInt(row?.account?.data?.parsed?.info?.tokenAmount?.amount||'0'),0n);
        const decimals=Number(rows[0]?.account?.data?.parsed?.info?.tokenAmount?.decimals??token.decimals??0);
        balance=Number(ethers.formatUnits(raw,decimals));
      }else if(token.blockchain==='ethereum'||token.blockchain==='bnb'||token.blockchain==='polygon'||token.blockchain==='arbitrum'){
        balance=await evmTokenBalance(token.blockchain,network,token.contractAddress,address);
      }else{
        // Bitcoin and TRON token balance adapters are not implemented here yet.
        return token;
      }
      if(!Number.isFinite(balance))throw new Error('invalid_balance');
      return {...token,balance,balanceUSD:token.contractAddress ? 0 : balance*priceMap[token.blockchain]};
    }catch{
      return token;
    }
  });
  return Promise.all(jobs);
}
