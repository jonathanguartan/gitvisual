import { state } from './state.js';

// ─── Per-tab request cancellation ────────────────────────────────────────────

let _tabAbort = null;  // AbortController for background (non-overlay) requests

/** Called by tabs.js on every tab switch. Cancels in-flight background requests. */
export function switchTabSignal() {
  if (_tabAbort) _tabAbort.abort();
  _tabAbort = new AbortController();
  return _tabAbort.signal;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body, signal) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  if (signal) opts.signal = signal;
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
  return api('GET', `${path}?${q}`, null, _tabAbort?.signal);
};
export const post = (path, body = {}) => api('POST', path, { repoPath: state.repoPath, ...body });

// ─── Operation Overlay ───────────────────────────────────────────────────────

let _opAbort   = null;
let _opCount   = 0;       // operaciones concurrentes con overlay activo
let _opFocused = null;    // elemento enfocado antes de mostrar el overlay
let _opSafetyTimer = null; // auto-cierre de seguridad

export function showOp(label) {
  // Guardar foco actual (solo si NO es el propio overlay o sus hijos)
  const active = document.activeElement;
  const overlay = document.getElementById('opOverlay');
  _opFocused = (active && !overlay.contains(active)) ? active : null;

  document.getElementById('opLabel').textContent = label;
  overlay.classList.add('active');

  // Safety: si el overlay lleva más de 45s visible, se cierra solo
  clearTimeout(_opSafetyTimer);
  _opSafetyTimer = setTimeout(() => forceHideOp(), 45_000);
}

export function hideOp() {
  // Solo ocultar si no hay otras operaciones en curso
  if (_opCount > 0) return;
  forceHideOp();
}

export function forceHideOp() {
  clearTimeout(_opSafetyTimer);
  _opSafetyTimer = null;
  _opCount = 0;
  document.getElementById('opOverlay').classList.remove('active');
  _opAbort = null;
  // Restaurar foco — solo si el elemento sigue visible en el DOM
  if (_opFocused && typeof _opFocused.focus === 'function'
      && document.contains(_opFocused) && _opFocused.offsetParent !== null) {
    _opFocused.focus();
  }
  _opFocused = null;
}

// Como `post` pero muestra el overlay si la operación tarda más de `threshold` ms.
// Operaciones rápidas (< threshold) no bloquean la UI en absoluto.
// Si dos llamadas concurrentes tardan, el overlay permanece hasta que ambas terminen.
export async function opPost(path, body = {}, label = 'Procesando…', threshold = 300) {
  let overlayShown = false;
  const timer = setTimeout(() => {
    overlayShown = true;
    _opCount++;
    showOp(label);
  }, threshold);

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
    clearTimeout(timer);
    if (overlayShown) { _opCount = Math.max(0, _opCount - 1); hideOp(); }
    _opAbort = null;
  }
}

export { api };

// Expose abort ref for the cancel button in init.js
window._getOpAbort = () => _opAbort;
