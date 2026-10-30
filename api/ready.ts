import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';

export default async function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ status: 'not_ready', error: 'method_not_allowed', requestId });
    return;
  }
  if (!process.env.DATABASE_URL || !process.env.API_RATE_LIMIT_SECRET) {
    res.status(503).json({ status: 'not_ready', dependencies: { database: 'not_configured', rateLimit: 'not_configured' }, requestId });
    return;
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`SELECT 1`;
    await sql`SELECT bucket_key FROM public.api_rate_limits LIMIT 0`;
    await sql`SELECT chain, network, tx_hash FROM public.indexed_transactions LIMIT 0`;
    res.status(200).json({ status: 'ready', dependencies: { database: 'ready', rateLimit: 'ready', indexedHistorySchema: 'ready' }, requestId });
  } catch {
    res.status(503).json({ status: 'not_ready', dependencies: { database: 'unavailable_or_migration_pending' }, requestId });
  }
}
