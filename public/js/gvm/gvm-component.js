/**
 * GvmComponent — Base class for all Gvm* components.
 *
 * Provides:
 *   - this._el  reference to the root DOM element
 *   - destroy() clears innerHTML and releases the element reference
 *
 * Subclasses must call super(el) and call super.destroy() in their destroy().
 */

export class GvmComponent {
  constructor(el) {
    if (!el) throw new Error('[GvmComponent] el is required');
    this._el = el;
  }

  /** Remove all component output from the DOM. Subclasses extend this. */
  destroy() {
    this._el.innerHTML = '';
  }
}
