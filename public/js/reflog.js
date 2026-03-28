import { get, post } from './api.js';
import { escHtml, relTime, toast, openModal, spinner, empty } from './utils.js';

// ─── Reflog Panel ─────────────────────────────────────────────────────────────

export async function openReflogModal() {
  document.getElementById('reflogList').innerHTML = spinner();
  openModal('modalReflog');
  await loadReflog();
}

async function loadReflog() {
  const list = document.getElementById('reflogList');
  try {
    const data    = await get('/repo/reflog', { limit: 150 });
    const entries = data.entries || [];

    if (!entries.length) {
      list.innerHTML = empty('📋', 'Reflog vacío');
      return;
    }

    list.innerHTML = entries.map((e, i) => `
      <div class="reflog-row" data-hash="${escHtml(e.hash)}">
        <div class="reflog-row-meta">
          <span class="reflog-idx">${i}</span>
          <span class="reflog-ref">${escHtml(e.ref || '')}</span>
          <span class="log-hash" title="${escHtml(e.hash)}">${escHtml(e.hash?.slice(0,7) || '')}</span>
          <span class="reflog-ago">${escHtml(e.ago || '')}</span>
        </div>
        <div class="reflog-subject">${escHtml(e.subject || '')}</div>
        <div class="reflog-actions">
          <button class="btn btn-xs" onclick="reflogCheckout('${escHtml(e.hash)}')" title="Checkout a este commit">⎇ Checkout</button>
          <button class="btn btn-xs" onclick="reflogBranchHere('${escHtml(e.hash)}')" title="Crear rama aquí">+ Rama</button>
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="recover-empty">${escHtml(e.message)}</div>`;
  }
}

export async function reflogCheckout(hash) {
  if (!confirm(`¿Hacer checkout del commit ${hash.slice(0,7)}?\nQuedarás en modo "detached HEAD".`)) return;
  try {
    await post('/repo/branch/checkout', { branchName: hash });
    await window.refreshAll();
    toast(`Checkout a ${hash.slice(0,7)} ✓ (HEAD detached)`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function reflogBranchHere(hash) {
  const name = prompt(`Nombre para la nueva rama (desde ${hash.slice(0,7)}):`);
  if (!name?.trim()) return;
  try {
    await post('/repo/branch/create-at', { branchName: name.trim(), hash });
    await window.refreshBranches();
    toast(`Rama "${name.trim()}" creada desde ${hash.slice(0,7)} ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

window.openReflogModal   = openReflogModal;
window.reflogCheckout    = reflogCheckout;
window.reflogBranchHere  = reflogBranchHere;
