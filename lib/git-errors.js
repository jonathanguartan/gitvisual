'use strict';

// ─── Patrones de error conocidos de git ───────────────────────────────────────
// Cada entrada puede tener:
//   test(e)      → función que recibe el Error y devuelve true si aplica
//   message      → string estático a devolver
//   format(e)    → función que formatea el mensaje usando el error original

const PATTERNS = [
  {
    // GitHub Push Protection
    test: e =>
      e.message.includes('GH013') ||
      e.message.includes('push protection') ||
      /secret.*scanning/i.test(e.message),
    format(e) {
      const paths = [
        ...new Set(
          [...e.message.matchAll(/path:\s*([^\n\r]+)/g)].map(m => m[1].trim())
        ),
      ];
      const fileList = paths.length
        ? `\n\nArchivos con secretos detectados:\n${paths.map(p => `  • ${p}`).join('\n')}`
        : '';
      return (
        `GitHub bloqueó el push porque uno o más commits contienen secretos (tokens, contraseñas).${fileList}\n\n` +
        `Para solucionarlo:\n` +
        `  1. git reset HEAD~1 --soft          ← deshace el último commit conservando los cambios\n` +
        `  2. git restore --staged <archivo>   ← desescena el archivo con el secreto\n` +
        `  3. Agrega el archivo a .gitignore\n` +
        `  4. Vuelve a hacer commit sin ese archivo`
      );
    },
  },
  {
    // Pull/merge bloqueado por cambios locales que serían sobreescritos
    test: e =>
      e.message.includes('would be overwritten by merge') ||
      e.message.includes('would be overwritten by checkout'),
    format(e) {
      const files = e.message
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('error:') && !l.startsWith('Please') && !l.startsWith('Your local'));
      const list = files.length ? `\n${files.map(f => `  • ${f}`).join('\n')}` : '';
      return (
        `No se puede hacer pull: los siguientes archivos tienen cambios locales que serían sobreescritos:${list}\n\n` +
        `Opciones:\n` +
        `  • Haz commit de esos cambios\n` +
        `  • O guárdalos en stash antes de hacer pull`
      );
    },
  },
  {
    // Fallo de autenticación con el remote
    test: e =>
      e.message.includes('Authentication failed') ||
      e.message.includes('could not read Username') ||
      e.message.includes('Invalid credentials') ||
      /HTTP\s+401/.test(e.message),
    message:
      'Fallo de autenticación con el remote. Verifica tus credenciales o configura un token de acceso personal.',
  },
  {
    // Lock file de git (index.lock u otros)
    test: e =>
      /index\.lock/.test(e.message) ||
      /\.lock['" ] could not be obtained/.test(e.message),
    message:
      'Git tiene un archivo de bloqueo activo (.git/index.lock). Si no hay otra operación en curso, elimínalo manualmente y vuelve a intentarlo.',
  },
  {
    // Stash bloqueado por conflictos sin resolver en el índice
    test: e =>
      e.message.includes('needs merge') ||
      (e.message.includes('could not write index') && e.message.includes('needs merge')),
    message:
      'No se puede crear el stash: hay archivos con conflictos sin resolver. Resuélvelos en la pestaña de Cambios antes de continuar.',
  },
  {
    // La ruta no es un repositorio git
    test: e =>
      e.message.includes('not a git repository') ||
      e.message.includes('no es un repositorio'),
    message: 'La ruta especificada no es un repositorio Git.',
  },
];

/**
 * Normaliza un error de git y envía la respuesta HTTP 500 adecuada.
 *
 * Detecta patrones conocidos y devuelve mensajes legibles. Si no hay coincidencia
 * usa el mensaje raw del error.
 *
 * @param {import('express').Response} res
 * @param {Error} e
 * @param {{ debug?: string }} [opts]
 *   - debug: texto de diagnóstico que se añade al final del mensaje (útil en rutas de push)
 */
function handleGitError(res, e, opts = {}) {
  let message = e.message;

  for (const pattern of PATTERNS) {
    if (pattern.test(e)) {
      message = pattern.format ? pattern.format(e) : pattern.message;
      break;
    }
  }

  if (opts.debug) message += `\n\n[Debug] ${opts.debug}`;

  res.status(500).json({ error: message });
}

/**
 * Middleware de error de Express.
 * Captura cualquier error pasado a next(err) que no haya sido manejado por la ruta.
 */
const logger = require('./logger');

function gitErrorMiddleware(err, req, res, next) {
  if (res.headersSent) return next(err);
  logger.error('[middleware] Unhandled error', { msg: err.message, url: req.url });
  handleGitError(res, err);
}

module.exports = { handleGitError, gitErrorMiddleware };
