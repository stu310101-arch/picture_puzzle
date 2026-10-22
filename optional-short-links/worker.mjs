import { validatePayload } from '../core.mjs';

const MAX_BYTES = 155000;
const TTL = 30 * 24 * 60 * 60;

async function readLimited(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new RangeError('Too large');
  if (!request.body) throw new Error('Empty body');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new RangeError('Too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    // No arbitrary destination URLs: this API stores puzzle records only.
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden origin', { status: 403 });
    const headers = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin', 'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    try {
      if (request.method === 'POST' && path === '/p') {
        if (!env.CREATE_LIMITER || !env.PUZZLES) return json({ error: 'Service not configured' }, 503);
        const { success } = await env.CREATE_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
        if (!success) return json({ error: 'Please wait before creating another link' }, 429);
        if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
        let payload;
        try { payload = validatePayload(await readLimited(request)); }
        catch (error) { return json({ error: 'Invalid or oversized puzzle' }, error instanceof RangeError ? 413 : 400); }
        // 72 random bits; no sequence IDs and no private credentials in the browser.
        const bytes = crypto.getRandomValues(new Uint8Array(9));
        const id = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
        const expiresAt = Date.now() + TTL * 1000;
        await env.PUZZLES.put(id, JSON.stringify({ payload, expiresAt }), { expirationTtl: TTL });
        return json({ id, expiresAt }, 201);
      }
      const match = path.match(/^\/p\/([A-Za-z0-9_-]{12})$/);
      if (request.method === 'GET' && match) {
        const record = await env.PUZZLES.get(match[1], 'json');
        if (!record || record.expiresAt <= Date.now()) return json({ error: 'Expired or not found' }, 404);
        return json(record.payload);
      }
      return json({ error: 'Not found' }, 404);
    } catch { return json({ error: 'Service unavailable' }, 503); }
  }
};
