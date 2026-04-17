/**
 * GvmContextMenu — Context menu component
 *
 * Encapsulates: positioning, icon/label parsing, auto-close on outside click,
 * context data storage, and action routing.
 *
 * Usage:
 *   const menu = new GvmContextMenu(el, {
 *     onAction: (action, context) => {},   // called when an action item is triggered
 *   });
 *
 *   menu.show(event, context, itemsHtml)  // open menu at cursor with given context
 *   menu.action(name)                     // close + fire onAction(name, context)
 *   menu.close()                          // hide without firing
 *   menu.getContext()                     // → stored context (null if closed)
 *   menu.destroy()                        // remove from DOM
 */

import { GvmComponent } from './gvm-component.js';
import { escHtml, closeAllCtxMenus } from '../utils.js';

export class GvmContextMenu extends GvmComponent {
  constructor(el, opts = {}) {
    super(el);
    this._onAction = opts.onAction || null;
    this._context  = null;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Open the menu at the cursor position.
   * Handles preventDefault/stopPropagation, closes other open menus,
   * parses icon/label structure, and auto-closes on next outside click.
   */
  show(event, context, itemsHtml) {
    event.preventDefault();
    event.stopPropagation();
    closeAllCtxMenus();

    this._context      = context;
    this._el.innerHTML = itemsHtml;
    this._parseIcons();
    this._el.style.left    = event.clientX + 'px';
    this._el.style.top     = event.clientY + 'px';
    this._el.style.display = 'block';

    // Adjust if overflowing viewport
    const rect = this._el.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  this._el.style.left = (event.clientX - rect.width)  + 'px';
    if (rect.bottom > window.innerHeight) this._el.style.top  = (event.clientY - rect.height) + 'px';

    requestAnimationFrame(() => document.addEventListener('click', closeAllCtxMenus, { once: true }));
  }

  /**
   * Route an action: close the menu then call onAction(name, context).
   * Called from HTML onclick handlers: onclick="xCtxAction('copy')"
   */
  action(name) {
    const ctx = this._context;
    closeAllCtxMenus();
    this._context = null;
    if (ctx !== null) this._onAction?.(name, ctx);
  }

  /** Hide the menu without firing an action. */
  close() {
    this._el.style.display = 'none';
    this._context = null;
  }

  getContext() { return this._context; }

  destroy() {
    this.close();
    super.destroy();
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /** Auto-split "icon label" text nodes → <span.ctx-icon> + <span.ctx-label>. */
  _parseIcons() {
    this._el.querySelectorAll('.ctx-item:not(.ctx-header)').forEach(el => {
      if (el.children.length > 0) return; // already structured
      const text = el.textContent;
      const m    = text.match(/^(\S{1,4})\s(.+)/s);
      if (m) el.innerHTML = `<span class="ctx-icon" aria-hidden="true">${escHtml(m[1])}</span><span class="ctx-label">${escHtml(m[2])}</span>`;
    });
  }
}
