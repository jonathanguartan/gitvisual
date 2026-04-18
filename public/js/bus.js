// ─── Lightweight event bus ────────────────────────────────────────────────────
// Replaces cross-module window.X() calls with decoupled emit/on pattern.

const _handlers = new Map();

export function on(event, handler) {
  if (!_handlers.has(event)) _handlers.set(event, []);
  _handlers.get(event).push(handler);
}

export function off(event, handler) {
  const h = _handlers.get(event);
  if (h) _handlers.set(event, h.filter(fn => fn !== handler));
}

export function emit(event, payload) {
  const handlers = _handlers.get(event);
  if (handlers) handlers.forEach(fn => fn(payload));
}
