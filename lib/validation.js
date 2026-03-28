'use strict';
const fs = require('fs');

/**
 * Valida que un nombre de rama, tag o remote sea seguro para usarse en comandos git.
 * Previene inyección de opciones (--), path traversal (..), caracteres de control, etc.
 */
function isValidRefName(name) {
  if (!name || typeof name !== 'string') return false;
  const invalidChars = /[\s\x00-\x1F\x7F~^:?*\[\\@]/;
  if (invalidChars.test(name)) return false;
  if (name.includes('..') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.lock')) return false;
  if (name.startsWith('-')) return false;
  return true;
}

/**
 * Valida que un hash de commit sea seguro (solo hex, 4-40 chars, no empieza con -).
 */
function isValidHash(hash) {
  if (!hash || typeof hash !== 'string') return false;
  if (hash.startsWith('-')) return false;
  return /^[0-9a-fA-F]{4,40}$/.test(hash);
}

/**
 * Middleware para validar que repoPath esté presente, sea un string y sea un directorio accesible.
 */
function validateRepoPath(req, res, next) {
  const repoPath = req.query.repoPath || req.body.repoPath;
  if (!repoPath || typeof repoPath !== 'string' || repoPath.trim() === '') {
    return res.status(400).json({ error: 'Falta la ruta del repositorio (repoPath)' });
  }

  try {
    const stats = fs.statSync(repoPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'La ruta proporcionada no es un directorio' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'La ruta del repositorio no existe o no es accesible' });
  }
  next();
}

module.exports = { isValidRefName, isValidHash, validateRepoPath };
