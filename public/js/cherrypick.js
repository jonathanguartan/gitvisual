import { state } from './state.js';
import { opPost } from './api.js';
import { escHtml, toast, openModal, closeModal } from './utils.js';

let _cpHash = null;

export function openCherryPickModal(hash) {
  _cpHash = hash;
  document.getElementById('cpHashLabel').textContent = hash.slice(0, 7);

  // Poblar selector de rama destino (todas las ramas locales excepto la actual)
  const allBranches = Object.values(state.branches?.branches || {})
    .filter(b => !b.name.startsWith('remotes/'));

  const sel = document.getElementById('cpTargetBranch');
  sel.innerHTML = `<option value="">— Rama actual (${escHtml(state.currentBranch || '')}) —</option>` +
    allBranches
      .filter(b => !b.current)
      .map(b => `<option value="${escHtml(b.name)}">${escHtml(b.name)}</option>`)
      .join('');

  openModal('modalCherryPick');
}

export async function confirmCherryPick() {
  if (!_cpHash) return;
  const targetBranch = document.getElementById('cpTargetBranch').value || null;
  const label = targetBranch
    ? `Cherry-pick ${_cpHash.slice(0,7)} → "${targetBranch}"…`
    : `Cherry-pick ${_cpHash.slice(0,7)} en rama actual…`;

  try {
    await opPost('/repo/cherry-pick', { commitHash: _cpHash, targetBranch }, label);
    closeModal('modalCherryPick');
    await window.refreshAll();
    toast(`Cherry-pick ${_cpHash.slice(0,7)} aplicado ✓`, 'success');
  } catch (e) {
    await window.refreshAll();
    toast(e.message, 'error');
  }
}

window.openCherryPickModal = openCherryPickModal;
window.confirmCherryPick   = confirmCherryPick;
