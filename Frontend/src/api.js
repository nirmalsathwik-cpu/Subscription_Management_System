// The only file that knows where data comes from.
//   VITE_DATA_SOURCE=api  (default) -> {VITE_API_BASE_URL}/<path>
//   VITE_DATA_SOURCE=mock           -> public/mock/<path with "/" as "-">.json (query string ignored)
const MOCK = import.meta.env.VITE_DATA_SOURCE === 'mock';
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const cache = new Map();
const listeners = new Set();

export const onInvalidate = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function invalidate() {
  cache.clear();
  listeners.forEach((fn) => fn());
}

async function parse(r, url) {
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error || `Request failed (${r.status}) for ${url}`);
  return body;
}

export function load(path) {
  if (!cache.has(path)) {
    const url = MOCK
      ? `${import.meta.env.BASE_URL}mock/${path.split('?')[0].replace(/^\//, '').replace(/\//g, '-')}.json`
      : `${BASE}/${path}`;
    const p = fetch(url).then((r) => parse(r, url)).catch((e) => {
      cache.delete(path);
      throw e;
    });
    cache.set(path, p);
  }
  return cache.get(path);
}

// Writes (POST / PATCH). Refreshes every view afterwards.
export async function send(path, body = {}, method = 'POST') {
  if (MOCK) throw new Error('Mock mode is read-only. Set VITE_DATA_SOURCE=api to use actions.');
  const r = await fetch(`${BASE}/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await parse(r, path);
  invalidate();
  return out;
}
