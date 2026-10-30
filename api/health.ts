import { randomUUID } from 'node:crypto';

export default function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: { code: 'method_not_allowed', requestId } });
    return;
  }
  res.status(200).json({ status: 'alive', service: 'dexwallet-api', requestId, timestamp: new Date().toISOString() });
}
