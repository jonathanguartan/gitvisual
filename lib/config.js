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

function sanitize(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const sanitized = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    sanitized[key] = (typeof value === 'object') ? sanitize(value) : value;
  }
  return sanitized;
}

function saveConfig(config) {
  const current = loadConfig();
  const safeInput = sanitize(config);
  
  // Validar y fusionar solo claves conocidas de la raíz
  const merged = { ...current };
  
  if (Array.isArray(safeInput.openTabs))    merged.openTabs = safeInput.openTabs;
  if (Array.isArray(safeInput.recentRepos)) merged.recentRepos = safeInput.recentRepos;
  
  if (typeof safeInput.autoFetchMinutes === 'number') 
    merged.autoFetchMinutes = Math.max(1, Math.min(1440, safeInput.autoFetchMinutes));
    
  if (typeof safeInput.rebaseOnPull === 'boolean') merged.rebaseOnPull = safeInput.rebaseOnPull;
  if (typeof safeInput.autoStash === 'boolean')    merged.autoStash = safeInput.autoStash;
  
  if (typeof safeInput.diffContext === 'number')
    merged.diffContext = Math.max(0, Math.min(100, safeInput.diffContext));
    
  if (typeof safeInput.logLimit === 'number')
    merged.logLimit = Math.max(1, Math.min(5000, safeInput.logLimit));
    
  if (typeof safeInput.mainBranch === 'string') merged.mainBranch = safeInput.mainBranch;

  // Deep-merge platforms: no sobreescribir toda la clave, sino fusionar por plataforma
  if (safeInput.platforms && typeof safeInput.platforms === 'object') {
    merged.platforms = { ...current.platforms };
    for (const [id, fields] of Object.entries(safeInput.platforms)) {
      if (['__proto__', 'constructor', 'prototype'].includes(id)) continue;
      if (fields && typeof fields === 'object') {
        merged.platforms[id] = { ...(current.platforms[id] || {}), ...sanitize(fields) };
      }
    }
  }

  // Escritura atómica: escribe en temporal y renombra para evitar corrupción
  const tmpFile = CONFIG_FILE + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2));
    fs.renameSync(tmpFile, CONFIG_FILE);
  } catch (err) {
    console.error('[config] Error al guardar:', err.message);
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

module.exports = { loadConfig, saveConfig };
