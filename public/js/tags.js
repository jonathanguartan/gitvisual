import { defineList, getList } from './gvm/gvm-lists.js';
import { get, opPost } from './api.js';
import { escHtml, escAttr, toast, openModal, closeModal } from './utils.js';
import { emit } from './bus.js';

// ─── Render ───────────────────────────────────────────────────────────────────

function _renderTagItem(t) {
  const pushBtn = !t.remote
    ? `<button class="tag-push" onclick="event.stopPropagation();pushTag('${escAttr(t.name)}')" title="Publicar en remoto">↑</button>`
    : '';
  return `<div class="tag-item">
    <span class="tag-icon">◈</span>
    <span class="tag-name" title="${escAttr(t.name)}">${escHtml(t.name)}</span>
    <span class="tag-type ${t.type === 'annotated' ? 'tag-type-ann' : 'tag-type-lw'}"
          title="${t.type === 'annotated' ? 'Etiqueta anotada (con mensaje)' : 'Etiqueta ligera'}">${t.type === 'annotated' ? 'Ann' : 'LW'}</span>
    <span class="tag-remote-badge ${t.remote ? 'tag-remote-yes' : 'tag-remote-no'}"
          title="${t.remote ? 'Publicado en remoto' : 'Solo local'}">${t.remote ? '☁' : '⬇'}</span>
    ${pushBtn}
    <button class="tag-del" onclick="event.stopPropagation();deleteTag('${escAttr(t.name)}')" title="Eliminar local">✕</button>
  </div>`;
}

// ─── Tags list ────────────────────────────────────────────────────────────────

export function renderTags(tags) {
  // Tags can be array of strings (legacy) or array of {name, type}
  const normalized = tags.map(t => typeof t === 'string' ? { name: t, type: 'lightweight' } : t);
  getList('tagList')?.setItems(normalized);
}

// ─── Tag ops ──────────────────────────────────────────────────────────────────

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
  if (!confirm(`¿Eliminar el tag local "${name}"?`)) return;
  try {
    await opPost('/repo/tag/delete', { tagName: name }, 'Eliminando tag…');
    const data = await get('/repo/tags');
    renderTags(data.all || []);
    toast(`Tag "${name}" eliminado`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

export async function pushTag(name) {
  try {
    await opPost('/repo/tag/push', { tagName: name }, `Publicando tag "${name}"…`);
    toast(`Tag "${name}" publicado ✓`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

export async function deleteRemoteTag(name) {
  if (!confirm(`¿Eliminar el tag "${name}" del remoto?`)) return;
  try {
    await opPost('/repo/tag/delete-remote', { tagName: name }, `Eliminando tag remoto "${name}"…`);
    toast(`Tag remoto "${name}" eliminado ✓`, 'info');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Window assignments for HTML onclick handlers ─────────────────────────────

window.openTagAtModal   = openTagAtModal;
window.openTagModal     = openTagModal;
window.confirmCreateTag = confirmCreateTag;
window.deleteTag        = deleteTag;
window.pushTag          = pushTag;
window.deleteRemoteTag  = deleteRemoteTag;

// ─── List registration (consumed by initAllGvmLists in panels.js) ─────────────

defineList('tagList', {
  renderItem: _renderTagItem,
});
