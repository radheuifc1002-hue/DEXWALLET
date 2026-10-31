import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';

const REQUIRED_INDEXED_NETWORKS = [
  'ethereum:mainnet', 'ethereum:testnet',
  'polygon:mainnet', 'polygon:testnet',
  'bnb:mainnet', 'bnb:testnet',
  'solana:mainnet', 'solana:devnet',
];

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
    const workers = await sql`
      SELECT worker_id, status, chains, last_seen_at
      FROM public.indexer_worker_heartbeats
      ORDER BY last_seen_at DESC
      LIMIT 1
    `;
    const worker = workers[0] as any;
    const reportedChains = Array.isArray(worker?.chains) ? worker.chains : [];
    const missingNetworks = REQUIRED_INDEXED_NETWORKS.filter((network) => !reportedChains.includes(network));
    const workerFresh = worker?.last_seen_at && Date.now() - new Date(worker.last_seen_at).getTime() <= 60000;
    if (!worker || worker.status !== 'running' || !workerFresh || missingNetworks.length > 0) {
      res.status(503).json({
        status: 'not_ready',
        dependencies: { database: 'ready', rateLimit: 'ready', indexedHistorySchema: 'ready', worker: workerFresh ? worker.status : 'unavailable' },
        missingNetworks,
        requestId,
      });
      return;
    }
    res.status(200).json({ status: 'ready', dependencies: { database: 'ready', rateLimit: 'ready', indexedHistorySchema: 'ready', worker: 'running' }, indexedNetworks: reportedChains, requestId });
  } catch {
    res.status(503).json({ status: 'not_ready', dependencies: { database: 'unavailable_or_migration_pending', worker: 'not_verified' }, requestId });
  }
}
