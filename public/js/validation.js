/**
 * Validación en el frontend — espejo exacto de lib/validation.js.
 * Mantener en sincronía con el backend si se cambian las reglas.
 */

/**
 * Valida que un nombre de rama, tag o remote sea seguro para usarse en git.
 * Reglas idénticas a las del backend.
 */
export function isValidRefName(name) {
  if (!name || typeof name !== 'string') return false;
  const invalidChars = /[\s\x00-\x1F\x7F~^:?*\[\\@]/;
  if (invalidChars.test(name)) return false;
  if (name.includes('..') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.lock')) return false;
  if (name.startsWith('-')) return false;
  return true;
}

/**
 * Valida que un hash de commit sea válido (solo hex, 4–40 chars, no empieza con -).
 */
export function isValidHash(hash) {
  if (!hash || typeof hash !== 'string') return false;
  if (hash.startsWith('-')) return false;
  return /^[0-9a-fA-F]{4,40}$/.test(hash);
}

/**
 * Limpia una cadena para usarla como nombre de rama.
 * Sustituye espacios por guiones y elimina caracteres no permitidos.
 * No garantiza un nombre válido completo; siempre pasar por isValidRefName tras aplicar.
 */
export function sanitizeBranchName(input) {
  return (input || '').trim()
    .replace(/\s+/g, '-')
    .replace(/[\x00-\x1F\x7F~^:?*\[\\@]/g, '');
}
