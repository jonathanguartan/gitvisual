// ─── GvmEditor Registry — Declarative editor initialization ───────────────────
//
// Pattern mirrors gvm-lists.js / initAllGvmLists():
//   1. HTML elements declare themselves via data-gvm-editor attribute
//   2. Modules call defineEditor(id, callbacks) to register options
//   3. panels.js calls initAllGvmEditors() once after DOM is ready
//
// HTML API:
//   <div id="myEditor" data-gvm-editor></div>
//
// JS API (in the owning module):
//   import { defineEditor, getEditor } from './gvm/gvm-editors.js';
//
//   defineEditor('myEditor', {
//     onToggle: () => {},   // called after mode changes; omit to re-render from cache
//   });
//
//   // At runtime:
//   getEditor('myEditor').render(diff, file);
//   getEditor('myEditor').setLoading();
//   getEditor('myEditor').setHint('message');
//   getEditor('myEditor').setContent(html);

import { GvmEditor } from './gvm-editor.js';

const _defs      = new Map(); // id → options registered by defineEditor()
const _instances = new Map(); // id → GvmEditor instance created by initAllGvmEditors()

/**
 * Register options for an editor element.
 * Call this at module load time (top-level), before initAllGvmEditors() runs.
 */
export function defineEditor(id, opts = {}) {
  _defs.set(id, opts);
}

/**
 * Discover all [data-gvm-editor] elements in the DOM and instantiate a GvmEditor
 * for each one that has a matching defineEditor() registration.
 * Called once by panels.js after all modules have loaded.
 */
export function initAllGvmEditors() {
  document.querySelectorAll('[data-gvm-editor]').forEach(el => {
    const id = el.id;
    if (!id) { console.warn('[GvmEditor] element with data-gvm-editor has no id:', el); return; }
    if (!_defs.has(id)) { console.warn('[GvmEditor] no defineEditor() registration for id:', id); return; }

    const opts = _defs.get(id);
    _instances.set(id, new GvmEditor({ el, ...opts }));
  });
}

/**
 * Retrieve the GvmEditor instance for a given element id.
 * Returns null if not yet initialized or id is unknown.
 */
export function getEditor(id) {
  return _instances.get(id) ?? null;
}
