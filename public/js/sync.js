import { state } from './state.js';
import { post, opPost } from './api.js';
import { toast } from './utils.js';
import { emit } from './bus.js';
import { dialog } from './gvm/gvm-dialog.js';

// ─── Push / Pull / Fetch ──────────────────────────────────────────────────────

export async function doPush() {
  if (!state.currentBranch) { toast('No hay rama activa para hacer push', 'warn'); return; }
  // Confirmar antes de hacer push directo a rama principal
  const mainBranches = new Set(['main', 'master', window.mainBranch].filter(Boolean));
  if (mainBranches.has(state.currentBranch)) {
    if (!await dialog.confirm(`Estás haciendo push directo a "${state.currentBranch}" (rama principal).\n¿Continuar?`, { type: 'warn', confirmText: 'Continuar' })) return;
  }
  try {
    const shouldSetUpstream = !(state.repoInfo && state.repoInfo.tracking);
    const batched   = shouldSetUpstream;
    const batchSize = 20;
    const label     = batched ? `↑ Subiendo en lotes…` : '↑ Subiendo cambios…';
    const params    = { branch: state.currentBranch, setUpstream: shouldSetUpstream, batched, batchSize };

    let result = await opPost('/repo/push', params, label);
    if (result === null) return;

    if (result.merged) {
      if (!await dialog.confirm(result.warning, { type: 'warn', confirmText: 'Push de todas formas' })) return;
      result = await opPost('/repo/push', { ...params, skipMergeCheck: true }, label);
      if (result === null) return;
    }

    emit('repo:refresh-branches');
    emit('repo:refresh-info');
    const batches = result?.batches;
    toast(`Push a "${state.currentBranch}" exitoso ✓${batches > 1 ? ` (${batches} lotes)` : ''}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function doPull() {
  try {
    const result = await opPost('/repo/pull', { branch: state.currentBranch }, '↓ Descargando cambios…');
    if (result === null) return;
    emit('repo:refresh');
    toast('Pull exitoso ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function doFetch() {
  try {
    const result = await opPost('/repo/fetch', {}, '⇄ Haciendo fetch…');
    if (result === null) return;
    emit('repo:refresh-branches');
    emit('repo:refresh-info');
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
    emit('repo:refresh');
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
      emit('repo:refresh-branches');
      emit('repo:refresh-info');
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
  emit('repo:refresh-branches');
  toast('Ramas actualizadas', 'info');
}

// ─── Window assignments ────────────────────────────────────────────────────────

window.doPush   = doPush;
window.doPull   = doPull;
window.doFetch  = doFetch;
window.syncRepo = syncRepo;
