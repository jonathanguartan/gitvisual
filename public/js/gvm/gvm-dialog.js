/**
 * GvmDialog — Modal de confirmación/alerta con estilo propio del sistema.
 *
 * Singleton — inicializado por panels.js via initGvmDialog().
 * Exporta `dialog` para uso en todos los módulos.
 *
 * API:
 *   const ok = await dialog.confirm('¿Eliminar?', { type: 'danger', confirmText: 'Eliminar' });
 *   await dialog.alert('Operación completada.', { type: 'info' });
 *
 * Opciones:
 *   title        — título del header (default: 'Confirmar' / 'Aviso')
 *   confirmText  — texto del botón primario (default: 'Confirmar' / 'Aceptar')
 *   cancelText   — texto del botón cancelar (default: 'Cancelar')
 *   type         — 'danger' | 'warn' | 'info' (default: 'info')
 */

import { GvmComponent } from './gvm-component.js';
import { escHtml } from '../utils.js';

const _ICON = { danger: '⚠', warn: '⚠', info: 'ℹ' };
const _BTN  = { danger: 'btn-danger', warn: 'btn-warn', info: 'btn-primary' };

export class GvmDialog extends GvmComponent {
  constructor(el) {
    super(el);
    this._resolvePromise = null;
    this._onKey = this._onKey.bind(this);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  confirm(message, opts = {}) {
    return this._show(message, { ...opts, mode: 'confirm' });
  }

  alert(message, opts = {}) {
    return this._show(message, { ...opts, mode: 'alert' });
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  _show(message, opts) {
    const isConfirm  = opts.mode === 'confirm';
    const type       = opts.type       || 'info';
    const title      = opts.title      || (isConfirm ? 'Confirmar' : 'Aviso');
    const confirmTxt = opts.confirmText|| (isConfirm ? 'Confirmar' : 'Aceptar');
    const cancelTxt  = opts.cancelText || 'Cancelar';

    this._el.innerHTML = `
      <div class="modal modal-sm gvm-dlg-card">
        <div class="gvm-dlg-hdr gvm-dlg-${type}">
          <span class="gvm-dlg-icon" aria-hidden="true">${_ICON[type] || 'ℹ'}</span>
          <span class="gvm-dlg-title">${escHtml(title)}</span>
        </div>
        <div class="gvm-dlg-body">${escHtml(message)}</div>
        <div class="gvm-dlg-footer">
          ${isConfirm
            ? `<button class="btn btn-secondary" data-result="false">${escHtml(cancelTxt)}</button>`
            : ''}
          <button class="btn ${_BTN[type] || 'btn-primary'} gvm-dlg-ok" data-result="true">
            ${escHtml(confirmTxt)}
          </button>
        </div>
      </div>`;

    this._el.classList.add('open');
    document.addEventListener('keydown', this._onKey);

    this._el.addEventListener('click', e => {
      if (e.target === this._el) this._close(false);
    }, { once: true });

    requestAnimationFrame(() => this._el.querySelector('.gvm-dlg-ok')?.focus());

    return new Promise(resolve => {
      this._resolvePromise = resolve;
      this._el.querySelectorAll('[data-result]').forEach(btn =>
        btn.addEventListener('click', () => this._close(btn.dataset.result === 'true'), { once: true })
      );
    });
  }

  _close(result) {
    this._el.classList.remove('open');
    document.removeEventListener('keydown', this._onKey);
    const res = this._resolvePromise;
    this._resolvePromise = null;
    this._el.innerHTML = '';
    res?.(result);
  }

  _onKey(e) {
    if (!this._resolvePromise) return;
    if (e.key === 'Escape') { e.preventDefault(); this._close(false); }
    if (e.key === 'Enter')  { e.preventDefault(); this._close(true);  }
  }

  destroy() {
    document.removeEventListener('keydown', this._onKey);
    super.destroy();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance = null;

export function initGvmDialog() {
  const el = document.getElementById('gvmDialogOverlay');
  if (!el) return;
  _instance = new GvmDialog(el);
}

export const dialog = {
  confirm: (msg, opts) => _instance?.confirm(msg, opts) ?? Promise.resolve(false),
  alert:   (msg, opts) => _instance?.alert(msg, opts)   ?? Promise.resolve(),
};
