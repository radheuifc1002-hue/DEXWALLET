import { randomUUID } from 'node:crypto';

export default function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ status: 'error', error: 'method_not_allowed', requestId });
    return;
  }
  res.status(200).json({ status: 'ready', dependencies: { database: 'not_required' }, requestId });
}
