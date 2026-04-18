// ─── GvmList Registry — Declarative list initialization ───────────────────────
//
// Pattern mirrors gvm/gvm-pane.js / initAllGvmPanes():
//   1. HTML elements declare config via data-gvm-* attributes
//   2. Modules call defineList(id, callbacks) to register render/event handlers
//   3. panels.js calls initAllGvmLists() once after DOM is ready
//
// HTML API:
//   <div id="myList"
//        data-gvm-list                        marks the element (required)
//        data-gvm-selmode="single"             none|single|multi  (default: single)
//        data-gvm-virtual                      presence = enable virtual scroll
//        data-gvm-item-height="44"             px per item for virtual scroll (default: 36)
//        data-gvm-scroll=".container"          CSS selector for scroll container
//        data-gvm-empty="Sin elementos">       empty-state text
//   </div>
//
// JS API (in the owning module):
//   import { defineList, getList } from './gvm/gvm-lists.js';
//
//   defineList('myList', {
//     renderItem: (item, idx, { selected, focused }) => '<html>',
//     onActivate: (item, idx, event) => {},
//     onCtxMenu:  (event, item, idx, selectedItems) => {},
//     onSelect:   (items) => {},
//     onKeyAction:(key, item, idx) => {},
//   });
//
//   // To update items at runtime:
//   getList('myList').setItems(newItems);
//   getList('myList').selectIndex(idx, trigger);

import { GvmList } from './gvm-list.js';

const _defs      = new Map(); // id → callbacks registered by defineList()
const _instances = new Map(); // id → GvmList instance created by initAllGvmLists()

/**
 * Register render/event callbacks for a list element.
 * Call this at module load time (top-level), before initAllGvmLists() runs.
 */
export function defineList(id, callbacks) {
  _defs.set(id, callbacks);
}

/**
 * Discover all [data-gvm-list] elements in the DOM and instantiate a GvmList
 * for each one that has a matching defineList() registration.
 * Called once by panels.js after all modules have loaded.
 */
export function initAllGvmLists() {
  document.querySelectorAll('[data-gvm-list]').forEach(el => {
    const id = el.id;
    if (!id) { console.warn('[GvmList] element with data-gvm-list has no id:', el); return; }
    if (!_defs.has(id)) { console.warn('[GvmList] no defineList() registration for id:', id); return; }

    const callbacks = _defs.get(id);
    const ds        = el.dataset;

    const scrollSel = ds.gvmScroll;
    const scrollEl  = scrollSel
      ? (el.closest(scrollSel) || document.querySelector(scrollSel))
      : undefined;

    const instance = new GvmList({
      el,
      ...(scrollEl ? { scrollEl } : {}),
      items:      [],
      selMode:    ds.gvmSelmode    || 'single',
      virtual:    'gvmVirtual'    in ds,
      itemHeight: parseFloat(ds.gvmItemHeight) || 36,
      emptyHtml:  ds.gvmEmpty ? `<div class="gvm-empty">${ds.gvmEmpty}</div>` : '',
      ...callbacks,
    });

    _instances.set(id, instance);
  });
}

/**
 * Retrieve the GvmList instance for a given element id.
 * Returns null if the list was not yet initialized or id is unknown.
 */
export function getList(id) {
  return _instances.get(id) ?? null;
}
