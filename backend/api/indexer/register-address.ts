import { neon } from '@neondatabase/serverless';
import { createHmac, randomUUID } from 'node:crypto';

export default async function handler(req: any, res: any) {
  const requestId = randomUUID();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: { code: 'method_not_allowed', requestId } });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > 2048) { res.status(400).json({ error: { code: 'invalid_body', requestId } }); return; }
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 2048) {
    res.status(400).json({ error: { code: 'invalid_body', requestId } }); return;
  }

  const chain = String(body.chain || '').toLowerCase();
  const network = String(body.network || '').toLowerCase();
  const address = String(body.walletAddress || '');
  const supported = (chain === 'ethereum' && ['mainnet', 'testnet'].includes(network)) ||
    (chain === 'polygon' && network === 'mainnet') ||
    (chain === 'bnb' && ['mainnet', 'testnet'].includes(network)) ||
    (chain === 'solana' && ['mainnet', 'devnet'].includes(network));
  if (!supported) {
    res.status(422).json({ error: { code: 'indexer_network_not_enabled', requestId } }); return;
  }
  const validAddress = chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) : /^0x[a-fA-F0-9]{40}$/.test(address);
  if (!validAddress) {
    res.status(400).json({ error: { code: 'invalid_wallet_address', requestId } }); return;
  }
  if (!process.env.DATABASE_URL || !process.env.API_RATE_LIMIT_SECRET) {
    res.status(503).json({ error: { code: 'service_not_configured', requestId } }); return;
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    const ipHeader = req.headers?.['x-real-ip'];
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = (typeof ipHeader === 'string' && ipHeader) ||
      (typeof forwarded === 'string' ? forwarded.split(',').pop()?.trim() : '') || 'unknown';
    const minute = Math.floor(Date.now() / 60000);
    const bucket = createHmac('sha256', process.env.API_RATE_LIMIT_SECRET)
      .update(ip + ':' + minute).digest('hex');
    const limits = await sql`
      INSERT INTO public.api_rate_limits (bucket_key, request_count, window_started_at, expires_at)
      VALUES (${bucket}, 1, to_timestamp(${minute * 60}), to_timestamp(${(minute + 2) * 60}))
      ON CONFLICT (bucket_key)
      DO UPDATE SET request_count = public.api_rate_limits.request_count + 1
      RETURNING request_count
    `;
    if (Number(limits[0]?.request_count || 0) > 60) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: { code: 'rate_limit_exceeded', requestId } });
      return;
    }

    const addressKey = chain === 'solana' ? address : address.toLowerCase();
    const states = await sql`
      INSERT INTO public.address_sync_state
        (chain, network, address_key, address_display, sync_status)
      VALUES (${chain}, ${network}, ${addressKey}, ${address}, 'pending')
      ON CONFLICT (chain, network, address_key)
      DO UPDATE SET address_display = EXCLUDED.address_display, updated_at = NOW()
      RETURNING sync_status, last_indexed_at, last_indexed_block, cursor
    `;
    const state = states[0];
    const initial = !state.last_indexed_at;
    const lastIndexedAt = state.last_indexed_at ? new Date(state.last_indexed_at).getTime() : 0;
    const shouldQueue = initial || (
      state.sync_status !== 'syncing' &&
      (!Number.isFinite(lastIndexedAt) || Date.now() - lastIndexedAt > 5 * 60 * 1000)
    );
    if (shouldQueue) {
      const active = await sql`
        SELECT id FROM public.indexer_jobs
        WHERE chain = ${chain} AND network = ${network} AND address_key = ${addressKey}
          AND status IN ('queued', 'running', 'retry')
        LIMIT 1
      `;
      if (active.length === 0) {
        const jobType = initial ? 'initial_sync' : 'incremental_sync';
        const bucketId = Math.floor(Date.now() / (5 * 60 * 1000));
        const jobKey = jobType + ':' + chain + ':' + network + ':' + addressKey + ':' + bucketId;
        await sql`
          INSERT INTO public.indexer_jobs
            (job_key, job_type, chain, network, address_key, cursor, status, priority, max_attempts)
          VALUES (${jobKey}, ${jobType}, ${chain}, ${network}, ${addressKey}, ${state.cursor || null}, 'queued', 50, 8)
          ON CONFLICT (job_key) DO NOTHING
        `;
        await sql`
          UPDATE public.address_sync_state
          SET sync_status = 'pending', last_error_category = NULL, updated_at = NOW()
          WHERE chain = ${chain} AND network = ${network} AND address_key = ${addressKey}
        `;
      }
    }

    res.status(202).json({
      accepted: true,
      syncStatus: state.sync_status,
      indexedAt: state.last_indexed_at || null,
      requestId,
    });
  } catch {
    res.status(503).json({ error: { code: 'indexer_registration_unavailable', requestId } });
  }
}
