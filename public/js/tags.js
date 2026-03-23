import { state } from './state.js';
import { get, post, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal } from './utils.js';

// ─── Tags ─────────────────────────────────────────────────────────────────────

let _tagAtHash = null;

export function openTagAtModal(hash) {
  _tagAtHash = hash;
  document.getElementById('newTagName').value = '';
  document.getElementById('newTagMessage').value = '';
  openModal('modalTag');
}

export function openTagModal() {
  _tagAtHash = null;
  document.getElementById('newTagName').value = '';
  document.getElementById('newTagMessage').value = '';
  openModal('modalTag');
}

export function renderTags(tags) {
  const el = document.getElementById('tagList');
  if (!el) return;
  if (tags.length === 0) {
    el.innerHTML = '<div class="empty-state-small">Sin etiquetas</div>';
    return;
  }
  el.innerHTML = tags.map(t => `
    <div class="tag-item">
      <span class="tag-icon">◈</span>
      <span class="tag-name" title="${escAttr(t)}">${escHtml(t)}</span>
      <button class="tag-del" onclick="deleteTag('${escAttr(t)}')" title="Eliminar tag">✕</button>
    </div>
  `).join('');
}

export async function confirmCreateTag() {
  const name = document.getElementById('newTagName').value.trim();
  const msg  = document.getElementById('newTagMessage').value.trim();
  if (!name) { toast('Introduce un nombre para el tag', 'warn'); return; }
  try {
    await opPost('/repo/tag/create', { tagName: name, message: msg || undefined, hash: _tagAtHash || undefined }, 'Creando tag…');
    _tagAtHash = null;
    const data = await get('/repo/tags');
    renderTags(data.all || []);
    closeModal('modalTag');
    document.getElementById('newTagName').value    = '';
    document.getElementById('newTagMessage').value = '';
    toast(`Tag "${name}" creado`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function deleteTag(name) {
  if (!confirm(`¿Eliminar el tag "${name}"?`)) return;
  try {
    await opPost('/repo/tag/delete', { tagName: name }, 'Eliminando tag…');
    const data = await get('/repo/tags');
    renderTags(data.all || []);
    toast(`Tag "${name}" eliminado`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.openTagAtModal   = openTagAtModal;
window.openTagModal     = openTagModal;
window.confirmCreateTag = confirmCreateTag;
window.deleteTag        = deleteTag;
