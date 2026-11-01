type Bucket={windowStarted:number;count:number};
const buckets=new Map<string,Bucket>();
const WINDOW_MS=60_000;
const MAX_BUCKETS=5_000;

function clientKey(req:any):string{
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const real=String(req?.headers?.['x-real-ip']||'').trim();
  const address=String(req?.socket?.remoteAddress||'').trim();
  return (forwarded||real||address||'unknown').slice(0,96);
}

/** Process-local guardrail. Enforce shared/distributed limits at the edge for multi-instance deployments. */
export function consumeRateLimit(req:any,route:string,limit=300):{allowed:boolean;remaining:number;resetAt:number}{
  const now=Date.now(),key=route+':'+clientKey(req);
  let bucket=buckets.get(key);
  if(!bucket||now-bucket.windowStarted>=WINDOW_MS){bucket={windowStarted:now,count:0};buckets.set(key,bucket);}
  bucket.count++;
  if(buckets.size>MAX_BUCKETS){
    for(const [candidate,value] of buckets){if(now-value.windowStarted>=WINDOW_MS)buckets.delete(candidate);}
    while(buckets.size>MAX_BUCKETS){const oldest=buckets.keys().next().value;if(!oldest)break;buckets.delete(oldest);}
  }
  return{allowed:bucket.count<=limit,remaining:Math.max(0,limit-bucket.count),resetAt:bucket.windowStarted+WINDOW_MS};
}
