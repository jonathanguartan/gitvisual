// ─── GvmContextMenu Registry — Declarative context menu initialization ─────────
//
// Pattern mirrors gvm-lists.js / initAllGvmLists():
//   1. HTML elements declare themselves via data-gvm-ctx-menu attribute
//   2. Modules call defineContextMenu(id, opts) to register the action handler
//   3. panels.js calls initAllGvmContextMenus() once after DOM is ready
//
// HTML API:
//   <div id="myCtxMenu" class="ctx-menu" data-gvm-ctx-menu style="display:none"></div>
//
// JS API (in the owning module):
//   import { defineContextMenu, getContextMenu } from './gvm/gvm-ctx-menus.js';
//
//   defineContextMenu('myCtxMenu', {
//     onAction: (action, context) => { switch (action) { ... } },
//   });
//
//   // At runtime:
//   getContextMenu('myCtxMenu').show(event, contextData, itemsHtml);
//   getContextMenu('myCtxMenu').action(actionName);   // from onclick handlers
//   getContextMenu('myCtxMenu').close();

import { GvmContextMenu } from './gvm-ctx-menu.js';

const _defs      = new Map(); // id → opts registered by defineContextMenu()
const _instances = new Map(); // id → GvmContextMenu instance

/**
 * Register an action handler for a context menu element.
 * Call this at module load time (top-level), before initAllGvmContextMenus() runs.
 */
export function defineContextMenu(id, opts = {}) {
  _defs.set(id, opts);
}

/**
 * Discover all [data-gvm-ctx-menu] elements in the DOM and instantiate a GvmContextMenu
 * for each one that has a matching defineContextMenu() registration.
 * Called once by panels.js after all modules have loaded.
 */
export function initAllGvmContextMenus() {
  document.querySelectorAll('[data-gvm-ctx-menu]').forEach(el => {
    const id = el.id;
    if (!id) { console.warn('[GvmContextMenu] element with data-gvm-ctx-menu has no id:', el); return; }
    if (!_defs.has(id)) { console.warn('[GvmContextMenu] no defineContextMenu() registration for id:', id); return; }

    const opts = _defs.get(id);
    _instances.set(id, new GvmContextMenu(el, opts));
  });
}

/**
 * Retrieve the GvmContextMenu instance for a given element id.
 * Returns null if not yet initialized or id is unknown.
 */
export function getContextMenu(id) {
  return _instances.get(id) ?? null;
}
