const path = require('path');
const fs   = require('fs');

const CONFIG_FILE = path.join(__dirname, '..', 'app-config.json');

const DEFAULTS = {
  openTabs:        [],
  recentRepos:     [],
  autoFetchMinutes: 5,
  rebaseOnPull:    false,
  autoStash:       false,
  diffContext:     3,
  logLimit:        100,
  mainBranch:      'main',
  platforms:       {},
};

/**
 * Migra el formato antiguo (campos planos: githubToken, bitbucketToken…)
 * al nuevo formato anidado { platforms: { github: {token}, … } }.
 * Se ejecuta una vez y es transparente para configs ya migradas.
 */
function migrate(raw) {
  if (raw.platforms && typeof raw.platforms === 'object') return raw; // ya migrado

  const platforms = {};

  if (raw.githubToken)
    platforms.github = { token: raw.githubToken };

  // En el formato viejo, Gitea compartía el mismo token que GitHub
  if (raw.giteaUrl)
    platforms.gitea = { url: raw.giteaUrl, token: raw.githubToken || '' };

  if (raw.bitbucketUser || raw.bitbucketToken || raw.bitbucketPassword)
    platforms.bitbucket = {
      user:     raw.bitbucketUser     || '',
      token:    raw.bitbucketToken    || '',
      password: raw.bitbucketPassword || '',
    };

  if (raw.gitlabToken)
    platforms.gitlab = { token: raw.gitlabToken };

  // Limpia campos legados del objeto devuelto
  const { githubToken, giteaUrl, bitbucketUser, bitbucketToken, bitbucketPassword, gitlabToken, ...rest } = raw;
  return { ...rest, platforms };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const rawText = fs.readFileSync(CONFIG_FILE, 'utf8');
      try {
        const raw = JSON.parse(rawText);
        return { ...DEFAULTS, ...migrate(raw) };
      } catch (parseError) {
        console.error(`[config] Error de lectura: El archivo ${CONFIG_FILE} está corrupto. Se ha creado una copia de seguridad .bak.`);
        try { fs.writeFileSync(CONFIG_FILE + '.bak', rawText); } catch (_) {}
      }
    }
  } catch (err) {
    console.error(`[config] No se pudo cargar la configuración: ${err.message}`);
  }
  return { ...DEFAULTS };
}

function saveConfig(config) {
  const current = loadConfig();
  const merged  = { ...current, ...config };

  // Deep-merge platforms: no sobreescribir toda la clave, sino fusionar por plataforma
  if (config.platforms && typeof config.platforms === 'object') {
    merged.platforms = { ...current.platforms };
    for (const [id, fields] of Object.entries(config.platforms)) {
      merged.platforms[id] = { ...(current.platforms[id] || {}), ...fields };
    }
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

module.exports = { loadConfig, saveConfig };
