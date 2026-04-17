/**
 * GvmList — Generic list component
 *
 * Handles: virtual scroll · keyboard navigation · focus management
 *          single/multi selection (Ctrl+Shift) · right-click · ARIA
 *
 * Usage:
 *   const list = new GvmList({
 *     el,                     // container element (content area)
 *     scrollEl,               // scroll container (defaults to el)
 *     items:       [],        // data array — immutable references are fine
 *     renderItem:  (item, idx, { selected, focused }) => '<html>',
 *     itemHeight:  36,        // required for virtual:true
 *     virtual:     false,
 *     selMode:     'single',  // 'none' | 'single' | 'multi'
 *     onActivate:  (item, idx, event) => {},   // single-click / Enter (no modifier)
 *     onSelect:    (items, indices) => {},      // fires on any selection change
 *     onCtxMenu:   (event, item, idx, selectedItems) => {},
 *     onKeyAction: (key, item, idx) => {},      // unhandled keys (Delete, etc.)
 *     emptyHtml:   '',            // HTML rendered when items array is empty
 *   });
 *
 *   list.setItems(items)          // replace data, clears selection
 *   list.selectIndex(idx, trigger)// programmatic select (trigger fires onActivate)
 *   list.scrollToIndex(idx)       // scroll idx into view
 *   list.focusNeighbor(dir)       // +1 / -1 (for external keyboard handlers)
 *   list.getSelected()            // → [{item, idx}]
 *   list.getFocused()             // → idx (-1 if none)
 *   list.refresh()                // re-render current items (e.g. after external state change)
 *   list.destroy()                // remove listeners, clear DOM, release references
 */

import { GvmComponent } from './gvm-component.js';

export class GvmList extends GvmComponent {
  constructor(opts = {}) {
    super(opts.el);
    this._el         = opts.el;
    this._scrollEl   = opts.scrollEl || opts.el;
    this._items      = opts.items || [];
    this._renderItem = opts.renderItem || (() => '');
    this._itemH      = opts.itemHeight || 36;
    this._virtual    = !!opts.virtual;
    this._selMode    = opts.selMode || 'single'; // 'none' | 'single' | 'multi'

    this._onActivate  = opts.onActivate  || null;
    this._onSelect    = opts.onSelect    || null;
    this._onCtxMenu   = opts.onCtxMenu   || null;
    this._onKeyAction = opts.onKeyAction || null;
    this._emptyHtml   = opts.emptyHtml   || '';

    // Selection state
    this._selected  = new Set();  // indices
    this._focused   = -1;
    this._anchor    = -1;         // Shift-click anchor

    // Bound handlers kept as properties so destroy() can removeEventListener
    this._boundClick   = this._onClick.bind(this);
    this._boundCtx     = this._onCtxMenu_.bind(this);
    this._boundKeydown = this._onKeydown.bind(this);
    this._boundScroll  = () => requestAnimationFrame(() => this._renderVirtual());

    this._setupEl();
    this._render();
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────

  _setupEl() {
    const el = this._el;
    el.setAttribute('role', 'listbox');
    el.setAttribute('aria-multiselectable', this._selMode === 'multi');
    if (this._virtual) el.style.position = 'relative';

    el.addEventListener('click',       this._boundClick,   { passive: false });
    el.addEventListener('contextmenu', this._boundCtx,     { passive: false });
    el.addEventListener('keydown',     this._boundKeydown, { passive: false });

    if (this._virtual) {
      this._scrollEl.addEventListener('scroll', this._boundScroll, { passive: true });
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._items.length) {
      this._el.style.height = '';
      this._el.innerHTML = this._emptyHtml;
      return;
    }
    if (this._virtual) {
      this._el.style.height = (this._items.length * this._itemH) + 'px';
      this._renderVirtual();
    } else {
      this._el.innerHTML = this._items.map((item, i) => this._wrapItem(item, i)).join('');
    }
  }

  _renderVirtual() {
    const scrollEl = this._scrollEl;
    const top      = scrollEl.scrollTop;
    const viewH    = scrollEl.clientHeight || 400;
    const buf      = 8;
    const first    = Math.max(0, Math.floor(top / this._itemH) - buf);
    const last     = Math.min(this._items.length - 1, Math.ceil((top + viewH) / this._itemH) + buf);

    let html = '';
    for (let i = first; i <= last; i++) {
      html += this._wrapItem(this._items[i], i, `position:absolute;top:${i * this._itemH}px;left:0;right:0;height:${this._itemH}px;box-sizing:border-box;`);
    }
    this._el.innerHTML = html;
  }

  _wrapItem(item, idx, extraStyle = '') {
    const sel = this._selected.has(idx);
    const foc = this._focused === idx;
    const cls = ['gvm-item', sel ? 'gvm-selected' : '', foc ? 'gvm-focused' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-gvm-idx="${idx}" role="option" aria-selected="${sel}" tabindex="-1" style="${extraStyle}">${
      this._renderItem(item, idx, { selected: sel, focused: foc })
    }</div>`;
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  _findItemEl(e) {
    return e.target.closest('.gvm-item[data-gvm-idx]');
  }

  _onClick(e) {
    const itemEl = this._findItemEl(e);
    if (!itemEl) return;
    const idx = parseInt(itemEl.dataset.gvmIdx, 10);
    if (isNaN(idx)) return;

    const item = this._items[idx];
    if (!item) return;

    if (this._selMode === 'multi' && e.shiftKey && this._anchor >= 0) {
      this._selectRange(this._anchor, idx);
      this._focused = idx;
      this._patchDOM();
      this._fireSelect();
    } else if (this._selMode === 'multi' && (e.ctrlKey || e.metaKey)) {
      if (this._selected.has(idx)) this._selected.delete(idx);
      else { this._selected.add(idx); this._anchor = idx; }
      this._focused = idx;
      this._patchDOM();
      this._fireSelect();
    } else {
      // Plain click → activate
      const changed = !this._selected.has(idx) || this._selected.size !== 1;
      this._selected.clear();
      this._selected.add(idx);
      this._anchor  = idx;
      this._focused = idx;
      this._patchDOM();
      if (changed) this._fireSelect();
      this._onActivate?.(item, idx, e);
    }
  }

  _onCtxMenu_(e) {
    if (!this._onCtxMenu) return;
    const itemEl = this._findItemEl(e);
    if (!itemEl) return;
    e.preventDefault();
    const idx = parseInt(itemEl.dataset.gvmIdx, 10);
    if (isNaN(idx)) return;

    // Right-click on unselected item → select it first
    if (!this._selected.has(idx)) {
      this._selected.clear();
      this._selected.add(idx);
      this._anchor = idx;
      this._focused = idx;
      this._patchDOM();
      this._fireSelect();
    }
    this._onCtxMenu(e, this._items[idx], idx, this.getSelected());
  }

  _onKeydown(e) {
    if (!this._items.length) return;
    const focused = this._focused < 0 ? 0 : this._focused;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.min(focused + 1, this._items.length - 1);
        this._moveFocus(next, e.shiftKey);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = Math.max(focused - 1, 0);
        this._moveFocus(prev, e.shiftKey);
        break;
      }
      case 'Home': {
        e.preventDefault();
        this._moveFocus(0, e.shiftKey);
        break;
      }
      case 'End': {
        e.preventDefault();
        this._moveFocus(this._items.length - 1, e.shiftKey);
        break;
      }
      case 'a': case 'A': {
        if ((e.ctrlKey || e.metaKey) && this._selMode === 'multi') {
          e.preventDefault();
          this._items.forEach((_, i) => this._selected.add(i));
          this._patchDOM();
          this._fireSelect();
        }
        break;
      }
      case 'Enter': case ' ': {
        e.preventDefault();
        const item = this._items[focused];
        if (item) this._onActivate?.(item, focused, e);
        break;
      }
      default:
        this._onKeyAction?.(e.key, this._items[focused], focused);
    }
  }

  // ─── Selection helpers ─────────────────────────────────────────────────────

  _selectRange(from, to) {
    const min = Math.min(from, to), max = Math.max(from, to);
    if (this._selMode !== 'multi') { this._selected.clear(); this._selected.add(to); return; }
    this._selected.clear();
    for (let i = min; i <= max; i++) this._selected.add(i);
  }

  _moveFocus(idx, shiftKey) {
    if (this._selMode === 'multi' && shiftKey && this._anchor >= 0) {
      this._selectRange(this._anchor, idx);
    } else {
      this._selected.clear();
      this._selected.add(idx);
      this._anchor = idx;
    }
    this._focused = idx;
    this._scrollToIdx(idx);
    this._patchDOM();
    this._fireSelect();
    this._onActivate?.(this._items[idx], idx, null);
  }

  // ─── DOM update ────────────────────────────────────────────────────────────

  /** Partial DOM update — only touches class/aria attributes, avoids full re-render. */
  _patchDOM() {
    if (this._virtual) {
      // Virtual scroll: re-render is cheap and necessary
      this._renderVirtual();
    } else {
      this._el.querySelectorAll('.gvm-item').forEach(el => {
        const idx = parseInt(el.dataset.gvmIdx, 10);
        const sel = this._selected.has(idx);
        const foc = this._focused === idx;
        el.classList.toggle('gvm-selected', sel);
        el.classList.toggle('gvm-focused',  foc);
        el.setAttribute('aria-selected', sel);
      });
    }
  }

  _fireSelect() {
    this._onSelect?.(this.getSelected());
  }

  // ─── Scroll ────────────────────────────────────────────────────────────────

  _scrollToIdx(idx) {
    if (this._virtual) {
      const el     = this._scrollEl;
      const top    = idx * this._itemH;
      const viewH  = el.clientHeight;
      const cur    = el.scrollTop;
      if (top < cur) el.scrollTop = top;
      else if (top + this._itemH > cur + viewH) el.scrollTop = top + this._itemH - viewH;
      requestAnimationFrame(() => this._renderVirtual());
    } else {
      const itemEl = this._el.querySelector(`[data-gvm-idx="${idx}"]`);
      itemEl?.scrollIntoView({ block: 'nearest' });
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Replace the item array. Clears selection and re-renders. */
  setItems(items) {
    this._items    = items || [];
    this._selected.clear();
    this._focused  = -1;
    this._anchor   = -1;
    if (this._virtual) {
      if (this._scrollEl !== this._el) this._scrollEl.scrollTop = 0;
    }
    this._render();
  }

  /** Programmatically select an item. Pass trigger=true to also fire onActivate. */
  selectIndex(idx, trigger = false) {
    if (idx < 0 || idx >= this._items.length) return;
    this._selected.clear();
    this._selected.add(idx);
    this._anchor  = idx;
    this._focused = idx;
    this._scrollToIdx(idx);
    this._patchDOM();
    this._fireSelect();
    if (trigger) this._onActivate?.(this._items[idx], idx, null);
  }

  /** Move focus by ±1 without modifiers. Useful for external keyboard handlers. */
  focusNeighbor(dir) {
    const next = Math.max(0, Math.min(this._items.length - 1, (this._focused < 0 ? 0 : this._focused) + dir));
    this._moveFocus(next, false);
  }

  scrollToIndex(idx)  { this._scrollToIdx(idx); }
  getFocused()        { return this._focused; }
  getSelected()       { return Array.from(this._selected).sort((a, b) => a - b).map(i => ({ item: this._items[i], idx: i })); }
  getItems()          { return this._items; }

  /** Re-render in-place when external state changes (e.g., selection classes driven by caller). */
  refresh() { this._render(); }

  /** Remove all listeners, clear DOM, and release references. */
  destroy() {
    this._el.removeEventListener('click',       this._boundClick);
    this._el.removeEventListener('contextmenu', this._boundCtx);
    this._el.removeEventListener('keydown',     this._boundKeydown);
    if (this._virtual) this._scrollEl.removeEventListener('scroll', this._boundScroll);
    super.destroy();
  }
}
