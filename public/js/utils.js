// ─── Utilities ────────────────────────────────────────────────────────────────

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function escAttr(s) {
  return String(s ?? '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

export function relTime(dateStr) {
  if (!dateStr) return '';
  const d    = new Date(dateStr);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)     return 'ahora mismo';
  if (diff < 3600)   return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
  return d.toLocaleDateString('es-ES');
}

// ─── Toast ───────────────────────────────────────────────────────────────────

export function toast(msg, type = 'info') {
  const wrap = document.getElementById('toasts');
  const el   = document.createElement('div');
  el.className = `toast ${type}`;
  const icons  = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
  el.innerHTML = `<span>${icons[type]}</span><span>${escHtml(msg)}</span>`;
  wrap.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ─── Modals ───────────────────────────────────────────────────────────────────

export const openModal  = id => document.getElementById(id).classList.add('open');
export const closeModal = id => document.getElementById(id).classList.remove('open');

document.querySelectorAll('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.close))
);

// ─── Loading helpers ──────────────────────────────────────────────────────────

export const spinner = () => `<div class="spinner-wrap"><div class="spinner"></div> Cargando…</div>`;
export const empty   = (icon, msg) => `<div class="empty-state"><span class="icon">${icon}</span><span>${msg}</span></div>`;

// ─── Clipboard ────────────────────────────────────────────────────────────────

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copiado', 'success'));
}

// ─── Shared context menu helpers ──────────────────────────────────────────────

export function closeAllCtxMenus() {
  document.querySelectorAll('.ctx-menu').forEach(m => m.style.display = 'none');
}

// ─── Panel Header HTML builder (for dynamically generated headers) ────────────
export function panelHdrHTML(title, actions = '') {
  return `<div class="panel-hdr">
    <span class="panel-hdr-title">${title}</span>
    ${actions ? `<div class="panel-hdr-actions">${actions}</div>` : ''}
  </div>`;
}

// ─── Function utilities ───────────────────────────────────────────────────────

export function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function throttle(fn, ms) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn.apply(this, args); }
  };
}

// ─── Window assignments for HTML onclick handlers ────────────────────────────

window.toast             = toast;
window.openModal         = openModal;
window.closeModal        = closeModal;
window.copyToClipboard   = copyToClipboard;
window.closeAllCtxMenus  = closeAllCtxMenus;
window.panelHdrHTML      = panelHdrHTML;
