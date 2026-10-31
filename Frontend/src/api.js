const MOCK = import.meta.env.VITE_DATA_SOURCE === 'mock';
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const cache = new Map();
const listeners = new Set();

export const onInvalidate = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function invalidate() {
  cache.clear();
  listeners.forEach((fn) => fn());
}

const TOKEN_KEY = 'ledgerline.token';
export const getToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};
const authHeaders = () => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {});

let onSessionLost = () => {};
export const setSessionLostHandler = (fn) => { onSessionLost = fn; };

async function parse(r, url, { isAuthCall = false } = {}) {
  const body = await r.json().catch(() => null);
  if (r.status === 401 && !isAuthCall && getToken()) {
    setToken(null);
    cache.clear();
    onSessionLost();
  }
  if (!r.ok) {
    const err = new Error(body?.error || `Request failed (${r.status}) for ${url}`);
    err.status = r.status;
    throw err;
  }
  return body;
}

export function load(path) {
  if (!cache.has(path)) {
    const url = MOCK
        ? `${import.meta.env.BASE_URL}mock/${path.split('?')[0].replace(/^\//, '').replace(/\//g, '-')}.json`
        : `${BASE}/${path}`;
    const p = fetch(url, { headers: authHeaders() }).then((r) => parse(r, url)).catch((e) => {
      cache.delete(path);
      throw e;
    });
    cache.set(path, p);
  }
  return cache.get(path);
}

export async function send(path, body = {}, method = 'POST') {
  if (MOCK) throw new Error('Mock mode is read-only. Set VITE_DATA_SOURCE=api to use actions.');
  const r = await fetch(`${BASE}/${path}`, { method, headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
  const out = await parse(r, path);
  invalidate();
  return out;
}

export async function signIn(loginId, password, role) {
  if (MOCK) throw new Error('Sign-in is not available in mock mode.');
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginId, password, role }),
  });
  const out = await parse(r, 'auth/login', { isAuthCall: true });
  setToken(out.token);
  invalidate();
  return out.user;
}

export async function fetchMe() {
  const r = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
  return (await parse(r, 'auth/me', { isAuthCall: true })).user;
}

export function signOut() {
  setToken(null);
  invalidate();
}