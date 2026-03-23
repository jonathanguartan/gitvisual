import { state } from './state.js';

// ─── API helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  const ct  = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Error del servidor (${res.status} ${res.statusText}) — ¿Reiniciaste el servidor?`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const get  = (path, params = {}) => {
  const q = new URLSearchParams({ ...params, repoPath: state.repoPath });
  return api('GET', `${path}?${q}`);
};
export const post = (path, body = {}) => api('POST', path, { repoPath: state.repoPath, ...body });

// ─── Operation Overlay ───────────────────────────────────────────────────────

let _opAbort = null;

export function showOp(label) {
  document.getElementById('opLabel').textContent = label;
  document.getElementById('opOverlay').classList.add('active');
}

export function hideOp() {
  document.getElementById('opOverlay').classList.remove('active');
  _opAbort = null;
}

// Como `post` pero muestra el overlay bloqueante y soporta cancelación
export async function opPost(path, body = {}, label = 'Procesando…') {
  showOp(label);
  const ctrl = new AbortController();
  _opAbort = ctrl;
  try {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ repoPath: state.repoPath, ...body }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error(`Error del servidor (${res.status})`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  } finally {
    hideOp();
  }
}

export { api };

// Expose abort ref for the cancel button in init.js
window._getOpAbort = () => _opAbort;
