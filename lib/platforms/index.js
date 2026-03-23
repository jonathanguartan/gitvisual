// ─── Platform Registry ────────────────────────────────────────────────────────
// Para añadir una nueva plataforma: crear lib/platforms/miplatforma.js
// y añadirla al array de abajo. El resto (rutas, ajustes) se adapta solo.

const platforms = [
  require('./github'),
  require('./bitbucket'),
  require('./gitlab'),
  require('./gitea'),
];

/**
 * Detecta la plataforma a partir de la URL del remote.
 * Gitea necesita la config para saber la URL de la instancia.
 * @param {string} url  Remote URL
 * @param {object} platformsCfg  app-config.json → platforms
 * @returns {{ platform, type, owner, repo } | null}
 */
function detect(url, platformsCfg = {}) {
  for (const p of platforms) {
    const result = p.detect(url, platformsCfg[p.id]);
    if (result) return { platform: p, ...result };
  }
  return null;
}

module.exports = {
  all:    platforms,
  get:    id => platforms.find(p => p.id === id),
  detect,
};
