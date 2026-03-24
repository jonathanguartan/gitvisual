import { state } from './state.js';
import { post, opPost } from './api.js';
import { toast } from './utils.js';

// ─── Push / Pull / Fetch ──────────────────────────────────────────────────────

export async function doPush() {
  if (!state.currentBranch) { toast('No hay rama activa para hacer push', 'warn'); return; }
  try {
    const shouldSetUpstream = !(state.repoInfo && state.repoInfo.tracking);
    const ahead = state.repoInfo?.ahead ?? 0;
    // Usar push por lotes si: primer push, o hay muchos commits ahead (>15)
    const batched   = shouldSetUpstream || ahead > 15;
    const batchSize = 20;
    const label     = batched ? `↑ Subiendo en lotes…` : '↑ Subiendo cambios…';
    const result = await opPost('/repo/push', { branch: state.currentBranch, setUpstream: shouldSetUpstream, batched, batchSize }, label);
    if (result === null) return;
    await Promise.all([window.refreshInfo(), window.refreshBranches()]);
    const batches = result?.batches;
    toast(`Push a "${state.currentBranch}" exitoso ✓${batches > 1 ? ` (${batches} lotes)` : ''}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function doPull() {
  try {
    const result = await opPost('/repo/pull', { branch: state.currentBranch }, '↓ Descargando cambios…');
    if (result === null) return;
    await window.refreshAll();
    toast('Pull exitoso ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function doFetch() {
  try {
    const result = await opPost('/repo/fetch', {}, '⇄ Haciendo fetch…');
    if (result === null) return;
    await window.refreshInfo();
    toast('Fetch completado', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Sync (Fetch + Pull) ───────────────────────────────────────────────────────

export async function syncRepo() {
  if (!state.repoPath) return;

  // Sin rama remota: publicar en lugar de intentar sincronizar
  if (!state.repoInfo?.tracking) {
    toast('Esta rama no tiene rama remota. Publicando…', 'info');
    await doPush();
    return;
  }

  try {
    await opPost('/repo/fetch', {}, '⇄ Sincronizando…');
    await opPost('/repo/pull', { remote: 'origin', branch: state.repoInfo?.currentBranch }, '↓ Pulling…');
    await window.refreshAll();
    toast('Sincronización completada ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Auto-fetch ────────────────────────────────────────────────────────────────

let _autoFetchTimer = null;

export function startAutoFetch(minutes = 5) {
  stopAutoFetch();
  if (!minutes || minutes <= 0) return;

  const tick = async () => {
    if (!state.repoPath) return;
    // Si hay un refresh en curso, saltar este ciclo para no bloquear git
    if (window._refreshing) {
      _autoFetchTimer = setTimeout(tick, 10000); // Reintentar en 10s si está ocupado
      return;
    }

    try {
      await post('/repo/fetch', {});
      await window.refreshBranches();
    } catch (_) {}

    // Programar el siguiente ciclo solo después de que este haya terminado
    _autoFetchTimer = setTimeout(tick, minutes * 60 * 1000);
  };

  _autoFetchTimer = setTimeout(tick, minutes * 60 * 1000);
}

export function stopAutoFetch() {
  if (_autoFetchTimer) { clearTimeout(_autoFetchTimer); _autoFetchTimer = null; }
}

export async function refreshBranchesList() {
  await doFetch();
  await window.refreshBranches();
  toast('Ramas actualizadas', 'info');
}

// ─── Window assignments ────────────────────────────────────────────────────────

window.doPush   = doPush;
window.doPull   = doPull;
window.doFetch  = doFetch;
window.syncRepo = syncRepo;
